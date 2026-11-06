//! The hidden test mode behind the scenario suite (`testing/` at the repo
//! root): one made-up moment (what's on screen, what was said, the
//! settings) goes through the app's real pipeline, and every decision, card,
//! paste and opened link is printed as JSON instead of happening.
//!
//! It takes two switches together, so it can't be turned on by accident:
//! the environment variable `AMBIENT_TEST_MODE=1` and the
//! `--test-scenario <file>` flag. The flag alone refuses to start. In test
//! mode the app:
//! - starts no window, tray, shortcut, microphone or agent loop;
//! - keeps its data in a fresh temporary folder (never the user's settings,
//!   history, keychain-backed license or screen memory);
//! - reads the screen, the focused field and the clock only from the
//!   scenario (the platform readers are never called);
//! - records pastes, key presses, opened links and apps, reminders and
//!   events instead of performing them;
//! - sends model and answer requests only to the test server named in the
//!   scenario (`api_base`), which the suite runs locally.
//!
//! It ships in release builds on purpose: the artifact users get is the one
//! the release workflow tests.

pub mod run;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The environment variable that, with `--test-scenario`, turns test mode on.
pub const ENV: &str = "AMBIENT_TEST_MODE";

/// What a scenario is about.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    /// Something said with a shortcut: routing, writing, the agent.
    #[default]
    Dictation,
    /// The user stays on a window: a suggestion, or quiet.
    Screen,
}

/// Which shortcut it was said with.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Key {
    #[default]
    Dictate,
    Ask,
    /// The polish shortcut.
    Polish,
}

/// The focused element in the window.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Focus {
    /// The platform's role name ("AXTextArea", "AXWebArea", "Edit"…).
    pub role: Option<String>,
    pub editable: bool,
    pub secure: bool,
    /// The field's text, when a field has focus.
    pub value: Option<String>,
    /// Caret position in characters of `value`.
    pub caret: Option<usize>,
    pub selection: Option<String>,
    /// The field's text is fixed-width (a code editor or terminal).
    pub monospace: bool,
}

/// The window in front, as the platform reader would report it.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Screen {
    pub app: String,
    /// Bundle id (macOS), executable name (Windows) or app id (Linux).
    pub bundle: String,
    pub title: String,
    pub url: Option<String>,
    pub text: Option<String>,
    pub focus: Focus,
    pub frame_urls: Vec<String>,
    pub frame_titles: Vec<String>,
    pub ui_labels: Vec<String>,
    pub private_window: bool,
    /// Accessibility permission granted (default yes).
    pub untrusted: bool,
    /// Pressing a labelled button ("Reply") works here.
    pub reply_button: bool,
}

/// A card already on screen when the scenario starts.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Card {
    /// "answer", "help", "suggestion" or "draft".
    pub kind: String,
    pub question: String,
    pub text: String,
}

/// Who the user is.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Me {
    pub name: Option<String>,
    pub email: Option<String>,
}

/// One scenario, as the suite resolves it (screens merged, the OS's own
/// app ids picked).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Scenario {
    pub id: String,
    pub kind: Kind,
    pub key: Key,
    pub transcript: String,
    /// Local time, "YYYY-MM-DDTHH:MM".
    pub now: Option<String>,
    /// None: nothing in front (the desktop).
    pub screen: Option<Screen>,
    pub card: Option<Card>,
    /// A JSON patch over the default settings (objects merge).
    pub settings: Value,
    /// "free" or "pro".
    pub plan: String,
    pub me: Me,
    /// The suite's local server: model, answers, suggestions.
    pub api_base: String,
    /// How long to wait for the agent to finish, at most.
    pub wait_ms: Option<u64>,
}

static SCENARIO: OnceLock<Scenario> = OnceLock::new();
static SETTINGS: Mutex<Option<crate::settings::AppSettings>> = Mutex::new(None);
static EVENTS: Mutex<Vec<Value>> = Mutex::new(Vec::new());
static STARTED: OnceLock<Instant> = OnceLock::new();

/// Test mode is on (see the module docs).
pub fn active() -> bool {
    SCENARIO.get().is_some()
}

/// The scenario being run.
pub fn scenario() -> Option<&'static Scenario> {
    SCENARIO.get()
}

/// Whether this launch asked for test mode. The flag without the
/// environment variable is refused: the process exits instead of starting
/// the app with a flag it would ignore.
pub fn requested(path: Option<&Path>) -> bool {
    let Some(path) = path else {
        return false;
    };
    if std::env::var(ENV).as_deref() != Ok("1") {
        eprintln!(
            "--test-scenario needs {ENV}=1 as well; not starting ({})",
            path.display()
        );
        std::process::exit(2);
    }
    true
}

