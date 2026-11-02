//! The agent HUD: a small glass panel in the top-right corner of the screen
//! with the cursor. It shows answers, suggestions and acting steps.
//!
//! Like the recording pill it's a non-activating panel, so it never steals
//! focus from the app you're in, and it's content-protected: invisible in
//! screen shares and recordings.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel, StyleMask};

pub const LABEL: &str = "agent_hud";
const WIDTH: f64 = 440.0;
const MIN_HEIGHT: f64 = 72.0;
const MAX_HEIGHT: f64 = 560.0;
const MARGIN: f64 = 16.0;

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(AgentHudPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

/// What the HUD is showing. Sent to the HUD window as the `hud` event.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HudContent {
    /// The answer card. `text` grows as the answer streams in.
    Answer {
        id: String,
        question: String,
        text: String,
        sources: Vec<HudSource>,
        done: bool,
        /// Offer Replace (select the field's text, paste over it) instead of
        /// Insert: for rewritten drafts.
        replace: bool,
    },
    /// A proactive suggestion: one line, accept or dismiss.
    Suggestion {
        id: String,
        title: String,
        accept_label: String,
    },
    /// A short status line ("Searching…", "Added to Calendar"). `text` is an
    /// i18n key. `undo` offers an Undo button that sends the `undo` action.
    Status {
        text: String,
        tone: HudTone,
        undo: bool,
    },
    /// Acting progress.
    Steps {
        id: String,
        title: String,
        steps: Vec<String>,
        done: bool,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct HudSource {
    pub title: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Type)]
#[serde(rename_all = "snake_case")]
pub enum HudTone {
    Neutral,
    Success,
    Error,
}

/// Create the HUD hidden; shown on demand.
pub fn create(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let result = PanelBuilder::<_, AgentHudPanel>::new(app, LABEL)
            .url(WebviewUrl::App("src/hud/index.html".into()))
            .title("Ambient")
            .level(PanelLevel::Status)
            .size(tauri::Size::Logical(tauri::LogicalSize {
                width: WIDTH,
                height: MIN_HEIGHT,
            }))
            .has_shadow(false)
            .transparent(true)
            .no_activate(true)
            .corner_radius(0.0)
            .style_mask(StyleMask::empty().borderless().nonactivating_panel())
            .with_window(|w| {
                w.decorations(false)
                    .transparent(true)
                    .focusable(false)
                    .content_protected(true)
            })
            .collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary(),
            )
            .build();
        match result {
            Ok(panel) => panel.hide(),
            Err(e) => log::error!("Failed to create agent HUD: {e}"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let built = tauri::WebviewWindowBuilder::new(
            app,
            LABEL,
            WebviewUrl::App("src/hud/index.html".into()),
        )
        .title("Ambient")
        .inner_size(WIDTH, MIN_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .content_protected(true)
        .visible(false)
        .build();
        if let Err(e) = built {
            log::error!("Failed to create agent HUD: {e}");
        }
    }
}

fn place(app: &AppHandle, height: f64) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let height = height.clamp(MIN_HEIGHT, MAX_HEIGHT);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: WIDTH,
        height,
    }));
    if let Some(monitor) = crate::overlay::get_monitor_with_cursor(app) {
        let scale = monitor.scale_factor();
        let pos = monitor.position().to_logical::<f64>(scale);
        let size = monitor.size().to_logical::<f64>(scale);
        // Below the menu bar, inset from the right edge.
        let x = pos.x + size.width - WIDTH - MARGIN;
        let y = pos.y + 38.0;
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
    }
}

/// Escape closes the HUD. The HUD never takes focus (so Insert pastes into
/// the user's app), which means it can't see key presses; instead Escape is
/// registered globally only while the HUD is up.
static ESCAPE_HELD: AtomicBool = AtomicBool::new(false);
static VISIBLE: AtomicBool = AtomicBool::new(false);

/// Whether the HUD is on screen (proactive suggestions never interrupt it).
pub fn is_visible() -> bool {
    VISIBLE.load(Ordering::SeqCst)
}

fn escape() -> Shortcut {
    "Escape".parse().expect("valid shortcut")
}

