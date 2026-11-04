//! Platform-agnostic hotkey manager built on top of KeyboardListener

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crate::error::{Error, Result};
use crate::listener::{BlockingHotkeys, KeyboardListener};
use crate::types::{Hotkey, HotkeyEvent, HotkeyId, HotkeyState, KeyEvent};

/// Longest a tap may be held and still count as half of a double tap. Matches
/// Ambient's hold-vs-tap threshold: anything longer is a hold, not a tap.
pub const DOUBLE_TAP_MAX_HOLD: Duration = Duration::from_millis(300);

/// Longest gap between the two taps, measured from the first tap's release to
/// the second tap's press.
pub const DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(400);

/// Tap bookkeeping for one double-tap hotkey.
#[derive(Debug, Default)]
struct DoubleTapState {
    /// When the target went down, while a candidate tap is in progress.
    pressed_at: Option<Instant>,
    /// Another key moved during this hold: it is a chord (Option+Tab), not a
    /// tap, so it must not count toward a double tap.
    chord: bool,
    /// When the last accepted tap ended — the anchor for the next one.
    last_tap_at: Option<Instant>,
}

impl DoubleTapState {
    fn is_held(&self) -> bool {
        self.pressed_at.is_some()
    }

    /// The target went down.
    fn press(&mut self, now: Instant) {
        if self.pressed_at.is_some() {
            // Auto-repeat while held: not a fresh tap.
            self.chord = true;
            return;
        }
        self.pressed_at = Some(now);
        self.chord = false;
        // A tap older than the window can no longer pair with this one.
        if self
            .last_tap_at
            .is_some_and(|last| now.saturating_duration_since(last) > DOUBLE_TAP_WINDOW)
        {
            self.last_tap_at = None;
        }
    }

    /// Some other key moved while the target is held.
    fn other_event(&mut self) {
        if self.is_held() {
            self.chord = true;
        }
    }

    /// The target went up. True when this release completes a double tap.
    fn release(&mut self, now: Instant) -> bool {
        let Some(pressed_at) = self.pressed_at.take() else {
            return false;
        };
        let held = now.saturating_duration_since(pressed_at);
        if self.chord || held > DOUBLE_TAP_MAX_HOLD {
            self.chord = false;
            self.last_tap_at = None;
            return false;
        }
        self.chord = false;
        match self.last_tap_at.take() {
            Some(last) if now.saturating_duration_since(last) <= DOUBLE_TAP_WINDOW => true,
            _ => {
                self.last_tap_at = Some(now);
                false
            }
        }
    }
}

/// Internal state shared between the manager and the processing thread
struct ManagerState {
    hotkeys: HashMap<HotkeyId, Hotkey>,
    next_id: u32,
    /// Track which hotkeys are currently pressed
    pressed_hotkeys: HashSet<HotkeyId>,
    /// Tap tracking, one entry per registered double-tap hotkey. Created
    /// lazily on the first event for that hotkey.
    double_tap: HashMap<HotkeyId, DoubleTapState>,
}

/// Whether the listener may swallow this hotkey so other apps never see it.
///
/// Double-tap triggers are listened to, never swallowed: the taps that arm them
/// are ordinary keyboard use (Option+arrow, Shift+click) and must reach the
/// rest of the system. Swallowing the first tap would break typing.
fn blocks_hotkey(hotkey: &Hotkey) -> bool {
    !hotkey.double_tap
}

impl ManagerState {
    fn new() -> Self {
        Self {
            hotkeys: HashMap::new(),
            next_id: 0,
            pressed_hotkeys: HashSet::new(),
            double_tap: HashMap::new(),
        }
    }

    /// Process a key event and return any matching hotkey events
    fn process_event(&mut self, event: &KeyEvent) -> Vec<HotkeyEvent> {
        self.process_event_at(event, Instant::now())
    }