/// Load the scenario and switch test mode on: a fresh data folder, the
/// scenario's settings. Call before anything reads settings or data paths.
pub fn activate(path: &Path) -> PathBuf {
    let fail = |why: String| -> ! {
        eprintln!("test mode: {why}");
        std::process::exit(2);
    };
    let raw = std::fs::read_to_string(path)
        .unwrap_or_else(|e| fail(format!("can't read {}: {e}", path.display())));
    let scenario: Scenario =
        serde_json::from_str(&raw).unwrap_or_else(|e| fail(format!("bad scenario: {e}")));
    if !scenario.api_base.starts_with("http://127.0.0.1")
        && !scenario.api_base.starts_with("http://localhost")
    {
        // Only the suite's own local server: never a real one.
        fail("api_base must be the suite's local server".into());
    }
    let dir = std::env::temp_dir().join(format!(
        "{}-test-{}-{}",
        env!("BRAND_SLUG"),
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    std::fs::create_dir_all(&dir).unwrap_or_else(|e| fail(format!("temp dir: {e}")));
    let settings = settings_for(&scenario.settings)
        .unwrap_or_else(|e| fail(format!("bad settings patch: {e}")));
    *SETTINGS.lock().unwrap_or_else(|e| e.into_inner()) = Some(settings);
    let _ = STARTED.set(Instant::now());
    let _ = SCENARIO.set(scenario);
    dir
}

/// The default settings with the scenario's patch on top.
fn settings_for(patch: &Value) -> Result<crate::settings::AppSettings, String> {
    let mut base =
        serde_json::to_value(crate::settings::get_default_settings()).map_err(|e| e.to_string())?;
    // A scenario is someone past setup (setup's Try it types plain words).
    merge(
        &mut base,
        &serde_json::json!({ "onboarding_completed": true }),
    );
    merge(&mut base, patch);
    serde_json::from_value(base).map_err(|e| e.to_string())
}

fn merge(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                merge(b.entry(k.clone()).or_insert(Value::Null), v);
            }
        }
        (b, p) if !p.is_null() => *b = p.clone(),
        _ => {}
    }
}

/// The scenario's settings (test mode only).
pub fn settings() -> Option<crate::settings::AppSettings> {
    if !active() {
        return None;
    }
    SETTINGS.lock().ok().and_then(|g| g.clone())
}

/// Settings written by the pipeline stay in memory.
pub fn set_settings(s: crate::settings::AppSettings) {
    if let Ok(mut g) = SETTINGS.lock() {
        *g = Some(s);
    }
}

/// Note something the app did (or would have done) for the report.
pub fn record(kind: &str, data: Value) {
    if !active() {
        return;
    }
    let ms = STARTED.get().map_or(0, |t| t.elapsed().as_millis() as u64);
    let mut ev = serde_json::json!({ "type": kind, "ms": ms });
    if let (Value::Object(e), Value::Object(d)) = (&mut ev, data) {
        e.extend(d);
    }
    if let Ok(mut g) = EVENTS.lock() {
        // A streaming answer updates its card many times: keep the latest.
        let same_card = |a: &Value, b: &Value| {
            a["type"] == "hud" && b["type"] == "hud" && {
                let (a, b) = (&a["card"], &b["card"]);
                a["kind"] == b["kind"] && a["id"] == b["id"] && a["id"].is_string()
            }
        };
        if g.last().is_some_and(|last| same_card(last, &ev)) {
            g.pop();
        }
        g.push(ev);
    }
}

pub(crate) fn events() -> Vec<Value> {
    EVENTS.lock().map(|g| g.clone()).unwrap_or_default()
}

/// Milliseconds since the last event (or since the start).
pub(crate) fn quiet_for_ms() -> u64 {
    let now = STARTED.get().map_or(0, |t| t.elapsed().as_millis() as u64);
    let last = EVENTS
        .lock()
        .ok()
        .and_then(|g| g.last().and_then(|e| e["ms"].as_u64()))
        .unwrap_or(0);
    now.saturating_sub(last)
}

/// The suite's local server, standing in for ours.
pub fn api_base() -> Option<String> {
    scenario().map(|s| s.api_base.trim_end_matches('/').to_string())
}

