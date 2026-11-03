//! Smart writing: per dictation (the dictation key, a text field focused),
//! decide whether to type the words **as said**, **polish** messy speech, or
//! **write for you** from an instruction ("tell him I can't make it, be
//! polite", "make this more formal" with text selected). Say what was done
//! with a small HUD chip, and let the user take it back: "Use my words"
//! replaces exactly the inserted text with what they said.
//!
//! The decision is cheap rules first (instruction forms, disfluency, length,
//! a selection, the app's category), a model only for genuinely ambiguous
//! phrasings (on this computer when it can, never sent in "On this computer
//! only"), and "as said" whenever unsure. "As said" never calls a model, so
//! it's exactly as fast as plain dictation. Thresholds are remote tunables
//! (`remote_config::WritingConfig`), shifted per app by what the user taught
//! it with "Use my words" (`AgentSettings::writing_prefs`).

use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use regex::Regex;
use tauri::AppHandle;

use crate::context::field::{self, FocusedField};
use crate::hud::{self, HudContent};
use crate::settings::{self, AppSettings, WritingMode};

// ── The decision ──────────────────────────────────────────────────────────

/// What was typed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// The transcript as is (custom words applied).
    AsSaid,
    /// Cleaned up, keeping their words (AI polish).
    Polished,
    /// Composed from an instruction, or a rewrite of the selection.
    Written,
}

impl Decision {
    pub fn name(self) -> &'static str {
        match self {
            Decision::AsSaid => "as_said",
            Decision::Polished => "polished",
            Decision::Written => "written",
        }
    }
}

/// Who decided.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Rules,
    Model,
}

impl Source {
    pub fn name(self) -> &'static str {
        match self {
            Source::Rules => "rules",
            Source::Model => "model",
        }
    }
}

/// What the rules know about where the words go (metadata only).
#[derive(Debug, Clone, Default)]
pub struct Ctx {
    /// Text is selected in the focused field.
    pub has_selection: bool,
    /// `telemetry::app_category` of the app in front.
    pub category: &'static str,
    /// An AI assistant's chat (ChatGPT, Claude…): words there are a prompt.
    pub ai_chat: bool,
    /// Said to Ambient by name ("Hey Ambient, …").
    pub addressed: bool,
}

/// Thresholds in effect for one app: the remote config, shifted by what the
/// user taught it there.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tunables {
    pub written_threshold: f32,
    pub ambiguous_floor: f32,
    pub polish_disfluency: f32,
    pub run_on_words: u32,
}

impl Default for Tunables {
    fn default() -> Self {
        let c = crate::remote_config::WritingConfig::default();
        Self {
            written_threshold: c.written_threshold,
            ambiguous_floor: c.ambiguous_floor,
            polish_disfluency: c.polish_disfluency,
            run_on_words: c.run_on_words,
        }
    }
}

/// The rules' verdict.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Decided(Decision),
    /// Might be an instruction: a model decides; `fallback` stands when no
    /// model can (as said, or polished if the speech was messy).
    Ambiguous {
        fallback: Decision,
    },
}

const POLITE: &str = r"(?:(?:please|pls|kindly|just|ok|okay|so|now|hey|can\s+you|could\s+you|would\s+you|will\s+you|would\s+you\s+mind|go\s+ahead\s+and|i\s+(?:want|need)\s+you\s+to|i'?d\s+like\s+you\s+to)[\s,]+)*";

/// "Make this more formal", "rewrite it", "shorter", "fix the grammar":
/// a rewrite of something already there (the selection).
static REWRITE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"(?ix)^{POLITE}(?:
            make\s+(?:this|it|that|these)\s+(?:(?:a\s+)?(?:bit|little|lot|much|way|sound|more|less|slightly)\s+)*
                (?:formal|casual|polite|politer|friendly|friendlier|professional|concise|short|shorter|long|longer|clear|clearer|simple|simpler|warm|warmer|nice|nicer|punchy|punchier|soft|softer|firm|firmer|direct|better|kinder|confident|positive)\b
          | (?:rewrite|rephrase|reword|shorten|tighten|simplify|proofread|polish|redo)\b
          | fix\s+(?:the\s+|my\s+)?(?:grammar|spelling|typos|wording|tone)\b
          | clean\s+(?:this|it|that)\s+up\b
          | (?:turn|convert)\s+(?:this|it|that)\s+into\b
          | translate\s+(?:this|it|that)\b
          | (?:shorter|longer|more\s+formal|less\s+formal|more\s+casual|friendlier|politer)\s*[.!]?\s*$
        )"
    ))
    .expect("rewrite cues")
});

/// "Write a quick thank-you to the team", "draft something for Sam".
static DRAFT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"(?ix)^{POLITE}(?:write|draft|compose)\s+(?:(?:me|us|him|her|them)\s+)?(?:a|an|some|something|the|my|our|a\s+few)\b"
    ))
    .expect("draft cues")
});

/// "Tell me…", "tell us…": asking the person being written to, not an
/// instruction to Ambient.
static TELL_ME: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^\s*(?:tell|let)\s+(?:me|us)\b").expect("tell me"));

/// "Thank the team for the launch", "thank him for…".
static THANK: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(r"(?i)^{POLITE}thank\s+(?:the\s+)?\w+\s+for\b")).expect("thank")
});

/// How to write it: "be polite", "keep it short", "in a friendly tone",
/// "…, politely".
static STYLE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)(?:^|[,.;:\-–—]\s*|\s)(?:
            be\s+(?:very\s+|really\s+|more\s+)?(?:polite|nice|kind|brief|friendly|professional|formal|casual|warm|direct|firm|apologetic|concise|short|gracious|diplomatic)\b
          | keep\s+it\s+(?:short|brief|polite|professional|friendly|casual|simple|light|warm|formal)\b
          | make\s+it\s+(?:short|shorter|brief|polite|formal|professional|friendly|casual|nice|sound|warm|clear)\b
          | in\s+an?\s+(?:\w+\s+){0,2}(?:tone|way|manner|voice)\b
          | (?:politely|nicely|formally|casually|professionally|briefly|kindly|warmly|diplomatically)\s*[.!]?\s*$
          | sign\s+(?:it|off)\b
        )",
    )
    .expect("style cues")
});

/// Spoken edits and formatting the polish prompt turns into text: false
/// starts and corrections, "new line", "bullet point".
static RESTART: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)\b(?:
            scratch\s+that | no\s+wait | wait\s+no | actually\s+no | sorry\s+i\s+mean | i\s+mean\s+(?:no|actually)
          | let\s+me\s+(?:start\s+over|rephrase|try\s+again) | delete\s+that | strike\s+that | or\s+rather
          | what\s+i\s+meant | new\s+(?:line|paragraph) | bullet\s+point | next\s+bullet | numbered\s+list
        )\b
        | ,\s*no,\s",
    )
    .expect("restart cues")
});

