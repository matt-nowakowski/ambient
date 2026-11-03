//! "Report a bug: the summary missed the last email", "that didn't work",
//! "tell the team …", "I wish you could …": bug reports and feedback, by
//! voice.
//!
//! The words are classified (bug, idea, other) and shown in a card, "Send
//! this to the team?", with the message as heard, an "Include diagnostics"
//! switch (off by default) and Send / Edit / Cancel. "Yes" or "send it" by
//! voice sends; Edit takes the next thing said as the new message. Nothing
//! leaves until Send.
//!
//! Right after an answer, "that's wrong" or "no, that's not it" offers to
//! report it (rate-limited). With diagnostics on, `feedback::submit` attaches
//! the last answer card (shown in the last 2 minutes), redacted, so this
//! module never attaches one itself.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use regex::Regex;
use tauri::AppHandle;

use super::notice::{offer, Notice};
use super::router::without_address;
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

/// Openers that address the makers, and what kind they imply.
static EXPLICIT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:(?:please|can\s+you|could\s+you|i\s+want\s+to|i'd\s+like\s+to|i\s+would\s+like\s+to|let\s+me)[\s,]+)*(?:
            (?P<bug>(?:report|file|log|submit)\s+(?:a\s+|this\s+|that\s+|the\s+)?(?:bug|problem|issue|crash)(?:\s+report)?|bug\s+report|bug)
          | (?P<idea>feature\s+request|(?:make\s+a\s+|send\s+a\s+|i\s+have\s+a\s+)?(?:feature\s+)?(?:suggestion|idea)\s+for\s+(?:the\s+)?(?:team|you|ambient|developers?|devs)|i\s+wish\s+you\s+(?:could|would|did|had)|it\s+would\s+be\s+(?:great|nice|cool|awesome|useful)\s+if\s+you\s+(?:could|would))
          | (?P<other>(?:send|give|leave|submit)\s+(?:some\s+|a\s+bit\s+of\s+|my\s+)?feedback|feedback|tell\s+(?:the|your)\s+(?:ambient\s+)?(?:team|developers?|devs|makers|creators)|let\s+(?:the|your)\s+(?:ambient\s+)?(?:team|developers?|devs)\s+know|message\s+(?:the|your)\s+team)
        )\b[\s,:;.\-—]*(?P<rest>.*)$",
    )
    .expect("report explicit")
});

/// Complaints about what just happened: a bug report only in context.
static VAGUE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:no[\s,.!]+|nope[\s,.!]+|ugh[\s,.!]+|hmm[\s,.!]+)*(?:
            (?:this|that|it)(?:'s|\s+is)\s+(?:broken|wrong|not\s+(?:right|working|it|what\s+i\s+(?:asked|meant|wanted)))
          | (?:that|this|it)\s+(?:didn't|did\s+not|doesn't|does\s+not|isn't|is\s+not)\s+(?:work|working|help|right)
          | (?:that's|thats|that\s+is)\s+not\s+it
          | wrong\s+answer
          | (?:you|ambient)\s+(?:got\s+(?:it|that)\s+wrong|made\s+a\s+mistake|messed\s+(?:it|that)\s+up)
        )\b",
    )
    .expect("report vague")
});

/// "No, that's not it" right after an answer: offer to report it.
static NEGATIVE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:no[\s,.!]+|nope[\s,.!]+)*(?:
            (?:that's|thats|that\s+is|this\s+is|it's|it\s+is)\s+(?:wrong|not\s+(?:it|right|correct|true|what\s+i\s+(?:asked|meant|wanted)))
          | (?:that|it)\s+(?:didn't|did\s+not|doesn't)\s+(?:work|help)
          | wrong(?:\s+answer)?
          | not\s+(?:right|correct|it)
          | (?:you're|you\s+are)\s+wrong
        )\b[\s.!]*$",
    )
    .expect("negative")
});

static BUG_WORDS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:bug|broken|break|crash(?:ed|es)?|freez(?:e|es|ing)|froze|stuck|error|fail(?:s|ed)?|wrong|didn't work|doesn't work|not working|glitch|hang(?:s|ing)?)\b")
        .expect("bug words")
});
static IDEA_WORDS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:wish|would be (?:great|nice|cool)|could you add|please add|feature|support for|it'd be nice|idea|suggest(?:ion)?|should be able to)\b")
        .expect("idea words")
});

/// What the message is about, when the opener didn't say.
pub fn classify(message: &str) -> FeedbackKind {
    if BUG_WORDS.is_match(message) {
        FeedbackKind::Bug
    } else if IDEA_WORDS.is_match(message) {
        FeedbackKind::Idea
    } else {
        FeedbackKind::Other
    }
}

/// The first pass: is this a report for the team? No model call.
pub fn report_intent(transcript: &str) -> Option<ReportIntent> {
    let said = without_address(transcript).trim();
    if let Some(c) = EXPLICIT.captures(said) {
        let rest = c.name("rest").map_or("", |m| m.as_str()).trim();
        let kind = if c.name("bug").is_some() {
            FeedbackKind::Bug
        } else if let Some(m) = c.name("idea") {
            // "I wish you could…" is itself the idea: keep the words.
            if m.as_str().to_lowercase().starts_with("feature")
                || m.as_str().to_lowercase().contains("for")
            {
                FeedbackKind::Idea
            } else {
                return Some(ReportIntent {
                    kind: FeedbackKind::Idea,
                    message: said.to_string(),
                    explicit: true,
                });
            }
        } else {
            classify(rest)
        };
        // "Bug" alone needs more than the word ("bug in the summary…").
        if c.name("bug")
            .is_some_and(|m| m.as_str().eq_ignore_ascii_case("bug"))
            && rest.split_whitespace().count() < 2
        {
            return None;
        }
        let message = if rest.is_empty() {
            said.to_string()
        } else {
            rest.to_string()
        };
        return Some(ReportIntent {
            kind,
            message,
            explicit: true,
        });
    }
    if VAGUE.is_match(said) {
        return Some(ReportIntent {
            kind: FeedbackKind::Bug,
            message: said.to_string(),
            explicit: false,
        });
    }
    None
}

