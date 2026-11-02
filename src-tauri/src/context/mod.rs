//! What's on screen, as text: the context engine behind Answer ("summarise
//! this"), proactive suggestions and screen memory.
//!
//! Text only, never pixels. The frontmost app is checked against the
//! never-watch policy *before* any of its text is read, and nothing here
//! stores or sends anything; callers decide what to keep (`recall`) and what
//! to send (after `redact`).

pub mod redact;
pub mod sensitive;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "windows")]
use self::windows as platform;
/// The platform's screen reader: the same functions on macOS (Accessibility)
/// and Windows (UI Automation).
#[cfg(target_os = "macos")]
use macos as platform;

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq, Type)]
pub struct FrontmostApp {
    pub pid: i32,
    pub bundle_id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, Type)]
pub struct ContextSnapshot {
    #[serde(default)]
    pub app: FrontmostApp,
    #[serde(default)]
    pub window_title: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub focused_role: Option<String>,
    /// A text field has focus (only a hint; writing never depends on it).
    #[serde(default)]
    pub editable: bool,
    /// A password field has focus. Nothing else is read when this is true.
    #[serde(default)]
    pub secure: bool,
    #[serde(default)]
    pub selection: Option<String>,
    /// Text of the focused, editable field (what the user is writing).
    #[serde(default)]
    pub focused_text: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    /// Unix seconds.
    #[serde(default)]
    pub ts: i64,
    /// URLs of the window's web frames (a browser's page, side panel,
    /// extension popup), used only to spot private places; cleared before a
    /// snapshot is handed out.
    #[serde(default)]
    pub frame_urls: Vec<String>,
    /// Those frames' titles, likewise.
    #[serde(default)]
    pub frame_titles: Vec<String>,
    /// The window is a private browsing window (Windows: read from the
    /// browser's own controls, which its title doesn't show). Never sent.
    #[serde(skip)]
    pub private_window: bool,
}

impl ContextSnapshot {
    /// What kind of private place this window is, if any, and which rule
    /// said so, from its app, titles, URLs and the browser UI's labels
    /// (`ui_labels`: tab, side panel and popup titles), never its text.
    #[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
    fn sensitive_place(
        &self,
        app: &FrontmostApp,
        ui_labels: &[String],
    ) -> Option<(sensitive::SensitivePlace, &'static str)> {
        let mut titles: Vec<&str> = vec![self.window_title.as_str()];
        titles.extend(self.frame_titles.iter().map(String::as_str));
        titles.extend(ui_labels.iter().map(String::as_str));
        let mut urls: Vec<&str> = self.frame_urls.iter().map(String::as_str).collect();
        if let Some(url) = &self.url {
            urls.push(url);
        }
        sensitive::sensitive_place_why(&app.name, &app.bundle_id, &titles, &urls)
    }
}

/// A snapshot as the platform reports it: the snapshot, plus the browser
/// UI's labels (for spotting private places only) and counts for logs.
#[derive(Deserialize, Debug, Default)]
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
pub struct RawSnapshot {
    #[serde(flatten)]
    pub snap: ContextSnapshot,
    #[serde(default)]
    pub ui_labels: Vec<String>,
    #[serde(default)]
    pub diag: SnapshotDiag,
}

/// Counts the native side reports with each snapshot, for logs only.
#[derive(Deserialize, Debug, Default, Clone)]
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
pub struct SnapshotDiag {
    /// Web areas in the window's browser UI walk (page, side panel…).
    #[serde(default)]
    pub web_areas: Option<u32>,
    /// Children of the first web area; 0 means no tree was built for it.
    #[serde(default)]
    pub web_area_children: Option<i64>,
    #[serde(default)]
    pub chrome_nodes: Option<u32>,
    /// Extension popups and other non-standard windows (browsers).
    #[serde(default)]
    pub popup_windows: Option<u32>,
    /// Nodes visited reading the text.
    #[serde(default)]
    pub text_nodes: Option<u32>,
    #[serde(default)]
    pub found_web_area: Option<bool>,
    #[serde(default)]
    pub found_main: Option<bool>,
    /// Chromium browsers: AXEnhancedUserInterface reads back as on.
    #[serde(default)]
    pub enhanced_ui: Option<bool>,
    /// Seconds since it was asked for (Chrome applies it ~2 s later).
    #[serde(default)]
    pub enhanced_age_s: Option<u32>,
}

