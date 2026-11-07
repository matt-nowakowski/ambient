//! What's on screen, as text: the context engine behind Answer ("summarise
//! this"), proactive suggestions and screen memory.
//!
//! Text only, never pixels. The frontmost app is checked against the
//! never-watch policy *before* any of its text is read, and nothing here
//! stores or sends anything; callers decide what to keep (`recall`) and what
//! to send (after `redact`).

pub mod field;
pub mod judge;
pub mod redact;
pub mod sensitive;

// Everywhere: its app-id lists are pure data (see `is_platform_browser`).
pub(crate) mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

// The platform's screen reader, with the same functions everywhere: macOS
// Accessibility, Windows UI Automation, Linux AT-SPI.
#[cfg(target_os = "windows")]
use self::windows as platform;
#[cfg(target_os = "linux")]
use linux as platform;
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
    /// Whether this window is a private place, judged from its app, titles,
    /// URLs, the browser UI's labels (`ui_labels`: tab, side panel and popup
    /// titles) and, once it has been read, its text (see `judge`).
    #[cfg_attr(
        not(any(target_os = "macos", target_os = "windows", target_os = "linux")),
        allow(dead_code)
    )]
    fn judge(&self, app: &FrontmostApp, ui_labels: &[String]) -> judge::Judgement {
        let mut titles: Vec<&str> = vec![self.window_title.as_str()];
        titles.extend(self.frame_titles.iter().map(String::as_str));
        titles.extend(ui_labels.iter().map(String::as_str));
        let mut urls: Vec<&str> = self.frame_urls.iter().map(String::as_str).collect();
        if let Some(url) = &self.url {
            urls.push(url);
        }
        let text = self
            .text
            .as_deref()
            .or(self.focused_text.as_deref())
            .unwrap_or("");
        judge::judge(&judge::Page {
            app_name: &app.name,
            bundle_id: &app.bundle_id,
            titles: &titles,
            urls: &urls,
            text,
            secure_focus: self.secure,
        })
    }
}

