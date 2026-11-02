//! The agent HUD: a small glass panel in the top-right corner of the screen
//! with the cursor. It shows answers, suggestions and acting steps.
//!
//! Like the recording pill it's a non-activating panel, so it never steals
//! focus from the app you're in, and it's content-protected: invisible in
//! screen shares and recordings.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

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
/// How long the card takes to dissolve before the panel is ordered out.
const CLOSE_MS: u64 = 200;

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
        /// What the card offers once done, chosen from where the user is and
        /// what the answer contains (see `agent::answer::actions_for`).
        actions: Vec<HudAnswerAction>,
        /// An i18n key for a quiet line under the answer (e.g. the web search
        /// failed, so this is from what the model knows).
        note: Option<String>,
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
    /// Heard and working: "Listening…" while `heard` is empty, then
    /// "Thinking…" under what was heard. No timeout; replaced by the result.
    Listening { heard: String },
    /// Text that had nowhere to go: dictation with no text field focused, or
    /// a drafted reply. Copy always; Insert once a text field has focus.
    Draft {
        id: String,
        /// i18n key of the heading.
        title: String,
        text: String,
        editable: bool,
    },
    /// "What can I say?": examples from the help sheet.
    Help,
}

impl HudContent {
    /// Short name of the card, for click-outside and focus handling.
    pub fn kind(&self) -> &'static str {
        match self {
            HudContent::Answer { .. } => "answer",
            HudContent::Suggestion { .. } => "suggestion",
            HudContent::Status { .. } => "status",
            HudContent::Steps { .. } => "steps",
            HudContent::Listening { .. } => "listening",
            HudContent::Draft { .. } => "draft",
            HudContent::Help => "help",
        }
    }

    fn id(&self) -> String {
        match self {
            HudContent::Answer { id, .. }
            | HudContent::Suggestion { id, .. }
            | HudContent::Steps { id, .. }
            | HudContent::Draft { id, .. } => id.clone(),
            _ => String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct HudSource {
    pub title: String,
    pub url: String,
}

/// One action button on a finished answer. `kind` is one of `insert`,
/// `replace`, `copy`, `copy_code`, `open_link`, `add_to_calendar`, `reply`;
/// `value` carries what it acts on when that isn't the whole answer (the
/// link, the code block).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct HudAnswerAction {
    pub kind: String,
    pub value: Option<String>,
}

impl HudAnswerAction {
    pub fn new(kind: &str) -> Self {
        Self {
            kind: kind.into(),
            value: None,
        }
    }

    pub fn with(kind: &str, value: String) -> Self {
        Self {
            kind: kind.into(),
            value: Some(value),
        }
    }
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
    start_watcher(app);
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
        match built {
            // Linux: no focus, no taskbar, and a layer surface where the
            // compositor has one (see hud_linux.rs).
            #[cfg(target_os = "linux")]
            Ok(window) => crate::hud_linux::configure(&window),
            #[cfg(not(target_os = "linux"))]
            Ok(_) => {}
            Err(e) => log::error!("Failed to create agent HUD: {e}"),
        }
    }
}

fn place(app: &AppHandle, height: f64) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let height = height.clamp(MIN_HEIGHT, MAX_HEIGHT);
    // A layer surface is placed by its margins, on the output in focus.
    #[cfg(target_os = "linux")]
    if crate::hud_linux::place(&window, WIDTH, height, 38.0, MARGIN) {
        return;
    }
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
            let id = current().map(|c| c.id()).unwrap_or_default();
            let _ = app.emit(
                "hud-action",
                HudActionEvent {
                    id,
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

/// What the HUD shows right now (None while hidden).
static CURRENT: Mutex<Option<HudContent>> = Mutex::new(None);
/// Bumped by every show and hide, so a delayed order-out never hides a card
/// that was shown after the close began.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// The card on screen, if any.
pub fn current() -> Option<HudContent> {
    CURRENT.lock().ok().and_then(|g| g.clone())
}

/// An answer card (or the help card) is on screen, so what the user says
/// next is probably a follow-up.
pub fn showing_answer() -> bool {
    is_visible()
        && current().is_some_and(|c| matches!(c, HudContent::Answer { .. } | HudContent::Help))
}

/// Show (or update) the HUD. Safe to call from any thread.
pub fn show(app: &AppHandle, content: HudContent) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut g) = CURRENT.lock() {
        *g = Some(content.clone());
    }
    VISIBLE.store(true, Ordering::SeqCst);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if handle.get_webview_window(LABEL).is_none() {
            create(&handle);
        }
        let _ = handle.emit_to(LABEL, "hud", &content);
        if let Some(w) = handle.get_webview_window(LABEL) {
            if !w.is_visible().unwrap_or(false) {
                place(&handle, MIN_HEIGHT);
                order_front(&handle, &w);
            }
        }
        hold_escape(&handle);
    });
}