/// A window title for logs: its length and a short hash, so the same window
/// can be followed across lines without writing its title.
pub fn title_tag(title: &str) -> String {
    // FNV-1a: stable across runs, unlike the std hasher.
    let mut h: u32 = 0x811c_9dc5;
    for b in title.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    format!("len={} #{:06x}", title.chars().count(), h & 0xff_ffff)
}

/// A URL for logs: its host only.
pub fn url_host(url: Option<&str>) -> String {
    url.map(|u| sensitive::hosts([u]).join(","))
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| "-".into())
}

/// A window of any open app, read on demand to find the user's own things.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct OpenWindow {
    #[serde(default)]
    pub bundle_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub text: String,
}

/// Text of the windows open in every app (not just the one in front), minus
/// the never-watch list and private windows, redacted. Only called while
/// answering something the user asked or accepted.
pub fn open_windows(never_watch: &[String], max_chars: usize) -> Vec<OpenWindow> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let mut skip: Vec<String> = DEFAULT_NEVER_WATCH.iter().map(|s| s.to_string()).collect();
        skip.extend(never_watch.iter().cloned());
        platform::open_windows(&skip, max_chars)
            .into_iter()
            .filter(|w| !PRIVATE_TITLE_MARKERS.iter().any(|m| w.title.contains(m)))
            .filter(|w| {
                sensitive::sensitive_place(
                    &w.name,
                    &w.bundle_id,
                    &[&w.title],
                    &[w.url.as_deref().unwrap_or("")],
                )
                .is_none()
            })
            .filter(|w| sensitive::detect(&w.text).is_none())
            .map(|mut w| {
                w.text = redact::redact(&w.text).0;
                w
            })
            .collect()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (never_watch, max_chars);
        Vec::new()
    }
}

/// Why no snapshot was taken.
#[derive(Serialize, Debug, Clone, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum Skipped {
    /// The app is on the never-watch list.
    NeverWatch,
    /// Accessibility permission hasn't been granted.
    NoPermission,
    /// No frontmost app, or this platform isn't supported yet.
    Unavailable,
    /// The window shows a recovery phrase or a private key, or is a private
    /// place (a wallet, a password manager, a bank): dropped entirely, and the
    /// agent shows that it stepped back.
    Sensitive,
}

/// Apps whose text is never read: password managers, keychains, private
/// messaging, and Ambient itself. Users can add more in the Privacy Center.
pub const DEFAULT_NEVER_WATCH: &[&str] = &[
    "com.1password.1password",
    "com.agilebits.onepassword7",
    "com.bitwarden.desktop",
    "com.lastpass.LastPass",
    "com.dashlane.dashlanephonefinal",
    "com.apple.keychainaccess",
    "com.apple.Passwords",
    "com.apple.MobileSMS",
    "net.whatsapp.WhatsApp",
    "org.whispersystems.signal-desktop",
    "ru.keepcoder.Telegram",
    "com.apple.systempreferences",
    // Windows (executable names): password managers, private messaging,
    // Settings and the sign-in and credential prompts.
    "1password.exe",
    "bitwarden.exe",
    "keepass.exe",
    "keepassxc.exe",
    "dashlane.exe",
    "enpass.exe",
    "nordpass.exe",
    "proton pass.exe",
    "keeperpasswordmanager.exe",
    "whatsapp.exe",
    "whatsapp.root.exe",
    "signal.exe",
    "telegram.exe",
    "systemsettings.exe",
    "credentialuibroker.exe",
    "lockapp.exe",
    "consent.exe",
    env!("BRAND_IDENTIFIER"),
];

/// Why a window was dropped as sensitive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SensitiveReason {
    /// It showed a recovery phrase or a private key.
    Secret,
    /// It is a private place as a whole (wallet, password manager, bank).
    Place(sensitive::SensitivePlace),
}