/// The scenario's clock, or None to use the real one.
pub fn now() -> Option<chrono::NaiveDateTime> {
    let s = scenario()?;
    let t = s.now.as_deref().unwrap_or("2026-11-05T10:00");
    chrono::NaiveDateTime::parse_from_str(t, "%Y-%m-%dT%H:%M").ok()
}

/// On Pro.
pub fn is_paid() -> bool {
    scenario().is_some_and(|s| s.plan == "pro")
}

// ── The screen, as the platform reader would report it ──────────────────

const PID: i32 = 4242;

pub fn frontmost_app() -> Option<crate::context::FrontmostApp> {
    let s = scenario()?.screen.as_ref()?;
    Some(crate::context::FrontmostApp {
        pid: PID,
        bundle_id: s.bundle.clone(),
        name: s.app.clone(),
    })
}

pub fn accessibility_trusted() -> bool {
    scenario()
        .and_then(|s| s.screen.as_ref())
        .is_some_and(|s| !s.untrusted)
}

/// The window, with its text when `max_chars` > 0 (cut like the readers do).
pub fn raw_snapshot(max_chars: usize) -> Option<crate::context::RawSnapshot> {
    let s = scenario()?.screen.as_ref()?;
    let text = (max_chars > 0)
        .then(|| s.text.clone())
        .flatten()
        .map(|t| t.chars().take(max_chars).collect::<String>());
    Some(crate::context::RawSnapshot {
        snap: crate::context::ContextSnapshot {
            app: frontmost_app().unwrap_or_default(),
            window_title: s.title.clone(),
            url: s.url.clone(),
            focused_role: s.focus.role.clone(),
            editable: s.focus.editable,
            secure: s.focus.secure,
            selection: (max_chars > 0).then(|| s.focus.selection.clone()).flatten(),
            focused_text: (max_chars > 0).then(|| s.focus.value.clone()).flatten(),
            text,
            ts: 0,
            frame_urls: s.frame_urls.clone(),
            frame_titles: s.frame_titles.clone(),
            private_window: s.private_window,
        },
        ui_labels: s.ui_labels.clone(),
        diag: Default::default(),
    })
}

/// The focused field, when one has focus.
pub fn focused_field(read_text: bool) -> Option<crate::context::field::FocusedField> {
    let f = &scenario()?.screen.as_ref()?.focus;
    if !f.editable || f.secure {
        return None;
    }
    let sel_len = f.selection.as_deref().map_or(0, |s| s.chars().count());
    Some(crate::context::field::FocusedField {
        value: read_text.then(|| f.value.clone()).flatten(),
        selection: read_text.then(|| f.selection.clone()).flatten(),
        caret: f
            .caret
            .or_else(|| f.value.as_deref().map(|v| v.chars().count())),
        sel_len,
    })
}

/// What's right before the caret: the scenario field's text up to its
/// caret (the end when unset). None when no field has focus or the field's
/// text isn't given.
pub fn caret_context(max_chars: usize) -> Option<crate::context::field::CaretContext> {
    let f = &scenario()?.screen.as_ref()?.focus;
    if !f.editable || f.secure {
        return None;
    }
    let value = f.value.as_deref()?;
    let caret = f.caret.unwrap_or_else(|| value.chars().count());
    let before: String = value.chars().take(caret).collect();
    Some(crate::context::field::CaretContext {
        before: crate::context::field::last_chars(&before, max_chars),
        monospace: f.monospace,
    })
}

/// Pressing a labelled button: 0 pressed, 1 not found.
pub fn press_labeled(labels: &[&str]) -> i32 {
    let pressed = scenario()
        .and_then(|s| s.screen.as_ref())
        .is_some_and(|s| s.reply_button);
    record(
        "press",
        serde_json::json!({ "labels": labels.len(), "pressed": pressed }),
    );
    if pressed {
        0
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patches_merge_into_defaults() {
        let patch = serde_json::json!({
            "post_process_enabled": true,
            "agent": { "intelligence": "cloud" }
        });
        let s = settings_for(&patch).expect("settings");
        assert!(s.post_process_enabled);
        assert_eq!(s.agent.intelligence, crate::settings::Intelligence::Cloud);
        // Untouched fields keep their defaults.
        let d = crate::settings::get_default_settings();
        assert_eq!(s.agent.routing, d.agent.routing);
        // Past setup, so dictation isn't held to setup's plain Try it.
        assert!(s.onboarding_completed);
    }

    #[test]
    fn off_without_a_scenario() {
        assert!(!active());
        assert!(frontmost_app().is_none());
        assert!(settings().is_none());
        assert!(api_base().is_none());
    }
}
