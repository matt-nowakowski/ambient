//! macOS keyboard listener using CGEventTap

use std::cell::Cell;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};

use objc2_core_foundation::{CFMachPort, CFRetained, CFRunLoop, CFRunLoopSource};
use objc2_core_graphics::{
    CGEvent, CGEventField, CGEventFlags, CGEventMask, CGEventSource, CGEventSourceStateID,
    CGEventTapCallBack, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventTapProxy, CGEventType,
};

use crate::error::{Error, Result};
use crate::platform::state::{release_events, stale_modifiers, BlockingHotkeys, ListenerState};
use crate::types::{Key, KeyEvent, Modifiers};

use super::keycode::{flags_have_alpha_shift, flags_have_fn, keycode_to_key, keycode_to_modifier};
use super::permissions::check_accessibility;

/// The tap thread's run loop, handed back to the public listener so Drop can
/// stop it. CFRunLoop is one of the documented thread-safe CF types; objc2
/// doesn't mark it Send, hence the wrapper.
pub(crate) struct TapRunLoop(CFRetained<CFRunLoop>);

unsafe impl Send for TapRunLoop {}

impl TapRunLoop {
    /// Stop the tap thread's run loop. Callable from any thread.
    ///
    /// A bare CFRunLoopStop only affects a loop that is currently between
    /// entry and exit — the stop flag lives in per-run data that is reset on
    /// every entry — so a stop landing in the gap between the `running`
    /// check and CFRunLoopRun entering would be silently lost and the tap
    /// thread would park forever. Enqueue the stop as a run-loop block
    /// instead: the block queue persists across entries, so the request
    /// executes either right away (after the wake-up) or at the next entry.
    /// Both behaviors verified empirically on macOS 26.5: a pre-entry
    /// CFRunLoopStop is a no-op, a pre-entry enqueued block stops the loop
    /// the moment it is entered.
    pub(crate) fn stop(&self) {
        let block = block2::StackBlock::new(|| {
            if let Some(rl) = CFRunLoop::current() {
                rl.stop();
            }
        });
        unsafe {
            self.0.perform_block(
                objc2_core_foundation::kCFRunLoopCommonModes.map(|m| m.as_ref()),
                Some(&block),
            );
        }
        self.0.wake_up();
    }
}

/// Internal listener state returned to KeyboardListener
pub(crate) struct MacOSListenerState {
    pub event_receiver: Receiver<KeyEvent>,
    pub thread_handle: Option<JoinHandle<()>>,
    pub running: Arc<AtomicBool>,
    pub blocking_hotkeys: Option<BlockingHotkeys>,
    pub run_loop: TapRunLoop,
}

/// Spawn a macOS keyboard listener using CGEventTap
pub(crate) fn spawn(blocking_hotkeys: Option<BlockingHotkeys>) -> Result<MacOSListenerState> {
    if !check_accessibility() {
        return Err(Error::AccessibilityNotGranted);
    }

    let (tx, rx) = mpsc::channel();
    let state = Arc::new(Mutex::new(ListenerState::new(tx, blocking_hotkeys.clone())));
    let running = Arc::new(AtomicBool::new(true));

    // Channel reporting event tap creation: the tap thread's run loop on
    // success (needed to stop it later), or an error message.
    let (init_tx, init_rx) = mpsc::channel::<std::result::Result<TapRunLoop, String>>();

    let thread_state = Arc::clone(&state);
    let thread_running = Arc::clone(&running);

    let handle = thread::spawn(move || {
        run_event_tap(thread_state, thread_running, init_tx);
    });

    // Wait for the event tap to be created
    let run_loop = match init_rx.recv() {
        Ok(Ok(run_loop)) => run_loop,
        Ok(Err(msg)) => {
            return Err(Error::EventTapCreationFailed(msg));
        }
        Err(_) => {
            return Err(Error::EventTapCreationFailed(
                "Event tap thread terminated unexpectedly".to_string(),
            ));
        }
    };

    Ok(MacOSListenerState {
        event_receiver: rx,
        thread_handle: Some(handle),
        running,
        blocking_hotkeys,
        run_loop,
    })
}

