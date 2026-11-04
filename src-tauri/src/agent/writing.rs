//! Smart writing: per dictation (the dictation key, a text field focused),
//! decide whether to type the words **as said**, **polish** messy speech, or
//! **write for you** from an instruction ("tell him I can't make it, be
//! polite", "make this more formal" with text selected). Say what was done
//! with a small HUD chip, and let the user take it back: "Use my words"
//! replaces exactly the inserted text with what they said.
//!
//! The decision is cheap rules first (instruction forms in many languages,
//! disfluency, length, a selection), a model only for genuinely ambiguous
//! phrasings, told what's around the field (a fresh message, a reply) rather
//! than which app it is (on this computer when it can, never sent in "On
//! this computer only"), and "as said" whenever unsure. "As said" never calls
//! a model, so it's exactly as fast as plain dictation (the rules take ~50 µs
//! in a debug build). Drafting from an instruction is an agent action, not
//! polish: it works with AI polish off. Thresholds are remote tunables
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

/// What the rules know about where the words go. Whether it's an
/// instruction is decided from the words and the field (a fresh message, a
/// reply under a quoted message), never from which app it is: the category
/// only keeps code (terminals, editors) careful.
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
    /// What's on screen around the field, for the model.
    pub scene: Scene,
}

/// The focused field and window, as far as deciding needs: read on this
/// computer; only these flags and the window's name reach a model.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Scene {
    /// "App — window title".
    pub window: String,
    /// Nothing typed before the caret (the start of a new message); None
    /// when the field couldn't be read.
    pub fresh: Option<bool>,
    /// A reply: a quoted message in the field ("On Monday Sam wrote:", "> …")
    /// or a reply's title ("Re: …", "Odp: …").
    pub replying: bool,
}

/// Quoted-reply markers in a reply's body, in the languages mail apps use.
static QUOTED: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?im)(?:\b(?:wrote|napisał(?:a)?|schrieb|a\s+écrit|escribió|ha\s+scritto|escreveu|schreef|написал(?:а)?|написав(?:ла)?|skrev|napsal(?:a)?)\s*:\s*$|^>\s|^-{2,}\s*(?:original\s+message|forwarded\s+message|ursprüngliche\s+nachricht|wiadomość\s+oryginalna|mensaje\s+original|message\s+d'origine)|^(?:from|von|od|de|da|van|от|från):\s.+\n(?:.*\n)?(?:sent|date|gesendet|wysłano|data|datum|enviado|envoyé|inviato|отправлено|skickat):)",
    )
    .expect("quoted reply")
});

/// A reply's window title ("Re: Budget", "AW: Budget", "Odp: Budżet").
static REPLY_TITLE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:re|aw|odp|rv|r|antw|sv|vs|ynt|réf|ответ)\s*:").expect("reply title")
});

impl Scene {
    /// From the field's text and caret and the window's title.
    pub fn read(app: &str, title: &str, value: Option<&str>, caret: Option<usize>) -> Self {
        let before: String = match (value, caret) {
            (Some(v), Some(c)) => v.chars().take(c).collect(),
            (Some(v), None) => v.to_string(),
            _ => String::new(),
        };
        Self {
            window: if title.trim().is_empty() {
                app.to_string()
            } else {
                format!("{app} — {title}")
            },
            fresh: value.map(|_| before.trim().is_empty()),
            replying: REPLY_TITLE.is_match(title) || value.is_some_and(|v| QUOTED.is_match(v)),
        }
    }
}

/// Thresholds in effect for one app: the remote config, shifted by what the
/// user taught it there.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tunables {
    pub written_threshold: f32,
    pub ambiguous_floor: f32,
    pub polish_disfluency: f32,
    pub run_on_words: u32,
    /// Dictations of this many words or fewer aren't polished.
    pub skip_polish_words: u32,
}

impl From<crate::remote_config::WritingConfig> for Tunables {
    fn from(c: crate::remote_config::WritingConfig) -> Self {
        Self {
            written_threshold: c.written_threshold,
            ambiguous_floor: c.ambiguous_floor,
            polish_disfluency: c.polish_disfluency,
            run_on_words: c.run_on_words,
            skip_polish_words: c.skip_polish_words,
        }
    }
}

