//! Escape and Enter for the HUD.
//!
//! The HUD never takes focus (so Insert pastes into the user's app), which
//! means its webview never sees a key press. While a card that advertises a
//! key is on screen, that key is taken globally and swallowed: Esc dismisses
//! (or stops), ⏎ runs a suggestion's primary action. The moment the card
//! goes, the key is given back. With no card showing, Escape and Enter are
//! never touched, and the writing chip (which sits beside the user's typing)
//! never takes either.
//!
//! Which hook takes the key: ambient-keys, the hook that already runs the
//! user's own shortcuts, when it's running and swallowing them; otherwise the
//! system's hotkey API through the global-shortcut plugin (Carbon on macOS,
//! RegisterHotKey on Windows, an X11 grab on Linux). Never both: one press
//! would be seen twice, or seen without being swallowed.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::hud::HudContent;

/// A suggestion takes ⏎ only after it has been up this long, so the Enter
/// that ends a line the user was already typing never accepts an offer that
/// appeared under their fingers.
pub const ENTER_GRACE: Duration = Duration::from_millis(800);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HudKey {
    Escape,
    Enter,
}

impl HudKey {
    /// The binding id when the key is held through ambient-keys.
    fn binding_id(self) -> &'static str {
        match self {
            HudKey::Escape => "hud_escape",
            HudKey::Enter => "hud_enter",
        }
    }

    fn name(self) -> &'static str {
        match self {
            HudKey::Escape => "escape",
            HudKey::Enter => "enter",
        }
    }

    /// The HUD key an ambient-keys binding id stands for.
    pub fn from_binding(id: &str) -> Option<HudKey> {
        [HudKey::Escape, HudKey::Enter]
            .into_iter()
            .find(|k| k.binding_id() == id)
    }
}

/// What a key does to the card on screen.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyAction {
    Dismiss,
    /// Acting steps: stop what's running.
    Stop,
    /// A suggestion's primary action ("Summarise", "Draft reply"…).
    Accept,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Wanted {
    pub escape: Option<KeyAction>,
    pub enter: Option<KeyAction>,
}

impl Wanted {
    fn get(self, key: HudKey) -> Option<KeyAction> {
        match key {
            HudKey::Escape => self.escape,
            HudKey::Enter => self.enter,
        }
    }
}

/// The keys the card on screen advertises. `recording`: a recording's cancel
/// shortcut owns Escape. `shown_for`: how long this card has been up.
pub fn wanted(card: Option<&HudContent>, recording: bool, shown_for: Duration) -> Wanted {
    let Some(card) = card else {
        return Wanted::default();
    };
    let escape = match card {
        // Passive: the user is typing beside it.
        HudContent::Writing { .. } => None,
        HudContent::Steps { done: false, .. } => Some(KeyAction::Stop),
        _ => Some(KeyAction::Dismiss),
    };
    let enter = match card {
        HudContent::Suggestion { .. } if shown_for >= ENTER_GRACE => Some(KeyAction::Accept),
        _ => None,
    };
    Wanted {
        escape: if recording { None } else { escape },
        enter,
    }
}

/// Where a key is held.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backend {
    /// ambient-keys, the user's own shortcut hook.
    Hook,
    /// The system hotkey API (global-shortcut plugin).
    System,
}

/// The hook only when it swallows what it catches (exclusive shortcuts on,
/// blocking started) and can see keys at all (macOS Secure Input blinds it;
/// system hotkeys still arrive).
pub fn choose_backend(hook_running: bool, hook_swallows: bool, secure_input: bool) -> Backend {
    if hook_running && hook_swallows && !secure_input {
        Backend::Hook
    } else {
        Backend::System
    }
}

/// What to do for one key: give it back from `release`, then take it on
/// `take`. Moving between backends releases first.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Change {
    pub release: Option<Backend>,
    pub take: Option<Backend>,
}

pub fn change(held: Option<Backend>, want: bool, backend: Backend) -> Change {
    match (held, want) {
        (Some(b), true) if b == backend => Change::default(),
        (Some(b), true) => Change {
            release: Some(b),
            take: Some(backend),
        },
        (Some(b), false) => Change {
            release: Some(b),
            take: None,
        },
        (None, true) => Change {
            release: None,
            take: Some(backend),
        },
        (None, false) => Change::default(),
    }
}

#[derive(Default)]
struct Held {
    escape: Option<Backend>,
    enter: Option<Backend>,
}

impl Held {
    fn slot(&mut self, key: HudKey) -> &mut Option<Backend> {
        match key {
            HudKey::Escape => &mut self.escape,
            HudKey::Enter => &mut self.enter,
        }
    }
}

