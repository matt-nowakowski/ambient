//! "Report a bug: the summary missed the last email", "that didn't work",
//! "tell the team …", "I wish you could …": bug reports and feedback, by
//! voice. The decision (`router::route`) recognises them, in any language,
//! and says whether each is a bug, an idea or other feedback.
//!
//! They're shown in a card, "Send this to the team?", with the message as
//! heard, an "Include diagnostics" switch (off by default) and Send / Edit /
//! Cancel. Answering by voice is the decision's too; Edit takes the next
//! thing said as the new message. Nothing leaves until Send.
//!
//! With diagnostics on, `feedback::submit` attaches
//! the last answer card (shown in the last 2 minutes), redacted, so this
//! module never attaches one itself.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use regex::Regex;
use tauri::AppHandle;

use super::notice::{offer, Notice};
use crate::feedback::{Feedback, FeedbackKind, FeedbackSource};
use crate::hud::{self, HudContent};

/// HUD ids of report cards and of the "report this?" offer.
pub const CARD_PREFIX: &str = "report-";
pub const OFFER_PREFIX: &str = "report-offer-";

/// What the first pass makes of the words.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReportIntent {
    pub kind: FeedbackKind,
    /// The message, without the opener ("report a bug:").
    pub message: String,
    /// Said to the team in so many words ("report a bug", "feature
    /// request", "tell the Ambient team"). Vague complaints ("that's wrong")
    /// only count when there's no text field, with the Ask key, or right
    /// after an answer: elsewhere they're words for people.
    pub explicit: bool,
}

pub fn kind_name(kind: FeedbackKind) -> &'static str {
    match kind {
        FeedbackKind::Bug => "bug",
        FeedbackKind::Idea => "idea",
        FeedbackKind::Other => "other",
    }
}

// ── The card ───────────────────────────────────────────────────────────────

struct Pending {
    id: String,
    kind: FeedbackKind,
    message: String,
    diagnostics: bool,
    /// Edit was pressed: the next thing said replaces the message.
    editing: bool,
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

fn card(p: &Pending) -> HudContent {
    HudContent::Report {
        id: p.id.clone(),
        report_kind: kind_name(p.kind).into(),
        message: p.message.clone(),
        include_diagnostics: p.diagnostics,
        editing: p.editing,
    }
}

/// Show "Send this to the team?" with the message as heard.
pub fn show(app: &AppHandle, intent: ReportIntent) {
    let p = Pending {
        id: format!("{CARD_PREFIX}{}", chrono::Utc::now().timestamp_millis()),
        kind: intent.kind,
        message: intent.message,
        diagnostics: false,
        editing: false,
    };
    log::debug!(
        "report: showing a {} report card ({} chars)",
        kind_name(p.kind),
        p.message.chars().count(),
    );
    hud::show(app, card(&p));
    if let Ok(mut g) = PENDING.lock() {
        *g = Some(p);
    }
    // "Yes" / "send it" by voice, without the shortcut.
    super::wake::listen_for_reply(app);
}

/// A report card is on screen, waiting.
pub fn awaiting() -> bool {
    if !hud::is_visible() {
        return false;
    }
    // Only while that very card is the one on screen.
    let on_screen = match hud::current() {
        Some(HudContent::Report { id, .. }) | Some(HudContent::Suggestion { id, .. }) => id,
        _ => return false,
    };
    PENDING
        .lock()
        .is_ok_and(|g| g.as_ref().is_some_and(|p| p.id == on_screen))
        || OFFER.lock().is_ok_and(|g| {
            g.as_ref()
                .is_some_and(|o| o.id == on_screen && o.at.elapsed() < OFFER_TTL)
        })
}

/// The card's buttons: send, edit, cancel/dismiss, and the diagnostics switch.
pub fn on_action(app: &AppHandle, id: &str, action: &str, value: Option<String>) {
    if id.starts_with(OFFER_PREFIX) {
        on_offer(app, id, action);
        return;
    }
    let mut g = PENDING
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if g.as_ref().is_none_or(|p| p.id != id) {
        return;
    }
    match action {
        "send" => {
            let p = g.take().expect("checked above");
            drop(g);
            send(app, p);
        }
        "diagnostics" => {
            if let Some(p) = g.as_mut() {
                p.diagnostics = value.as_deref() == Some("true");
            }
        }
        "edit" => {
            if let Some(p) = g.as_mut() {
                p.editing = true;
                hud::show(app, card(p));
            }
        }
        // cancel, dismiss, click outside
        _ => {
            g.take();
            drop(g);
            hud::hide(app);
        }
    }
}

fn send(app: &AppHandle, p: Pending) {
    hud::show(
        app,
        HudContent::Listening {
            heard: String::new(),
        },
    );
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let message = p.message.clone();
        let feedback = Feedback {
            kind: p.kind,
            message: p.message,
            include_diagnostics: p.diagnostics,
            // `submit` attaches the last answer itself when diagnostics are on.
            example: None,
            source: FeedbackSource::Voice,
        };
        let result = crate::feedback::submit(&app, feedback).await;
        match result {
            Ok(()) => {
                log::debug!("report: sent");
                Notice::done("hud.report.sent").show(&app);
            }
            // `e` is an i18n key (`feedback.errors.*`): say why, then offer Copy.
            Err(e) => {
                log::warn!("report: sending failed: {e}");
                Notice::cant(if e.starts_with("feedback.errors.") {
                    &e
                } else {
                    "hud.report.failed"
                })
                .offer(offer::COPY, "hud.copy", message)
                .show(&app);
            }
        }
    });
}