/// The four modifier groups as (OS flag, left bit, compound bits).
const MODIFIER_GROUPS: [(CGEventFlags, Modifiers, Modifiers); 4] = [
    (
        CGEventFlags::MaskControl,
        Modifiers::CTRL_LEFT,
        Modifiers::CTRL,
    ),
    (
        CGEventFlags::MaskShift,
        Modifiers::SHIFT_LEFT,
        Modifiers::SHIFT,
    ),
    (
        CGEventFlags::MaskCommand,
        Modifiers::CMD_LEFT,
        Modifiers::CMD,
    ),
    (
        CGEventFlags::MaskAlternate,
        Modifiers::OPT_LEFT,
        Modifiers::OPT,
    ),
];

/// Reconcile internally tracked modifiers against the actual CGEventFlags from the OS.
///
/// This corrects drift caused by missed events (e.g., tap disabled by timeout, system
/// interruptions like Mission Control or screen lock). Should only be called for
/// non-FlagsChanged events, where flags reflect the current state with no change pending.
///
/// Returns the synthetic releases for modifiers we tracked as held but the OS
/// says are up; callers must forward them. Without those events the manager
/// keeps believing the key is down, so a push-to-talk shortcut whose release
/// was missed while the tap was disabled never ends its recording.
fn reconcile_modifiers(current: &mut Modifiers, flags: CGEventFlags) -> Vec<KeyEvent> {
    // If OS says a modifier group IS held but we have no bits for it,
    // we missed a press event. Default to left side as fallback.
    for (flag, left, compound) in MODIFIER_GROUPS {
        if flags.contains(flag) && !current.intersects(compound) {
            *current |= left;
        }
    }

    // What the OS reports as physically held, limited to groups we track.
    let mut physical = Modifiers::empty();
    for (flag, _left, compound) in MODIFIER_GROUPS {
        if flags.contains(flag) {
            physical |= *current & compound;
        }
    }

    // If OS says a modifier group is NOT held, clear our tracked bits, and
    // say so on the event channel: this fixes "stuck modifier" from missed
    // release events as well as our own bookkeeping.
    let stale = stale_modifiers(*current, physical);
    let events = release_events(*current, stale);
    *current &= !stale;
    events
}

/// Context handed to the event tap callback through the refcon pointer.
///
/// `tap` is filled in right after `CGEventTapCreate` returns. The callback and
/// `run_event_tap` execute on the same thread (callbacks only fire while that
/// thread runs its run loop), so a plain `Cell` is sound.
struct CallbackCtx {
    state: Arc<Mutex<ListenerState>>,
    tap: Cell<Option<NonNull<CFMachPort>>>,
}

