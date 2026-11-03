//! First-launch intro (Arc-style): a borderless, transparent window over the
//! whole screen plays the brand moment, then closes and the main window
//! fades in. Once per install; replayable from Settings > About.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::settings::{get_settings, write_settings};

pub const LABEL: &str = "intro";

/// First launch: onboarding not done and the intro not yet seen.
pub fn should_play(app: &AppHandle) -> bool {
    let s = get_settings(app);
    !s.onboarding_completed && !s.intro_seen
}

/// Cover the screen with the intro. Returns false if it couldn't be shown
/// (the caller then shows the main window straight away).
pub fn play(app: &AppHandle) -> bool {
    if app.get_webview_window(LABEL).is_some() {
        return true;
    }
    let Some(monitor) = crate::overlay::get_monitor_with_cursor(app) else {
        return false;
    };
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    // Without a compositor (some X11 Linux setups) a transparent window draws
    // black: build an opaque one and let the page paint its own backdrop.
    let transparent = transparency_available();
    let builder =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("src/intro/index.html".into()))
            .title(env!("BRAND_NAME"))
            .position(pos.x, pos.y)
            .inner_size(size.width, size.height)
            .decorations(false)
            .transparent(transparent)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(true)
            .visible(true);
    let builder = if transparent {
        builder
    } else {
        builder.initialization_script("window.__INTRO_SOLID__ = true;")
    };
    // Wayland ignores window positions: cover the screen as fullscreen.
    #[cfg(target_os = "linux")]
    let builder = builder.fullscreen(true);
    let built = builder.build();
    match built {
        Ok(window) => {
            // A menu-bar-only (Accessory) app can't bring a new window to the
            // front, and WebKit pauses animation in windows that aren't on
            // screen: become a regular app first, then show and focus.
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                crate::refresh_dock_icon(app);
            }
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();
            log::info!(
                "intro shown at ({:.0},{:.0}) {:.0}x{:.0}, transparent={}, visible={:?}",
                pos.x,
                pos.y,
                size.width,
                size.height,
                transparent,
                window.is_visible()
            );
            true
        }
        Err(e) => {
            log::warn!("intro window failed: {e}");
            false
        }
    }
}

/// Whether a transparent window shows the desktop through it. Always on
/// macOS and Windows; on Linux only with a compositing window manager
/// (Wayland always composites).
fn transparency_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        gtk::gdk::Screen::default().is_some_and(|s| s.is_composited())
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

/// Where the main window will open, in the intro window's own coordinates
/// (logical px), so the intro can shrink into exactly that spot.
#[derive(Serialize, Type)]
pub struct IntroTarget {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Centre the (still hidden) main window on the intro's screen and say where
/// it is. None if either window is missing; the intro then just fades out.
#[tauri::command]
#[specta::specta]
pub fn intro_target(app: AppHandle) -> Option<IntroTarget> {
    let intro = app.get_webview_window(LABEL)?;
    let main = app.get_webview_window("main")?;
    let monitor = intro.current_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let screen = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    let size = main.outer_size().ok()?.to_logical::<f64>(scale);
    let x = ((screen.width - size.width) / 2.0).round();
    let y = ((screen.height - size.height) / 2.0).round();
    let _ = main.set_position(tauri::LogicalPosition::new(origin.x + x, origin.y + y));
    Some(IntroTarget {
        x,
        y,
        width: size.width,
        height: size.height,
    })
}

/// Set while the main window is held in front after the intro hands over;
/// cleared (and the window made a normal one again) the first time the user
/// leaves it.
static HOLDING_FRONT: AtomicBool = AtomicBool::new(false);

/// The intro reports it has finished (or was skipped): bring in the main
/// window in front of everything, then close the intro over it, and remember
/// it was seen.
///
/// The main window stays above other apps' windows until the user leaves it
/// (see [`on_main_focus_lost`]). Dropping that level after a fixed 120 ms, as
/// before, let it fall behind whatever app was active whenever Ambient itself
/// hadn't become the active app yet (a first launch from the disk image or
/// past the Gatekeeper prompt): macOS 14+ may decline a background app's
/// activation request, so the window ended up at normal level, behind.
#[tauri::command]
#[specta::specta]
pub fn intro_finished(app: AppHandle) {
    let mut s = get_settings(&app);
    if !s.intro_seen {
        s.intro_seen = true;
        write_settings(&app, s);
    }
    crate::show_main_window(&app);
    if let Some(main) = app.get_webview_window("main") {
        HOLDING_FRONT.store(true, Ordering::SeqCst);
        let _ = main.set_always_on_top(true);
        let _ = main.set_focus();
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(120));
            let _ = handle.run_on_main_thread({
                let handle = handle.clone();
                move || {
                    if let Some(w) = handle.get_webview_window(LABEL) {
                        let _ = w.close();
                    }
                    if let Some(main) = handle.get_webview_window("main") {
                        // Closing the key intro window: hand key status to
                        // the main window and ask again to be the active app.
                        let _ = main.set_focus();
                        activate_app();
                    }
                }
            });
            // Activation is asynchronous; if the window still isn't key, ask
            // once more. It stays in front either way.
            std::thread::sleep(std::time::Duration::from_millis(500));
            if let Some(main) = handle.get_webview_window("main") {
                let focused = main.is_focused().unwrap_or(false);
                log::info!(
                    "intro handed over: main visible={:?} focused={}",
                    main.is_visible(),
                    focused
                );
                if !focused {
                    let _ = main.set_focus();
                    let _ = handle.run_on_main_thread(activate_app);
                }
            }
        });
        return;
    }
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.close();
    }
}

/// The main window lost focus: if it was being held in front after the intro,
/// the user has left it, so it becomes a normal window again.
pub fn on_main_focus_lost(app: &AppHandle) {
    if HOLDING_FRONT.swap(false, Ordering::SeqCst) {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_always_on_top(false);
        }
        log::info!("intro hold released: the user left the main window");
    }
}

/// Ask macOS to make Ambient the active app (main thread only).
fn activate_app() {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
        #[allow(deprecated)]
        let _ = NSRunningApplication::currentApplication().activateWithOptions(
            NSApplicationActivationOptions::ActivateAllWindows
                | NSApplicationActivationOptions::ActivateIgnoringOtherApps,
        );
    }
}

/// Settings > About: watch it again.
#[tauri::command]
#[specta::specta]
pub fn replay_intro(app: AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    if !play(&app) {
        crate::show_main_window(&app);
    }
}