/// Bring the panel up without activating Ambient: `orderFrontRegardless` on
/// the non-activating panel rather than `WebviewWindow::show`, which calls
/// `makeKeyAndOrderFront` and can pull the app (and with it the main window)
/// forward over the app the user is acting in.
fn order_front(app: &AppHandle, w: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;
        if let Ok(panel) = app.get_webview_panel(LABEL) {
            panel.show();
            return;
        }
    }
    let _ = app;
    let _ = w.show();
}

/// Close the HUD: the card dissolves (the HUD webview animates it out on
/// `hud-close`), then the panel is ordered out.
pub fn hide(app: &AppHandle) {
    release_escape(app);
    VISIBLE.store(false, Ordering::SeqCst);
    if let Ok(mut g) = CURRENT.lock() {
        *g = None;
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app.emit_to(LABEL, "hud-close", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(CLOSE_MS));
        if GENERATION.load(Ordering::SeqCst) != generation {
            return; // shown again meanwhile
        }
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }
            if let Some(w) = h.get_webview_window(LABEL) {
                let _ = w.hide();
            }
        });
    });
}

// ── Click outside, and the draft card's Insert ──────────────────────────
//
// The panel never becomes key, so it can't see clicks elsewhere. While the
// HUD is up, a light poll of the mouse button state (no event tap, no extra
// permission) notices a press outside the card: answers and help dissolve; a
// draft card instead re-checks whether a text field now has focus, so it can
// offer Insert.

static WATCHING: AtomicBool = AtomicBool::new(false);

fn start_watcher(app: &AppHandle) {
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("hud-watch".into())
        .spawn(move || watch(app));
    if let Err(e) = spawned {
        log::warn!("HUD click watcher didn't start: {e}");
    }
}

#[cfg(target_os = "macos")]
fn mouse_down() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
    }
    // kCGEventSourceStateCombinedSessionState; left and right buttons.
    unsafe { CGEventSourceButtonState(0, 0) || CGEventSourceButtonState(0, 1) }
}