/// What's held where. The lock also serializes reconciliation passes.
static HELD: Mutex<Held> = Mutex::new(Held {
    escape: None,
    enter: None,
});
/// The card on screen and when it first appeared (a card updating in
/// place, like a streaming answer, keeps its time).
static SHOWN: Mutex<Option<(String, &'static str, Instant)>> = Mutex::new(None);
/// The suggestion just accepted: it waits for its result without ⏎, so a
/// second Enter goes to the user's app rather than to a no-op.
static ACCEPTED: Mutex<Option<String>> = Mutex::new(None);
/// A re-check is already scheduled for the end of the Enter grace.
static GRACE_PENDING: AtomicBool = AtomicBool::new(false);

fn shown_for(card: Option<&HudContent>) -> Duration {
    let mut g = SHOWN.lock().unwrap_or_else(|e| e.into_inner());
    let Some(card) = card else {
        *g = None;
        return Duration::ZERO;
    };
    let (id, kind) = (card.id(), card.kind());
    match &*g {
        Some((i, k, at)) if *i == id && *k == kind => at.elapsed(),
        _ => {
            *g = Some((id, kind, Instant::now()));
            Duration::ZERO
        }
    }
}

/// A suggestion was accepted (click, ⏎ or voice): give ⏎ back.
pub fn accepted(app: &AppHandle, id: &str) {
    if let Ok(mut g) = ACCEPTED.lock() {
        *g = Some(id.to_string());
    }
    sync(app);
}

/// `wanted`, for the card on screen now.
fn wanted_now(card: Option<&HudContent>) -> Wanted {
    let since = shown_for(card);
    let mut want = wanted(card, crate::shortcut::cancel_requested(), since);
    let accepted = card.is_some_and(|c| {
        ACCEPTED
            .lock()
            .is_ok_and(|g| g.as_deref() == Some(c.id().as_str()))
    });
    if accepted {
        want.enter = None;
    }
    want
}

fn backend(app: &AppHandle) -> Backend {
    let hook_running = crate::settings::get_settings(app).keyboard_implementation
        == crate::settings::KeyboardImplementation::AmbientKeys
        && app
            .try_state::<crate::shortcut::ambient_keys::AmbientKeysState>()
            .is_some();
    choose_backend(
        hook_running,
        crate::shortcut::ambient_keys::blocking_active(),
        crate::secure_input::is_enabled_now(),
    )
}

/// Bring the held keys in line with the card on screen, off the calling
/// thread: callers include the hook's own thread, which must not wait on
/// itself. Each pass applies the latest state, so passes may run in any
/// order.
pub fn sync(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || sync_now(&app));
}

/// `sync`, on this thread. Never call from the ambient-keys manager thread.
pub fn sync_now(app: &AppHandle) {
    let mut held = HELD.lock().unwrap_or_else(|e| e.into_inner());
    let card = crate::hud::is_visible().then(crate::hud::current).flatten();
    let want = wanted_now(card.as_ref());
    let since = shown_for(card.as_ref());
    let backend = backend(app);
    for key in [HudKey::Escape, HudKey::Enter] {
        let slot = held.slot(key);
        let c = change(*slot, want.get(key).is_some(), backend);
        if let Some(b) = c.release {
            release(app, key, b);
            *slot = None;
        }
        if let Some(b) = c.take {
            if take(app, key, b) {
                *slot = Some(b);
            }
        }
    }
    // A suggestion inside its Enter grace: look again when it ends.
    if matches!(card, Some(HudContent::Suggestion { .. }))
        && since < ENTER_GRACE
        && !GRACE_PENDING.swap(true, Ordering::SeqCst)
    {
        let app = app.clone();
        let wait = ENTER_GRACE - since + Duration::from_millis(20);
        std::thread::spawn(move || {
            std::thread::sleep(wait);
            GRACE_PENDING.store(false, Ordering::SeqCst);
            sync_now(&app);
        });
    }
}

fn binding(key: HudKey) -> crate::settings::ShortcutBinding {
    crate::settings::ShortcutBinding {
        id: key.binding_id().into(),
        name: key.binding_id().into(),
        description: String::new(),
        default_binding: key.name().into(),
        current_binding: key.name().into(),
    }
}

fn system_shortcut(key: HudKey) -> Option<Shortcut> {
    match key {
        HudKey::Escape => "Escape",
        HudKey::Enter => "Enter",
    }
    .parse()
    .ok()
}

fn take(app: &AppHandle, key: HudKey, backend: Backend) -> bool {
    let result = match backend {
        Backend::Hook => crate::shortcut::ambient_keys::register_shortcut(app, binding(key)),
        Backend::System => {
            let Some(shortcut) = system_shortcut(key) else {
                return false;
            };
            let gs = app.global_shortcut();
            // The user's own shortcut (a recording's cancel) has it.
            if gs.is_registered(shortcut) {
                return false;
            }
            gs.on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    pressed(app, key);
                }
            })
            .map_err(|e| e.to_string())
        }
    };
    match result {
        Ok(()) => {
            log::debug!("HUD: holding {} ({backend:?})", key.name());
            true
        }
        Err(e) => {
            log::debug!("HUD: couldn't hold {} ({backend:?}): {e}", key.name());
            false
        }
    }
}

