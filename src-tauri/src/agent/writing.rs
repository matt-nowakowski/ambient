//! Smart writing: per dictation (the dictation key, a text field focused),
//! decide whether to type the words **as said**, **polish** messy speech, or
//! **write for you** from an instruction ("tell him I can't make it, be
//! polite", "make this more formal" with text selected). Say what was done
//! with a small HUD chip, and let the user take it back: "Use my words"
//! replaces exactly the inserted text with what they said.
//!
//! The decision is reasoning, not rules: `router::route` reads what was said
//! with the screen and says whether to type it as said, tidy it, or write
//! for the user. Drafting from an instruction is an agent action, not
//! polish: it works with AI polish off. What the user takes back with "Use
//! my words" is remembered per app (`AgentSettings::writing_prefs`).

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
        let settings = settings::get_settings(app);
        // Setup's Try it shows plain dictation: the words, typed at once.
        // Polish and smart writing start once setup is done (All set's AI
        // polish switch, or Settings), even if polish was already on.
        if !settings.onboarding_completed {
            return Self::fixed(false);
        }
        let mode = settings.writing_mode;
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

/// Whether text is selected in the focused field (read here, never sent).
pub fn has_selection(app: &AppHandle) -> bool {
    let nw = settings::get_settings(app).agent.never_watch;
    field::focused_field(true, &nw).is_some_and(|f| f.has_selection())
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
    /// The user's style for this app or site (`agent::styles`).
    pub style: Option<crate::settings::WritingStyle>,
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

/// After Edit on the chip, what's said is how to change the written text
/// (the user's choice, so no guess). True when handled (nothing is typed).
pub fn handle_edit(app: &AppHandle, transcript: &str) -> bool {
    if transcript.trim().is_empty() {
        return false;
    }
    let editing = EDITING
        .lock()
        .ok()
        .and_then(|mut g| g.take())
        .filter(|(at, _)| at.elapsed() < EDIT_WINDOW);
    let Some((_, ins)) = editing else {
        return false;
    };
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
            style: None,
        },
    );
    true
}

/// Ambient just typed a cleaned-up or written version of what was said:
/// the user may ask for their own words back (the decision's "undo").
pub fn can_use_my_words() -> bool {
    LAST.lock()
        .ok()
        .is_some_and(|g| g.as_ref().is_some_and(|i| i.at.elapsed() < VOICE_WINDOW))
}

/// Put the user's own words back in place of the last insertion.
pub fn use_my_words(app: &AppHandle) -> bool {
    if !can_use_my_words() {
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
    if crate::testing::active() {
        crate::testing::record("copy", serde_json::json!({ "text": text }));
        return;
    }
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
        // Test mode: the scenario's user, not this computer's.
        if let Some(s) = crate::testing::scenario() {
            return Self {
                name: s.me.name.clone(),
                email: s.me.email.clone(),
            };
        }
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
    tauri::async_runtime::spawn(write_now(app.clone(), req));
}

/// [`write_for_you`], awaited: done once the text is in (or couldn't be).
pub async fn write_now(app: AppHandle, req: WriteRequest) {
    super::milestone(&app, "answer");
    // A rewrite keeps the original selection, which "Undo rewrite"
    // restores; an Edit keeps what the first write would restore.
    let mut smart = SmartWrite::new(req.raw.clone(), None);
    if let Some(prev) = &req.replaces {
        smart.raw = prev.raw.clone();
        smart.rewrite = prev.rewrite;
    }
    smart.replaces = req.replaces.clone();
    // The text to rewrite goes in as data (tagged `selected_text`); what to
    // do with it goes with the instruction.
    let context = match (&req.context, req.has_selection) {
        (Some(text), _) => Some(text.clone()),
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
            Some(original)
        }
        (None, false) => None,
    };
    let about_screen = context.is_none();
    let instruction = if context.is_some() {
        format!(
            "{}\n\n(Rewrite the text in <selected_text> as asked. Reply with the rewritten text only: it replaces the original.)",
            req.instruction
        )
    } else {
        req.instruction
    };
    super::answer::run_with(
        app,
        instruction,
        false,
        about_screen,
        context,
        super::answer::Opts {
            write: true,
            compose: true,
            smart: Some(smart),
            style_note: super::styles::note(req.style),
            context_tag: Some("selected_text"),
            ..Default::default()
        },
    )
    .await;
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
        after_insert(app, written(smart), text);
        return true;
    }
    // A rewrite goes over the selection, spaced as it was.
    let pasted = if smart.rewrite {
        crate::clipboard::paste(text.to_string(), app.clone()).map(|()| text.to_string())
    } else {
        crate::clipboard::paste_dictation(text.to_string(), app.clone())
    };
    match pasted {
        Err(e) => {
            log::warn!("inserting the written text failed: {e}");
            false
        }
        Ok(typed) => {
            // Watch for word fixes to learn.
            crate::corrections::watch(app, &typed);
            after_insert(app, written(smart), &typed);
            true
        }
    }
}

fn written(smart: &SmartWrite) -> Typed {
    Typed {
        decision: Decision::Written,
        raw: smart.raw.clone(),
        note: None,
        rewrite: smart.rewrite,
    }
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
            && crate::clipboard::paste_dictation(smart.raw.clone(), app.clone()).is_err()
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

    #[test]
    fn a_few_words_are_never_worth_a_polish() {
        let always = WritePlan {
            mode: WritingMode::Polish,
            polish_on: true,
            force_polish: true,
            explicit: false,
        };
        for s in ["ok", "sounds good", "um yes please", "了解しました"] {
            assert!(!always.polish_worth_it(s, 3), "{s}");
        }
        for s in [
            "um so I think we should move the meeting",
            "会議を木曜日に移動しましょうか",
        ] {
            assert!(always.polish_worth_it(s, 3), "{s}");
        }
        // The polish shortcut polishes even "ok"; 0 turns the skip off.
        let shortcut = WritePlan {
            explicit: true,
            ..always
        };
        assert!(shortcut.polish_worth_it("ok", 3));
        assert!(always.polish_worth_it("ok", 0));
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
}