/// A snapshot as the platform reports it: the snapshot, plus the browser
/// UI's labels (for spotting private places only) and counts for logs.
#[derive(Deserialize, Debug, Default)]
#[cfg_attr(
    not(any(target_os = "macos", target_os = "windows", target_os = "linux")),
    allow(dead_code)
)]
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
#[cfg_attr(
    not(any(target_os = "macos", target_os = "windows", target_os = "linux")),
    allow(dead_code)
)]
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
    let mut skip: Vec<String> = default_never_watch().map(str::to_string).collect();
    skip.extend(never_watch.iter().cloned());
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    // Test mode: only the scenario's window is "open" (read via `snapshot`).
    if crate::testing::active() {
        return Vec::new();
    }
    let windows = platform::open_windows(&skip, max_chars);
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let windows: Vec<OpenWindow> = {
        let _ = (&skip, max_chars);
        Vec::new()
    };
    windows
        .into_iter()
        .filter(|w| !PRIVATE_TITLE_MARKERS.iter().any(|m| w.title.contains(m)))
        .filter(|w| {
            sensitive::sensitive_place(
                &w.name,
                &w.bundle_id,
                &[&w.title],
                &[w.url.as_deref().unwrap_or("")],
                &w.text,
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
    /// place (a wallet, a password manager, a bank, a checkout, a medical
    /// portal, a government-ID page): dropped entirely, and the agent shows
    /// that it stepped back.
    Sensitive,
}

/// Apps whose text is never read: password managers, keychains, system
/// settings and sign-in prompts, and Ambient itself. Messaging apps aren't
/// on it: Ambient writes replies there, which needs the conversation (read
/// and redacted like email). Users can add any app in the Privacy Center.
pub const DEFAULT_NEVER_WATCH: &[&str] = &[
    "com.1password.1password",
    "com.agilebits.onepassword7",
    "com.bitwarden.desktop",
    "com.lastpass.LastPass",
    "com.dashlane.dashlanephonefinal",
    "com.apple.keychainaccess",
    "com.apple.Passwords",
    "com.apple.systempreferences",
    // Windows (executable names): password managers, Settings and the
    // sign-in and credential prompts.
    "1password.exe",
    "bitwarden.exe",
    "keepass.exe",
    "keepassxc.exe",
    "dashlane.exe",
    "enpass.exe",
    "nordpass.exe",
    "proton pass.exe",
    "keeperpasswordmanager.exe",
    "systemsettings.exe",
    "credentialuibroker.exe",
    "lockapp.exe",
    "consent.exe",
    env!("BRAND_IDENTIFIER"),
];

/// Never-watch ids for this platform beside the shared list (Linux app ids).
#[cfg(target_os = "linux")]
const PLATFORM_NEVER_WATCH: &[&str] = linux::NEVER_WATCH;
#[cfg(not(target_os = "linux"))]
const PLATFORM_NEVER_WATCH: &[&str] = &[];

/// The built-in never-watch list on this platform.
pub fn default_never_watch() -> impl Iterator<Item = &'static str> {
    DEFAULT_NEVER_WATCH
        .iter()
        .chain(PLATFORM_NEVER_WATCH)
        .copied()
}

/// An app that means a call when it's in front while another app holds the
/// mic, for platforms whose app ids aren't macOS bundle ids.
pub fn is_platform_call_app(bundle_id: &str) -> bool {
    #[cfg(target_os = "linux")]
    {
        linux::is_call_app(bundle_id)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = bundle_id;
        false
    }
}

/// A browser, by the Linux app ids (lowercased executable, Snap or Flatpak
/// names) beside the shared list's bundle ids and Windows executables.
/// Checked on every OS, like the agent's other app lists: ids can't collide
/// across OSes, and the same answer everywhere means the scenario suite's
/// Linux fixtures (`--as-os linux`) see what a Linux build sees.
pub fn is_platform_browser(bundle_id: &str) -> bool {
    linux::appid::is_browser(bundle_id)
}

/// Why a window was dropped as sensitive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SensitiveReason {
    /// It showed a recovery phrase or a private key.
    Secret,
    /// It is a private place as a whole (wallet, password manager, bank,
    /// checkout, medical portal, government-ID page).
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

    /// What to say, quietly, when the user asks about a window Ambient won't
    /// read ("I don't read banking pages."): an i18n key.
    pub fn declined_key(self) -> &'static str {
        use sensitive::SensitivePlace::*;
        match self {
            SensitiveReason::Secret => "hud.status.privateSecret",
            SensitiveReason::Place(Wallet) => "hud.status.privateWallet",
            SensitiveReason::Place(PasswordManager) => "hud.status.privatePasswords",
            SensitiveReason::Place(Banking) => "hud.status.privateBanking",
            SensitiveReason::Place(Payment) => "hud.status.privatePayment",
            SensitiveReason::Place(Health) => "hud.status.privateHealth",
            SensitiveReason::Place(Identity) => "hud.status.privateIdentity",
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
    crate::testing::record(
        "sensitive",
        serde_json::json!({ "reason": format!("{reason:?}") }),
    );
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
    default_never_watch().any(|b| b == bundle_id) || extra.iter().any(|b| b == bundle_id)
}

/// Whether the screen can be read: Accessibility permission on macOS;
/// Windows' UI Automation needs none.
pub fn accessibility_trusted() -> bool {
    // Test mode never reads the real screen: the scenario's window instead.
    if crate::testing::active() {
        return crate::testing::accessibility_trusted();
    }
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        platform::ax_trusted()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

pub fn frontmost_app() -> Option<FrontmostApp> {
    if crate::testing::active() {
        return crate::testing::frontmost_app();
    }
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        platform::frontmost_app()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

/// The last sensitive-check outcome per window, so a decision is logged at
/// debug once when it changes, and every tick only at trace.
#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
static LAST_CHECK: std::sync::Mutex<Option<(String, String)>> = std::sync::Mutex::new(None);

/// The front window as the platform reports it. Linux's AT-SPI reader has
/// no browser UI labels or counts, so its snapshot is wrapped as is.
#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn raw_snapshot(pid: i32, max_chars: usize) -> Option<RawSnapshot> {
    if crate::testing::active() {
        return crate::testing::raw_snapshot(max_chars);
    }
    #[cfg(target_os = "linux")]
    {
        platform::window_snapshot(pid, max_chars).map(|snap| RawSnapshot {
            snap,
            ..Default::default()
        })
    }
    #[cfg(not(target_os = "linux"))]
    {
        platform::window_snapshot(pid, max_chars)
    }
}

/// The same window was judged private from its text a moment ago (by a full
/// read): a metadata-only look at it (routing, the agent's tick) keeps that
/// verdict instead of seeing only a harmless title.
#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn judged_private_recently(app: &FrontmostApp, title: &str) -> Option<sensitive::SensitivePlace> {
    match recent_sensitive()? {
        SensitiveWindow {
            bundle_id,
            title: t,
            reason: SensitiveReason::Place(place),
        } if bundle_id == app.bundle_id && t == title => Some(place),
        _ => None,
    }
}

/// A private browsing window, or a private place. `read` says whether the
/// snapshot carries the window's text (a full read) or only its metadata.
#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn check_place(app: &FrontmostApp, raw: &RawSnapshot, read: bool) -> Result<(), Skipped> {
    let snap = &raw.snap;
    if snap.private_window
        || PRIVATE_TITLE_MARKERS
            .iter()
            .any(|m| snap.window_title.contains(m))
    {
        return Err(Skipped::NeverWatch);
    }
    let judgement = snap.judge(app, &raw.ui_labels);
    let found = judgement.place.or_else(|| {
        (!read)
            .then(|| judged_private_recently(app, &snap.window_title))
            .flatten()
    });
    // Privacy-safe: bundle, a title tag, the score and the names of the
    // signals that fired, counts, hosts and extension ids only.
    let signals = judgement.signals.join(",");
    let outcome = match (found, judgement.place) {
        (Some(place), Some(_)) => {
            format!("match {place:?} (score {} via {signals})", judgement.score)
        }
        (Some(place), None) => format!("match {place:?} (judged from its text a moment ago)"),
        _ => format!("no match (score {} via {signals})", judgement.score),
    };
    let urls = snap
        .frame_urls
        .iter()
        .map(String::as_str)
        .chain(snap.url.as_deref());
    let ext = sensitive::extension_ids(urls.clone());
    let line = format!(
        "sensitive check {} title[{}] {}: {outcome}; frames={} hosts={:?} extensions={:?} ui_labels={} popups={} web_areas={} web_area_children={}",
        app.bundle_id,
        title_tag(&snap.window_title),
        if read { "page" } else { "meta" },
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
    if let Some(place) = found {
        mark_sensitive(app, &snap.window_title, SensitiveReason::Place(place));
        return Err(Skipped::Sensitive);
    }
    Ok(())
}

/// Press the button or link with one of these names in the front window
/// (e.g. Gmail's "Reply"). 0 pressed, 1 not found, 2 the press failed,
/// 3 unavailable.
pub fn press_labeled(labels: &[&str]) -> i32 {
    if crate::testing::active() {
        return crate::testing::press_labeled(labels);
    }
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
/// Private places (wallets, password managers, banks, checkouts, medical and
/// government-ID pages) are judged from the app, titles and frame URLs
/// before any text is read, and again with the text once it is (see
/// `judge`); they and windows showing a recovery phrase or key come back as
/// [`Skipped::Sensitive`].
pub fn snapshot(max_chars: usize, never_watch: &[String]) -> Result<ContextSnapshot, Skipped> {
    let Some(app) = frontmost_app() else {
        // On Wayland the window in front is only known through AT-SPI.
        return Err(if accessibility_trusted() {
            Skipped::Unavailable
        } else {
            Skipped::NoPermission
        });
    };
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
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        // Metadata first (titles, URLs; no text), so a private place is
        // dropped before any of its text is read.
        let meta = raw_snapshot(app.pid, 0).ok_or(Skipped::Unavailable)?;
        check_place(&app, &meta, false)?;
        let mut snap = if max_chars == 0 {
            meta.snap
        } else {
            let full = raw_snapshot(app.pid, max_chars).ok_or(Skipped::Unavailable)?;
            // Judged again with its text (in memory only: a private page's
            // text is dropped right here). The window may also have changed.
            check_place(&app, &full, true)?;
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
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = (app, max_chars);
        Err(Skipped::Unavailable)
    }
}

/// A web link's host ("https://truth.network/about" → "truth.network");
/// None for other schemes. Page readers keep links that leave the page's
/// own site, with their destination.
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub(crate) fn link_host(url: &str) -> Option<&str> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    rest.split(['/', '?', '#']).next().filter(|h| !h.is_empty())
}