impl Default for Tunables {
    fn default() -> Self {
        crate::remote_config::WritingConfig::default().into()
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
    adjust(
        crate::remote_config::agent_config().writing.into(),
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
        skip_polish_words: base.skip_polish_words,
    }
}

// ── The model, for ambiguous phrasings ──────────────────────────────────

/// Keep the opening words: the server treats calls starting with them as
/// routing, which never spends Free's AI uses (`completionKind` in
/// web/lib/ai.ts).
const MODEL_SYSTEM: &str = r#"You decide how to type what the user just dictated into a text field. Reply with exactly one word: as_said, polished or written.
Decide from the words and the situation, never from which app it is. The words may be in any language; decide the same way.
as_said: the words ARE the message, spoken to its reader: first and second person, a greeting, a question or request to them ("tell me when you're free", "let me know if that works", "thanks, all good", "dzięki, wszystko ok").
polished: the same, but the speech is messy (fillers, false starts, corrections) and needs cleaning up, keeping their words.
written: the words are an instruction to you ABOUT a message: they say what to write ("reply that everything's ok", "write back saying Thursday works", "draft a thank-you to the team"), speak of the recipient in the third person ("tell him I can't make it", "let Sam know I'm late"), or say how to write it ("be polite", "keep it short"), or ask to rewrite selected text ("make this more formal"). Also in other languages: "odpisz że wszystko ok", "napisz mu że będę o 5", "dile que llego tarde", "réponds-lui que c'est bon", "antworte, dass alles passt", "rispondi che va bene", "大丈夫だと返信して".
A fresh reply under someone's message makes an instruction more likely, but words spoken to the reader are still as_said.
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

/// What the model is told: where the words go (the window, whether it's a
/// fresh message or a reply, a selection) and the words.
pub fn model_input(transcript: &str, ctx: &Ctx) -> String {
    let mut field = Vec::new();
    match ctx.scene.fresh {
        Some(true) => field.push("empty, a new message starts here"),
        Some(false) => field.push("has text before the cursor"),
        None => {}
    }
    if ctx.scene.replying {
        field.push("a reply under someone's message");
    }
    if ctx.has_selection {
        field.push("text is selected");
    }
    let window = if ctx.scene.window.is_empty() {
        String::new()
    } else {
        format!("Window: {}\n", ctx.scene.window)
    };
    let field = if field.is_empty() {
        String::new()
    } else {
        format!("Field: {}\n", field.join("; "))
    };
    format!("{window}{field}Dictated: {}", transcript.trim())
}

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
    let user = model_input(transcript, ctx);
    if !crate::limits::ai_available(app) {
        return None;
    }
    let local_ok = super::llm::on_device_ready()
        && s.agent.intelligence != Intelligence::Cloud
        && (crate::plan::is_paid(app) || s.agent.device_only() || s.agent.on_device_when_possible);
    // A background decision like the router's: it never spends a Free AI use,
    // on device or hosted (the server treats this prompt as routing).
    let ask = async {
        if local_ok {
            let reply = super::llm::complete_on_device(MODEL_SYSTEM, &user).await;
            if reply.is_some() || s.agent.device_only() {
                return reply;
            }
        }
        if s.agent.device_only() || super::llm::target(app).is_none() {
            return None;
        }
        // One word back: a tiny output cap also gets the server's short
        // time budget.
        super::llm::complete_hosted_limited(
            app,
            "write_mode",
            MODEL_SYSTEM,
            &user,
            crate::llm_client::RequestLimits {
                max_tokens: Some(8),
                timeout: Some(MODEL_TIMEOUT),
            },
        )
        .await
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

/// Words, counting Chinese and Japanese (written without spaces) at about
/// two characters a word.
pub fn word_count(t: &str) -> usize {
    let spaced = t.split_whitespace().count();
    let cjk = t
        .chars()
        .filter(|c| matches!(*c as u32, 0x3040..=0x30FF | 0x3400..=0x4DBF | 0x4E00..=0x9FFF))
        .count();
    spaced.max(cjk.div_ceil(2))
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
    /// Asked for this one (the polish shortcut, a file): polished however
    /// short it is.
    pub explicit: bool,
}

impl WritePlan {
    /// Files, the wake word, and anything else that just polishes or not.
    pub fn fixed(post_process: bool) -> Self {
        Self {
            mode: WritingMode::AsSaid,
            polish_on: post_process,
            force_polish: post_process,
            explicit: post_process,
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
            explicit: explicit_polish,
        }
    }

    /// Whether this polish is worth a model round trip: a dictation of a
    /// few words ("sounds good", "ok thanks") is typed at once instead,
    /// unless polish was asked for (the shortcut). `max_words` is the
    /// `writing.skip_polish_words` tunable (0 polishes everything).
    pub fn polish_worth_it(&self, transcript: &str, max_words: u32) -> bool {
        self.explicit || word_count(transcript) > max_words as usize
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

/// Whether text is selected in the focused field, and the scene around it
/// (`window` is "App — title"). The field's text is read here only to tell
/// a fresh message or a reply; it never leaves this computer.
pub fn read_field(app: &AppHandle, app_name: &str, title: &str) -> (bool, Scene) {
    let nw = settings::get_settings(app).agent.never_watch;
    match field::focused_field(true, &nw) {
        Some(f) => (
            f.has_selection(),
            Scene::read(app_name, title, f.value.as_deref(), f.caret),
        ),
        None => (false, Scene::read(app_name, title, None, None)),
    }
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

// ── Who's who in a reply ──────────────────────────────────────────────────
//
// A draft is written as the user, to the other person. Mail shows both
// ("From: Sam … To: Matt"), and without being told which one is the user
// the model has addressed the reply to them.

/// The user, as far as this computer knows.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Me {
    /// The account's full name on this computer ("Matt Nowakowski").
    pub name: Option<String>,
    /// The signed-in email.
    pub email: Option<String>,
}

impl Me {
    pub fn read(app: &AppHandle) -> Self {
        Self {
            name: full_user_name(),
            email: crate::plan::account_email(app),
        }
    }

    fn label(&self) -> Option<String> {
        match (&self.name, &self.email) {
            (Some(n), Some(e)) => Some(format!("{n} ({e})")),
            (Some(n), None) => Some(n.clone()),
            (None, Some(e)) => Some(e.clone()),
            (None, None) => None,
        }
    }

    /// Whether a name or address seen on screen is the user.
    pub fn is(&self, who: &str) -> bool {
        let who = who.trim().to_lowercase();
        if who.is_empty() || matches!(who.as_str(), "me" | "you" | "ja" | "ich" | "moi" | "yo") {
            return true;
        }
        if let Some(e) = &self.email {
            let e = e.to_lowercase();
            if who.contains(&e) || e.split('@').next() == Some(who.as_str()) {
                return true;
            }
        }
        self.name.as_ref().is_some_and(|n| {
            let n = n.to_lowercase();
            // The full name, or just the first name on its own ("Matt").
            who == n || n.split_whitespace().next() == Some(who.as_str())
        })
    }
}

/// The login account's full name, read once.
fn full_user_name() -> Option<String> {
    static NAME: Lazy<Option<String>> = Lazy::new(|| {
        #[cfg(target_os = "macos")]
        let name = Some(objc2_foundation::NSFullUserName().to_string());
        #[cfg(target_os = "linux")]
        let name = std::env::var("USER").ok().and_then(|user| {
            std::fs::read_to_string("/etc/passwd").ok().and_then(|p| {
                p.lines()
                    .find(|l| l.split(':').next() == Some(user.as_str()))
                    .and_then(|l| l.split(':').nth(4))
                    .and_then(|gecos| gecos.split(',').next())
                    .map(str::to_string)
            })
        });
        // Windows has no full name without a directory lookup: the signed-in
        // email and the screen carry it there.
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        let name: Option<String> = None;
        name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty())
    });
    NAME.clone()
}

/// "From: Sam Lee <sam@acme.com>" in a header (any of the usual languages).
static FROM_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?im)^\s*(?:from|von|od|de|da|van|от|від|från|fra|kimden)\s*:\s*(.+?)\s*$")
        .expect("from line")
});

