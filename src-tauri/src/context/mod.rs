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
}

impl ContextSnapshot {
    /// What kind of private place this window is, if any, from its app,
    /// titles and URLs (never its text).
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    fn sensitive_place(&self, app: &FrontmostApp) -> Option<sensitive::SensitivePlace> {
        let mut titles: Vec<&str> = vec![self.window_title.as_str()];
        titles.extend(self.frame_titles.iter().map(String::as_str));
        let mut urls: Vec<&str> = self.frame_urls.iter().map(String::as_str).collect();
        if let Some(url) = &self.url {
            urls.push(url);
        }
        sensitive::sensitive_place(&app.name, &app.bundle_id, &titles, &urls)
    }
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
    #[cfg(target_os = "macos")]
    {
        let mut skip: Vec<String> = DEFAULT_NEVER_WATCH.iter().map(|s| s.to_string()).collect();
        skip.extend(never_watch.iter().cloned());
        macos::open_windows(&skip, max_chars)
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
    #[cfg(not(target_os = "macos"))]
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
    log::debug!("stepping back from a sensitive window ({reason:?})");
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

pub fn accessibility_trusted() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::ax_trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn frontmost_app() -> Option<FrontmostApp> {
    #[cfg(target_os = "macos")]
    {
        macos::frontmost_app()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// A private browsing window, or a private place.
#[cfg(target_os = "macos")]
fn check_place(app: &FrontmostApp, snap: &ContextSnapshot) -> Result<(), Skipped> {
    if PRIVATE_TITLE_MARKERS
        .iter()
        .any(|m| snap.window_title.contains(m))
    {
        return Err(Skipped::NeverWatch);
    }
    if let Some(place) = snap.sensitive_place(app) {
        mark_sensitive(app, &snap.window_title, SensitiveReason::Place(place));
        return Err(Skipped::Sensitive);
    }
    Ok(())
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
    #[cfg(target_os = "macos")]
    {
        // Metadata first (titles, URLs; no text), so a private place is
        // dropped before any of its text is read.
        let meta = macos::window_snapshot(app.pid, 0).ok_or(Skipped::Unavailable)?;
        check_place(&app, &meta)?;
        let mut snap = if max_chars == 0 {
            meta
        } else {
            let full = macos::window_snapshot(app.pid, max_chars).ok_or(Skipped::Unavailable)?;
            // The window may have changed in between.
            check_place(&app, &full)?;
            full
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
            mark_sensitive(&app, &snap.window_title, SensitiveReason::Secret);
            return Err(Skipped::Sensitive);
        }
        snap.app = app;
        snap.ts = chrono::Utc::now().timestamp();
        Ok(snap)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, max_chars);
        Err(Skipped::Unavailable)
    }
}
