//! First-launch intro (Arc-style): a borderless, transparent window over the
//! whole screen plays the brand moment, then closes and the main window
//! fades in. Once per install; replayable from Settings > About.

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::settings::{get_settings, write_settings};

pub const LABEL: &str = "intro";

/// First launch: onboarding not done and the intro not yet seen. Skipped on
/// Linux, where window transparency depends on the compositor and could show
/// a black screen instead of the veil.
pub fn should_play(app: &AppHandle) -> bool {
    if cfg!(target_os = "linux") {
        return false;
    }
    let s = get_settings(app);
    !s.onboarding_completed && !s.intro_seen
}

/// Cover the screen with the intro. Returns false if it couldn't be shown
/// (the caller then shows the main window straight away).
pub fn play(app: &AppHandle) -> bool {
    if cfg!(target_os = "linux") {
        return false;
    }
    if app.get_webview_window(LABEL).is_some() {
        return true;
    }
    let Some(monitor) = crate::overlay::get_monitor_with_cursor(app) else {
        return false;
    };
    let scale = monitor.scale_factor();
    let pos = monitor.position().to_logical::<f64>(scale);
    let size = monitor.size().to_logical::<f64>(scale);
    let built =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("src/intro/index.html".into()))
            .title(env!("BRAND_NAME"))
            .position(pos.x, pos.y)
            .inner_size(size.width, size.height)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(true)
            .visible(true)
            .build();
    match built {
        Ok(window) => {
            // A menu-bar-only (Accessory) app can't bring a new window to the
            // front, and WebKit pauses animation in windows that aren't on
            // screen: become a regular app first, then show and focus.
            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();
            log::info!(
                "intro shown at ({:.0},{:.0}) {:.0}x{:.0}, visible={:?}",
                pos.x,
                pos.y,
                size.width,
                size.height,
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

/// The intro reports it has finished (or was skipped): bring in the main
/// window in front of everything, then close the intro over it, and remember
/// it was seen.
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
        // Front of every other app's windows on this first open, then a
        // normal window again.
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
                        let _ = main.set_always_on_top(false);
                        let _ = main.set_focus();
                    }
                }
            });
        });
        return;
    }
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.close();
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