/// "First … second … third", "number one … number two": a list to format.
static LIST: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:first(?:ly)?\b.*\bsecond(?:ly)?\b|number\s+one\b.*\bnumber\s+two\b|point\s+one\b.*\bpoint\s+two\b)")
        .expect("list cues")
});

/// Filler words, removed before reading an instruction.
static FILLER_WORDS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:u+m+|u+h+|uhm|erm|er|a+h|hm+|mm+)\b[,.]?\s*").expect("filler words")
});

const FILLERS: &[&str] = &[
    "um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "ahh", "eh", "hmm", "hm", "mm", "mhm",
];
const FILLER_PHRASES: &[(&str, &str, f32)] = &[
    ("you", "know", 1.0),
    ("i", "mean", 1.0),
    ("sort", "of", 0.5),
    ("kind", "of", 0.5),
];
/// Doubled words that are fine ("that that", "had had").
const OK_DOUBLES: &[&str] = &[
    "that", "had", "very", "really", "so", "no", "bye", "ha", "go",
];

fn words(t: &str) -> Vec<String> {
    t.split(|c: char| {
        c.is_whitespace() || matches!(c, ',' | ';' | ':' | '!' | '?' | '"' | '“' | '”')
    })
    .map(|w| {
        w.replace('’', "'")
            .trim_matches(|c: char| !c.is_alphanumeric() && c != '\'')
            .to_lowercase()
    })
    .filter(|w| !w.is_empty())
    .collect()
}

/// Fillers, repeated words and hedges per word (0 for clean prose).
pub fn disfluency_rate(transcript: &str) -> f32 {
    let w = words(transcript);
    if w.is_empty() {
        return 0.0;
    }
    let mut n = 0.0f32;
    for (i, word) in w.iter().enumerate() {
        if FILLERS.contains(&word.as_str()) {
            n += 1.0;
        }
        if let Some(next) = w.get(i + 1) {
            if next == word && !OK_DOUBLES.contains(&word.as_str()) {
                n += 1.0;
            }
            if let Some((_, _, weight)) = FILLER_PHRASES
                .iter()
                .find(|(a, b, _)| word == a && next == b)
            {
                n += weight;
            }
        }
    }
    n / w.len() as f32
}

/// The longest stretch of words without a sentence break.
fn longest_run(transcript: &str) -> usize {
    transcript
        .split(['.', '!', '?', '\n', '。', '！', '？'])
        .map(|s| s.split_whitespace().count())
        .max()
        .unwrap_or(0)
}

/// Messy speech worth polishing: a correction or spoken formatting, a list,
/// a run-on, or enough fillers and repeats.
pub fn is_messy(transcript: &str, t: &Tunables) -> bool {
    RESTART.is_match(transcript)
        || LIST.is_match(transcript)
        || longest_run(transcript) >= t.run_on_words as usize
        || disfluency_rate(transcript) >= t.polish_disfluency
}

/// A rewrite command ("make this more formal", "shorter", "rewrite it").
pub fn is_rewrite_command(transcript: &str) -> bool {
    REWRITE.is_match(super::router::without_address(transcript).trim())
}

/// How much this reads as an instruction to write rather than the words to
/// type, 0–1.
pub fn instruction_score(transcript: &str, ctx: &Ctx) -> f32 {
    use super::compose::{compose_intent, ComposeIntent};
    let addressed = ctx.addressed || super::router::addresses_ambient(transcript);
    // Fillers don't change what was meant ("um, tell them…").
    let cleaned = FILLER_WORDS.replace_all(super::router::without_address(transcript), "");
    let t = cleaned.trim();
    if t.is_empty() || ctx.category == "terminal" {
        return 0.0;
    }
    let n_words = t.split_whitespace().count();
    let styled = STYLE.is_match(t);
    let mut score: f32 = if REWRITE.is_match(t) {
        // A rewrite needs something to rewrite.
        if ctx.has_selection {
            0.95
        } else {
            0.25
        }
    } else if TELL_ME.is_match(t) {
        0.0
    } else {
        match compose_intent(t) {
            ComposeIntent::Yes(_) => 0.9,
            ComposeIntent::Maybe => 0.55,
            ComposeIntent::No if DRAFT.is_match(t) => 0.8,
            ComposeIntent::No if THANK.is_match(t) => 0.55,
            ComposeIntent::No => 0.0,
        }
    };
    if styled {
        score += if score >= 0.4 { 0.3 } else { 0.15 };
    }
    if addressed {
        score += 0.3;
    }
    // Code and docs: "write a test for…" is often the text itself.
    if ctx.category == "editor" {
        score -= 0.15;
    }
    // Instructions are short; long speech is the message.
    if n_words > 50 {
        score -= 0.25;
    }
    score.clamp(0.0, 1.0)
}

/// The rules' decision. Prompts to an AI assistant and terminals are always
/// as said; "as said" whenever unsure.
pub fn classify(transcript: &str, ctx: &Ctx, t: &Tunables) -> Verdict {
    if transcript.trim().is_empty() || (ctx.ai_chat && !ctx.addressed) {
        return Verdict::Decided(Decision::AsSaid);
    }
    let messy = ctx.category != "terminal" && is_messy(transcript, t);
    let fallback = if messy {
        Decision::Polished
    } else {
        Decision::AsSaid
    };
    let score = instruction_score(transcript, ctx);
    if score >= t.written_threshold {
        Verdict::Decided(Decision::Written)
    } else if score >= t.ambiguous_floor {
        Verdict::Ambiguous { fallback }
    } else {
        Verdict::Decided(fallback)
    }
}

/// The thresholds for `bundle`: remote config, raised where the user took
/// back what was written or polished (that app most, its category a little).
pub fn tunables_for(settings: &AppSettings, bundle: &str) -> Tunables {
    let c = crate::remote_config::agent_config().writing;
    adjust(
        Tunables {
            written_threshold: c.written_threshold,
            ambiguous_floor: c.ambiguous_floor,
            polish_disfluency: c.polish_disfluency,
            run_on_words: c.run_on_words,
        },
        &settings.agent.writing_prefs,
        bundle,
    )
}