    /// The same, with an explicit clock, so the double-tap window can be
    /// driven deterministically from tests.
    fn process_event_at(&mut self, event: &KeyEvent, now: Instant) -> Vec<HotkeyEvent> {
        let mut results = Vec::new();

        let mut double_tap_ids: Vec<HotkeyId> = self
            .hotkeys
            .iter()
            .filter(|(_, hotkey)| hotkey.double_tap)
            .map(|(&id, _)| id)
            .collect();
        double_tap_ids.sort_by_key(|id| id.0);

        if event.is_key_down {
            // Track taps of double-tap targets; any other key moving during a
            // held candidate turns that hold into a chord.
            for id in &double_tap_ids {
                let hotkey = self.hotkeys[id];
                let is_target =
                    hotkey.key == event.key && hotkey.modifiers.matches(event.modifiers);
                let state = self.double_tap.entry(*id).or_default();
                if is_target {
                    state.press(now);
                } else {
                    state.other_event();
                }
            }

            // Check for hotkeys that should be pressed
            let to_press: Vec<HotkeyId> = self
                .hotkeys
                .iter()
                .filter(|(&id, hotkey)| {
                    !hotkey.double_tap
                        && hotkey.modifiers.matches(event.modifiers)
                        && hotkey.key == event.key
                        && !self.pressed_hotkeys.contains(&id)
                })
                .map(|(&id, _)| id)
                .collect();

            for id in to_press {
                self.pressed_hotkeys.insert(id);
                results.push(HotkeyEvent {
                    id,
                    state: HotkeyState::Pressed,
                });
            }
        } else {
            // A double tap reports one press/release pair when the second tap
            // lands: the press starts the toggle, and consumers that ignore
            // releases (toggle activation) act on the single edge.
            let mut fired: Vec<HotkeyId> = Vec::new();
            for id in &double_tap_ids {
                let hotkey = self.hotkeys[id];
                let Some(state) = self.double_tap.get_mut(id) else {
                    continue;
                };
                if !state.is_held() {
                    continue;
                }
                // The target is up when its key goes up, or — for a
                // modifier-only target — when the modifier it watches is no
                // longer held. Extra modifiers (a chord) must not read as a
                // release while the target itself is still down.
                let is_target_release = match hotkey.key {
                    Some(key) => event.key == Some(key),
                    None => !event.modifiers.intersects(hotkey.modifiers),
                };
                if !is_target_release {
                    state.other_event();
                } else if state.release(now) {
                    fired.push(*id);
                }
            }
            for id in fired {
                results.push(HotkeyEvent {
                    id,
                    state: HotkeyState::Pressed,
                });
                results.push(HotkeyEvent {
                    id,
                    state: HotkeyState::Released,
                });
            }

            // Check for hotkeys that should be released
            // A hotkey is released when its key is released, or — for modifier
            // events — when the modifiers no longer match. A modifier event
            // (key == None) whose modifiers still match must not release a
            // modifier-only hotkey (e.g. tapping Shift while a Cmd-only hotkey
            // is held).
            let to_release: Vec<HotkeyId> = self
                .hotkeys
                .iter()
                .filter(|(&id, hotkey)| {
                    self.pressed_hotkeys.contains(&id)
                        && ((event.key.is_some() && hotkey.key == event.key)
                            || (event.key.is_none() && !hotkey.modifiers.matches(event.modifiers)))
                })
                .map(|(&id, _)| id)
                .collect();

            for id in to_release {
                self.pressed_hotkeys.remove(&id);
                results.push(HotkeyEvent {
                    id,
                    state: HotkeyState::Released,
                });
            }
        }

        results
    }
}

/// Platform-agnostic Hotkey Manager
///
/// This manager wraps a `KeyboardListener` and filters events against
/// registered hotkeys, emitting `HotkeyEvent`s when matches occur.
///
/// Registered hotkeys are blocked from reaching other applications.
/// Note: On Linux, blocking requires write access to `/dev/uinput`
/// (non-blocked keystrokes are re-injected through it).
pub struct HotkeyManager {
    state: Arc<Mutex<ManagerState>>,
    event_receiver: Receiver<HotkeyEvent>,
    _thread_handle: Option<JoinHandle<()>>,
    running: Arc<std::sync::atomic::AtomicBool>,
    /// Shared set of hotkeys to block
    blocking_hotkeys: Option<BlockingHotkeys>,
}

impl HotkeyManager {
    /// Create a new HotkeyManager (non-blocking mode)
    ///
    /// On macOS, this will check for accessibility permissions and fail if not granted.
    pub fn new() -> Result<Self> {
        let listener = KeyboardListener::new()?;

        let (tx, rx) = mpsc::channel();
        let state = Arc::new(Mutex::new(ManagerState::new()));
        let running = Arc::new(std::sync::atomic::AtomicBool::new(true));

        let thread_state = Arc::clone(&state);
        let thread_running = Arc::clone(&running);

        let handle = thread::spawn(move || {
            Self::event_loop(listener, thread_state, tx, thread_running);
        });

        Ok(Self {
            state,
            event_receiver: rx,
            _thread_handle: Some(handle),
            running,
            blocking_hotkeys: None,
        })
    }