/// "On Mon, 2 Nov 2026 at 10:02, Sam Lee <sam@acme.com> wrote:" in a quoted
/// reply.
static WROTE_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?im)(?:^|,\s*|\s)([^,\n<>]{2,60}?)\s*(?:<[^>\n]+>)?\s*(?:wrote|napisał(?:a)?|schrieb|a\s+écrit|escribió|ha\s+scritto|escreveu|schreef|написал(?:а)?|skrev)\s*:\s*$")
        .expect("wrote line")
});

/// A chat message's header: "Sam Lee  10:42 AM", "Sam Lee 10:42", "Anna
/// Kowalska — 14:05" (Slack, Teams, Discord).
static CHAT_HEADER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^\s*(\p{Lu}[\p{L}'’.\-]*(?:[ \t]\p{Lu}[\p{L}'’.\-]*){0,3})\s*(?:[—–\-·,]\s*)?(?:\d{1,2}:\d{2}(?:\s?[AaPp]\.?[Mm]\.?)?|(?:Today|Yesterday)\s+at\s+\d{1,2}:\d{2}(?:\s?[AP]M)?)\s*$")
        .expect("chat header")
});

/// "Sam Lee <sam@acme.com>" → "Sam Lee"; a bare address stays.
fn display_name(s: &str) -> String {
    let s = s.trim().trim_matches('"');
    match s.find('<') {
        Some(i) if i > 0 => s[..i].trim().trim_matches('"').to_string(),
        _ => s.trim_matches(|c| c == '<' || c == '>').to_string(),
    }
}