/// The callback function for the event tap
///
/// Returns NULL to block the event, or the event pointer to pass it through.
unsafe extern "C-unwind" fn event_tap_callback(
    _proxy: CGEventTapProxy,
    event_type: CGEventType,
    event: NonNull<CGEvent>,
    user_info: *mut c_void,
) -> *mut CGEvent {
    // Safety: user_info is the CallbackCtx owned by run_event_tap
    let ctx = &*(user_info as *const CallbackCtx);

    // Handle tap-disable pseudo-events before touching the state lock: macOS
    // stops delivering real events until the tap is re-enabled, so recovery
    // must not depend on the mutex being healthy. Re-enabling from the
    // callback (rather than polling CGEventTapIsEnabled from the run loop) is
    // the Apple-documented pattern and avoids recurring WindowServer RPCs —
    // those leak kernel IPC vouchers and eventually panic the whole machine
    // (upstream #1827).
    if matches!(
        event_type,
        CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput
    ) {
        if let Some(tap) = ctx.tap.get() {
            CGEvent::tap_enable(tap.as_ref(), true);
        }
        // Reconcile modifiers: we may have missed events while disabled, and
        // the releases we report end any shortcut left waiting on them.
        if let Ok(mut state) = ctx.state.lock() {
            let releases = reconcile_modifiers(
                &mut state.current_modifiers,
                CGEventSource::flags_state(CGEventSourceStateID::CombinedSessionState),
            );
            for release in releases {
                let _ = state.event_sender.send(release);
            }
        }
        return event.as_ptr();
    }

    let cg_event = event.as_ref();
    let flags = CGEvent::flags(Some(cg_event));

    let mut should_block = false;

    if let Ok(mut state) = ctx.state.lock() {
        // Reconcile tracked modifiers against OS flags for non-FlagsChanged events.
        // On FlagsChanged, flags reflect the state *after* the current change, so
        // reconciling would fight with the toggle logic.
        if event_type != CGEventType::FlagsChanged {
            let releases = reconcile_modifiers(&mut state.current_modifiers, flags);
            for release in releases {
                let _ = state.event_sender.send(release);
            }
        }

        // Build side-specific modifiers from internally tracked state + FN from flags
        let modifiers = if flags_have_fn(flags) {
            state.current_modifiers | Modifiers::FN
        } else {
            state.current_modifiers & !Modifiers::FN
        };

        match event_type {
            CGEventType::KeyDown => {
                let keycode = CGEvent::integer_value_field(
                    Some(cg_event),
                    CGEventField::KeyboardEventKeycode,
                ) as u16;

                let key = keycode_to_key(keycode);

                // Skip keycodes we can't map (e.g. special function keys like
                // Mission Control's 0xA0, or the Globe key's configured action).
                // A key-less KeyEvent carries no usable information, and the
                // Windows/Linux backends already emit mapped keys only.
                if key.is_none() {
                    return event.as_ptr();
                }

                // Check if this should be blocked
                should_block = state.should_block(modifiers, key);

                let _ = state.event_sender.send(KeyEvent {
                    modifiers,
                    key,
                    is_key_down: true,
                    changed_modifier: None,
                });
            }
            CGEventType::KeyUp => {
                let keycode = CGEvent::integer_value_field(
                    Some(cg_event),
                    CGEventField::KeyboardEventKeycode,
                ) as u16;

                let key = keycode_to_key(keycode);

                // Skip unmapped keycodes (same as KeyDown)
                if key.is_none() {
                    return event.as_ptr();
                }

                // Block key up if we blocked key down (to be consistent)
                should_block = state.should_block(modifiers, key);

                let _ = state.event_sender.send(KeyEvent {
                    modifiers,
                    key,
                    is_key_down: false,
                    changed_modifier: None,
                });
            }
            CGEventType::FlagsChanged => {
                let keycode = CGEvent::integer_value_field(
                    Some(cg_event),
                    CGEventField::KeyboardEventKeycode,
                ) as u16;

                let changed_modifier = keycode_to_modifier(keycode);

                // Check if this is a lock key (e.g., Caps Lock) which comes through
                // as FlagsChanged but isn't a traditional modifier
                let lock_key = keycode_to_key(keycode);

                // Handle lock keys specially - they come through FlagsChanged
                // but don't change our tracked modifier state
                if let Some(key) = lock_key {
                    let is_key_down = flags_have_alpha_shift(flags);

                    should_block = state.should_block(modifiers, Some(key));

                    let _ = state.event_sender.send(KeyEvent {
                        modifiers,
                        key: Some(key),
                        is_key_down,
                        changed_modifier: None,
                    });
                } else if let Some(modifier_bit) = changed_modifier {
                    // Regular modifier key — use keycode to toggle the specific bit
                    let was_set = state.current_modifiers.contains(modifier_bit);
                    let is_key_down = !was_set;

                    if is_key_down {
                        state.current_modifiers |= modifier_bit;
                    } else {
                        state.current_modifiers &= !modifier_bit;
                    }

                    // Re-derive modifiers after update (include FN from flags)
                    let new_modifiers = if flags_have_fn(flags) {
                        state.current_modifiers | Modifiers::FN
                    } else {
                        state.current_modifiers & !Modifiers::FN
                    };

                    // Check if this modifier-only combo should be blocked
                    if is_key_down {
                        should_block = state.should_block(new_modifiers, None);
                    }

                    let _ = state.event_sender.send(KeyEvent {
                        modifiers: new_modifiers,
                        key: None,
                        is_key_down,
                        changed_modifier,
                    });
                } else if keycode == 0x3F {
                    // FN key itself — tracked via flags, not keycode state
                    let had_fn = modifiers.contains(Modifiers::FN);
                    let has_fn = flags_have_fn(flags);
                    if had_fn != has_fn {
                        let new_modifiers = if has_fn {
                            state.current_modifiers | Modifiers::FN
                        } else {
                            state.current_modifiers & !Modifiers::FN
                        };

                        if has_fn {
                            should_block = state.should_block(new_modifiers, None);
                        }

                        let _ = state.event_sender.send(KeyEvent {
                            modifiers: new_modifiers,
                            key: None,
                            is_key_down: has_fn,
                            changed_modifier: Some(Modifiers::FN),
                        });
                    }
                }
            }
            // Mouse button events
            // Only report left/right clicks when modifiers are held (to avoid noise)
            CGEventType::LeftMouseDown if !modifiers.is_empty() => {
                let _ = state.event_sender.send(KeyEvent {
                    modifiers,
                    key: Some(Key::MouseLeft),
                    is_key_down: true,
                    changed_modifier: None,
                });
            }
            CGEventType::LeftMouseUp if !modifiers.is_empty() => {
                let _ = state.event_sender.send(KeyEvent {
                    modifiers,
                    key: Some(Key::MouseLeft),
                    is_key_down: false,
                    changed_modifier: None,
                });
            }
            CGEventType::RightMouseDown if !modifiers.is_empty() => {
                let _ = state.event_sender.send(KeyEvent {
                    modifiers,
                    key: Some(Key::MouseRight),
                    is_key_down: true,
                    changed_modifier: None,
                });
            }
            CGEventType::RightMouseUp if !modifiers.is_empty() => {
                let _ = state.event_sender.send(KeyEvent {
                    modifiers,
                    key: Some(Key::MouseRight),
                    is_key_down: false,
                    changed_modifier: None,
                });
            }
            // Pass through unmodified left/right clicks
            CGEventType::LeftMouseDown
            | CGEventType::LeftMouseUp
            | CGEventType::RightMouseDown
            | CGEventType::RightMouseUp => {}
            CGEventType::OtherMouseDown => {
                let button_number = CGEvent::integer_value_field(
                    Some(cg_event),
                    CGEventField::MouseEventButtonNumber,
                );
                let key = match button_number {
                    2 => Some(Key::MouseMiddle),
                    3 => Some(Key::MouseX1),
                    4 => Some(Key::MouseX2),
                    _ => None, // Unknown button
                };
                if let Some(key) = key {
                    let _ = state.event_sender.send(KeyEvent {
                        modifiers,
                        key: Some(key),
                        is_key_down: true,
                        changed_modifier: None,
                    });
                }
            }
            CGEventType::OtherMouseUp => {
                let button_number = CGEvent::integer_value_field(
                    Some(cg_event),
                    CGEventField::MouseEventButtonNumber,
                );
                let key = match button_number {
                    2 => Some(Key::MouseMiddle),
                    3 => Some(Key::MouseX1),
                    4 => Some(Key::MouseX2),
                    _ => None,
                };
                if let Some(key) = key {
                    let _ = state.event_sender.send(KeyEvent {
                        modifiers,
                        key: Some(key),
                        is_key_down: false,
                        changed_modifier: None,
                    });
                }
            }
            // TapDisabledByTimeout/TapDisabledByUserInput are handled (and
            // returned from) before the state lock above.
            _ => {}
        }
    }

    if should_block {
        // Block the event from reaching other applications
        std::ptr::null_mut()
    } else {
        // Pass the event through unchanged
        event.as_ptr()
    }
}

