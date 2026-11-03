//! Delivering finished meeting notes: the "Your notes are ready" HUD card
//! (Open, Copy, and Email to me when signed in), and the email itself.
//!
//! The email goes through `/api/meetings/email`, which sends only to the
//! signed-in account's address (never one the app names), doesn't store or
//! log the content, and rate-limits. Secrets are redacted here first, and the
//! exact request is written to the Privacy Center's ledger before it leaves.

use std::sync::Once;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use tauri::{AppHandle, Emitter, Listener};

use super::{Meeting, MeetingBody};
use crate::context::redact::redact;
use crate::hud::{self, HudContent, HudTone};
use crate::settings::{self, MeetingsEmail};

/// HUD ids of notes cards: `notes-<meeting id>`.
pub const NOTES_PREFIX: &str = "notes-";
const SEND_TIMEOUT: Duration = Duration::from_secs(20);

/// The "Your notes are ready" card.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct NotesCard {
    pub id: String,
    pub meeting_id: i64,
    /// The summary's title; empty when there's none (the card shows the time).
    pub title: String,
    /// Unix seconds the meeting started.
    pub started: i64,
    pub action_items: u32,
    /// The notes as plain text, for Copy.
    pub text: String,
    /// Offer "Email to me": signed in, and email isn't turned off.
    pub can_email: bool,
    /// `sending`, `sent` or `failed` once an email is under way.
    pub email: Option<String>,
}

/// The notes as plain text (Copy, and the shape of the email).
pub fn notes_text(m: &Meeting) -> String {
    let Some(s) = &m.body.summary else {
        return m.body.notes.join("\n");
    };
    let mut out = vec![s.title.clone(), String::new()];
    if !s.summary.is_empty() {
        out.push(s.summary.clone());
        out.push(String::new());
    }
    let list = |out: &mut Vec<String>, title: &str, items: &[String], mark: &str| {
        if !items.is_empty() {
            out.push(title.to_string());
            out.extend(items.iter().map(|i| format!("{mark} {i}")));
            out.push(String::new());
        }
    };
    list(&mut out, "Decisions", &s.decisions, "-");
    list(&mut out, "Action items", &s.action_items, "[ ]");
    list(&mut out, "Questions for you", &s.questions_for_you, "-");
    out.join("\n").trim().to_string()
}

fn signed_in(app: &AppHandle) -> bool {
    let st = crate::plan::status(app);
    st.account_email.is_some() || st.email.is_some()
}

/// The meeting ended and its notes were written (or not): count it, show the
/// card, and email the notes if the user chose "always".
pub fn notes_ready(app: &AppHandle, id: i64, started: i64, ended: i64, body: &MeetingBody) {
    listen_once(app);
    let outcome = match (&body.summary, body.segments.is_empty()) {
        (Some(_), _) => "notes",
        (None, true) => "empty",
        (None, false) => "failed",
    };
    crate::telemetry::meeting(outcome, ended - started);
    if outcome == "failed" {
        crate::telemetry::error("meeting", "failed");
    }
    if body.segments.is_empty() {
        return;
    }
    let meeting = Meeting {
        id,
        started,
        ended: Some(ended),
        body: body.clone(),
    };
    let mode = settings::get_settings(app).meetings_email;
    let can_email = body.summary.is_some() && mode != MeetingsEmail::Off && signed_in(app);
    let card = NotesCard {
        id: format!("{NOTES_PREFIX}{id}"),
        meeting_id: id,
        title: body
            .summary
            .as_ref()
            .map(|s| s.title.clone())
            .unwrap_or_default(),
        started,
        action_items: body
            .summary
            .as_ref()
            .map_or(0, |s| s.action_items.len() as u32),
        text: notes_text(&meeting),
        can_email,
        email: None,
    };
    let always = can_email && mode == MeetingsEmail::Always;
    show_card(app, card, always.then(|| "sending".to_string()));
    if always {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { email_and_update(&app, id, true).await });
    }
}

fn show_card(app: &AppHandle, mut card: NotesCard, email: Option<String>) {
    card.email = email;
    hud::show(app, HudContent::MeetingNotes(card));
}

/// The notes card on screen for meeting `id`, if it's still there.
fn card_on_screen(id: i64) -> Option<NotesCard> {
    match hud::current() {
        Some(HudContent::MeetingNotes(c)) if c.meeting_id == id && hud::is_visible() => Some(c),
        _ => None,
    }
}

async fn email_and_update(app: &AppHandle, id: i64, always: bool) {
    let result = send_email(app, id, always).await;
    let state = if result.is_ok() { "sent" } else { "failed" };
    match card_on_screen(id) {
        Some(card) => show_card(app, card, Some(state.to_string())),
        // The card is gone: a short line says what happened instead.
        None if !hud::is_visible() => hud::show(
            app,
            HudContent::Status {
                text: if result.is_ok() {
                    "hud.notes.emailed".into()
                } else {
                    "hud.notes.emailFailed".into()
                },
                tone: if result.is_ok() {
                    HudTone::Success
                } else {
                    HudTone::Error
                },
                undo: false,
            },
        ),
        None => {}
    }
}

fn listen_once(app: &AppHandle) {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let handle = app.clone();
        app.listen("hud-action", move |event| {
            let Ok(a) = serde_json::from_str::<hud::HudActionEvent>(event.payload()) else {
                return;
            };
            let Some(id) =
                a.id.strip_prefix(NOTES_PREFIX)
                    .and_then(|s| s.parse::<i64>().ok())
            else {
                return;
            };
            match a.action.as_str() {
                "open_notes" => {
                    hud::hide(&handle);
                    crate::show_main_window(&handle);
                    let _ = handle.emit("open-meeting", id);
                }
                "email_notes" => {
                    if let Some(card) = card_on_screen(id) {
                        show_card(&handle, card, Some("sending".into()));
                    }
                    let handle = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        email_and_update(&handle, id, false).await
                    });
                }
                _ => {}
            }
        });
    });
}

