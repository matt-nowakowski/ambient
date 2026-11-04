//! Bug reports and feedback, sent only when the user chooses to: from the
//! Send feedback dialog (tray, Settings › About, ⌘K), a 👎 on a card, or by
//! voice through the agent.
//!
//! What's sent: the message, the kind, where it came from, an optional email
//! for a reply, the app version, OS family and plan, and the random install
//! id (telemetry.rs) for rate limiting. Diagnostics (a settings summary and
//! the last log lines) and the example (the card's question and answer) only
//! when the user ticks them; both are redacted here, and log lines also lose
//! window titles, URLs, hosts, emails, quoted text and home folder names.
//! The dialog previews the exact body first, and every send is written to the
//! request ledger.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;
use tauri::{AppHandle, Emitter};

use crate::context::redact::redact;
use crate::hud::HudContent;

const LOG_LINES: usize = 200;
const MAX_LOG_LINE: usize = 300;
const MAX_MESSAGE: usize = 4000;
const MAX_QUESTION: usize = 4000;
const MAX_ANSWER: usize = 8000;
/// The server's cap on diagnostics.
const MAX_DIAGNOSTICS_BYTES: usize = 64 * 1024;
/// A voice report attaches the last answer card shown this recently.
// Used by `submit`, which the voice agent calls.
#[allow(dead_code)]
const VOICE_EXAMPLE_WINDOW: Duration = Duration::from_secs(120);
const SEND_TIMEOUT: Duration = Duration::from_secs(20);

/// What kind of report.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum FeedbackKind {
    Bug,
    Idea,
    Other,
}

/// Where the report came from (shown and filterable in the admin inbox).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum FeedbackSource {
    /// Said to the agent ("tell the team the reminder didn't work").
    Voice,
    /// The Send feedback dialog.
    Dialog,
    /// A 👎 on an answer or suggestion card.
    Thumbs,
}

/// A card the report is about: its question and answer, redacted.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Type)]
pub struct FeedbackExample {
    /// `answer` or `suggestion`.
    pub card: String,
    /// The answer type (`answer`, `web`, `recall`, `write`, `about_screen`)
    /// or the suggestion kind.
    pub kind: String,
    pub question: String,
    pub answer: String,
}

/// A report for [`submit`]. Stable: the voice agent builds this.
#[allow(dead_code)] // built by the voice agent's "report" route
#[derive(Debug, Clone)]
pub struct Feedback {
    pub kind: FeedbackKind,
    pub message: String,
    /// Attach the settings summary and redacted recent log lines.
    pub include_diagnostics: bool,
    /// The card it's about. For a voice report with diagnostics and no
    /// example, the last answer card (if shown in the last 2 minutes) is
    /// attached automatically.
    pub example: Option<FeedbackExample>,
    pub source: FeedbackSource,
}

/// Send a report: same server path, redaction and ledger entry as the dialog.
/// No email is attached (the dialog is where a reply address can be given).
/// Err is an i18n key (`feedback.errors.*`).
///
/// ```ignore
/// crate::feedback::submit(&app, crate::feedback::Feedback {
///     kind: crate::feedback::FeedbackKind::Bug,
///     message: "The reminder went to the wrong day".into(),
///     include_diagnostics: true,
///     example: None,
///     source: crate::feedback::FeedbackSource::Voice,
/// }).await?;
/// ```
#[allow(dead_code)] // called by the voice agent's "report" route
pub async fn submit(app: &AppHandle, feedback: Feedback) -> Result<(), String> {
    let example = feedback.example.clone().or_else(|| {
        (feedback.source == FeedbackSource::Voice && feedback.include_diagnostics)
            .then(|| recent_answer(VOICE_EXAMPLE_WINDOW))
            .flatten()
    });
    send(
        app,
        FeedbackInput {
            kind: feedback.kind,
            source: feedback.source,
            message: feedback.message,
            email: None,
            include_diagnostics: feedback.include_diagnostics,
            example,
        },
    )
    .await
}