/// A short "that's wrong" after an answer.
pub fn is_negative(transcript: &str) -> bool {
    let t = without_address(transcript);
    t.split_whitespace().count() <= 10 && NEGATIVE.is_match(t)
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
            let message = report_intent(t).map_or_else(|| t.to_string(), |r| r.message);
            p.kind = classify(&message);
            p.message = message;
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
/// When the offer was last shown, to keep it rare.
static OFFERED: Mutex<Vec<Instant>> = Mutex::new(Vec::new());
const OFFER_TTL: Duration = Duration::from_secs(12);
const OFFER_GAP: Duration = Duration::from_secs(10 * 60);
const OFFERS_PER_HOUR: usize = 2;

/// Whether the offer may show now (at most one per 10 minutes, two an hour).
fn offer_allowed(times: &mut Vec<Instant>) -> bool {
    times.retain(|t| t.elapsed() < Duration::from_secs(3600));
    times.len() < OFFERS_PER_HOUR && times.last().is_none_or(|t| t.elapsed() >= OFFER_GAP)
}

/// Right after an answer, "that's wrong": offer to report it. True when the
/// offer was shown (the words are then not routed anywhere else).
pub fn offer_after_answer(app: &AppHandle, transcript: &str) -> bool {
    if !is_negative(transcript) {
        return false;
    }
    if super::answer::last_turn().is_none() {
        return false;
    }
    {
        let mut times = OFFERED
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if !offer_allowed(&mut times) {
            log::debug!("report: not offering (rate limit)");
            return false;
        }
        times.push(Instant::now());
    }
    let id = format!("{OFFER_PREFIX}{}", chrono::Utc::now().timestamp_millis());
    if let Ok(mut g) = OFFER.lock() {
        *g = Some(Offer {
            id: id.clone(),
            at: Instant::now(),
            said: transcript.trim().to_string(),
        });
    }
    log::debug!("report: offering to report the last answer");
    hud::show(
        app,
        HudContent::Suggestion {
            id,
            title: "hud.report.offer".into(),
            accept_label: "hud.report.offerAccept".into(),
            vars: Default::default(),
        },
    );
    super::wake::listen_for_reply(app);
    true
}

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

    fn kind(s: &str) -> Option<(FeedbackKind, bool)> {
        report_intent(s).map(|r| (r.kind, r.explicit))
    }

    #[test]
    fn hears_bug_reports() {
        for s in [
            "report a bug: the summary missed the last email",
            "Hey Ambient, report a bug, the reminder didn't show",
            "file a bug the HUD stays up forever",
            "bug report: dictation pasted twice",
            "I want to report a problem with the reminders",
        ] {
            assert_eq!(kind(s), Some((FeedbackKind::Bug, true)), "{s}");
        }
        assert_eq!(
            report_intent("report a bug: the summary missed the last email")
                .map(|r| r.message)
                .as_deref(),
            Some("the summary missed the last email")
        );
    }

    #[test]
    fn hears_ideas_and_feedback() {
        for s in [
            "feature request: let me pick the voice",
            "I wish you could read my Slack",
            "Hey Ambient, it would be great if you could book meetings",
        ] {
            assert_eq!(kind(s), Some((FeedbackKind::Idea, true)), "{s}");
        }
        assert_eq!(
            kind("send feedback: love the new reminders"),
            Some((FeedbackKind::Other, true))
        );
        assert_eq!(
            kind("tell the team the search is broken in Arc"),
            Some((FeedbackKind::Bug, true))
        );
        assert_eq!(
            kind("tell the team I'd love a dark HUD"),
            Some((FeedbackKind::Other, true))
        );
        assert_eq!(
            kind("let the team know it crashed when I opened Notes"),
            Some((FeedbackKind::Bug, true))
        );
    }

    #[test]
    fn vague_complaints_need_context() {
        for s in [
            "this is broken",
            "that's wrong",
            "that didn't work",
            "No, that's not it",
        ] {
            assert_eq!(kind(s), Some((FeedbackKind::Bug, false)), "{s}");
        }
    }

    #[test]
    fn leaves_dictation_alone() {
        for s in [
            "Thanks for the feedback on the deck",
            "Let's report the numbers on Friday",
            "The team is happy with the design",
            "I think the build is green now",
            "bug",
        ] {
            assert_eq!(kind(s), None, "{s}");
        }
    }

    #[test]
    fn negatives_after_an_answer() {
        for s in [
            "that's wrong",
            "No, that's not it",
            "wrong answer",
            "that didn't work",
            "nope, not right",
        ] {
            assert!(is_negative(s), "{s}");
        }
        for s in [
            "that's right",
            "thanks",
            "what's the weather tomorrow",
            "no worries, I'll send it later today",
        ] {
            assert!(!is_negative(s), "{s}");
        }
    }

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

    #[test]
    fn the_offer_is_rare() {
        let mut times = Vec::new();
        assert!(offer_allowed(&mut times));
        times.push(Instant::now());
        assert!(!offer_allowed(&mut times), "not twice in ten minutes");
    }
}
