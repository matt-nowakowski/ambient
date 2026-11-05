//! The agent HUD: a small glass panel in the top-right corner of the screen
//! with the cursor. It shows answers, suggestions and acting steps.
//!
//! Like the recording pill it's a non-activating panel, so it never steals
//! focus from the app you're in, and it's content-protected: invisible in
//! screen shares and recordings.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};

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
    /// A proactive suggestion: one line, accept or dismiss. `title` is an
    /// i18n key (or the judge's own words); `vars` fill its placeholders
    /// (`count`, `name`, `error`; `lang` is a language code the HUD names).
    Suggestion {
        id: String,
        title: String,
        accept_label: String,
        #[serde(default)]
        vars: BTreeMap<String, String>,
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
    /// What the agent did, or why it couldn't, with what it can do instead:
    /// "Reminder set for 9:00 tomorrow: fix the vault" (Undo), or "I can't
    /// set reminders on Linux yet. Add it to your calendar instead?" (Add to
    /// calendar, Copy). `text` is an i18n key; `vars` fill it (`due` is a
    /// local "YYYY-MM-DDTHH:MM" the HUD turns into "9:00 tomorrow").
    Notice {
        id: String,
        text: String,
        #[serde(default)]
        vars: BTreeMap<String, String>,
        tone: HudTone,
        undo: bool,
        #[serde(default)]
        offers: Vec<HudOffer>,
    },
    /// "Send this to the team?": a bug report or feedback said by voice,
    /// with the message as heard, an "Include diagnostics" switch (off by
    /// default) and Send / Edit / Cancel. `report_kind` is `bug`, `idea` or
    /// `other`; `editing` means the next thing said replaces the message.
    Report {
        id: String,
        report_kind: String,
        message: String,
        include_diagnostics: bool,
        editing: bool,
    },
    /// Meeting notes are ready (meeting/deliver.rs): Open, Copy, Email to me.
    MeetingNotes(crate::meeting::deliver::NotesCard),
    /// Smart writing, after typing (agent/writing.rs): a small chip saying
    /// what was done, "Polished" or "Written for you", with "Use my
    /// words" (`revert`) and, for written text, "Edit". `decision` is
    /// `polished`, `written`, `rewritten` (a selection rewritten: "Undo rewrite"
    /// restores it), `editing` (Edit: say what to change) or
    /// `note`; `note` is an i18n key for a line instead ("Copied your exact
    /// words…"). Fades after a few seconds unless hovered.
    Writing {
        id: String,
        decision: String,
        note: Option<String>,
        revert: bool,
        edit: bool,
    },
}

/// A button on a notice: an alternative the agent can do instead. `label`
/// is an i18n key; `copy` is handled by the HUD itself (it copies `value`),
/// anything else is sent back as a `hud_action` with the notice's id.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct HudOffer {
    pub action: String,
    pub label: String,
    pub value: Option<String>,
}

impl HudOffer {
    pub fn new(action: &str, label: &str, value: Option<String>) -> Self {
        Self {
            action: action.into(),
            label: label.into(),
            value,
        }
    }
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
            HudContent::Notice { .. } => "notice",
            HudContent::Report { .. } => "report",
            HudContent::MeetingNotes(_) => "meeting_notes",
            HudContent::Writing { .. } => "writing",
        }
    }

    pub(crate) fn id(&self) -> String {
        match self {
            HudContent::Answer { id, .. }
            | HudContent::Suggestion { id, .. }
            | HudContent::Steps { id, .. }
            | HudContent::Draft { id, .. }
            | HudContent::Notice { id, .. }
            | HudContent::Report { id, .. }
            | HudContent::Writing { id, .. } => id.clone(),
            HudContent::MeetingNotes(n) => n.id.clone(),
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
            #[cfg(target_os = "windows")]
            Ok(w) => make_non_activating(&w),
            // Linux: no focus, no taskbar, and a layer surface where the
            // compositor has one (see hud_linux.rs).
            #[cfg(target_os = "linux")]
            Ok(window) => crate::hud_linux::configure(&window),
            #[cfg(not(any(target_os = "windows", target_os = "linux")))]
            Ok(_) => {}
            Err(e) => log::error!("Failed to create agent HUD: {e}"),
        }
    }
}

/// Windows: a panel that never takes focus (clicks don't activate it, so
/// Insert still pastes into the user's app), stays above other windows and
/// stays out of the taskbar and Alt+Tab.
#[cfg(target_os = "windows")]
fn make_non_activating(w: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    };
    let Ok(hwnd) = w.hwnd() else {
        return;
    };
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let style = (style & !WS_EX_APPWINDOW.0)
            | WS_EX_NOACTIVATE.0
            | WS_EX_TOOLWINDOW.0
            | WS_EX_TOPMOST.0;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style as isize);
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