fn hold_escape(app: &AppHandle) {
    if ESCAPE_HELD.swap(true, Ordering::SeqCst) {
        return;
    }
    let gs = app.global_shortcut();
    if gs.is_registered(escape()) {
        // Recording's cancel shortcut owns Escape right now.
        ESCAPE_HELD.store(false, Ordering::SeqCst);
        return;
    }
    let registered = gs.on_shortcut(escape(), |app, _, event| {
        if event.state == ShortcutState::Pressed {
            let _ = app.emit(
                "hud-action",
                HudActionEvent {
                    id: String::new(),
                    action: "dismiss".into(),
                },
            );
            hide(app);
        }
    });
    if registered.is_err() {
        ESCAPE_HELD.store(false, Ordering::SeqCst);
    }
}

/// Give Escape back (on hide, and before a recording registers its cancel).
pub fn release_escape(app: &AppHandle) {
    if ESCAPE_HELD.swap(false, Ordering::SeqCst) {
        let _ = app.global_shortcut().unregister(escape());
    }
}

/// Show (or update) the HUD. Safe to call from any thread.
pub fn show(app: &AppHandle, content: HudContent) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if handle.get_webview_window(LABEL).is_none() {
            create(&handle);
        }
        let _ = handle.emit_to(LABEL, "hud", &content);
        if let Some(w) = handle.get_webview_window(LABEL) {
            if !w.is_visible().unwrap_or(false) {
                place(&handle, MIN_HEIGHT);
                let _ = w.show();
            }
        }
        hold_escape(&handle);
        VISIBLE.store(true, Ordering::SeqCst);
    });
}

pub fn hide(app: &AppHandle) {
    release_escape(app);
    VISIBLE.store(false, Ordering::SeqCst);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(w) = handle.get_webview_window(LABEL) {
            let _ = w.hide();
        }
    });
}

/// The HUD reports its content height so the panel hugs the card.
#[tauri::command]
#[specta::specta]
pub fn hud_resize(app: AppHandle, height: f64) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || place(&handle, height));
}

#[tauri::command]
#[specta::specta]
pub fn hud_hide(app: AppHandle) {
    hide(&app);
}

/// What the user did in the HUD. `insert` pastes `text` into the app they were
/// in (the HUD never takes focus, so that app is still frontmost); the rest
/// are forwarded to whichever agent flow owns `id`.
#[tauri::command]
#[specta::specta]
pub fn hud_action(app: AppHandle, id: String, action: String, text: Option<String>) {
    match action.as_str() {
        "insert" => {
            hide(&app);
            if let Some(text) = text {
                let handle = app.clone();
                std::thread::spawn(move || {
                    // Let the hide settle so the paste lands in the user's app.
                    std::thread::sleep(std::time::Duration::from_millis(120));
                    if let Err(e) = crate::clipboard::paste(text, handle) {
                        log::warn!("HUD insert failed: {e}");
                    }
                });
            }
        }
        "replace" => {
            hide(&app);
            if let Some(text) = text {
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    if let Some(state) = handle.try_state::<crate::input::EnigoState>() {
                        if let Ok(mut enigo) = state.0.lock() {
                            let _ = crate::input::send_select_all(&mut enigo);
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(80));
                    if let Err(e) = crate::clipboard::paste(text, handle) {
                        log::warn!("HUD replace failed: {e}");
                    }
                });
            }
        }
        // Sources: web links in the browser, local files (Spotlight results) in
        // their own app. Opened from Rust so the HUD needs no file access.
        "open" => {
            if let Some(url) = text {
                use tauri_plugin_opener::OpenerExt;
                let result = match url.strip_prefix("file://") {
                    Some(path) => app
                        .opener()
                        .open_path(path.replace("%20", " "), None::<&str>),
                    None if url.starts_with("http://") || url.starts_with("https://") => {
                        app.opener().open_url(&url, None::<&str>)
                    }
                    None => Ok(()),
                };
                if let Err(e) = result {
                    log::warn!("HUD open failed: {e}");
                }
            }
            return;
        }
        "copy" => {
            if let Some(t) = text {
                use tauri_plugin_clipboard_manager::ClipboardExt;
                let _ = app.clipboard().write_text(t);
            }
            hide(&app);
        }
        "dismiss" => hide(&app),
        "undo" => {
            let ok = crate::agent::act::undo_last();
            show(
                &app,
                HudContent::Status {
                    text: if ok {
                        "hud.status.undone".into()
                    } else {
                        "hud.status.failed".into()
                    },
                    tone: if ok { HudTone::Neutral } else { HudTone::Error },
                    undo: false,
                },
            );
        }
        _ => {}
    }
    let _ = app.emit("hud-action", HudActionEvent { id, action });
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct HudActionEvent {
    pub id: String,
    pub action: String,
}