    /// Create a new HotkeyManager with blocking support
    ///
    /// On macOS, this will check for accessibility permissions and fail if not granted.
    /// Registered hotkeys will be blocked from reaching other applications.
    ///
    /// Note: On Linux, blocking requires write access to `/dev/uinput`
    /// and this fails with an actionable error without it.
    pub fn new_with_blocking() -> Result<Self> {
        let blocking_hotkeys: BlockingHotkeys = Arc::new(Mutex::new(HashSet::new()));
        let listener = KeyboardListener::new_with_blocking(blocking_hotkeys.clone())?;

        let (tx, rx) = mpsc::channel();
        let state = Arc::new(Mutex::new(ManagerState::new()));
        let running = Arc::new(std::sync::atomic::AtomicBool::new(true));

        let thread_state = Arc::clone(&state);
        let thread_running = Arc::clone(&running);

        let handle = thread::spawn(move || {
            Self::event_loop(listener, thread_state, tx, thread_running);
        });

        Ok(Self {
            state,
            event_receiver: rx,
            _thread_handle: Some(handle),
            running,
            blocking_hotkeys: Some(blocking_hotkeys),
        })
    }

    /// Event processing loop
    fn event_loop(
        listener: KeyboardListener,
        state: Arc<Mutex<ManagerState>>,
        sender: Sender<HotkeyEvent>,
        running: Arc<std::sync::atomic::AtomicBool>,
    ) {
        const RECV_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(100);

        while running.load(std::sync::atomic::Ordering::SeqCst) {
            // Block until we receive an event or timeout (to check running flag)
            match listener.recv_timeout(RECV_TIMEOUT) {
                Ok(key_event) => {
                    if let Ok(mut state) = state.lock() {
                        let hotkey_events = state.process_event(&key_event);
                        for event in hotkey_events {
                            if sender.send(event).is_err() {
                                // Receiver dropped, exit
                                return;
                            }
                        }
                    }
                }
                Err(crate::error::Error::Timeout) => {
                    // No event received, loop continues to check running flag
                }
                Err(_) => {
                    // Listener disconnected, exit
                    return;
                }
            }
        }
    }

    /// Register a hotkey and return its unique ID
    ///
    /// Returns an error if the hotkey is already registered.
    pub fn register(&self, hotkey: Hotkey) -> Result<HotkeyId> {
        let mut state = self.state.lock().map_err(|_| Error::MutexPoisoned)?;

        // Check if already registered
        for (id, existing) in &state.hotkeys {
            if existing == &hotkey {
                return Err(Error::HotkeyAlreadyRegistered(format!(
                    "{} (id: {:?})",
                    hotkey, id
                )));
            }
        }

        let id = HotkeyId(state.next_id);
        state.next_id += 1;
        state.hotkeys.insert(id, hotkey);

        // Add to blocking set. Double-tap hotkeys are listened to, never
        // swallowed: a single tap of the modifier is ordinary keyboard use
        // (Option+arrow, Option as a dead key) and other apps must see it.
        if let Some(blocking_hotkeys) = &self.blocking_hotkeys {
            if blocks_hotkey(&hotkey) {
                if let Ok(mut blocking) = blocking_hotkeys.lock() {
                    blocking.insert(hotkey);
                }
            }
        }

        Ok(id)
    }