static VISIBLE: AtomicBool = AtomicBool::new(false);

/// Whether the HUD is on screen (proactive suggestions never interrupt it).
pub fn is_visible() -> bool {
    VISIBLE.load(Ordering::SeqCst)
}

/// Esc or ⏎, caught while the card advertised it (see `hud_keys`): what a
/// click on the button it names would do.
pub fn on_key(app: &AppHandle, card: &HudContent, action: crate::hud_keys::KeyAction) {
    use crate::hud_keys::KeyAction;
    let id = card.id();
    match action {
        KeyAction::Dismiss => {
            remember_dismissed(&id);
            let _ = app.emit(
                "hud-action",
                HudActionEvent {
                    id,
                    action: "dismiss".into(),
                },
            );
            hide(app);
        }
        KeyAction::Stop => hud_action(app.clone(), id, "stop".into(), None),
        KeyAction::Accept => hud_action(app.clone(), id, "accept".into(), None),
    }
}

/// What the HUD shows right now (None while hidden).
static CURRENT: Mutex<Option<HudContent>> = Mutex::new(None);
/// Bumped by every show and hide, so a delayed order-out never hides a card
/// that was shown after the close began.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// The answer the user dismissed, so the rest of its stream doesn't bring
/// the card back: the agent keeps calling `show` with each new chunk.
static DISMISSED: Mutex<Option<String>> = Mutex::new(None);

fn remember_dismissed(id: &str) {
    if let Ok(mut g) = DISMISSED.lock() {
        *g = id.starts_with("answer-").then(|| id.to_string());
    }
}

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
    if let HudContent::Answer { id, .. } = &content {
        if DISMISSED
            .lock()
            .is_ok_and(|g| g.as_deref() == Some(id.as_str()))
        {
            return;
        }
    }
    crate::feedback::note_card(&content);
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut g) = CURRENT.lock() {
        *g = Some(content.clone());
    }
    VISIBLE.store(true, Ordering::SeqCst);
    // Esc (and a suggestion's ⏎) while this card is up; see `hud_keys`.
    crate::hud_keys::sync(app);
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
    // Windows: show without activating (`show` would take focus from the
    // app the user is in) and above everything, including fullscreen-ish
    // windows that went topmost after the HUD was created.
    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = w.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
            SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
        };
        make_non_activating(w);
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
        let _ = app;
        return;
    }
    let _ = app;
    let _ = w.show();
}

/// Close the HUD: the card dissolves (the HUD webview animates it out on
/// `hud-close`), then the panel is ordered out.
pub fn hide(app: &AppHandle) {
    VISIBLE.store(false, Ordering::SeqCst);
    if let Ok(mut g) = CURRENT.lock() {
        *g = None;
    }
    // Esc and ⏎ go back to the user's app.
    crate::hud_keys::sync(app);
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
// HUD is up, a light poll (no event tap, no extra permission) notices a press
// outside the card. It reads the window server's mouse-down *counter* rather
// than the button state: a trackpad tap is down and up within a few ms, which
// a 40 ms poll of the button state usually missed. Answers, help and
// suggestions dissolve; a draft card first checks whether the click put focus
// in a text field (then it stays and offers Insert), and dissolves otherwise.

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

/// Mouse presses (left, right, other) the window server has seen so far.
#[cfg(target_os = "macos")]
fn presses() -> u32 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceCounterForEventType(state: i32, event_type: u32) -> u32;
    }
    // kCGEventSourceStateCombinedSessionState; kCGEventLeftMouseDown,
    // kCGEventRightMouseDown, kCGEventOtherMouseDown.
    unsafe {
        CGEventSourceCounterForEventType(0, 1)
            .wrapping_add(CGEventSourceCounterForEventType(0, 3))
            .wrapping_add(CGEventSourceCounterForEventType(0, 25))
    }
}

/// Windows and Linux X11: presses counted from the polled button state
/// (no hook). The watcher polls every 40 ms, shorter than a click.
#[cfg(any(target_os = "windows", target_os = "linux"))]
fn presses() -> u32 {
    use std::sync::atomic::AtomicU32;
    static COUNT: AtomicU32 = AtomicU32::new(0);
    static WAS_DOWN: AtomicBool = AtomicBool::new(false);
    let now = mouse_down();
    if now && !WAS_DOWN.swap(true, Ordering::SeqCst) {
        COUNT.fetch_add(1, Ordering::SeqCst);
    } else if !now {
        WAS_DOWN.store(false, Ordering::SeqCst);
    }
    COUNT.load(Ordering::SeqCst)
}