/// Each written revert in this app raises the bar by 0.1 (up to three), and
/// in other apps of its category by 0.05 (up to three); polish reverts make
/// polishing need half as much mess again per revert (a quarter for the
/// category). "Other" apps share nothing.
pub fn adjust(
    base: Tunables,
    prefs: &std::collections::BTreeMap<String, settings::WritingPref>,
    bundle: &str,
) -> Tunables {
    let cat = crate::telemetry::app_category(bundle);
    let mine = prefs.get(bundle).cloned().unwrap_or_default();
    let (mut cat_w, mut cat_p) = (0u32, 0u32);
    if cat != "other" {
        for (b, p) in prefs {
            if b != bundle && crate::telemetry::app_category(b) == cat {
                cat_w += p.written_reverts;
                cat_p += p.polished_reverts;
            }
        }
    }
    let shift = 0.1 * mine.written_reverts.min(3) as f32 + 0.05 * cat_w.min(3) as f32;
    let factor = 1.0 + 0.5 * mine.polished_reverts.min(3) as f32 + 0.25 * cat_p.min(3) as f32;
    Tunables {
        written_threshold: base.written_threshold + shift,
        ambiguous_floor: base.ambiguous_floor + shift,
        polish_disfluency: base.polish_disfluency * factor,
        run_on_words: (base.run_on_words as f32 * factor).round() as u32,
    }
}

// ── The model, for ambiguous phrasings ──────────────────────────────────

const MODEL_SYSTEM: &str = r#"You decide how to type what the user just dictated into a text field. Reply with exactly one word:
as_said: the words are the text to type, word for word (a message, note, reply or prompt), even when they start with "tell", "ask", "let me know" or "thank" and are addressed to the person being written to.
polished: the words are the text to type but the speech is messy (fillers, false starts, corrections) and needs cleaning up, keeping their words.
written: they are instructing you to write or rewrite something for them ("tell him I can't make it, be polite", "write a quick thank-you to the team", "reply saying Thursday works", "make this more formal"); the text to type would differ from what they said.
If unsure, as_said."#;

/// The label in a model reply.
pub fn parse_label(reply: &str) -> Option<Decision> {
    let r = reply.to_lowercase();
    let at = |w: &str| r.find(w);
    [
        (at("as_said"), Decision::AsSaid),
        (at("as said"), Decision::AsSaid),
        (at("polished"), Decision::Polished),
        (at("written"), Decision::Written),
    ]
    .into_iter()
    .filter_map(|(i, d)| i.map(|i| (i, d)))
    .min_by_key(|(i, _)| *i)
    .map(|(_, d)| d)
}

const MODEL_TIMEOUT: Duration = Duration::from_millis(3_000);

/// Ask a model about an ambiguous phrasing: Apple Intelligence on this Mac
/// when it can run it (on a paid plan, "On this computer only", or when
/// the user prefers it), else the hosted model the user chose, never in
/// "On this computer only". On Free either way takes one of the week's AI
/// uses (on device through `plan::consume_local_ai`); with the pool spent
/// nothing is asked. None when no model may be asked, it timed out, or the
/// reply made no sense.
pub async fn model_decide(app: &AppHandle, transcript: &str, ctx: &Ctx) -> Option<Decision> {
    use crate::settings::Intelligence;
    let s = settings::get_settings(app);
    let user = format!(
        "App: {}{}\nDictated: {}",
        ctx.category,
        if ctx.has_selection {
            ", text is selected"
        } else {
            ""
        },
        transcript.trim()
    );
    if !crate::limits::ai_available(app) {
        return None;
    }
    let local_ok = super::llm::on_device_ready()
        && s.agent.intelligence != Intelligence::Cloud
        && (crate::plan::is_paid(app) || s.agent.device_only() || s.agent.on_device_when_possible);
    let ask = async {
        if local_ok && crate::plan::consume_local_ai(app) {
            let reply = super::llm::complete_on_device(MODEL_SYSTEM, &user).await;
            if reply.is_some() || s.agent.device_only() {
                return reply;
            }
        }
        if s.agent.device_only() || super::llm::target(app).is_none() {
            return None;
        }
        super::llm::complete_hosted(app, "write_mode", MODEL_SYSTEM, &user).await
    };
    let reply = tokio::time::timeout(MODEL_TIMEOUT, ask)
        .await
        .ok()
        .flatten()?;
    let label = parse_label(&reply);
    log::debug!(
        "writing: model said {}",
        label.map_or("nothing usable", Decision::name)
    );
    label
}

// ── The plan for one dictation ──────────────────────────────────────────

/// How this dictation may be written, from the Writing setting, AI polish
/// and the shortcut used.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WritePlan {
    pub mode: WritingMode,
    /// AI polish is available (on, with a provider this plan allows).
    pub polish_on: bool,
    /// Polish this one regardless (the polish shortcut, "Always polish").
    pub force_polish: bool,
}

impl WritePlan {
    /// Files, the wake word, and anything else that just polishes or not.
    pub fn fixed(post_process: bool) -> Self {
        Self {
            mode: WritingMode::AsSaid,
            polish_on: post_process,
            force_polish: post_process,
        }
    }

    /// A dictation; `explicit_polish` is the polish shortcut.
    pub fn for_dictation(app: &AppHandle, explicit_polish: bool) -> Self {
        let mode = settings::get_settings(app).writing_mode;
        let polish_on = explicit_polish || crate::plan::polish_every_dictation(app);
        Self {
            mode,
            polish_on,
            force_polish: explicit_polish || (mode == WritingMode::Polish && polish_on),
        }
    }

    /// Decided per utterance.
    pub fn smart(&self) -> bool {
        self.mode == WritingMode::Smart && !self.force_polish
    }

    /// Instructions may be written for the user without naming Ambient:
    /// only in Smart. Otherwise only when they address it or use Ask.
    pub fn writes_unasked(&self) -> bool {
        self.mode == WritingMode::Smart
    }
}

/// Whether text is selected in the focused field (metadata only, no text).
pub fn has_selection(app: &AppHandle) -> bool {
    let nw = settings::get_settings(app).agent.never_watch;
    field::focused_field(false, &nw).is_some_and(|f| f.has_selection())
}

// ── Out of allowance ─────────────────────────────────────────────────────

/// Whether an answer error (an i18n key) is Free's spent weekly AI pool:
/// `limits` then says so (with Upgrade) instead of a writing note.
pub fn is_weekly_limit(key: &str) -> bool {
    key == "hud.status.weeklyLimit"
}

// ── After inserting: the chip, and what to revert ───────────────────────

/// What `actions` typed and how, for the chip.
#[derive(Debug, Clone)]
pub struct Typed {
    pub decision: Decision,
    /// The transcript as said (custom words applied).
    pub raw: String,
    /// An i18n key for a gentle note instead of the usual chip text (e.g.
    /// out of allowance, so it's as said).
    pub note: Option<&'static str>,
    /// A rewrite of the user's selection: `raw` is that original text,
    /// restored exactly by "Undo rewrite".
    pub rewrite: bool,
}