    /// Unregister a hotkey by its ID
    ///
    /// Returns an error if the hotkey ID is not found.
    pub fn unregister(&self, id: HotkeyId) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| Error::MutexPoisoned)?;

        let hotkey = state.hotkeys.remove(&id);
        if hotkey.is_none() {
            return Err(Error::HotkeyNotFound(id));
        }

        // Remove from blocking set
        if let Some(blocking_hotkeys) = &self.blocking_hotkeys {
            if let Some(hotkey) = hotkey {
                if let Ok(mut blocking) = blocking_hotkeys.lock() {
                    blocking.remove(&hotkey);
                }
            }
        }

        Ok(())
    }

    /// Get the hotkey definition associated with an ID
    ///
    /// Returns `None` if the ID is not found.
    pub fn get_hotkey(&self, id: HotkeyId) -> Option<Hotkey> {
        let state = self.state.lock().ok()?;
        state.hotkeys.get(&id).copied()
    }

    /// Blocking receive for hotkey events
    ///
    /// Blocks until a hotkey event is received or the event loop stops.
    pub fn recv(&self) -> Result<HotkeyEvent> {
        self.event_receiver
            .recv()
            .map_err(|_| Error::EventLoopNotRunning)
    }

    /// Non-blocking receive for hotkey events
    ///
    /// Returns `Some(event)` if an event is available, `None` otherwise.
    pub fn try_recv(&self) -> Option<HotkeyEvent> {
        match self.event_receiver.try_recv() {
            Ok(event) => Some(event),
            Err(TryRecvError::Empty) => None,
            Err(TryRecvError::Disconnected) => None,
        }
    }

    /// Get the number of currently registered hotkeys
    pub fn hotkey_count(&self) -> usize {
        let state = if let Ok(s) = self.state.lock() {
            s
        } else {
            return 0;
        };
        state.hotkeys.len()
    }
}

impl Drop for HotkeyManager {
    fn drop(&mut self) {
        self.running
            .store(false, std::sync::atomic::Ordering::SeqCst);
        // Join the thread to ensure clean shutdown
        if let Some(handle) = self._thread_handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Key, Modifiers};

    fn make_key_event(modifiers: Modifiers, key: Option<Key>, is_key_down: bool) -> KeyEvent {
        KeyEvent {
            modifiers,
            key,
            is_key_down,
            changed_modifier: None,
        }
    }

    fn make_modifier_event(
        modifiers: Modifiers,
        is_key_down: bool,
        changed: Modifiers,
    ) -> KeyEvent {
        KeyEvent {
            modifiers,
            key: None,
            is_key_down,
            changed_modifier: Some(changed),
        }
    }

    mod manager_state {
        use super::*;

        #[test]
        fn register_and_lookup_hotkey() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();

            let id = HotkeyId(state.next_id);
            state.next_id += 1;
            state.hotkeys.insert(id, hotkey);

            assert_eq!(state.hotkeys.get(&id), Some(&hotkey));
            assert_eq!(state.hotkeys.len(), 1);
        }