/// What the dialog sends (and previews).
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct FeedbackInput {
    pub kind: FeedbackKind,
    pub source: FeedbackSource,
    pub message: String,
    pub email: Option<String>,
    pub include_diagnostics: bool,
    /// Only when the user ticked "Include the example".
    pub example: Option<FeedbackExample>,
}

/// What the dialog starts with.
#[derive(Serialize, Debug, Clone, Type)]
pub struct FeedbackDraft {
    /// The signed-in email, to prefill the reply address.
    pub email: Option<String>,
    /// The card a 👎 was for, redacted (sent only if ticked).
    pub example: Option<FeedbackExample>,
}

// ── cards seen ────────────────────────────────────────────────────────────

struct SeenCard {
    id: String,
    at: Instant,
    example: FeedbackExample,
}

static CARDS: Lazy<Mutex<Vec<SeenCard>>> = Lazy::new(|| Mutex::new(Vec::new()));

/// Called for every card the HUD shows: remembers finished answers and
/// suggestions (in memory, a few at most) so a 👎 or a voice report can
/// refer to them.
pub fn note_card(content: &HudContent) {
    let (id, example) = match content {
        HudContent::Answer {
            id,
            question,
            text,
            done: true,
            ..
        } if !text.is_empty() => (
            id.clone(),
            FeedbackExample {
                card: "answer".into(),
                kind: crate::telemetry::card(id)
                    .map(|(_, k)| k)
                    .unwrap_or_else(|| "answer".into()),
                question: question.clone(),
                answer: text.clone(),
            },
        ),
        HudContent::Suggestion { id, title, .. } => (
            id.clone(),
            FeedbackExample {
                card: "suggestion".into(),
                kind: crate::telemetry::card(id)
                    .map(|(_, k)| k)
                    .unwrap_or_else(|| "help_here".into()),
                question: title.clone(),
                answer: String::new(),
            },
        ),
        _ => return,
    };
    if let Ok(mut g) = CARDS.lock() {
        g.retain(|c| c.id != id && c.at.elapsed() < Duration::from_secs(15 * 60));
        if g.len() >= 10 {
            g.remove(0);
        }
        g.push(SeenCard {
            id,
            at: Instant::now(),
            example,
        });
    }
}

fn card_example(id: &str) -> Option<FeedbackExample> {
    CARDS
        .lock()
        .ok()?
        .iter()
        .find(|c| c.id == id)
        .map(|c| redact_example(c.example.clone()))
}

/// The last answer card, if shown within `window`, redacted.
#[allow(dead_code)]
fn recent_answer(window: Duration) -> Option<FeedbackExample> {
    CARDS
        .lock()
        .ok()?
        .iter()
        .rev()
        .find(|c| c.example.card == "answer" && c.at.elapsed() < window)
        .map(|c| redact_example(c.example.clone()))
}

fn redact_example(mut e: FeedbackExample) -> FeedbackExample {
    e.question = redact(&e.question).0.chars().take(MAX_QUESTION).collect();
    e.answer = redact(&e.answer).0.chars().take(MAX_ANSWER).collect();
    e
}

/// 👍/👎 on a card. Counted (if usage counts are on); 👎 also opens the
/// feedback dialog ("What went wrong?") with that card attached as an option.
pub fn on_rate(app: &AppHandle, id: &str, up: bool) {
    if let Some((card, kind)) = crate::telemetry::card(id) {
        crate::telemetry::card_rating(card, &kind, up);
    }
    if !up {
        crate::hud::hide(app);
        crate::show_main_window(app);
        let _ = app.emit(
            "open-feedback",
            json!({ "source": "thumbs", "card_id": id }),
        );
    }
}

// ── diagnostics ───────────────────────────────────────────────────────────