/// A request to write for the user (`Decision::Written`).
#[derive(Debug, Clone)]
pub struct WriteRequest {
    /// The instruction (without "Hey Ambient,").
    pub instruction: String,
    /// The transcript as said, for "Use my words" and the fallback.
    pub raw: String,
    /// Rewrite the selection rather than draft from scratch.
    pub has_selection: bool,
    /// Text to rewrite instead of the selection (Edit by voice).
    pub context: Option<String>,
    /// Replace this earlier insertion instead of inserting (Edit by voice).
    pub replaces: Option<Inserted>,
}

/// What the answer flow needs to finish a smart write.
#[derive(Debug, Clone)]
pub struct SmartWrite {
    /// What "Use my words" puts back: the transcript, or for a rewrite the
    /// original selected text.
    pub raw: String,
    pub replaces: Option<Inserted>,
    /// A rewrite of the selection (`raw` is the original selection).
    pub rewrite: bool,
}

impl SmartWrite {
    /// For a new write: a rewrite of the selection when it could be read
    /// (its original text is what a revert restores), else the transcript.
    pub fn new(transcript: String, selection: Option<String>) -> Self {
        match selection.filter(|s| !s.is_empty()) {
            Some(original) => Self {
                raw: original,
                replaces: None,
                rewrite: true,
            },
            None => Self {
                raw: transcript,
                replaces: None,
                rewrite: false,
            },
        }
    }
}

/// Text typed into a field, kept briefly so it can be replaced.
#[derive(Debug, Clone)]
pub struct Inserted {
    /// Exactly what was pasted (a trailing space included when that
    /// setting is on).
    pub text: String,
    /// What a revert puts back: the transcript, or the original selection
    /// for a rewrite.
    pub raw: String,
    /// A rewrite of a selection: the revert restores `raw` exactly (no
    /// trailing space) and the chip says "Undo rewrite".
    pub rewrite: bool,
    pub decision: Decision,
    pub bundle: String,
    pub app_name: String,
    /// Auto-submit sent it: it can't be taken back in place.
    pub submitted: bool,
    pub at: Instant,
}

/// HUD ids of the chip and its notes.
pub const PREFIX: &str = "writing-";
/// How long after typing "use my words" by voice still applies.
const VOICE_WINDOW: Duration = Duration::from_secs(45);
/// How long the next dictation edits the written text after Edit.
const EDIT_WINDOW: Duration = Duration::from_secs(40);

static LAST: Mutex<Option<Inserted>> = Mutex::new(None);
static EDITING: Mutex<Option<(Instant, Inserted)>> = Mutex::new(None);

fn chip_id() -> String {
    format!("{PREFIX}{}", chrono::Utc::now().timestamp_millis())
}

/// The text a paste of `text` puts in the field.
fn pasted_form(settings: &AppSettings, text: &str) -> String {
    if settings.append_trailing_space {
        format!("{text} ")
    } else {
        text.to_string()
    }
}

/// After a paste: remember what went in (for "Use my words") and show the
/// chip. Nothing for plain "as said". Call off the main thread.
pub fn after_insert(app: &AppHandle, typed: Typed, final_text: &str) {
    if typed.decision == Decision::AsSaid {
        if let Some(note) = typed.note {
            show_note(app, note);
        }
        return;
    }
    let s = settings::get_settings(app);
    let front = crate::context::frontmost_app().unwrap_or_default();
    let inserted = Inserted {
        text: pasted_form(&s, final_text),
        raw: typed.raw,
        rewrite: typed.rewrite,
        decision: typed.decision,
        bundle: front.bundle_id,
        app_name: front.name,
        submitted: s.auto_submit && s.paste_method != crate::settings::PasteMethod::None,
        at: Instant::now(),
    };
    log::debug!(
        "writing: typed {} ({} chars, raw {} chars, rewrite {})",
        inserted.decision.name(),
        inserted.text.chars().count(),
        inserted.raw.chars().count(),
        inserted.rewrite
    );
    let decision = inserted.decision;
    let label = chip_decision(&inserted);
    if let Ok(mut g) = LAST.lock() {
        *g = Some(inserted);
    }
    hud::show(
        app,
        HudContent::Writing {
            id: chip_id(),
            decision: label.into(),
            note: None,
            revert: true,
            edit: decision == Decision::Written,
        },
    );
}

/// The chip's `decision`: `rewritten` for a rewrite of a selection (it
/// offers "Undo rewrite"), else the decision's name.
pub fn chip_decision(ins: &Inserted) -> &'static str {
    if ins.rewrite {
        "rewritten"
    } else {
        ins.decision.name()
    }
}

/// What a revert puts back and whether to paste it exactly (no trailing
/// space): the original selection for a rewrite, else the transcript.
pub fn revert_text(ins: &Inserted) -> (&str, bool) {
    (ins.raw.as_str(), ins.rewrite)
}

/// A chip with only a note ("Copied your exact words…").
fn show_note(app: &AppHandle, note: &str) {
    hud::show(
        app,
        HudContent::Writing {
            id: chip_id(),
            decision: "note".into(),
            note: Some(note.into()),
            revert: false,
            edit: false,
        },
    );
}

/// What the chip's buttons do.
pub fn on_action(app: &AppHandle, _id: &str, action: &str) {
    match action {
        "revert" => {
            hud::hide(app);
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(150));
                revert(&app, "click");
            });
        }
        "edit" => start_edit(app),
        "cancel_edit" => {
            if let Ok(mut g) = EDITING.lock() {
                if let Some((_, ins)) = g.take() {
                    if let Ok(mut last) = LAST.lock() {
                        *last = Some(ins);
                    }
                }
            }
            hud::hide(app);
        }
        _ => hud::hide(app),
    }
}

/// "Use my words", "undo that", "just what I said", "no, as I said".
static REVERT_PHRASE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\W*(?:(?:hey\s+)?ambient[\s,]+)?(?:no|nope|oh)?[\s,.]*(?:
            (?:just\s+)?use\s+my\s+(?:own\s+)?words
          | undo\s+(?:that|it|this)
          | (?:just\s+|exactly\s+)?what\s+i\s+(?:actually\s+)?said
          | (?:just\s+|exactly\s+)?as\s+i\s+said(?:\s+it)?
          | my\s+(?:own\s+)?words(?:\s+please)?
          | (?:go\s+)?back\s+to\s+(?:my\s+words|what\s+i\s+said)
          | (?:type|put)\s+(?:it|that)?\s*(?:exactly\s+)?(?:as|how)\s+i\s+said(?:\s+it)?
        )(?:[\s,]+please)?\W*$",
    )
    .expect("revert phrases")
});

/// Whether these words ask to take back the last smart insertion.
pub fn is_revert_phrase(transcript: &str) -> bool {
    REVERT_PHRASE.is_match(transcript)
}