/// Run the event tap in a dedicated thread
fn run_event_tap(
    state: Arc<Mutex<ListenerState>>,
    running: Arc<AtomicBool>,
    init_tx: Sender<std::result::Result<TapRunLoop, String>>,
) {
    // Event types we want to monitor
    let event_mask: CGEventMask = (1 << CGEventType::KeyDown.0)
        | (1 << CGEventType::KeyUp.0)
        | (1 << CGEventType::FlagsChanged.0)
        // Mouse buttons
        | (1 << CGEventType::LeftMouseDown.0)
        | (1 << CGEventType::LeftMouseUp.0)
        | (1 << CGEventType::RightMouseDown.0)
        | (1 << CGEventType::RightMouseUp.0)
        | (1 << CGEventType::OtherMouseDown.0)
        | (1 << CGEventType::OtherMouseUp.0);

    // Callback context, handed to the tap as a raw refcon pointer
    let ctx_ptr = Box::into_raw(Box::new(CallbackCtx {
        state: Arc::clone(&state),
        tap: Cell::new(None),
    }));

    let callback: CGEventTapCallBack = Some(event_tap_callback);

    // Use Default mode (not ListenOnly) to enable optional event blocking
    let tap: Option<CFRetained<CFMachPort>> = unsafe {
        CGEvent::tap_create(
            CGEventTapLocation::SessionEventTap,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            event_mask,
            callback,
            ctx_ptr as *mut c_void,
        )
    };

    let tap = match tap {
        Some(t) => t,
        None => {
            // Cleanup
            unsafe {
                drop(Box::from_raw(ctx_ptr));
            }
            let _ = init_tx.send(Err(
                "Failed to create event tap. Your terminal app may need accessibility permission in System Settings > Privacy & Security > Accessibility".to_string()
            ));
            return;
        }
    };

    // Give the callback the tap port so it can re-enable on TapDisabledBy*
    // pseudo-events. No race: callbacks only run on this thread's run loop,
    // which hasn't started yet.
    unsafe { (*ctx_ptr).tap.set(Some(NonNull::from(&*tap))) };

    // Create run loop source
    let source: Option<CFRetained<CFRunLoopSource>> =
        CFMachPort::new_run_loop_source(None, Some(&tap), 0);

    let source = match source {
        Some(s) => s,
        None => {
            unsafe {
                CFMachPort::invalidate(&tap);
                drop(Box::from_raw(ctx_ptr));
            }
            let _ = init_tx.send(Err("Failed to create run loop source".to_string()));
            return;
        }
    };

    // Get the current run loop and add the source
    let run_loop = CFRunLoop::current();

    // Unwrap the Option<CFRetained<CFRunLoop>> - current() should always succeed on a valid thread
    let run_loop = match run_loop {
        Some(rl) => rl,
        None => {
            unsafe {
                CFMachPort::invalidate(&tap);
                drop(Box::from_raw(ctx_ptr));
            }
            let _ = init_tx.send(Err("Failed to get current run loop".to_string()));
            return;
        }
    };

    run_loop.add_source(Some(&source), unsafe {
        objc2_core_foundation::kCFRunLoopCommonModes
    });
    CGEvent::tap_enable(&tap, true);

    // Signal successful initialization, handing back this thread's run loop
    // so KeyboardListener::drop can stop it.
    let _ = init_tx.send(Ok(TapRunLoop(run_loop.clone())));

    // Park in the run loop: no periodic wakeups, no watchdog. v0.3.2 cycled
    // CFRunLoopRunInMode every 100ms and polled CGEventTapIsEnabled each
    // pass; that RPC leaked kernel IPC vouchers until macOS panicked with
    // "Cannot grow ipc space beyond IVAC_ENTRIES_MAX" (upstream #1827),
    // and even the bare 100ms cycling cost ~10 mach messages/sec. Tap
    // recovery is event-driven in event_tap_callback; shutdown goes through
    // TapRunLoop::stop. Guarded by `running` in case the loop returns
    // without a stop request; bail out if the tap's port died (e.g. the
    // accessibility permission was revoked) so we don't spin on a dead
    // source.
    while running.load(std::sync::atomic::Ordering::SeqCst) {
        CFRunLoop::run();

        if !CFMachPort::is_valid(&tap) {
            break;
        }
    }

    // Cleanup
    run_loop.remove_source(Some(&source), unsafe {
        objc2_core_foundation::kCFRunLoopCommonModes
    });
    CGEvent::tap_enable(&tap, false);
    CFMachPort::invalidate(&tap);
    unsafe {
        drop(Box::from_raw(ctx_ptr));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    use objc2_core_foundation::CFRunLoopTimer;

    unsafe extern "C-unwind" fn noop_timer(_timer: *mut CFRunLoopTimer, _info: *mut c_void) {}

    /// The stop request must survive being issued before the run loop has
    /// been entered. A bare CFRunLoopStop is lost in that window (the stop
    /// flag lives in per-run data reset on entry), which would park the tap
    /// thread forever and hang KeyboardListener::drop. Needs no
    /// accessibility permission, so it runs everywhere including CI.
    #[test]
    fn stop_requested_before_run_entry_is_not_lost() {
        let (tx, rx) = mpsc::channel();
        let handle = thread::spawn(move || {
            let rl = CFRunLoop::current().expect("thread has a run loop");

            // A far-future timer keeps the mode non-empty so run_in_mode
            // actually blocks instead of returning Finished immediately.
            let timer = unsafe {
                CFRunLoopTimer::new(
                    None,
                    objc2_core_foundation::CFAbsoluteTimeGetCurrent() + 3600.0,
                    0.0,
                    0,
                    0,
                    Some(noop_timer),
                    std::ptr::null_mut(),
                )
            }
            .expect("create timer");
            rl.add_timer(Some(&timer), unsafe {
                objc2_core_foundation::kCFRunLoopDefaultMode
            });

            tx.send(TapRunLoop(rl.clone())).unwrap();

            // Guarantee the main thread's stop lands while this thread is
            // provably outside the run loop.
            thread::sleep(Duration::from_millis(200));

            let started = Instant::now();
            // Bounded run: if the stop request was lost this returns at the
            // 5s timeout and the elapsed assertion below fails, instead of
            // hanging the test.
            CFRunLoop::run_in_mode(
                unsafe { objc2_core_foundation::kCFRunLoopDefaultMode },
                5.0,
                false,
            );
            started.elapsed()
        });

        let run_loop = rx.recv().expect("run loop handle");
        run_loop.stop(); // lands before the thread enters the run loop

        let elapsed = handle.join().expect("tap thread panicked");
        assert!(
            elapsed < Duration::from_secs(2),
            "stop issued before run-loop entry was lost; loop ran for {elapsed:?}"
        );
    }

    unsafe extern "C-unwind" fn noop_callback(
        _proxy: CGEventTapProxy,
        _event_type: CGEventType,
        event: NonNull<CGEvent>,
        _user_info: *mut c_void,
    ) -> *mut CGEvent {
        event.as_ptr()
    }

    /// A real (listen-only) event tap, or None when the test runner has no
    /// accessibility permission (CI, unprivileged terminals) — tests skip.
    fn create_test_tap() -> Option<CFRetained<CFMachPort>> {
        if !check_accessibility() {
            eprintln!("SKIPPED: accessibility permission not granted to the test runner");
            return None;
        }
        unsafe {
            CGEvent::tap_create(
                CGEventTapLocation::SessionEventTap,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::ListenOnly,
                1 << CGEventType::KeyDown.0,
                Some(noop_callback),
                std::ptr::null_mut(),
            )
        }
    }

    fn make_ctx(tap: &CFRetained<CFMachPort>) -> CallbackCtx {
        let (tx, _rx) = mpsc::channel();
        CallbackCtx {
            state: Arc::new(Mutex::new(ListenerState::new(tx, None))),
            tap: Cell::new(Some(NonNull::from(&**tap))),
        }
    }

    /// Like `make_ctx`, keeping the event receiver so tests can read what the
    /// callback reports on the event channel.
    fn make_ctx_with_receiver(tap: &CFRetained<CFMachPort>) -> (CallbackCtx, Receiver<KeyEvent>) {
        let (tx, rx) = mpsc::channel();
        (
            CallbackCtx {
                state: Arc::new(Mutex::new(ListenerState::new(tx, None))),
                tap: Cell::new(Some(NonNull::from(&**tap))),
            },
            rx,
        )
    }

    fn deliver_tap_disabled(ctx: &CallbackCtx, event_type: CGEventType) {
        let event = CGEvent::new(None).expect("failed to create CGEvent");
        let returned = unsafe {
            event_tap_callback(
                std::ptr::null_mut(),
                event_type,
                NonNull::from(&*event),
                ctx as *const CallbackCtx as *mut c_void,
            )
        };
        assert_eq!(
            returned,
            NonNull::from(&*event).as_ptr(),
            "pseudo-events must be passed through, not blocked"
        );
    }

    /// Recovery is event-driven now (no polling watchdog): receiving a
    /// TapDisabledBy* pseudo-event must re-enable the tap from the callback.
    #[test]
    fn tap_disabled_pseudo_event_reenables_tap() {
        let Some(tap) = create_test_tap() else { return };

        for event_type in [
            CGEventType::TapDisabledByTimeout,
            CGEventType::TapDisabledByUserInput,
        ] {
            let ctx = make_ctx(&tap);
            CGEvent::tap_enable(&tap, false);
            assert!(!CGEvent::tap_is_enabled(&tap));

            deliver_tap_disabled(&ctx, event_type);

            assert!(
                CGEvent::tap_is_enabled(&tap),
                "callback must re-enable the tap after {event_type:?}"
            );
        }
    }

    /// Re-enabling must not depend on the state mutex being healthy: a
    /// poisoned mutex (a panic on some other thread holding it) must not
    /// leave the tap permanently dead.
    #[test]
    fn tap_reenabled_even_with_poisoned_state_mutex() {
        let Some(tap) = create_test_tap() else { return };

        let ctx = make_ctx(&tap);
        let state = Arc::clone(&ctx.state);
        let _ = thread::spawn(move || {
            let _guard = state.lock().unwrap();
            panic!("poison the listener state mutex");
        })
        .join();
        assert!(ctx.state.lock().is_err(), "mutex should be poisoned");

        CGEvent::tap_enable(&tap, false);
        assert!(!CGEvent::tap_is_enabled(&tap));

        deliver_tap_disabled(&ctx, CGEventType::TapDisabledByTimeout);

        assert!(
            CGEvent::tap_is_enabled(&tap),
            "re-enable must happen even when the state lock is unusable"
        );
    }

    /// The pseudo-event handler must reconcile modifier state (the original
    /// purpose of PR #4): stale tracked modifiers with no physically-held
    /// keys must be cleared.
    #[test]
    fn tap_disabled_pseudo_event_reconciles_modifiers() {
        let Some(tap) = create_test_tap() else { return };

        let ctx = make_ctx(&tap);
        ctx.state.lock().unwrap().current_modifiers = Modifiers::CTRL_LEFT | Modifiers::SHIFT_RIGHT;

        deliver_tap_disabled(&ctx, CGEventType::TapDisabledByTimeout);

        // No modifier keys are physically held while tests run, so
        // reconciliation against OS flags must clear the stale state.
        assert_eq!(
            ctx.state.lock().unwrap().current_modifiers,
            Modifiers::empty(),
            "stale modifiers must be reconciled away on tap-disable"
        );
    }

    /// Reconciling a missed release must report it on the event channel: a
    /// push-to-talk hotkey whose key-up the disabled tap never delivered has
    /// nothing else to end its recording.
    #[test]
    fn reconcile_reports_stale_modifiers_as_releases() {
        let mut tracked = Modifiers::CMD_LEFT | Modifiers::SHIFT_RIGHT | Modifiers::OPT_RIGHT;

        // Only Shift is still physically held.
        let events = reconcile_modifiers(&mut tracked, CGEventFlags::MaskShift);

        assert_eq!(tracked, Modifiers::SHIFT_RIGHT);
        assert_eq!(events.len(), 2);
        // MODIFIER_RELEASE_ORDER: CMD_LEFT before OPT_RIGHT.
        assert_eq!(events[0].changed_modifier, Some(Modifiers::CMD_LEFT));
        assert_eq!(
            events[0].modifiers,
            Modifiers::SHIFT_RIGHT | Modifiers::OPT_RIGHT
        );
        assert_eq!(events[0].key, None);
        assert!(!events[0].is_key_down);
        assert_eq!(events[1].changed_modifier, Some(Modifiers::OPT_RIGHT));
        assert_eq!(events[1].modifiers, Modifiers::SHIFT_RIGHT);
    }

    /// Reconciling nothing stale reports nothing, and a modifier the OS
    /// reports as held but we missed adopts the left side, as before.
    #[test]
    fn reconcile_adopts_missed_presses_without_reporting_them() {
        let mut tracked = Modifiers::empty();

        let events = reconcile_modifiers(&mut tracked, CGEventFlags::MaskControl);

        assert!(events.is_empty());
        assert_eq!(tracked, Modifiers::CTRL_LEFT);
    }

    /// FN comes from the flags, not from keycode state: reconciliation must
    /// never drop it.
    #[test]
    fn reconcile_keeps_fn() {
        let mut tracked = Modifiers::FN | Modifiers::CMD_LEFT;

        let events = reconcile_modifiers(&mut tracked, CGEventFlags::empty());

        assert_eq!(tracked, Modifiers::FN);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].changed_modifier, Some(Modifiers::CMD_LEFT));
    }

    /// The tap-disable path forwards those releases too.
    #[test]
    fn tap_disabled_forwards_releases_for_stale_modifiers() {
        let Some(tap) = create_test_tap() else { return };

        let (ctx, rx) = make_ctx_with_receiver(&tap);
        ctx.state.lock().unwrap().current_modifiers = Modifiers::CTRL_LEFT | Modifiers::OPT_RIGHT;

        deliver_tap_disabled(&ctx, CGEventType::TapDisabledByUserInput);

        let events: Vec<KeyEvent> = rx.try_iter().collect();
        assert_eq!(events.len(), 2, "one release per stale modifier");
        assert_eq!(events[0].changed_modifier, Some(Modifiers::CTRL_LEFT));
        assert_eq!(events[1].changed_modifier, Some(Modifiers::OPT_RIGHT));
        assert_eq!(
            ctx.state.lock().unwrap().current_modifiers,
            Modifiers::empty()
        );
    }
}