/// Who the user is replying to, from the window's text: the sender of the
/// message on screen that isn't the user. Mail: the first "From:" (the
/// message open) or "… wrote:" (quoted in the reply); chat: the latest
/// message header that isn't the user's. None when nothing says.
pub fn other_party(screen: &str, me: &Me) -> Option<String> {
    let mail = FROM_LINE
        .captures_iter(screen)
        .chain(WROTE_LINE.captures_iter(screen))
        .map(|c| display_name(&c[1]))
        .find(|n| !n.is_empty() && !me.is(n));
    if mail.is_some() {
        return mail;
    }
    CHAT_HEADER
        .captures_iter(screen)
        .map(|c| c[1].trim().to_string())
        .filter(|n| !me.is(n))
        .last()
}

/// The instruction sent to write a reply: who the user is and who they're
/// answering, so the draft is from them and to the other person.
pub fn reply_brief(instruction: &str, me: &Me, screen: Option<&str>) -> String {
    let other = screen.and_then(|s| other_party(s, me));
    let mut note = String::from("(Who's who: ");
    if let Some(me) = me.label() {
        note.push_str(&format!("I am {me}. "));
    }
    note.push_str("Write as me, in the first person");
    match other {
        Some(o) => note.push_str(&format!(
            ", to {o}: they wrote the message I'm answering. Address {o}, never me, and don't sign as {o}.)"
        )),
        None => note.push_str(
            ", to the other person in the conversation (whoever wrote the last message that isn't mine); never address it to me.)",
        ),
    }
    // This note is English; the reply isn't.
    note.insert_str(
        note.len() - 1,
        " Write in the language of the conversation, or of my instruction above if there's none.",
    );
    format!("{instruction}\n\n{note}")
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
            explicit: false,
        };
        assert!(smart.smart() && smart.writes_unasked() && !smart.force_polish);
        // The polish shortcut always polishes.
        let shortcut = WritePlan {
            mode: WritingMode::Smart,
            polish_on: true,
            force_polish: true,
            explicit: true,
        };
        assert!(!shortcut.smart());
        let as_said = WritePlan {
            mode: WritingMode::AsSaid,
            polish_on: true,
            force_polish: false,
            explicit: false,
        };
        assert!(!as_said.smart() && !as_said.writes_unasked() && !as_said.force_polish);
    }

    /// The 0.1.8 default: polish off. Smart writing still drafts from an
    /// instruction (an agent action), and types everything else as said.
    #[test]
    fn with_polish_off_smart_still_drafts() {
        let plan = WritePlan {
            mode: WritingMode::Smart,
            polish_on: false,
            force_polish: false,
            explicit: false,
        };
        assert!(plan.smart() && plan.writes_unasked());
        let c = ctx("chat");
        assert!(written("odpisz że wszystko ok", &c));
        assert!(written("reply saying Thursday works", &c));
        assert_eq!(
            decide("Thanks, see you Monday.", &c),
            Verdict::Decided(Decision::AsSaid)
        );
    }

    #[test]
    fn a_few_words_are_never_worth_a_polish() {
        let always = WritePlan {
            mode: WritingMode::Polish,
            polish_on: true,
            force_polish: true,
            explicit: false,
        };
        let t = Tunables::default();
        assert_eq!(t.skip_polish_words, 3);
        for s in ["ok", "sounds good", "um yes please", "了解しました"] {
            assert!(!always.polish_worth_it(s, t.skip_polish_words), "{s}");
        }
        for s in [
            "um so I think we should move the meeting",
            "会議を木曜日に移動しましょうか",
        ] {
            assert!(always.polish_worth_it(s, t.skip_polish_words), "{s}");
        }
        // The polish shortcut polishes even "ok"; 0 turns the skip off.
        let shortcut = WritePlan {
            explicit: true,
            ..always
        };
        assert!(shortcut.polish_worth_it("ok", 3));
        assert!(always.polish_worth_it("ok", 0));
    }

    /// The founder's: Polish (and other languages) typed verbatim in 0.1.7.
    #[test]
    fn instructions_in_any_language_are_written() {
        for c in [ctx("chat"), ctx("mail"), ctx("other"), ctx("browser")] {
            for s in [
                "odpisz że wszystko ok",
                "Odpisz, że wszystko OK.",
                "napisz mu że będę o piątej",
                "antworte, dass alles passt",
                "responde que sí",
                "réponds-lui que c'est bon",
                "rispondi che va bene",
                "ответь что всё в порядке",
                "大丈夫だと返信して",
            ] {
                assert!(written(s, &c), "{s} in {}: {:?}", c.category, decide(s, &c));
            }
            // "Tell him that…" is as often the message: a model decides.
            for s in ["powiedz mu że będę o piątej", "dile que llego tarde"] {
                assert!(
                    matches!(decide(s, &c), Verdict::Ambiguous { .. }),
                    "{s} in {}",
                    c.category
                );
            }
            for s in [
                "Dzięki, wszystko ok, do jutra",
                "Myślę że to dobry pomysł",
                "Je pense que c'est bon",
                "ありがとうございます",
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

    /// Mail, Messages and Slack decide alike: the app's kind no longer moves
    /// the decision (only code, in terminals and editors, stays careful).
    #[test]
    fn mail_messages_and_slack_decide_alike() {
        let apps = [
            "com.apple.mail",
            "com.apple.MobileSMS",
            "com.tinyspeck.slackmacgap",
            "net.whatsapp.WhatsApp",
            "com.google.Chrome",
        ];
        for s in [
            "tell him I can't make it, be polite",
            "reply that everything's ok",
            "odpisz że wszystko ok",
            "let her know I'll be late",
            "tell them we're happy",
            "Tell me when you're free.",
            "Thanks, see you Monday.",
            "um so I think uh we should probably um move the meeting",
        ] {
            let verdicts: Vec<Verdict> = apps
                .iter()
                .map(|b| {
                    let c = Ctx {
                        category: crate::telemetry::app_category(b),
                        ..Default::default()
                    };
                    decide(s, &c)
                })
                .collect();
            assert!(
                verdicts.windows(2).all(|v| v[0] == v[1]),
                "{s}: {verdicts:?}"
            );
        }
    }

    #[test]
    fn the_model_hears_the_scene_not_the_app() {
        let mut c = ctx("chat");
        c.scene = Scene::read("Messages", "Anna Kowalska", Some(""), Some(0));
        let input = model_input("odpisz że wszystko ok", &c);
        assert_eq!(
            input,
            "Window: Messages — Anna Kowalska\nField: empty, a new message starts here\nDictated: odpisz że wszystko ok"
        );
        assert!(!input.contains("chat"));
        // A field that couldn't be read says nothing about it.
        c.scene = Scene::read("Slack", "", None, None);
        assert_eq!(
            model_input("tell him hi", &c),
            "Window: Slack\nDictated: tell him hi"
        );
        // Starts with the router-like prefix the server counts as routing.
        assert!(MODEL_SYSTEM.starts_with("You decide how to type what the user just dictated"));
    }

    #[test]
    fn reads_a_reply_from_the_field() {
        // Mail: a reply window, the quoted message below the caret.
        let body = "\n\nOn Mon, 2 Nov 2026 at 10:02, Sam Lee <sam@acme.com> wrote:\n> Can you confirm the budget by Friday?\n> Sam";
        let s = Scene::read("Mail", "Re: Q4 budget", Some(body), Some(0));
        assert_eq!(s.fresh, Some(true));
        assert!(s.replying);
        // Polish Mail: "napisał:".
        let pl = "\n\nW dniu 2.11.2026 o 10:02 Anna Kowalska <anna@firma.pl> napisał(a):\n> Czy wszystko gra?";
        assert!(Scene::read("Mail", "Odp: Projekt", Some(pl), Some(0)).replying);
        // Slack: an empty message box; a reply only if the title says so.
        let s = Scene::read("Slack", "Sam Lee (DM) - Acme - Slack", Some(""), Some(0));
        assert_eq!(s.fresh, Some(true));
        assert!(!s.replying);
        // Mid-sentence in Messages.
        let s = Scene::read("Messages", "Anna", Some("Sounds good, and "), Some(16));
        assert_eq!(s.fresh, Some(false));
    }

    fn matt() -> Me {
        Me {
            name: Some("Matt Nowakowski".into()),
            email: Some("matt@example.com".into()),
        }
    }

    const MAIL_SCREEN: &str = "Mail — Re: Q4 budget
From: Sam Lee <sam@acme.com>
Subject: Q4 budget
Date: 2 November 2026 at 10:02
To: Matt Nowakowski <matt@example.com>

Hi Matt,
Can you confirm the budget by Friday?
Thanks,
Sam";

    #[test]
    fn a_mail_reply_goes_to_the_sender_not_to_me() {
        assert_eq!(
            other_party(MAIL_SCREEN, &matt()).as_deref(),
            Some("Sam Lee")
        );
        let brief = reply_brief("odpisz że wszystko ok", &matt(), Some(MAIL_SCREEN));
        assert!(brief.starts_with("odpisz że wszystko ok\n\n"));
        assert!(brief.contains("I am Matt Nowakowski (matt@example.com)"));
        assert!(brief.contains("to Sam Lee"));
        assert!(brief.contains("Address Sam Lee, never me"));
        // My own sent message open (From: me): the reply is to whoever else
        // wrote, here quoted below.
        let sent = "Mail — Re: Q4 budget
From: Matt Nowakowski <matt@example.com>
To: Sam Lee <sam@acme.com>

Sure, see below.

On Mon, 2 Nov 2026 at 10:02, Sam Lee <sam@acme.com> wrote:
> Can you confirm the budget by Friday?";
        assert_eq!(other_party(sent, &matt()).as_deref(), Some("Sam Lee"));
    }

    #[test]
    fn a_slack_reply_goes_to_the_latest_other_person() {
        let slack = "Slack — Sam Lee (DM) - Acme
Sam Lee  10:42 AM
are we still on for the demo?
Matt Nowakowski  10:44 AM
yes, one sec
Priya Shah  10:45 AM
can I join?";
        assert_eq!(other_party(slack, &matt()).as_deref(), Some("Priya Shah"));
        // My message last: still the latest other person.
        let mine_last = "Slack — #launch
Anna Kowalska
14:05
czy wszystko gra?
Matt
14:07
sprawdzam";
        assert_eq!(
            other_party(mine_last, &matt()).as_deref(),
            Some("Anna Kowalska")
        );
    }

    #[test]
    fn messages_without_names_get_the_general_rule() {
        // Messages shows bubbles, not names: no guess, just "the other person".
        let messages = "Messages — Anna\nAre you coming tonight?\nYes!\nGreat, 8pm?";
        assert_eq!(other_party(messages, &matt()), None);
        let brief = reply_brief("tell her 8 works", &matt(), Some(messages));
        assert!(brief.contains("to the other person in the conversation"));
        assert!(brief.contains("never address it to me"));
        // Nothing known about me at all: still never addressed to me.
        let brief = reply_brief("reply ok", &Me::default(), None);
        assert!(!brief.contains("I am"));
        assert!(brief.contains("never address it to me"));
    }

    #[test]
    fn knows_me_by_name_email_or_first_name() {
        let me = matt();
        for s in [
            "Matt Nowakowski",
            "matt nowakowski",
            "Matt",
            "matt@example.com",
            "Matt Nowakowski <matt@example.com>",
            "me",
        ] {
            assert!(me.is(s), "{s}");
        }
        for s in ["Sam Lee", "Matthew Perry", "Matt Smith"] {
            assert!(!me.is(s), "{s}");
        }
    }

    /// Unit timing for the report: the local decision costs microseconds,
    /// so "as said" is as fast as plain dictation.
    #[test]
    fn the_local_decision_is_cheap() {
        let c = ctx("chat");
        let t = Tunables::default();
        let samples = [
            "Thanks for the update, I'll send the numbers tomorrow.",
            "odpisz że wszystko ok",
            "tell him I can't make it, be polite",
            "um so I think uh we should probably um move the meeting",
        ];
        // Warm the regexes.
        for s in samples {
            classify(s, &c, &t);
        }
        let n = 2_000;
        let started = Instant::now();
        for _ in 0..n {
            for s in samples {
                std::hint::black_box(classify(s, &c, &t));
            }
        }
        let per = started.elapsed() / (n * samples.len() as u32);
        eprintln!("writing::classify: {per:?} per dictation");
        assert!(per < Duration::from_millis(2), "{per:?}");
    }
}