/// Linux: the pointer's buttons on X11 (Wayland doesn't expose them).
#[cfg(target_os = "linux")]
fn mouse_down() -> bool {
    crate::hud_linux::mouse_down()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn mouse_down() -> bool {
    false
}

/// Whether the cursor is over the HUD panel (physical pixels).
fn cursor_inside(app: &AppHandle) -> bool {
    let Some(w) = app.get_webview_window(LABEL) else {
        return false;
    };
    let (Ok(cursor), Ok(pos), Ok(size)) =
        (app.cursor_position(), w.outer_position(), w.outer_size())
    else {
        return true; // unknown: never dismiss on a guess
    };
    let (x, y) = (f64::from(pos.x), f64::from(pos.y));
    cursor.x >= x
        && cursor.x <= x + f64::from(size.width)
        && cursor.y >= y
        && cursor.y <= y + f64::from(size.height)
}

#[derive(Debug, PartialEq, Eq)]
enum ClickOutside {
    Dismiss,
    RecheckFocus,
    Ignore,
}

/// What a press outside the card does to each kind of card. Suggestions and
/// status lines leave on their own timers; steps have Stop.
fn on_click_outside(kind: &str) -> ClickOutside {
    match kind {
        "answer" | "help" => ClickOutside::Dismiss,
        "draft" => ClickOutside::RecheckFocus,
        _ => ClickOutside::Ignore,
    }
}

fn watch(app: AppHandle) {
    let mut was_down = false;
    let mut recheck_at: Option<Instant> = None;
    let mut last_focus_check = Instant::now();
    loop {
        let visible = is_visible();
        std::thread::sleep(Duration::from_millis(if visible { 40 } else { 200 }));
        if !visible {
            was_down = false;
            recheck_at = None;
            continue;
        }
        let Some(card) = current() else { continue };
        let down = mouse_down();
        let pressed = down && !was_down;
        was_down = down;
        if pressed && !cursor_inside(&app) {
            match on_click_outside(card.kind()) {
                ClickOutside::Dismiss => {
                    let _ = app.emit(
                        "hud-action",
                        HudActionEvent {
                            id: card.id(),
                            action: "dismiss".into(),
                        },
                    );
                    hide(&app);
                    continue;
                }
                // Focus moves on mouse-up; look shortly after.
                ClickOutside::RecheckFocus => {
                    recheck_at = Some(Instant::now() + Duration::from_millis(250));
                }
                ClickOutside::Ignore => {}
            }
        }
        // A draft card follows focus: Insert appears once a field has it.
        if let HudContent::Draft {
            id,
            title,
            text,
            editable,
        } = card
        {
            let due = recheck_at.is_some_and(|t| Instant::now() >= t)
                || last_focus_check.elapsed() > Duration::from_millis(700);
            if due {
                recheck_at = None;
                last_focus_check = Instant::now();
                let now = crate::agent::can_insert_here();
                if now != editable {
                    show(
                        &app,
                        HudContent::Draft {
                            id,
                            title,
                            text,
                            editable: now,
                        },
                    );
                }
            }
        }
    }
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

/// Paste `text` into the app the user is in, after the HUD has gone (the HUD
/// never takes focus, so that app is still frontmost).
fn paste_later(app: &AppHandle, text: String, select_all: bool) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        if select_all {
            if let Some(state) = handle.try_state::<crate::input::EnigoState>() {
                if let Ok(mut enigo) = state.0.lock() {
                    let _ = crate::input::send_select_all(&mut enigo);
                }
            }
            std::thread::sleep(Duration::from_millis(80));
        }
        if let Err(e) = crate::clipboard::paste(text, handle) {
            log::warn!("HUD paste failed: {e}");
        }
    });
}

/// What the user did in the HUD. `insert` pastes `text` into the app they were
/// in; the rest are forwarded to whichever agent flow owns `id`.
#[tauri::command]
#[specta::specta]
pub fn hud_action(app: AppHandle, id: String, action: String, text: Option<String>) {
    match action.as_str() {
        "insert" => {
            hide(&app);
            if let Some(text) = text {
                paste_later(&app, text, false);
            }
        }
        "replace" => {
            hide(&app);
            if let Some(text) = text {
                paste_later(&app, text, true);
            }
        }
        // Mail: open a reply to the message in front, then paste the draft.
        "reply" => {
            hide(&app);
            if let Some(text) = text {
                crate::agent::reply_with(&app, text);
            }
        }
        // A date in the answer: pull the event out and add it.
        "add_to_calendar" => {
            if let Some(text) = text {
                crate::agent::proactive::add_answer_to_calendar(&app, text);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_outside_dismisses_answers_but_keeps_drafts() {
        assert_eq!(on_click_outside("answer"), ClickOutside::Dismiss);
        assert_eq!(on_click_outside("help"), ClickOutside::Dismiss);
        assert_eq!(on_click_outside("draft"), ClickOutside::RecheckFocus);
        assert_eq!(on_click_outside("suggestion"), ClickOutside::Ignore);
        assert_eq!(on_click_outside("listening"), ClickOutside::Ignore);
    }
}