impl SensitiveReason {
    /// The HUD status (an i18n key) that says the agent stepped back.
    pub fn status_key(self) -> &'static str {
        match self {
            SensitiveReason::Secret => "hud.status.sensitivePaused",
            SensitiveReason::Place(_) => "hud.status.steppingBack",
        }
    }
}

/// A window found sensitive.
#[derive(Debug, Clone)]
pub struct SensitiveWindow {
    pub bundle_id: String,
    pub title: String,
    pub reason: SensitiveReason,
}

/// The last window found sensitive, and when.
static SENSITIVE: std::sync::Mutex<Option<(SensitiveWindow, std::time::Instant)>> =
    std::sync::Mutex::new(None);

fn mark_sensitive(app: &FrontmostApp, title: &str, reason: SensitiveReason) {
    log::trace!("stepping back from a sensitive window ({reason:?})");
    if let Ok(mut g) = SENSITIVE.lock() {
        *g = Some((
            SensitiveWindow {
                bundle_id: app.bundle_id.clone(),
                title: title.to_string(),
                reason,
            },
            std::time::Instant::now(),
        ));
    }
}

/// The window most recently found sensitive, if it was in the last minute:
/// the agent uses it to tell the user it stepped back.
pub fn recent_sensitive() -> Option<SensitiveWindow> {
    SENSITIVE
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .filter(|(_, t)| t.elapsed() < std::time::Duration::from_secs(60))
        .map(|(w, _)| w)
}

/// Window titles that mark a private browsing window (best effort: browsers
/// don't expose a private-mode flag through accessibility).
const PRIVATE_TITLE_MARKERS: &[&str] = &[
    "Private Browsing",
    "Incognito",
    "InPrivate",
    "Private Window",
];

pub fn is_never_watch(bundle_id: &str, extra: &[String]) -> bool {
    DEFAULT_NEVER_WATCH.contains(&bundle_id) || extra.iter().any(|b| b == bundle_id)
}

/// Whether the screen can be read: Accessibility permission on macOS;
/// Windows' UI Automation needs none.
pub fn accessibility_trusted() -> bool {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        platform::ax_trusted()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

pub fn frontmost_app() -> Option<FrontmostApp> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        platform::frontmost_app()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

/// Mail apps where Reply (Cmd+R / Ctrl+R) opens a reply to the message in
/// front: Apple Mail, and Outlook on Windows.
pub fn is_mail_app(bundle_id: &str) -> bool {
    bundle_id == "com.apple.mail" || ["outlook.exe", "olk.exe"].contains(&bundle_id)
}

/// The last sensitive-check outcome per window, so a decision is logged at
/// debug once when it changes, and every tick only at trace.
#[cfg(any(target_os = "macos", target_os = "windows"))]
static LAST_CHECK: std::sync::Mutex<Option<(String, String)>> = std::sync::Mutex::new(None);

/// A private browsing window, or a private place.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn check_place(app: &FrontmostApp, raw: &RawSnapshot) -> Result<(), Skipped> {
    let snap = &raw.snap;
    if snap.private_window
        || PRIVATE_TITLE_MARKERS
            .iter()
            .any(|m| snap.window_title.contains(m))
    {
        return Err(Skipped::NeverWatch);
    }
    let found = snap.sensitive_place(app, &raw.ui_labels);
    // Privacy-safe: bundle, a title tag, counts, hosts and extension ids only.
    let outcome = match found {
        Some((place, rule)) => format!("match {place:?} (rule {rule})"),
        None => "no match".into(),
    };
    let urls = snap
        .frame_urls
        .iter()
        .map(String::as_str)
        .chain(snap.url.as_deref());
    let ext = sensitive::extension_ids(urls.clone());
    let line = format!(
        "sensitive check {} title[{}]: {outcome}; frames={} hosts={:?} extensions={:?} ui_labels={} popups={} web_areas={} web_area_children={}",
        app.bundle_id,
        title_tag(&snap.window_title),
        snap.frame_urls.len(),
        sensitive::hosts(urls),
        ext,
        raw.ui_labels.len(),
        raw.diag.popup_windows.unwrap_or(0),
        raw.diag.web_areas.unwrap_or(0),
        raw.diag.web_area_children.unwrap_or(-1),
    );
    let key = format!("{}|{}", app.pid, snap.window_title);
    let changed = LAST_CHECK
        .lock()
        .map(|mut g| {
            let changed = g.as_ref() != Some(&(key.clone(), outcome.clone()));
            *g = Some((key, outcome));
            changed
        })
        .unwrap_or(true);
    if changed {
        log::debug!("{line}");
    } else {
        log::trace!("{line}");
    }
    if let Some((place, _)) = found {
        mark_sensitive(app, &snap.window_title, SensitiveReason::Place(place));
        return Err(Skipped::Sensitive);
    }
    Ok(())
}