/// Voice, right after a smart insertion: "use my words" reverts it; after
/// Edit, what's said is how to change the written text. True when handled
/// (nothing is typed then).
pub fn handle_voice(app: &AppHandle, transcript: &str) -> bool {
    if transcript.trim().is_empty() {
        return false;
    }
    let editing = EDITING
        .lock()
        .ok()
        .and_then(|mut g| g.take())
        .filter(|(at, _)| at.elapsed() < EDIT_WINDOW);
    if let Some((_, ins)) = editing {
        if is_revert_phrase(transcript) {
            if let Ok(mut g) = LAST.lock() {
                *g = Some(ins);
            }
        } else {
            log::debug!("writing: editing the written text by voice");
            let current = ins.text.trim_end().to_string();
            write_for_you(
                app,
                WriteRequest {
                    instruction: transcript.trim().to_string(),
                    raw: ins.raw.clone(),
                    has_selection: false,
                    context: Some(current),
                    replaces: Some(ins),
                },
            );
            return true;
        }
    }
    if !is_revert_phrase(transcript) {
        return false;
    }
    let recent = LAST
        .lock()
        .ok()
        .is_some_and(|g| g.as_ref().is_some_and(|i| i.at.elapsed() < VOICE_WINDOW));
    if !recent {
        return false;
    }
    hud::hide(app);
    let app = app.clone();
    std::thread::spawn(move || revert(&app, "voice"));
    true
}

/// Edit: the next thing said is how to change the written text.
fn start_edit(app: &AppHandle) {
    let Some(ins) = LAST.lock().ok().and_then(|mut g| g.take()) else {
        hud::hide(app);
        return;
    };
    if let Ok(mut g) = EDITING.lock() {
        *g = Some((Instant::now(), ins));
    }
    hud::show(
        app,
        HudContent::Writing {
            id: chip_id(),
            decision: "editing".into(),
            note: Some("hud.writing.editPrompt".into()),
            revert: false,
            edit: false,
        },
    );
}

/// "Use my words": put the transcript where the polished or written text
/// is, count it, and learn from it.
fn revert(app: &AppHandle, by: &'static str) {
    let Some(last) = LAST.lock().ok().and_then(|mut g| g.take()) else {
        return;
    };
    let (text, exact) = revert_text(&last);
    let how = replace_inserted(app, &last, text, exact);
    log::debug!(
        "writing: reverted {}{} by {by} ({})",
        last.decision.name(),
        if last.rewrite { " (rewrite)" } else { "" },
        how.name()
    );
    match how {
        Replaced::Selected | Replaced::Undone => {}
        Replaced::Clipboard => {
            copy_text(app, text);
            show_note(
                app,
                if last.rewrite {
                    "hud.writing.copiedOriginal"
                } else {
                    "hud.writing.copiedWords"
                },
            );
        }
    }
    crate::telemetry::write_revert(last.decision.name(), by);
    learn(app, &last);
}

/// Count a revert for the app it happened in.
fn learn(app: &AppHandle, ins: &Inserted) {
    if ins.bundle.is_empty() {
        return;
    }
    let mut s = settings::get_settings(app);
    let pref = s.agent.writing_prefs.entry(ins.bundle.clone()).or_default();
    if !ins.app_name.is_empty() {
        pref.app_name = ins.app_name.clone();
    }
    match ins.decision {
        Decision::Written => pref.written_reverts = pref.written_reverts.saturating_add(1),
        Decision::Polished => pref.polished_reverts = pref.polished_reverts.saturating_add(1),
        Decision::AsSaid => return,
    }
    settings::write_settings(app, s);
}

fn copy_text(app: &AppHandle, text: &str) {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let _ = app.clipboard().write_text(text.to_string());
}

/// How an insertion was replaced.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Replaced {
    /// The inserted range was selected (accessibility) and pasted over.
    Selected,
    /// The app's Undo removed it (proved by re-reading the field), then the
    /// replacement was pasted.
    Undone,
    /// Neither was safe: the caller copies the replacement instead.
    Clipboard,
}

impl Replaced {
    pub fn name(self) -> &'static str {
        match self {
            Replaced::Selected => "selected",
            Replaced::Undone => "undo",
            Replaced::Clipboard => "clipboard",
        }
    }
}

/// Where `inserted` ends at the caret in `value`: the start (characters)
/// and length of the inserted text, also accepting it without a trailing
/// space some fields trim.
pub fn inserted_before_caret(value: &str, caret: usize, inserted: &str) -> Option<(usize, usize)> {
    let chars: Vec<char> = value.chars().collect();
    if caret > chars.len() {
        return None;
    }
    let candidates = [inserted, inserted.trim_end()];
    for want in candidates {
        let n = want.chars().count();
        if n == 0 || n > caret {
            continue;
        }
        if chars[caret - n..caret].iter().copied().eq(want.chars()) {
            return Some((caret - n, n));
        }
    }
    None
}

/// Whether going from `after` (just after the paste) to `now` removed
/// exactly the inserted text and nothing else.
pub fn undo_removed(after: &str, now: &str, inserted: &str) -> bool {
    for want in [inserted, inserted.trim_end()] {
        if want.is_empty() {
            continue;
        }
        let mut from = 0;
        while let Some(i) = after[from..].find(want) {
            let at = from + i;
            let mut expected = String::with_capacity(after.len());
            expected.push_str(&after[..at]);
            expected.push_str(&after[at + want.len()..]);
            if expected == now {
                return true;
            }
            from = at + want.len().max(1);
            if from >= after.len() {
                break;
            }
        }
    }
    false
}

fn send_keys(app: &AppHandle, f: fn(&mut enigo::Enigo) -> Result<(), String>) -> bool {
    crate::clipboard::with_enigo(app, f).is_ok()
}