/// The request body, redacted. `session` is the sign-in session (if any).
fn email_body(m: &Meeting, follow_up: Option<&str>, session: Option<&str>) -> serde_json::Value {
    let s = m.body.summary.clone().unwrap_or_default();
    let r = |t: &str| redact(t).0;
    let rl = |items: &[String]| -> Vec<String> { items.iter().take(30).map(|i| r(i)).collect() };
    let date = chrono::DateTime::from_timestamp(m.started, 0)
        .map(|d| {
            d.with_timezone(&chrono::Local)
                .format("%A %-d %B %Y, %H:%M")
                .to_string()
        })
        .unwrap_or_default();
    let minutes = m.ended.map_or(0, |e| ((e - m.started).max(0) + 30) / 60);
    let mut body = json!({
        "title": r(&s.title).chars().take(200).collect::<String>(),
        "date": date,
        "duration_min": minutes.min(1440),
        "summary": r(&s.summary).chars().take(4000).collect::<String>(),
        "decisions": rl(&s.decisions),
        "action_items": rl(&s.action_items),
        "questions": rl(&s.questions_for_you),
        "follow_up": follow_up.map(|f| r(f).chars().take(6000).collect::<String>()),
    });
    if let Some(session) = session {
        body["session"] = json!(session);
    }
    body
}

/// Email meeting `id`'s notes to the signed-in account. Err is an i18n key.
pub async fn send_email(app: &AppHandle, id: i64, always: bool) -> Result<(), String> {
    let result = send_email_inner(app, id).await;
    crate::telemetry::meeting_email(always, result.is_ok());
    if let Err(e) = &result {
        log::warn!("meeting notes email failed: {e}");
    }
    result
}

async fn send_email_inner(app: &AppHandle, id: i64) -> Result<(), String> {
    if !signed_in(app) {
        return Err("meetings.email.errors.notSignedIn".into());
    }
    let meeting = super::get_meeting(id)?;
    if meeting.body.summary.is_none() {
        return Err("meetings.email.errors.noSummary".into());
    }
    // The follow-up draft is written on demand; the email is still worth
    // sending without it.
    let follow_up = super::meeting_follow_up(app.clone(), id).await.ok();
    let session = crate::plan::session_token(app);
    let body = email_body(&meeting, follow_up.as_deref(), session.as_deref());
    let url = format!("{}/api/meetings/email", crate::agent::answer::api_base());
    // The ledger shows exactly what's sent, minus the session token itself.
    let mut shown = body.clone();
    if shown.get("session").is_some() {
        shown["session"] = json!("[your sign-in session]");
    }
    crate::recall::log_request(
        &crate::telemetry::host_of(&url),
        "meeting_email",
        &serde_json::to_string_pretty(&shown).unwrap_or_default(),
    );
    let res = reqwest::Client::new()
        .post(&url)
        .bearer_auth(crate::agent::llm::server_token(app))
        .json(&body)
        .timeout(SEND_TIMEOUT)
        .send()
        .await
        .map_err(|_| "meetings.email.errors.offline".to_string())?;
    match res.status().as_u16() {
        200..=299 => Ok(()),
        401 | 403 => Err("meetings.email.errors.notSignedIn".into()),
        429 => Err("meetings.email.errors.rateLimited".into()),
        _ => Err("meetings.email.errors.failed".into()),
    }
}

/// "Email to me" from the Meetings page.
#[tauri::command]
#[specta::specta]
pub async fn email_meeting_notes(app: AppHandle, id: i64) -> Result<(), String> {
    send_email(&app, id, false).await
}

/// Off, ask (the card's button) or always.
#[tauri::command]
#[specta::specta]
pub fn change_meetings_email_setting(app: AppHandle, mode: MeetingsEmail) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.meetings_email = mode;
    settings::write_settings(&app, s);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meeting::MeetingSummary;

    fn meeting() -> Meeting {
        Meeting {
            id: 7,
            started: 1_700_000_000,
            ended: Some(1_700_000_000 + 45 * 60),
            body: MeetingBody {
                summary: Some(MeetingSummary {
                    title: "Q3 planning".into(),
                    summary: "We agreed the scope. The api_key = sk-live-abcdefghijklmnopqrstuvwx was shared.".into(),
                    decisions: vec!["Ship in October".into()],
                    action_items: vec!["Ana: send the deck (Fri)".into(), "Me: book the room".into()],
                    questions_for_you: vec![],
                }),
                ..Default::default()
            },
        }
    }

    #[test]
    fn plain_text_has_a_checklist() {
        let t = notes_text(&meeting());
        assert!(t.starts_with("Q3 planning"));
        assert!(t.contains("[ ] Ana: send the deck (Fri)"));
        assert!(t.contains("- Ship in October"));
        assert!(!t.contains("Questions for you"));
    }

    #[test]
    fn email_body_is_redacted_and_bounded() {
        let b = email_body(&meeting(), Some("Thanks all! token: abc123"), Some("sess"));
        let summary = b["summary"].as_str().unwrap();
        assert!(!summary.contains("sk-live"), "{summary}");
        assert!(!b["follow_up"].as_str().unwrap().contains("abc123"));
        assert_eq!(b["duration_min"], 45);
        assert_eq!(b["action_items"].as_array().unwrap().len(), 2);
        assert_eq!(b["session"], "sess");
        assert!(email_body(&meeting(), None, None).get("session").is_none());
    }
}