fn release(app: &AppHandle, key: HudKey, backend: Backend) {
    let result = match backend {
        Backend::Hook => crate::shortcut::ambient_keys::unregister_shortcut(app, binding(key)),
        Backend::System => match system_shortcut(key) {
            Some(s) => app
                .global_shortcut()
                .unregister(s)
                .map_err(|e| e.to_string()),
            None => Ok(()),
        },
    };
    match result {
        Ok(()) => log::debug!("HUD: gave back {}", key.name()),
        Err(e) => log::warn!("HUD: couldn't give back {}: {e}", key.name()),
    }
}

/// A held key was pressed. The card is read again here: it may have changed
/// since the key was taken.
pub fn pressed(app: &AppHandle, key: HudKey) {
    let card = crate::hud::is_visible().then(crate::hud::current).flatten();
    let action = wanted_now(card.as_ref()).get(key);
    if let (Some(card), Some(action)) = (card, action) {
        crate::hud::on_key(app, &card, action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn suggestion() -> HudContent {
        HudContent::Suggestion {
            id: "suggest-1".into(),
            title: "hud.suggest.summariseThread".into(),
            accept_label: "hud.suggest.summarise".into(),
            vars: BTreeMap::new(),
        }
    }

    fn writing() -> HudContent {
        HudContent::Writing {
            id: "writing-1".into(),
            decision: "polished".into(),
            note: None,
            revert: true,
            edit: false,
        }
    }

    #[test]
    fn nothing_is_held_without_a_card() {
        assert_eq!(wanted(None, false, Duration::ZERO), Wanted::default());
    }

    #[test]
    fn a_suggestion_takes_escape_at_once_and_enter_after_the_grace() {
        let s = suggestion();
        let early = wanted(Some(&s), false, Duration::from_millis(100));
        assert_eq!(early.escape, Some(KeyAction::Dismiss));
        assert_eq!(early.enter, None);
        let later = wanted(Some(&s), false, ENTER_GRACE);
        assert_eq!(later.escape, Some(KeyAction::Dismiss));
        assert_eq!(later.enter, Some(KeyAction::Accept));
    }

    #[test]
    fn enter_is_only_for_suggestions() {
        let status = HudContent::Status {
            text: "hud.status.undone".into(),
            tone: crate::hud::HudTone::Neutral,
            undo: false,
        };
        let w = wanted(Some(&status), false, Duration::from_secs(5));
        assert_eq!(w.escape, Some(KeyAction::Dismiss));
        assert_eq!(w.enter, None);
    }

    #[test]
    fn the_writing_chip_never_takes_a_key() {
        assert_eq!(
            wanted(Some(&writing()), false, Duration::from_secs(5)),
            Wanted::default()
        );
    }

    #[test]
    fn running_steps_stop_on_escape() {
        let steps = |done| HudContent::Steps {
            id: "steps-1".into(),
            title: String::new(),
            steps: vec![],
            done,
        };
        assert_eq!(
            wanted(Some(&steps(false)), false, Duration::ZERO).escape,
            Some(KeyAction::Stop)
        );
        assert_eq!(
            wanted(Some(&steps(true)), false, Duration::ZERO).escape,
            Some(KeyAction::Dismiss)
        );
    }

    #[test]
    fn a_recording_keeps_escape_for_its_cancel() {
        let w = wanted(Some(&suggestion()), true, ENTER_GRACE);
        assert_eq!(w.escape, None);
        assert_eq!(w.enter, Some(KeyAction::Accept));
    }

    #[test]
    fn the_hook_only_when_it_swallows_and_can_see() {
        assert_eq!(choose_backend(true, true, false), Backend::Hook);
        // Listening without blocking: the key would reach the app too.
        assert_eq!(choose_backend(true, false, false), Backend::System);
        // Secure Input blinds the hook.
        assert_eq!(choose_backend(true, true, true), Backend::System);
        assert_eq!(choose_backend(false, true, false), Backend::System);
    }

    #[test]
    fn changes_take_release_and_move() {
        use Backend::*;
        assert_eq!(change(None, false, Hook), Change::default());
        assert_eq!(
            change(None, true, Hook),
            Change {
                release: None,
                take: Some(Hook)
            }
        );
        assert_eq!(change(Some(Hook), true, Hook), Change::default());
        // Given back the moment the card goes.
        assert_eq!(
            change(Some(System), false, Hook),
            Change {
                release: Some(System),
                take: None
            }
        );
        // The hook started swallowing (or stopped): move, releasing first.
        assert_eq!(
            change(Some(System), true, Hook),
            Change {
                release: Some(System),
                take: Some(Hook)
            }
        );
    }

    #[test]
    fn hook_bindings_round_trip() {
        for key in [HudKey::Escape, HudKey::Enter] {
            assert_eq!(HudKey::from_binding(key.binding_id()), Some(key));
        }
        assert_eq!(HudKey::from_binding("cancel"), None);
    }
}