/// Windows: the physical button state.
#[cfg(target_os = "windows")]
fn mouse_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VIRTUAL_KEY, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
    };
    let down = |vk: VIRTUAL_KEY| unsafe { GetAsyncKeyState(i32::from(vk.0)) as u16 & 0x8000 != 0 };
    down(VK_LBUTTON) || down(VK_RBUTTON) || down(VK_MBUTTON)
}

/// Linux: the pointer's buttons on X11 (Wayland doesn't expose them).
#[cfg(target_os = "linux")]
fn mouse_down() -> bool {
    crate::hud_linux::mouse_down()
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn presses() -> u32 {
    0
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
    /// Dismiss, unless the click put focus in a text field: then the draft
    /// stays and offers Insert.
    DismissUnlessFocused,
    Ignore,
}

/// What a press outside the card does to each kind of card. In-progress
/// cards (listening, thinking, acting steps) stay; status lines leave on
/// their own short timers.
fn on_click_outside(card: &HudContent) -> ClickOutside {
    match card {
        // An answer with nothing in it yet is still "Thinking…".
        HudContent::Answer { text, done, .. } if text.is_empty() && !done => ClickOutside::Ignore,
        HudContent::Answer { .. }
        | HudContent::Help
        | HudContent::Suggestion { .. }
        | HudContent::Report { .. }
        | HudContent::MeetingNotes(_) => ClickOutside::Dismiss,
        HudContent::Draft { .. } => ClickOutside::DismissUnlessFocused,
        // A notice with choices goes like an answer; a plain one fades.
        HudContent::Notice { offers, undo, .. } if !offers.is_empty() || *undo => {
            ClickOutside::Dismiss
        }
        HudContent::Listening { .. }
        | HudContent::Steps { .. }
        | HudContent::Status { .. }
        | HudContent::Notice { .. }
        // The writing chip fades on its own; clicking back into the text
        // must not take "Use my words" away before it's read.
        | HudContent::Writing { .. } => ClickOutside::Ignore,
    }
}

/// Dissolve the card because the user clicked away from it.
fn dismiss_on_click(app: &AppHandle, card: &HudContent) {
    log::debug!("HUD: click outside dismissed the {} card", card.kind());
    let id = card.id();
    remember_dismissed(&id);
    // A suggestion clicked away from counts as ignored, not refused, so it
    // doesn't back off that kind of suggestion.
    let action = if matches!(card, HudContent::Suggestion { .. }) {
        "expire"
    } else {
        "dismiss"
    };
    let _ = app.emit(
        "hud-action",
        HudActionEvent {
            id,
            action: action.into(),
        },
    );
    hide(app);
}

fn watch(app: AppHandle) {
    // Presses before the card appeared (say, the click that opened it) don't
    // count: the baseline keeps moving while the HUD is hidden.
    let mut seen = presses();
    let mut recheck_at: Option<Instant> = None;
    // Set by a click outside a draft: dismiss it at the recheck unless a
    // text field took focus.
    let mut draft_clicked_away = false;
    let mut last_focus_check = Instant::now();
    // Whether the cursor was over the writing chip (it stays while hovered).
    let mut hovering = false;
    loop {
        let visible = is_visible();
        std::thread::sleep(Duration::from_millis(if visible { 30 } else { 200 }));
        let count = presses();
        let pressed = count != seen;
        seen = count;
        if !visible {
            recheck_at = None;
            draft_clicked_away = false;
            continue;
        }
        let Some(card) = current() else { continue };
        if matches!(card, HudContent::Writing { .. }) {
            let inside = cursor_inside(&app);
            if inside != hovering {
                hovering = inside;
                let _ = app.emit_to(LABEL, "hud-hover", inside);
            }
        } else {
            hovering = false;
        }
        if pressed && !cursor_inside(&app) {
            match on_click_outside(&card) {
                ClickOutside::Dismiss => {
                    dismiss_on_click(&app, &card);
                    continue;
                }
                // Focus moves on mouse-up; look shortly after.
                ClickOutside::DismissUnlessFocused => {
                    recheck_at = Some(Instant::now() + Duration::from_millis(250));
                    draft_clicked_away = true;
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
            let clicked_due = recheck_at.is_some_and(|t| Instant::now() >= t);
            let due = clicked_due || last_focus_check.elapsed() > Duration::from_millis(700);
            if due {
                recheck_at = None;
                last_focus_check = Instant::now();
                let now = crate::agent::can_insert_here();
                if clicked_due && std::mem::take(&mut draft_clicked_away) && !now {
                    let card = HudContent::Draft {
                        id,
                        title,
                        text,
                        editable,
                    };
                    dismiss_on_click(&app, &card);
                    continue;
                }
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

/// Press the app's Undo (Cmd+Z / Ctrl+Z) in the app the user is in, after
/// the HUD has gone.
fn undo_later(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        if let Some(state) = handle.try_state::<crate::input::EnigoState>() {
            if let Ok(mut enigo) = state.0.lock() {
                if let Err(e) = crate::input::send_undo(&mut enigo) {
                    log::warn!("HUD undo failed: {e}");
                }
            }
        }
    });
}

/// What the user did in the HUD. `insert` pastes `text` into the app they were
/// in; the rest are forwarded to whichever agent flow owns `id`.
#[tauri::command]
#[specta::specta]
pub fn hud_action(app: AppHandle, id: String, action: String, text: Option<String>) {
    // Smart writing's chip: "Use my words", "Edit".
    if id.starts_with(crate::agent::writing::PREFIX) {
        crate::agent::writing::on_action(&app, &id, &action);
        let _ = app.emit("hud-action", HudActionEvent { id, action });
        return;
    }
    // "Send this to the team?" and the "report this?" offer.
    if id.starts_with(crate::agent::report::CARD_PREFIX) {
        crate::agent::report::on_action(&app, &id, &action, text);
        return;
    }
    // A notice's alternatives ("add it to your calendar instead") belong to
    // the agent, which knows what was asked.
    if id.starts_with(crate::agent::notice::PREFIX)
        && !matches!(action.as_str(), "copy" | "dismiss" | "open")
    {
        crate::agent::notice::on_action(&app, &id, &action, text);
        return;
    }
    match action.as_str() {
        // "Did you mean to type this?" → "Ask Ambient instead".
        "ask" => {
            hide(&app);
            if let Some(text) = text {
                crate::agent::ask_instead(&app, text);
            }
        }
        // An answer stays up to say it went in, with Undo: the HUD never
        // has focus, so the paste lands in the user's app either way.
        "insert" | "replace" => {
            if !id.starts_with("answer-") {
                hide(&app);
            }
            if let Some(text) = text {
                paste_later(&app, text, action == "replace");
            }
        }
        // Undo an answer's Insert: the app's own Undo, in that app.
        "undo_insert" => {
            hide(&app);
            undo_later(&app);
        }
        // A suggestion (or offer) accepted: it waits for its result.
        "accept" => crate::hud_keys::accepted(&app, &id),
        // Stop a streaming answer where it is.
        "stop" => {
            if id.starts_with("answer-") {
                crate::agent::answer::stop(&id);
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
        "dismiss" => {
            remember_dismissed(&id);
            hide(&app);
        }
        // 👍/👎 on an answer or suggestion: counted (and 👎 opens feedback),
        // without touching the card's own flow.
        "rate_up" | "rate_down" => {
            crate::feedback::on_rate(&app, &id, action == "rate_up");
            return;
        }
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

    fn answer(text: &str, done: bool) -> HudContent {
        HudContent::Answer {
            id: "answer-1".into(),
            question: "q".into(),
            text: text.into(),
            sources: Vec::new(),
            done,
            replace: false,
            actions: Vec::new(),
            note: None,
        }
    }

    #[test]
    fn click_outside_dismisses_finished_cards_but_not_work_in_progress() {
        assert_eq!(on_click_outside(&answer("Hi", true)), ClickOutside::Dismiss);
        assert_eq!(
            on_click_outside(&answer("Hi", false)),
            ClickOutside::Dismiss
        );
        assert_eq!(on_click_outside(&answer("", false)), ClickOutside::Ignore);
        assert_eq!(on_click_outside(&HudContent::Help), ClickOutside::Dismiss);
        let suggestion = HudContent::Suggestion {
            id: "suggest-1".into(),
            title: "t".into(),
            accept_label: "a".into(),
            vars: Default::default(),
        };
        assert_eq!(on_click_outside(&suggestion), ClickOutside::Dismiss);
        let draft = HudContent::Draft {
            id: "draft-1".into(),
            title: "t".into(),
            text: "x".into(),
            editable: false,
        };
        assert_eq!(on_click_outside(&draft), ClickOutside::DismissUnlessFocused);
        let listening = HudContent::Listening {
            heard: String::new(),
        };
        assert_eq!(on_click_outside(&listening), ClickOutside::Ignore);
    }
}