static URL: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\b[a-z][a-z0-9+.\-]*://\S+").expect("url"));
static EMAIL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b").expect("email"));
static HOST: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\b(host|domain|url)=\S+").expect("host"));
static TITLE_TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"title\[[^\]]*\]").expect("title tag"));
static TITLE_FIELD: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(window_title|title)\s*[=:]\s*.*$").expect("title field"));
static QUOTED: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#""[^"]*"|“[^”]*”|‘[^’]*’|«[^»]*»"#).expect("quoted"));
static HOME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)(/Users/|/home/|[A-Z]:\\Users\\)[^/\\\s]+").expect("home"));
static DOMAIN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|app|dev|co|me|so|us|uk|de|fr|edu|gov)\b(?:/\S*)?")
        .expect("domain")
});

/// One log line, made safe to send: secrets (the usual redaction), then
/// anything that could be a window title, a URL or host, an email, quoted
/// text or a home folder name.
pub fn redact_log_line(line: &str) -> String {
    let s = redact(line).0;
    let s = URL.replace_all(&s, "[url]");
    let s = EMAIL.replace_all(&s, "[email]");
    let s = HOST.replace_all(&s, "$1=[removed]");
    let s = TITLE_TAG.replace_all(&s, "title[…]");
    let s = TITLE_FIELD.replace_all(&s, "$1=[removed]");
    let s = QUOTED.replace_all(&s, "\"…\"");
    let s = HOME.replace_all(&s, "~");
    let s = DOMAIN.replace_all(&s, "[domain]");
    s.chars().take(MAX_LOG_LINE).collect()
}

fn recent_log_lines(app: &AppHandle) -> Vec<String> {
    let Ok(dir) = crate::portable::app_log_dir(app) else {
        return Vec::new();
    };
    let path = dir.join(format!("{}.log", env!("BRAND_SLUG")));
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(LOG_LINES)..]
        .iter()
        .map(|l| redact_log_line(l))
        .collect()
}

/// Settings that help debugging. Never custom words, never-watch entries,
/// per-app suggestion mutes, prompts or paths.
fn settings_summary(app: &AppHandle) -> Value {
    let s = crate::settings::get_settings(app);
    let all = serde_json::to_value(&s).unwrap_or_default();
    let pick = |keys: &[&str], from: &Value| -> Value {
        Value::Object(
            keys.iter()
                .filter_map(|k| from.get(*k).map(|v| ((*k).to_string(), v.clone())))
                .collect(),
        )
    };
    let mut out = pick(
        &[
            "shortcut_activation",
            "auto_stop_on_pause",
            "selected_model",
            "selected_language",
            "spoken_languages",
            "app_language",
            "translate_to_english",
            "paste_method",
            "clipboard_handling",
            "auto_submit",
            "post_process_enabled",
            "post_process_provider_id",
            "keyboard_implementation",
            "exclusive_shortcuts",
            "typing_tool",
            "overlay_style",
            "vad_enabled",
            "vad_backend",
            "long_form_chunking",
            "language_detection",
            "transcribe_accelerator",
            "theme",
            "experimental_enabled",
            "show_tray_icon",
            "start_hidden",
            "autostart_enabled",
            "telemetry",
            "meetings_email",
        ],
        &all,
    );
    let agent = pick(
        &[
            "routing",
            "screen_context",
            "screen_memory",
            "proactive",
            "meetings",
            "wake_word",
            "retention_days",
            "intelligence",
            "cloud_suggestions",
            "on_device_when_possible",
            "suggestions_per_hour",
        ],
        &all["agent"],
    );
    out["agent"] = agent;
    out["agent"]["paused"] = json!(s
        .agent
        .paused_until
        .is_some_and(|t| t > chrono::Utc::now().timestamp()));
    out["custom_words_count"] = json!(s.custom_words.len());
    out
}