/// Replace exactly the inserted text with `replacement`, if that can be done
/// safely; otherwise `Clipboard` and nothing in the field changed. Call off
/// the main thread.
///
/// 1. Accessibility: the inserted text must sit right before the caret;
///    select it, read the selection back, paste over it.
/// 2. Otherwise, where the field can be read: the app's Undo once, then
///    paste, but only if re-reading proves Undo removed exactly the
///    insertion (if it changed something else, Redo puts it back).
/// 3. Otherwise: nothing (the caller copies the text and says so).
pub fn replace_inserted(
    app: &AppHandle,
    ins: &Inserted,
    replacement: &str,
    exact: bool,
) -> Replaced {
    let paste = |text: &str| {
        if exact {
            crate::clipboard::paste_exact(text.to_string(), app.clone())
        } else {
            crate::clipboard::paste(text.to_string(), app.clone())
        }
    };
    if ins.submitted {
        return Replaced::Clipboard;
    }
    let front = crate::context::frontmost_app().unwrap_or_default();
    if front.bundle_id != ins.bundle || ins.bundle.is_empty() {
        log::debug!("writing: another app is in front; not replacing in place");
        return Replaced::Clipboard;
    }
    let nw = settings::get_settings(app).agent.never_watch;
    let Some(f) = field::focused_field(true, &nw) else {
        log::debug!("writing: the field can't be read; not replacing in place");
        return Replaced::Clipboard;
    };
    if let Some(r) = select_inserted(&f, &ins.text, &nw) {
        if paste(replacement).is_ok() {
            return r;
        }
        return Replaced::Clipboard;
    }
    // Undo, proven by reading the field again.
    let Some(after) = f.value.clone() else {
        return Replaced::Clipboard;
    };
    if !after.contains(ins.text.trim_end()) {
        return Replaced::Clipboard;
    }
    if !send_keys(app, crate::input::send_undo) {
        return Replaced::Clipboard;
    }
    std::thread::sleep(Duration::from_millis(220));
    let now = field::focused_field(true, &nw).and_then(|f| f.value);
    match now {
        Some(now) if undo_removed(&after, &now, &ins.text) => {
            if paste(replacement).is_ok() {
                Replaced::Undone
            } else {
                Replaced::Clipboard
            }
        }
        Some(now) if now != after => {
            log::debug!("writing: undo changed something else; redoing it");
            send_keys(app, crate::input::send_redo);
            Replaced::Clipboard
        }
        _ => Replaced::Clipboard,
    }
}

/// Step 1 of `replace_inserted`: select the inserted text before the caret
/// and check the selection reads back as it.
fn select_inserted(f: &FocusedField, inserted: &str, nw: &[String]) -> Option<Replaced> {
    let value = f.value.as_deref()?;
    let caret = f.caret?;
    // Something else is selected: the user moved on.
    if f.sel_len != 0 {
        return None;
    }
    let (start, len) = inserted_before_caret(value, caret, inserted)?;
    if !field::select_chars(start, len) {
        return None;
    }
    std::thread::sleep(Duration::from_millis(60));
    let check = field::focused_field(true, nw)?;
    let want: String = value.chars().skip(start).take(len).collect();
    let ok = check.caret == Some(start) && check.sel_len == len
        || check.selection.as_deref() == Some(want.as_str());
    if ok {
        Some(Replaced::Selected)
    } else {
        // Put the caret back where it was.
        field::select_chars(caret, 0);
        None
    }
}

// ── Written for you ───────────────────────────────────────────────────────

/// Write from the instruction (with the selection, or the text being
/// edited), then insert it where the caret is, or replace the earlier text
/// after Edit. Counts as an AI request.
pub fn write_for_you(app: &AppHandle, req: WriteRequest) {
    super::milestone(app, "answer");
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // A rewrite keeps the original selection, which "Undo rewrite"
        // restores; an Edit keeps what the first write would restore.
        let mut smart = SmartWrite::new(req.raw.clone(), None);
        if let Some(prev) = &req.replaces {
            smart.raw = prev.raw.clone();
            smart.rewrite = prev.rewrite;
        }
        smart.replaces = req.replaces.clone();
        let context = match (&req.context, req.has_selection) {
            (Some(text), _) => Some(format!(
                "Text to rewrite (reply with the rewritten text only):\n\"\"\"\n{text}\n\"\"\""
            )),
            (None, true) => {
                let a = app.clone();
                let selection = tauri::async_runtime::spawn_blocking(move || {
                    let nw = settings::get_settings(&a).agent.never_watch;
                    field::focused_field(true, &nw).and_then(|f| f.selection)
                })
                .await
                .ok()
                .flatten();
                // Without the selection's text there's nothing to rewrite:
                // leave it as it is rather than type over it.
                let Some(original) = selection.filter(|s| !s.trim().is_empty()) else {
                    show_note(&app, "hud.writing.couldntRewrite");
                    return;
                };
                smart = SmartWrite::new(req.raw.clone(), Some(original.clone()));
                Some(original).map(|s| {
                    format!(
                        "Selected text to rewrite (reply with the rewritten text only; it replaces the selection):\n\"\"\"\n{s}\n\"\"\""
                    )
                })
            }
            (None, false) => None,
        };
        let about_screen = context.is_none();
        super::answer::run_with(
            app,
            req.instruction,
            false,
            about_screen,
            context,
            super::answer::Opts {
                write: true,
                compose: true,
                smart: Some(smart),
                ..Default::default()
            },
        )
        .await;
    });
}

/// The written text is ready: insert it (or replace the text being
/// edited) and show the chip. Returns false when it couldn't be typed, so
/// the caller offers it as a draft. Call off the main thread.
pub fn deliver_written(app: &AppHandle, text: &str, smart: &SmartWrite) -> bool {
    if let Some(prev) = &smart.replaces {
        let how = replace_inserted(app, prev, text, false);
        log::debug!("writing: replaced the edited text ({})", how.name());
        if how == Replaced::Clipboard {
            copy_text(app, text);
            show_note(app, "hud.writing.copiedEdit");
            return true;
        }
    } else if let Err(e) = crate::clipboard::paste(text.to_string(), app.clone()) {
        log::warn!("inserting the written text failed: {e}");
        return false;
    }
    after_insert(
        app,
        Typed {
            decision: Decision::Written,
            raw: smart.raw.clone(),
            note: None,
            rewrite: smart.rewrite,
        },
        text,
    );
    true
}

/// Writing failed (Free's week spent, offline…): type their words as said
/// (a failed rewrite leaves the selection alone), then say why: Free's
/// spent pool through `limits` (with Upgrade), anything else as a note.
pub fn written_failed(app: &AppHandle, smart: SmartWrite, error_key: &str) {
    let spent = is_weekly_limit(error_key);
    let note = if smart.rewrite {
        "hud.writing.couldntRewrite"
    } else {
        "hud.writing.couldntWrite"
    };
    hud::hide(app);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        if smart.replaces.is_none()
            && !smart.rewrite
            && crate::clipboard::paste(smart.raw.clone(), app.clone()).is_err()
        {
            return;
        }
        if spent {
            crate::limits::ai_spent(&app, crate::limits::Show::Always);
        } else {
            show_note(&app, note);
        }
    });
}