static SEND: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:(?:yes|yeah|yep|sure|ok(?:ay)?|send(?:\s+it)?|do\s+it|go\s+ahead|please|submit(?:\s+it)?)\b[\s.!,]*)+$")
        .expect("send")
});
static CANCEL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:(?:no|nope|cancel|don't|do\s+not|never\s*mind|forget\s+it|stop|not\s+now)\b[\s.!,]*)+(?:send\s+it)?[\s.!]*$")
        .expect("cancel")
});

/// The report card or the "report this?" offer on screen, for the decision
/// (`router::route`): what it shows and the answers it takes.
pub fn voice_card() -> Option<super::router::Card> {
    if !awaiting() {
        return None;
    }
    if OFFER.lock().is_ok_and(|g| g.is_some()) {
        return Some(super::router::Card {
            about: "it asks whether to report the last problem to the team".into(),
            replies: vec!["yes", "no"],
        });
    }
    let message = PENDING
        .lock()
        .ok()?
        .as_ref()
        .filter(|p| !p.editing)?
        .message
        .clone();
    Some(super::router::Card {
        about: format!("a report ready to send to the team: \"{message}\""),
        replies: vec!["send", "cancel"],
    })
}

/// Act on the decision's answer to that card. False when it isn't up.
pub fn voice_reply(app: &AppHandle, reply: &str) -> bool {
    if !awaiting() {
        return false;
    }
    let offer_id = OFFER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|o| o.id.clone()));
    if let Some(id) = offer_id {
        match reply {
            "yes" | "send" => on_offer(app, &id, "accept"),
            "no" | "cancel" => on_offer(app, &id, "dismiss"),
            _ => return false,
        }
        return true;
    }
    let Some(id) = PENDING
        .lock()
        .ok()
        .and_then(|g| g.as_ref().filter(|p| !p.editing).map(|p| p.id.clone()))
    else {
        return false;
    };
    match reply {
        "send" | "yes" => on_action(app, &id, "send", None),
        "cancel" | "no" => on_action(app, &id, "cancel", None),
        _ => return false,
    }
    true
}

/// After Edit on the report card, what's said is the new message.
pub fn handle_edit(app: &AppHandle, transcript: &str) -> bool {
    let t = transcript.trim();
    if t.is_empty() || !awaiting() {
        return false;
    }
    let mut g = PENDING
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(p) = g.as_mut().filter(|p| p.editing) else {
        return false;
    };
    p.message = t.to_string();
    p.editing = false;
    hud::show(app, card(p));
    true
}

/// What was said while a report card (or the offer) is up: "yes"/"send it"
/// sends, "cancel" drops it, and after Edit anything else is the new
/// message. True when it was for the card.
pub fn handle_voice(app: &AppHandle, transcript: &str) -> bool {
    let t = transcript.trim();
    if t.is_empty() || !awaiting() {
        return false;
    }
    // The "report this?" offer.
    let offer_id = OFFER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|o| o.id.clone()));
    if let Some(id) = offer_id {
        if super::proactive::YES.is_match(t) || SEND.is_match(t) {
            on_offer(app, &id, "accept");
            return true;
        }
        if CANCEL.is_match(t) || super::proactive::NO.is_match(t) {
            on_offer(app, &id, "dismiss");
            return true;
        }
        return false;
    }
    let (id, editing) = match PENDING
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|p| (p.id.clone(), p.editing)))
    {
        Some(x) => x,
        None => return false,
    };
    if SEND.is_match(t) && !editing {
        on_action(app, &id, "send", None);
        return true;
    }
    if CANCEL.is_match(t) {
        on_action(app, &id, "cancel", None);
        return true;
    }
    if editing {
        let mut g = PENDING
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(p) = g.as_mut() {
            p.message = t.to_string();
            p.editing = false;
            hud::show(app, card(p));
        }
        return true;
    }
    false
}

// ── "Want me to report this to the team?" ──────────────────────────────────

struct Offer {
    id: String,
    at: Instant,
    said: String,
}

static OFFER: Mutex<Option<Offer>> = Mutex::new(None);
const OFFER_TTL: Duration = Duration::from_secs(12);

fn on_offer(app: &AppHandle, id: &str, action: &str) {
    let Some(o) = OFFER
        .lock()
        .ok()
        .and_then(|mut g| g.take_if(|o| o.id == id))
    else {
        return;
    };
    if action != "accept" {
        hud::hide(app);
        return;
    }
    show(
        app,
        ReportIntent {
            kind: FeedbackKind::Bug,
            message: o.said,
            explicit: true,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_answers_to_the_card() {
        for s in ["yes", "send it", "Yes, send it.", "ok submit"] {
            assert!(SEND.is_match(s), "{s}");
        }
        for s in ["cancel", "no", "never mind", "don't send it"] {
            assert!(CANCEL.is_match(s), "{s}");
        }
        assert!(!SEND.is_match("yes the vault is broken"));
    }
}