fn diagnostics(app: &AppHandle) -> Value {
    let mut lines = recent_log_lines(app);
    let mut d = json!({ "settings": settings_summary(app), "logs": lines });
    // Keep under the server's cap: drop the oldest lines first.
    while d.to_string().len() > MAX_DIAGNOSTICS_BYTES && !lines.is_empty() {
        let drop = (lines.len() / 4).max(1);
        lines.drain(..drop.min(lines.len()));
        d["logs"] = json!(lines);
    }
    d
}

// ── payload and sending ───────────────────────────────────────────────────

fn valid_email(e: &str) -> bool {
    e.len() <= 254 && EMAIL.find(e).is_some_and(|m| m.as_str().len() == e.len())
}

fn os_family() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// The exact body sent to `/api/feedback`, given the parts gathered here.
fn build_payload(
    input: &FeedbackInput,
    install: Option<String>,
    plan: &str,
    diagnostics: Option<Value>,
) -> Value {
    let email = input
        .email
        .as_deref()
        .map(str::trim)
        .filter(|e| valid_email(e))
        .map(str::to_string);
    json!({
        "install": install,
        "kind": input.kind,
        "source": input.source,
        "message": redact(input.message.trim()).0.chars().take(MAX_MESSAGE).collect::<String>(),
        "email": email,
        "version": env!("CARGO_PKG_VERSION"),
        "os": os_family(),
        "plan": plan,
        "diagnostics": diagnostics,
        "example": input.example.clone().map(redact_example),
    })
}

fn payload(app: &AppHandle, input: &FeedbackInput) -> Value {
    let plan = match crate::plan::status(app).plan {
        crate::plan::Plan::Free => "free",
        crate::plan::Plan::Trial => "trial",
        crate::plan::Plan::Pro | crate::plan::Plan::Team => "pro",
    };
    build_payload(
        input,
        crate::telemetry::install_id(app),
        plan,
        input.include_diagnostics.then(|| diagnostics(app)),
    )
}

async fn send(app: &AppHandle, input: FeedbackInput) -> Result<(), String> {
    if input.message.trim().is_empty() {
        return Err("feedback.errors.empty".into());
    }
    let body = payload(app, &input);
    let text = serde_json::to_string(&body).map_err(|_| "feedback.errors.failed".to_string())?;
    let url = format!("{}/api/feedback", crate::agent::answer::api_base());
    crate::recall::log_request(
        &crate::telemetry::host_of(&url),
        "feedback",
        &serde_json::to_string_pretty(&body).unwrap_or_default(),
    );
    let res = reqwest::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .body(text)
        .timeout(SEND_TIMEOUT)
        .send()
        .await
        .map_err(|_| "feedback.errors.offline".to_string())?;
    let status = res.status().as_u16();
    log::info!(
        "feedback: sent ({:?}, {:?}) → {status}",
        input.kind,
        input.source
    );
    match status {
        200..=299 => Ok(()),
        429 => Err("feedback.errors.rateLimited".into()),
        _ => Err("feedback.errors.failed".into()),
    }
}

/// Prefill for the dialog: the signed-in email, and the 👎'd card.
#[tauri::command]
#[specta::specta]
pub fn feedback_draft(app: AppHandle, card_id: Option<String>) -> FeedbackDraft {
    let st = crate::plan::status(&app);
    FeedbackDraft {
        email: st.account_email.or(st.email),
        example: card_id.as_deref().and_then(card_example),
    }
}

/// Exactly what Send would send, pretty-printed.
#[tauri::command]
#[specta::specta]
pub fn feedback_preview(app: AppHandle, input: FeedbackInput) -> String {
    serde_json::to_string_pretty(&payload(&app, &input)).unwrap_or_default()
}