// ── Settings ──────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub fn change_writing_mode_setting(app: AppHandle, mode: WritingMode) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.writing_mode = mode;
    settings::write_settings(&app, s);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx(category: &'static str) -> Ctx {
        Ctx {
            category,
            ..Default::default()
        }
    }

    fn decide(s: &str, c: &Ctx) -> Verdict {
        classify(s, c, &Tunables::default())
    }

    fn written(s: &str, c: &Ctx) -> bool {
        decide(s, c) == Verdict::Decided(Decision::Written)
    }

    #[test]
    fn clean_prose_is_typed_as_said() {
        for c in [
            ctx("chat"),
            ctx("mail"),
            ctx("editor"),
            ctx("other"),
            ctx("browser"),
        ] {
            for s in [
                "Thanks for the update, I'll send the numbers tomorrow.",
                "Let's push the sync to Thursday.",
                "I think we should ship the beta next week.",
                "The meeting moved to 3pm.",
                "Can you send me the deck before the call?",
                "Sounds good to me.",
                "I told them we're happy with the proposal.",
                "Reply to John by Friday.",
                "We should write the email copy next week.",
                "Happy birthday! Hope you have a great day.",
                "Tell me when you're free and I'll book a room.",
                "Let me know if that works for you.",
                "Thanks for the reply, see you Monday.",
                "Okay.",
            ] {
                assert_eq!(
                    decide(s, &c),
                    Verdict::Decided(Decision::AsSaid),
                    "{s} in {}",
                    c.category
                );
            }
        }
    }

    #[test]
    fn a_tell_meant_verbatim_in_a_chat_is_never_written_by_the_rules() {
        let chat = ctx("chat");
        // Typed to a colleague in Slack: words to send, not an instruction.
        for s in [
            "Tell me when you're free.",
            "Tell us how the demo went!",
            "Tell Sam I said hi.",
            "Tell them we're happy with it.",
            "tell her the build is green",
        ] {
            assert!(!written(s, &chat), "{s}");
        }
        // Without a model, an ambiguous "tell" falls back to as said.
        assert_eq!(
            decide("Tell Sam I said hi.", &chat),
            Verdict::Ambiguous {
                fallback: Decision::AsSaid
            }
        );
        assert_eq!(
            decide("Tell me when you're free.", &chat),
            Verdict::Decided(Decision::AsSaid)
        );
    }

    #[test]
    fn instructions_are_written_for_you() {
        for c in [ctx("chat"), ctx("mail"), ctx("browser"), ctx("other")] {
            for s in [
                "tell him I can't make it, be polite",
                "Tell them we're happy with it, keep it short.",
                "write a quick thank-you to the team for the launch",
                "Write a short note to Sam saying the deck is ready",
                "reply saying Thursday works",
                "Reply to this email saying we're in",
                "please reply to this email saying that we're happy",
                "Draft an email to Sam about the launch",
                "can you write a polite reply declining the offer",
                "let them know the build is green, in a friendly tone",
                "Hey Ambient, tell them I'll be late",
                "could you draft a message to the team thanking them",
                "respond and say thanks",
                "write back saying I'll be late",
                "ask them if Friday works, politely",
            ] {
                assert!(written(s, &c), "{s} in {}", c.category);
            }
        }
    }

    #[test]
    fn rewrites_need_a_selection() {
        let mut c = ctx("mail");
        for s in [
            "make this more formal",
            "Make it a bit shorter.",
            "rewrite this",
            "Can you make this sound friendlier?",
            "fix the grammar",
            "shorter",
            "clean this up",
            "translate this into Spanish",
        ] {
            c.has_selection = false;
            assert!(!written(s, &c), "no selection: {s}");
            c.has_selection = true;
            assert!(written(s, &c), "selection: {s}");
        }
    }

    #[test]
    fn messy_speech_is_polished() {
        let c = ctx("mail");
        for s in [
            "um so I think uh we should probably um move the meeting",
            "I I think the the numbers are wrong",
            "let's meet on Tuesday, no, Wednesday at three",
            "send it to Sam scratch that send it to Priya",
            "we need three things first the budget second the hires third the launch date",
            "so basically you know I was thinking you know that we could kind of try it",
            "the plan is to ship the beta next week and then we gather feedback from the first users and then we iterate on the onboarding and the pricing page and then we do the launch with a blog post and a newsletter and some outreach",
            "new paragraph thanks everyone",
        ] {
            assert_eq!(decide(s, &c), Verdict::Decided(Decision::Polished), "{s}");
        }
    }

    #[test]
    fn ambiguous_phrasings_go_to_a_model() {
        let c = ctx("mail");
        for s in [
            "tell them we're happy",
            "let her know I'll be late",
            "ask them if Friday works",
            "thank the team for the launch",
            "say that we agree",
        ] {
            assert!(
                matches!(decide(s, &c), Verdict::Ambiguous { .. }),
                "{s}: {:?}",
                decide(s, &c)
            );
        }
        // A messy ambiguous one falls back to polished.
        assert_eq!(
            decide("um tell them uh we're happy", &c),
            Verdict::Ambiguous {
                fallback: Decision::Polished
            }
        );
    }

    #[test]
    fn prompts_and_terminals_stay_as_said() {
        let mut ai = ctx("other");
        ai.ai_chat = true;
        for s in [
            "write a quick thank-you to the team for the launch",
            "make this more formal",
            "um so like uh write a poem",
        ] {
            assert_eq!(decide(s, &ai), Verdict::Decided(Decision::AsSaid), "{s}");
        }
        let term = ctx("terminal");
        for s in [
            "git commit dash m fix the build",
            "write a quick thank-you to the team",
            "um uh ls",
        ] {
            assert_eq!(decide(s, &term), Verdict::Decided(Decision::AsSaid), "{s}");
        }
    }

    #[test]
    fn editors_and_long_speech_need_more_to_be_written() {
        let e = ctx("editor");
        assert!(!written("write a test for the parser", &e));
        assert!(written("write a quick thank-you to the team, be warm", &e));
        let long = "write a summary of what we discussed today which was the launch plan the budget the hiring plan and the timeline for the next quarter and also the open questions from finance and legal that we still need to answer before the board meeting next month and the follow ups for everyone on the team please and thank you";
        assert!(!written(long, &ctx("mail")));
    }

    #[test]
    fn learned_reverts_raise_the_bar_in_that_app_and_a_little_in_its_category() {
        let mut prefs = std::collections::BTreeMap::new();
        prefs.insert(
            "com.tinyspeck.slackmacgap".to_string(),
            settings::WritingPref {
                app_name: "Slack".into(),
                written_reverts: 2,
                polished_reverts: 1,
            },
        );
        let base = Tunables::default();
        let slack = adjust(base, &prefs, "com.tinyspeck.slackmacgap");
        assert!((slack.written_threshold - (base.written_threshold + 0.2)).abs() < 1e-5);
        assert!((slack.polish_disfluency - base.polish_disfluency * 1.5).abs() < 1e-5);
        let discord = adjust(base, &prefs, "com.hnc.Discord");
        assert!((discord.written_threshold - (base.written_threshold + 0.1)).abs() < 1e-5);
        assert!((discord.polish_disfluency - base.polish_disfluency * 1.25).abs() < 1e-5);
        let mail = adjust(base, &prefs, "com.apple.mail");
        assert_eq!(mail, base);
        // In Slack, "tell him … be polite" (0.85) now needs 0.9: a model decides.
        let c = ctx("chat");
        assert!(matches!(
            classify("tell him I can't make it, be polite", &c, &slack),
            Verdict::Ambiguous { .. }
        ));
        assert_eq!(
            classify("tell him I can't make it, be polite", &c, &base),
            Verdict::Decided(Decision::Written)
        );
    }

    #[test]
    fn reads_the_models_label() {
        assert_eq!(parse_label("written"), Some(Decision::Written));
        assert_eq!(parse_label(" As_said\n"), Some(Decision::AsSaid));
        assert_eq!(parse_label("polished."), Some(Decision::Polished));
        assert_eq!(parse_label("as said, not written"), Some(Decision::AsSaid));
        assert_eq!(parse_label("no idea"), None);
    }

    #[test]
    fn hears_use_my_words() {
        for s in [
            "use my words",
            "Use my words.",
            "undo that",
            "Undo that!",
            "just what I said",
            "no, as I said",
            "No as I said",
            "as I said",
            "exactly what I said",
            "my words please",
            "Hey Ambient, use my own words",
            "go back to what I said",
        ] {
            assert!(is_revert_phrase(s), "{s}");
        }
        for s in [
            "As I said yesterday, the deck is ready.",
            "I'll use my words carefully",
            "undo the last migration",
            "what did I say about pricing",
            "",
        ] {
            assert!(!is_revert_phrase(s), "{s}");
        }
    }

    #[test]
    fn finds_the_inserted_text_right_before_the_caret() {
        let value = "Hi Sam, Thursday works for me. Thanks";
        let inserted = "Thursday works for me. ";
        let caret = "Hi Sam, Thursday works for me. ".chars().count();
        assert_eq!(
            inserted_before_caret(value, caret, inserted),
            Some((8, inserted.chars().count()))
        );
        // The caret moved: no match, nothing is selected.
        assert_eq!(inserted_before_caret(value, caret - 3, inserted), None);
        assert_eq!(inserted_before_caret(value, 0, inserted), None);
        assert_eq!(inserted_before_caret(value, 999, inserted), None);
        // A field that trimmed the trailing space.
        let trimmed = "Note: Thursday works for me.";
        assert_eq!(
            inserted_before_caret(trimmed, trimmed.chars().count(), inserted),
            Some((6, "Thursday works for me.".chars().count()))
        );
        // Characters, not bytes or UTF-16.
        let emoji = "😀 Merci, à jeudi ";
        assert_eq!(
            inserted_before_caret(emoji, emoji.chars().count(), "Merci, à jeudi "),
            Some((2, 15))
        );
    }

    #[test]
    fn undo_counts_only_when_exactly_the_insertion_went() {
        let after = "Hi Sam, Thursday works for me. Thanks";
        let ins = "Thursday works for me. ";
        assert!(undo_removed(after, "Hi Sam, Thanks", ins));
        // Undo took more (the app grouped typing with the paste).
        assert!(!undo_removed(after, "Hi Thanks", ins));
        // Undo did nothing.
        assert!(!undo_removed(after, after, ins));
        // Undo took less.
        assert!(!undo_removed(after, "Hi Sam, Thursday works Thanks", ins));
        // The field trims a trailing space after undo too.
        assert!(undo_removed("Thursday works for me.", "", ins));
        // Repeated text: any one occurrence exactly removed counts.
        assert!(undo_removed("ok ok ", "ok ", "ok "));
    }

    fn inserted(text: &str, raw: &str, rewrite: bool) -> Inserted {
        Inserted {
            text: text.into(),
            raw: raw.into(),
            rewrite,
            decision: Decision::Written,
            bundle: "com.apple.mail".into(),
            app_name: "Mail".into(),
            submitted: false,
            at: Instant::now(),
        }
    }

    #[test]
    fn undoing_a_rewrite_restores_the_original_selection_not_the_command() {
        let original = "hey can u send the deck by fri";
        // "make this more formal" with that text selected.
        let smart = SmartWrite::new("make this more formal".into(), Some(original.into()));
        assert!(smart.rewrite);
        assert_eq!(smart.raw, original);
        // No selection read: a plain write, reverted to the transcript.
        let plain = SmartWrite::new("write a thank-you to the team".into(), None);
        assert!(!plain.rewrite);
        assert_eq!(plain.raw, "write a thank-you to the team");
        assert!(!SmartWrite::new("x".into(), Some(String::new())).rewrite);

        // The rewrite went in where the selection was (trailing space on).
        let rewritten = "Could you please send the deck by Friday? ";
        let ins = inserted(rewritten, &smart.raw, smart.rewrite);
        assert_eq!(chip_decision(&ins), "rewritten");
        // The revert restores the original exactly, without a trailing space.
        assert_eq!(revert_text(&ins), (original, true));
        // ...over exactly the rewritten range before the caret.
        let field = format!("Hi Sam,\n{rewritten}Thanks");
        let caret = format!("Hi Sam,\n{rewritten}").chars().count();
        assert_eq!(
            inserted_before_caret(&field, caret, &ins.text),
            Some((8, rewritten.chars().count()))
        );
        // The Undo fallback counts only if it removed exactly the rewrite.
        assert!(undo_removed(&field, "Hi Sam,\nThanks", &ins.text));

        // A plain write still offers the user's words.
        let w = inserted(
            "I can't make it, sorry! ",
            "tell him I can't make it",
            false,
        );
        assert_eq!(chip_decision(&w), "written");
        assert_eq!(revert_text(&w), ("tell him I can't make it", false));
    }

    #[test]
    fn plans_follow_the_setting() {
        let fixed = WritePlan::fixed(true);
        assert!(!fixed.smart() && fixed.force_polish);
        let smart = WritePlan {
            mode: WritingMode::Smart,
            polish_on: true,
            force_polish: false,
        };
        assert!(smart.smart() && smart.writes_unasked() && !smart.force_polish);
        // The polish shortcut always polishes.
        let shortcut = WritePlan {
            mode: WritingMode::Smart,
            polish_on: true,
            force_polish: true,
        };
        assert!(!shortcut.smart());
        let as_said = WritePlan {
            mode: WritingMode::AsSaid,
            polish_on: true,
            force_polish: false,
        };
        assert!(!as_said.smart() && !as_said.writes_unasked() && !as_said.force_polish);
    }
}