        #[test]
        fn hotkey_press_generates_event() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Simulate Cmd+K key down (event uses side-specific modifier)
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].id, id);
            assert_eq!(results[0].state, HotkeyState::Pressed);
            assert!(state.pressed_hotkeys.contains(&id));
        }

        #[test]
        fn hotkey_release_generates_event() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Press first
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            state.process_event(&event);

            // Then release the key
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), false);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].id, id);
            assert_eq!(results[0].state, HotkeyState::Released);
            assert!(!state.pressed_hotkeys.contains(&id));
        }

        #[test]
        fn no_duplicate_press_events() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Press once
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);

            // Press again (key repeat) - should not generate another event
            let results = state.process_event(&event);
            assert_eq!(results.len(), 0);
        }

        #[test]
        fn modifier_release_triggers_hotkey_release() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Press Cmd+K
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            state.process_event(&event);
            assert!(state.pressed_hotkeys.contains(&id));

            // Release Cmd (while K is still held) - modifier event
            let event = make_modifier_event(Modifiers::empty(), false, Modifiers::CMD_LEFT);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Released);
            assert!(!state.pressed_hotkeys.contains(&id));
        }

        #[test]
        fn wrong_modifiers_dont_trigger() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            state.hotkeys.insert(HotkeyId(0), hotkey);

            // Press Shift+K instead of Cmd+K
            let event = make_key_event(Modifiers::SHIFT_LEFT, Some(Key::K), true);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 0);
        }

        #[test]
        fn modifier_only_hotkey() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD | Modifiers::SHIFT, None).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Press Cmd+Shift (no key) — events use side-specific modifiers
            let event = make_modifier_event(
                Modifiers::CMD_LEFT | Modifiers::SHIFT_LEFT,
                true,
                Modifiers::SHIFT_LEFT,
            );
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Pressed);
        }

        #[test]
        fn multiple_hotkeys_same_key() {
            let mut state = ManagerState::new();

            // Cmd+K and Ctrl+K
            let hotkey1 = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let hotkey2 = Hotkey::new(Modifiers::CTRL, Key::K).unwrap();
            let id1 = HotkeyId(0);
            let id2 = HotkeyId(1);
            state.hotkeys.insert(id1, hotkey1);
            state.hotkeys.insert(id2, hotkey2);

            // Press Cmd+K
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].id, id1);

            // Press Ctrl+K (release Cmd first)
            state.pressed_hotkeys.clear();
            let event = make_key_event(Modifiers::CTRL_LEFT, Some(Key::K), true);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].id, id2);
        }

        #[test]
        fn key_only_hotkey() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::empty(), Key::F1).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Press F1 with no modifiers
            let event = make_key_event(Modifiers::empty(), Some(Key::F1), true);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Pressed);

            // F1 with modifiers should NOT trigger
            state.pressed_hotkeys.clear();
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::F1), true);
            let results = state.process_event(&event);

            assert_eq!(results.len(), 0);
        }

        #[test]
        fn modifier_only_hotkey_not_released_by_unrelated_modifier() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, None).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Cmd down — hotkey pressed
            let event = make_modifier_event(Modifiers::CMD_LEFT, true, Modifiers::CMD_LEFT);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Pressed);

            // Shift down while Cmd held — no state change
            let event = make_modifier_event(
                Modifiers::CMD_LEFT | Modifiers::SHIFT_LEFT,
                true,
                Modifiers::SHIFT_LEFT,
            );
            assert_eq!(state.process_event(&event).len(), 0);

            // Shift up — Cmd is still held and still matches, so the hotkey
            // must NOT be released
            let event = make_modifier_event(Modifiers::CMD_LEFT, false, Modifiers::SHIFT_LEFT);
            assert_eq!(state.process_event(&event).len(), 0);
            assert!(state.pressed_hotkeys.contains(&id));

            // Cmd up — now it releases
            let event = make_modifier_event(Modifiers::empty(), false, Modifiers::CMD_LEFT);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Released);
            assert!(!state.pressed_hotkeys.contains(&id));
        }

        #[test]
        fn modifier_only_hotkey_releases_on_own_modifier_release() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, None).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            let event = make_modifier_event(Modifiers::CMD_LEFT, true, Modifiers::CMD_LEFT);
            state.process_event(&event);
            assert!(state.pressed_hotkeys.contains(&id));

            let event = make_modifier_event(Modifiers::empty(), false, Modifiers::CMD_LEFT);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Released);
        }

        #[test]
        fn compound_modifier_only_hotkey_releases_on_partial_release() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD | Modifiers::SHIFT, None).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Cmd down, then Shift down — pressed once both are held
            let event = make_modifier_event(Modifiers::CMD_LEFT, true, Modifiers::CMD_LEFT);
            assert_eq!(state.process_event(&event).len(), 0);
            let event = make_modifier_event(
                Modifiers::CMD_LEFT | Modifiers::SHIFT_LEFT,
                true,
                Modifiers::SHIFT_LEFT,
            );
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Pressed);

            // Releasing either modifier breaks the match — released
            let event = make_modifier_event(Modifiers::SHIFT_LEFT, false, Modifiers::CMD_LEFT);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Released);
        }

        #[test]
        fn keyed_hotkey_not_released_by_unrelated_key_release() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            state.process_event(&event);
            assert!(state.pressed_hotkeys.contains(&id));

            // Release of a different key while Cmd+K is held — no release
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::J), false);
            assert_eq!(state.process_event(&event).len(), 0);
            assert!(state.pressed_hotkeys.contains(&id));
        }

        #[test]
        fn side_specific_hotkey_matches_correct_side() {
            let mut state = ManagerState::new();
            // Register CtrlRight+Space
            let hotkey = Hotkey::new(Modifiers::CTRL_RIGHT, Key::Space).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Left ctrl should not trigger
            let event = make_key_event(Modifiers::CTRL_LEFT, Some(Key::Space), true);
            assert_eq!(state.process_event(&event).len(), 0);

            // Right ctrl should trigger
            let event = make_key_event(Modifiers::CTRL_RIGHT, Some(Key::Space), true);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].state, HotkeyState::Pressed);
        }

        #[test]
        fn compound_hotkey_matches_either_side() {
            let mut state = ManagerState::new();
            let hotkey = Hotkey::new(Modifiers::CMD, Key::K).unwrap();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, hotkey);

            // Left Cmd triggers
            let event = make_key_event(Modifiers::CMD_LEFT, Some(Key::K), true);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);

            // Release
            state.pressed_hotkeys.clear();

            // Right Cmd also triggers
            let event = make_key_event(Modifiers::CMD_RIGHT, Some(Key::K), true);
            let results = state.process_event(&event);
            assert_eq!(results.len(), 1);
        }
    }

    mod double_tap {
        use super::*;

        fn option_right() -> Hotkey {
            "double_tap+option_right".parse().unwrap()
        }

        fn press_option(down: bool) -> KeyEvent {
            if down {
                make_modifier_event(Modifiers::OPT_RIGHT, true, Modifiers::OPT_RIGHT)
            } else {
                make_modifier_event(Modifiers::empty(), false, Modifiers::OPT_RIGHT)
            }
        }

        fn tap(state: &mut ManagerState, at: Instant) {
            state.process_event_at(&press_option(true), at);
            state.process_event_at(&press_option(false), at + Duration::from_millis(50));
        }

        /// Two quick taps starting at `at`; returns the events the second
        /// release produced.
        fn fire_pair(state: &mut ManagerState, at: Instant) -> Vec<HotkeyEvent> {
            tap(state, at);
            state.process_event_at(&press_option(true), at + Duration::from_millis(200));
            state.process_event_at(&press_option(false), at + Duration::from_millis(250))
        }

        #[test]
        fn second_tap_fires_one_press_release_pair() {
            let mut state = ManagerState::new();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, option_right());
            let t0 = Instant::now();

            // First tap: arms only.
            assert!(state.process_event_at(&press_option(true), t0).is_empty());
            assert!(state
                .process_event_at(&press_option(false), t0 + Duration::from_millis(50))
                .is_empty());
            // Second tap: its release reports one press/release pair.
            assert!(state
                .process_event_at(&press_option(true), t0 + Duration::from_millis(200))
                .is_empty());
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(250));
            assert_eq!(events.len(), 2);
            assert_eq!(events[0].id, id);
            assert_eq!(events[0].state, HotkeyState::Pressed);
            assert_eq!(events[1].state, HotkeyState::Released);
            assert!(state.pressed_hotkeys.is_empty());
        }

        #[test]
        fn each_double_tap_toggles_again() {
            let mut state = ManagerState::new();
            let id = HotkeyId(0);
            state.hotkeys.insert(id, option_right());
            let t0 = Instant::now();

            assert_eq!(fire_pair(&mut state, t0).len(), 2);
            let events = fire_pair(&mut state, t0 + Duration::from_millis(600));
            assert_eq!(events.len(), 2, "the next double tap must fire again");
            assert_eq!(events[0].id, id);
            assert_eq!(events[0].state, HotkeyState::Pressed);
        }

        #[test]
        fn a_single_tap_never_fires() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());

            let events = state.process_event_at(&press_option(true), Instant::now());
            assert!(events.is_empty());
            let events = state.process_event_at(
                &press_option(false),
                Instant::now() + Duration::from_millis(40),
            );
            assert!(events.is_empty());
        }

        #[test]
        fn second_tap_outside_the_window_starts_a_new_pair() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());
            let t0 = Instant::now();

            tap(&mut state, t0);
            // Far outside the window: this tap arms instead of firing.
            tap(&mut state, t0 + Duration::from_millis(900));
            // The next quick tap pairs with it.
            let events =
                state.process_event_at(&press_option(true), t0 + Duration::from_millis(1100));
            assert!(events.is_empty());
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(1150));
            assert_eq!(events.len(), 2);
        }

        #[test]
        fn a_held_modifier_is_not_a_tap() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());
            let t0 = Instant::now();

            state.process_event_at(&press_option(true), t0);
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(500));
            assert!(events.is_empty());

            // A lone tap right after the hold must not pair with it.
            assert!(state
                .process_event_at(&press_option(true), t0 + Duration::from_millis(600))
                .is_empty());
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(650));
            assert!(events.is_empty(), "the hold must not have armed a pair");

            // ...and the tap that follows it pairs normally.
            assert!(state
                .process_event_at(&press_option(true), t0 + Duration::from_millis(800))
                .is_empty());
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(850));
            assert_eq!(events.len(), 2);
        }

        #[test]
        fn a_chord_is_not_a_tap() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());
            let t0 = Instant::now();

            // Option held, then Tab: that is Option+Tab, not a tap of Option.
            state.process_event_at(&press_option(true), t0);
            state.process_event_at(
                &make_key_event(Modifiers::OPT_RIGHT, Some(Key::Tab), true),
                t0 + Duration::from_millis(30),
            );
            state.process_event_at(
                &make_key_event(Modifiers::OPT_RIGHT, Some(Key::Tab), false),
                t0 + Duration::from_millis(60),
            );
            assert!(state
                .process_event_at(&press_option(false), t0 + Duration::from_millis(80))
                .is_empty());

            // Nothing armed: a following quick tap must not fire by itself.
            let events =
                state.process_event_at(&press_option(true), t0 + Duration::from_millis(200));
            assert!(events.is_empty());
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(250));
            assert!(events.is_empty());
        }

        #[test]
        fn keys_between_taps_do_not_spoil_the_pair() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());
            let t0 = Instant::now();

            tap(&mut state, t0);
            // Normal typing between the two taps: Option is not held, so this
            // is not a chord.
            state.process_event_at(
                &make_key_event(Modifiers::empty(), Some(Key::A), true),
                t0 + Duration::from_millis(120),
            );
            state.process_event_at(
                &make_key_event(Modifiers::empty(), Some(Key::A), false),
                t0 + Duration::from_millis(140),
            );

            assert!(state
                .process_event_at(&press_option(true), t0 + Duration::from_millis(220))
                .is_empty());
            let events =
                state.process_event_at(&press_option(false), t0 + Duration::from_millis(270));
            assert_eq!(events.len(), 2);
        }

        #[test]
        fn unrelated_events_do_not_fire() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());
            let t0 = Instant::now();

            // A release with no press before it, then a plain key release with
            // nothing held: neither is a hotkey edge.
            assert!(state.process_event_at(&press_option(false), t0).is_empty());
            assert!(state
                .process_event_at(
                    &make_key_event(Modifiers::empty(), Some(Key::A), false),
                    t0 + Duration::from_millis(20),
                )
                .is_empty());
        }

        /// A double-tap trigger must never be swallowed: the taps that arm it
        /// are ordinary keyboard use for every other app (issue: exclusive
        /// shortcuts breaking Option+arrow).
        #[test]
        fn double_tap_hotkeys_are_never_blocked() {
            assert!(!blocks_hotkey(&option_right()));
            assert!(!blocks_hotkey(
                &"double_tap+ctrl+space".parse::<Hotkey>().unwrap()
            ));
            // Plain hotkeys are still blocked, or exclusive mode would do
            // nothing for them.
            assert!(blocks_hotkey(&"option_right".parse::<Hotkey>().unwrap()));
            assert!(blocks_hotkey(&"ctrl+space".parse::<Hotkey>().unwrap()));
        }

        #[test]
        fn keyed_double_tap_fires_on_the_key() {
            let mut state = ManagerState::new();
            let id = HotkeyId(0);
            state
                .hotkeys
                .insert(id, "double_tap+ctrl+space".parse().unwrap());
            let t0 = Instant::now();

            let space = |down: bool| make_key_event(Modifiers::CTRL_LEFT, Some(Key::Space), down);
            let ctrl = |down: bool| {
                make_modifier_event(
                    if down {
                        Modifiers::CTRL_LEFT
                    } else {
                        Modifiers::empty()
                    },
                    down,
                    Modifiers::CTRL_LEFT,
                )
            };

            state.process_event_at(&ctrl(true), t0);
            state.process_event_at(&space(true), t0 + Duration::from_millis(10));
            state.process_event_at(&space(false), t0 + Duration::from_millis(40));
            state.process_event_at(&space(true), t0 + Duration::from_millis(180));
            let events = state.process_event_at(&space(false), t0 + Duration::from_millis(220));
            assert_eq!(events.len(), 2);
            assert_eq!(events[0].id, id);
            assert_eq!(events[0].state, HotkeyState::Pressed);
        }

        #[test]
        fn a_lone_release_does_nothing() {
            let mut state = ManagerState::new();
            state.hotkeys.insert(HotkeyId(0), option_right());

            // Some listeners report key-ups for keys they never saw go down.
            assert!(state
                .process_event_at(&press_option(false), Instant::now())
                .is_empty());
        }
    }
}