/// Send the dialog's report. Err is an i18n key.
#[tauri::command]
#[specta::specta]
pub async fn send_feedback(app: AppHandle, input: FeedbackInput) -> Result<(), String> {
    send(&app, input).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_lines_lose_titles_urls_and_people() {
        let line = r#"2026-11-02 [INFO] proactive: com.google.Chrome title[len=31 #a1b2c3] host=mail.google.com fetched https://mail.google.com/mail/u/0/#inbox for ana.silva@example.com in /Users/ana/Documents "Q3 board deck — Final" api_key = sk-live-1234567890abcdefghij"#;
        let out = redact_log_line(line);
        for gone in [
            "mail.google.com",
            "https://",
            "ana.silva",
            "/Users/ana",
            "Q3 board deck",
            "sk-live",
            "#a1b2c3",
        ] {
            assert!(!out.contains(gone), "{gone} survived: {out}");
        }
        assert!(out.contains("com.google.Chrome"), "{out}");
        assert!(out.contains("proactive:"));
    }

    #[test]
    fn title_fields_and_windows_paths() {
        let out = redact_log_line(r"front window: Notes title=Weekend plans with Sam");
        assert!(!out.contains("Weekend"), "{out}");
        let out = redact_log_line(r"model at C:\Users\matt\AppData\Local\x.gguf");
        assert!(!out.contains("matt"), "{out}");
        let out = redact_log_line("visited docs.example.dev/path?q=1 and “secret plans”");
        assert!(
            !out.contains("example.dev") && !out.contains("secret plans"),
            "{out}"
        );
    }

    #[test]
    fn long_lines_are_cut() {
        assert!(redact_log_line(&"a ".repeat(1000)).chars().count() <= MAX_LOG_LINE);
    }

    fn input() -> FeedbackInput {
        FeedbackInput {
            kind: FeedbackKind::Bug,
            source: FeedbackSource::Dialog,
            message: "  It typed my password: hunter2 into Slack  ".into(),
            email: Some("not an email".into()),
            include_diagnostics: false,
            example: Some(FeedbackExample {
                card: "answer".into(),
                kind: "web".into(),
                question: "what's my token: abcd1234".into(),
                answer: "word ".repeat(4_000),
            }),
        }
    }

    #[test]
    fn payload_is_redacted_and_bounded() {
        let p = build_payload(&input(), Some("ab".repeat(16)), "pro", None);
        assert_eq!(p["kind"], "bug");
        assert_eq!(p["source"], "dialog");
        assert_eq!(p["plan"], "pro");
        assert!(!p["message"].as_str().unwrap().contains("hunter2"));
        assert!(p["email"].is_null(), "invalid emails are dropped");
        assert!(p["diagnostics"].is_null());
        assert!(!p["example"]["question"]
            .as_str()
            .unwrap()
            .contains("abcd1234"));
        assert_eq!(
            p["example"]["answer"].as_str().unwrap().chars().count(),
            MAX_ANSWER
        );
        let mut with_email = input();
        with_email.email = Some(" ana@example.com ".into());
        with_email.example = None;
        let p = build_payload(&with_email, None, "free", Some(json!({"logs": []})));
        assert_eq!(p["email"], "ana@example.com");
        assert!(p["example"].is_null());
        assert!(p["install"].is_null());
        assert!(p["diagnostics"].is_object());
        for key in [
            "install",
            "kind",
            "source",
            "message",
            "email",
            "version",
            "os",
            "plan",
            "diagnostics",
            "example",
        ] {
            assert!(p.get(key).is_some(), "{key}");
        }
    }

    #[test]
    fn voice_reports_attach_a_recent_answer() {
        note_card(&HudContent::Answer {
            id: "answer-1".into(),
            question: "When is the dentist?".into(),
            text: "Tuesday at 10.".into(),
            sources: vec![],
            done: true,
            replace: false,
            actions: vec![],
            note: None,
        });
        let e = recent_answer(VOICE_EXAMPLE_WINDOW).unwrap();
        assert_eq!(e.question, "When is the dentist?");
        assert_eq!(e.card, "answer");
        assert!(recent_answer(Duration::ZERO).is_none());
        assert_eq!(card_example("answer-1").unwrap().answer, "Tuesday at 10.");
    }
}