/// Press the button or link with one of these names in the front window
/// (e.g. Gmail's "Reply"). 0 pressed, 1 not found, 2 the press failed,
/// 3 unavailable.
pub fn press_labeled(labels: &[&str]) -> i32 {
    #[cfg(target_os = "macos")]
    {
        match frontmost_app() {
            Some(app) if accessibility_trusted() => macos::press_labeled(app.pid, labels),
            _ => 3,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = labels;
        3
    }
}

/// Read the frontmost window. `max_chars == 0` reads metadata only (app,
/// title, focus), which is cheap enough to call on every trigger.
///
/// Private places (wallets, password managers, banks) are recognised from
/// the app, titles and frame URLs alone, before any text is read; they and
/// windows showing a recovery phrase or key come back as
/// [`Skipped::Sensitive`].
pub fn snapshot(max_chars: usize, never_watch: &[String]) -> Result<ContextSnapshot, Skipped> {
    let app = frontmost_app().ok_or(Skipped::Unavailable)?;
    // From the app's identity alone, before anything is read.
    if let Some(place) = sensitive::sensitive_app(&app.name, &app.bundle_id) {
        mark_sensitive(&app, &app.name, SensitiveReason::Place(place));
        return Err(Skipped::Sensitive);
    }
    if is_never_watch(&app.bundle_id, never_watch) {
        return Err(Skipped::NeverWatch);
    }
    if !accessibility_trusted() {
        return Err(Skipped::NoPermission);
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        // Metadata first (titles, URLs; no text), so a private place is
        // dropped before any of its text is read.
        let meta = platform::window_snapshot(app.pid, 0).ok_or(Skipped::Unavailable)?;
        check_place(&app, &meta)?;
        let mut snap = if max_chars == 0 {
            meta.snap
        } else {
            let full = platform::window_snapshot(app.pid, max_chars).ok_or(Skipped::Unavailable)?;
            // The window may have changed in between.
            check_place(&app, &full)?;
            let d = &full.diag;
            log::debug!(
                "snapshot {} title[{}] host={} text_chars={} text_nodes={} web_area={} main={} web_area_children={} chrome_nodes={} enhanced_ui={:?} enhanced_age_s={:?}",
                app.bundle_id,
                title_tag(&full.snap.window_title),
                url_host(full.snap.url.as_deref()),
                full.snap.text.as_deref().map_or(0, |t| t.chars().count()),
                d.text_nodes.unwrap_or(0),
                d.found_web_area.unwrap_or(false),
                d.found_main.unwrap_or(false),
                d.web_area_children.unwrap_or(-1),
                d.chrome_nodes.unwrap_or(0),
                d.enhanced_ui,
                d.enhanced_age_s,
            );
            full.snap
        };
        snap.frame_urls.clear();
        snap.frame_titles.clear();
        if snap.secure {
            snap.text = None;
            snap.selection = None;
            snap.focused_text = None;
        }
        let shows_secret = [&snap.text, &snap.selection, &snap.focused_text]
            .iter()
            .any(|t| t.as_deref().is_some_and(|t| sensitive::detect(t).is_some()));
        if shows_secret {
            log::debug!(
                "sensitive check {} title[{}]: shows a recovery phrase or key; dropped",
                app.bundle_id,
                title_tag(&snap.window_title)
            );
            mark_sensitive(&app, &snap.window_title, SensitiveReason::Secret);
            return Err(Skipped::Sensitive);
        }
        snap.app = app;
        snap.ts = chrono::Utc::now().timestamp();
        Ok(snap)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, max_chars);
        Err(Skipped::Unavailable)
    }
}
