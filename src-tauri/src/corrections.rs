//! "Learn from my corrections": after Ambient pastes, watch the field for a
//! short while (until focus moves, the text is sent, or about 45 s pass),
//! see which words the user fixed, and when the same fix comes back ("Anna"
//! → "Ana", "kubernetes" → "Kubernetes") offer, quietly, to remember it.
//!
//! The field is read through the same accessibility APIs as smart writing
//! (`context::field`: macOS AX, Windows UI Automation, Linux AT-SPI), which
//! already skip password fields, private apps, the never-watch list and text
//! that looks like a key. Field text never leaves this computer and is never
//! stored: only the word pairs (and how often each was seen) are kept, in
//! `corrections.json` next to the settings. Only word-level swaps count; a
//! rewrite teaches nothing.
//!
//! Three steps decide what's offered, all on this computer:
//!
//! 1. A size policy ([`SizePolicy`]) decides what is even considered: a
//!    paste, a field and an edit of a sensible size. A long field or a
//!    heavily rewritten paste teaches nothing reliable and isn't looked at.
//! 2. Each fix gets a verdict ([`Verdict`]): *reusable* (a name or term
//!    that will come back: "Anna" → "Ana", "kubernetes" → "Kubernetes"),
//!    *specific* (right for this message only: a plural, a tense, a
//!    different everyday word, a number) or *uncertain* (could be either).
//!    Only reusable fixes are offered; uncertainty means wait. The same
//!    uncertain fix made again and again stops being uncertain.
//! 3. A fix that's due but can't be offered yet (another card is up) stays
//!    queued in the ledger and is offered later; a ledger that can't be read
//!    is set aside, not overwritten, and one that can't be saved is kept in
//!    memory. A user's correction is never silently dropped.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::context::field;
use crate::settings::{self, AppSettings, WordReplacement};

/// How long after a paste the field is watched.
const WATCH_FOR: Duration = Duration::from_secs(45);
/// How often the field is read meanwhile.
const POLL_EVERY: Duration = Duration::from_millis(1_500);
/// The same fix this many times before it's offered.
const ASK_AFTER: u32 = 2;
/// An offer that faded unanswered comes back after this many more.
const ASK_AGAIN_AFTER: u32 = 3;
/// Sightings of the same uncertain fix that make it reusable: the user
/// making exactly this change again and again is the evidence it lacked.
const CONFIRM_AFTER: u32 = 4;
/// Pairs kept (the least recently seen go first; queued offers never go).
const KEEP: usize = 200;

/// A newer paste ends the current watch.
static GENERATION: AtomicU64 = AtomicU64::new(0);
static LEDGER_LOCK: Mutex<()> = Mutex::new(());

// ── What is considered ───────────────────────────────────────────────────

/// What's even looked at, by size. Decided locally, before any diff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SizePolicy {
    /// Longest paste worth watching, in words.
    pub max_words: usize,
    /// Longest field worth reading while watching, in characters (a long
    /// document's field is read every poll; past this, it isn't watched).
    pub max_field_chars: usize,
    /// Most separate edits in one paste; more is a rewrite.
    pub max_edits: usize,
    /// Most of the paste that may change, in tenths (4: 40%).
    pub max_changed_tenths: usize,
    /// Most words replaced in one edit ("chat GPT" → "ChatGPT" is two).
    pub max_from_words: usize,
}

pub const SIZE_POLICY: SizePolicy = SizePolicy {
    max_words: 200,
    max_field_chars: 20_000,
    max_edits: 3,
    max_changed_tenths: 4,
    max_from_words: 3,
};

impl SizePolicy {
    /// Whether a paste of `words` words is worth watching.
    pub fn watch_paste(&self, words: usize) -> bool {
        words > 0 && words <= self.max_words
    }

    /// Whether a field of `chars` characters is worth reading.
    pub fn read_field(&self, chars: usize) -> bool {
        chars <= self.max_field_chars
    }

    /// Whether `edits` edits changing `changed` of `pasted` words are fixes
    /// rather than a rewrite.
    fn fixes(&self, pasted: usize, edits: usize, changed: usize) -> bool {
        edits <= self.max_edits && changed * 10 <= pasted.max(3) * self.max_changed_tenths
    }
}

// ── What changed ─────────────────────────────────────────────────────────

/// The word swaps between what was pasted and what the field holds now:
/// one word for one ("Anna" → "Ana") or a few for one ("Chat GPT" →
/// "ChatGPT"), punctuation around them aside. Empty when it looks like a
/// rewrite rather than a fix, or nothing changed that could be learned.
/// Uncertain fixes are kept (they're counted, not offered); specific ones
/// aren't.
pub fn substitutions(pasted: &str, edited: &str) -> Vec<(String, String)> {
    let policy = SIZE_POLICY;
    let a: Vec<&str> = pasted.split_whitespace().collect();
    let b: Vec<&str> = edited.split_whitespace().collect();
    if a.is_empty()
        || b.is_empty()
        || !policy.watch_paste(a.len())
        || b.len() > policy.max_words * 2
    {
        return Vec::new();
    }
    let hunks = diff_hunks(&a, &b);
    // Typing on after the pasted text is an insertion, not a fix.
    let edits: Vec<&(Vec<&str>, Vec<&str>)> =
        hunks.iter().filter(|(del, _)| !del.is_empty()).collect();
    let changed: usize = edits.iter().map(|(del, _)| del.len()).sum();
    if !policy.fixes(a.len(), edits.len(), changed) {
        return Vec::new();
    }
    edits
        .into_iter()
        .filter(|(del, ins)| ins.len() == 1 && (1..=policy.max_from_words).contains(&del.len()))
        .filter_map(|(del, ins)| {
            let from = del.iter().map(|w| core(w)).collect::<Vec<_>>().join(" ");
            let to = core(ins[0]).to_string();
            // A sentence's first word recased is grammar, not a term.
            let at = a.iter().position(|w| w.as_ptr() == del[0].as_ptr())?;
            let sentence_start = at == 0 || a[at - 1].ends_with(['.', '!', '?']);
            if sentence_start && from.to_lowercase() == to.to_lowercase() {
                return None;
            }
            learnable(&from, &to).then_some((from, to))
        })
        .collect()
}

/// Runs of deleted and inserted words between equal ones (an LCS diff).
fn diff_hunks<'a>(a: &[&'a str], b: &[&'a str]) -> Vec<(Vec<&'a str>, Vec<&'a str>)> {
    let (n, m) = (a.len(), b.len());
    // lcs[i][j]: the longest common run of a[i..] and b[j..].
    let mut lcs = vec![vec![0u16; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if a[i] == b[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }
    let mut hunks = Vec::new();
    let (mut del, mut ins) = (Vec::new(), Vec::new());
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            if !del.is_empty() || !ins.is_empty() {
                hunks.push((std::mem::take(&mut del), std::mem::take(&mut ins)));
            }
            i += 1;
            j += 1;
        } else if j < m && (i == n || lcs[i][j + 1] >= lcs[i + 1][j]) {
            ins.push(b[j]);
            j += 1;
        } else {
            del.push(a[i]);
            i += 1;
        }
    }
    if !del.is_empty() || !ins.is_empty() {
        hunks.push((del, ins));
    }
    hunks
}

/// A word without the punctuation around it ("Anna," → "Anna").
fn core(word: &str) -> &str {
    word.trim_matches(|c: char| !c.is_alphanumeric())
}

/// What a fix says about the future.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// A name or term that will come back: worth offering to remember.
    Reusable,
    /// Right for this message only (grammar, a plural, a different word, a
    /// number): never offered.
    Specific,
    /// Could be either: counted, not offered, until it keeps happening.
    Uncertain,
}

/// Endings that make another form of the same word ("meeting" →
/// "meetings", "Anna" → "Anna's"): grammar for this sentence.
const INFLECTIONS: &[&str] = &["s", "es", "'s", "’s", "ed", "d", "ing", "er", "ly", "n't"];

fn is_inflection(a: &str, b: &str) -> bool {
    let (short, long) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    long.strip_prefix(short)
        .is_some_and(|ending| INFLECTIONS.contains(&ending))
}

/// The verdict on `from` → `to`, and why (a fixed name for logs and tests).
pub fn verdict(from: &str, to: &str) -> (Verdict, &'static str) {
    use Verdict::*;
    if from.is_empty() || to.is_empty() || from == to {
        return (Specific, "no change");
    }
    if to.chars().count() > 40 || from.chars().count() > 60 || to.contains(char::is_whitespace) {
        return (Specific, "too long or several words");
    }
    if !to.chars().any(char::is_alphabetic) || looks_secret(from) || looks_secret(to) {
        return (Specific, "a number, key, address or path");
    }
    let (fl, tl) = (from.to_lowercase(), to.to_lowercase());
    let common = crate::audio_toolkit::text::is_common_word;
    if fl == tl {
        // Casing: "kubernetes" → "Kubernetes" or "iphone" → "iPhone" is a
        // term's spelling. A common word capitalised ("meeting" →
        // "Meeting") is emphasis or a heading; lowercasing is style.
        if from.contains(' ') || !to.chars().any(char::is_uppercase) {
            return (Specific, "lowercased");
        }
        if common(&tl) {
            return (Specific, "a common word recased");
        }
        return (Reusable, "a term's casing");
    }
    let squashed: String = fl.split_whitespace().collect();
    // Words run together into a name ("chat GPT" → "ChatGPT").
    if from.contains(' ') && squashed == tl {
        return if to.chars().any(char::is_uppercase) {
            (Reusable, "words joined into a name")
        } else {
            (Uncertain, "words joined")
        };
    }
    // Another form of the same word is grammar for this sentence.
    if is_inflection(&fl, &tl) {
        return (Specific, "another form of the word");
    }
    // A different everyday word is a rewrite or grammar ("their" → "there").
    if from.split_whitespace().any(|w| common(&w.to_lowercase())) {
        return (Specific, "a different everyday word");
    }
    let dist = strsim::levenshtein(&squashed, &tl) as f64;
    let len = squashed.chars().count().max(tl.chars().count()) as f64;
    let ratio = dist / len;
    if ratio > 0.5 {
        return (Specific, "a different word");
    }
    // A misheard word put right as an everyday word ("recieve" →
    // "receive") may be this sentence only; a name or term is the user's.
    let named = to.chars().next().is_some_and(char::is_uppercase)
        || to.chars().skip(1).any(char::is_uppercase);
    if common(&tl) && !named {
        return (Uncertain, "an everyday word");
    }
    // Very short words are too easy to change for another reason.
    if squashed.chars().count() <= 3 && tl.chars().count() <= 3 {
        return (Uncertain, "too short to tell");
    }
    if ratio > 0.34 {
        return (Uncertain, "spelt quite differently");
    }
    if named || tl.chars().count() >= 5 {
        (Reusable, "a name or term's spelling")
    } else {
        (Uncertain, "a short lowercase word")
    }
}

/// The verdict once it's been seen `count` times: an uncertain fix the user
/// keeps making is reusable after all. Specific stays specific.
pub fn verdict_after(from: &str, to: &str, count: u32) -> Verdict {
    match verdict(from, to).0 {
        Verdict::Uncertain if count >= CONFIRM_AFTER => Verdict::Reusable,
        v => v,
    }
}

/// Whether `from` → `to` could be worth remembering (reusable now, or
/// uncertain and so worth counting).
pub fn learnable(from: &str, to: &str) -> bool {
    verdict(from, to).0 != Verdict::Specific
}

/// A key, token, address or path rather than a word.
fn looks_secret(word: &str) -> bool {
    if crate::context::sensitive::detect(word).is_some() {
        return true;
    }
    if word.contains(['@', '/', '\\', '=', '_']) || word.contains("://") {
        return true;
    }
    let digits = word.chars().filter(char::is_ascii_digit).count();
    let n = word.chars().count();
    // Long runs of letters and digits ("sk4f9…"), or mostly digits.
    (n >= 16 && digits > 0) || (n > 0 && digits * 2 > n)
}

// ── What was seen ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct Seen {
    pub from: String,
    pub to: String,
    pub count: u32,
    /// The count when it was last offered (0: never).
    #[serde(default)]
    pub asked_at: u32,
    /// Unix seconds.
    #[serde(default)]
    pub last: i64,
}

/// Word pairs seen, the ones the user said no to, and the offers waiting to
/// be shown. No field text.
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct Ledger {
    #[serde(default)]
    pub seen: Vec<Seen>,
    #[serde(default)]
    pub declined: Vec<(String, String)>,
    /// Due offers not shown yet (another card was up): offered next time.
    #[serde(default)]
    pub queued: Vec<(String, String)>,
}

impl Ledger {
    /// Count one sighting; true when it's time to offer it (and it's then
    /// queued until it is). Only a reusable fix is ever due.
    pub fn record(&mut self, from: &str, to: &str, now: i64) -> bool {
        if self.declined.iter().any(|(f, t)| f == from && t == to) {
            return false;
        }
        let i = match self.seen.iter().position(|s| s.from == from && s.to == to) {
            Some(i) => i,
            None => {
                self.seen.push(Seen {
                    from: from.into(),
                    to: to.into(),
                    ..Default::default()
                });
                self.seen.len() - 1
            }
        };
        let s = &mut self.seen[i];
        s.count = s.count.saturating_add(1);
        s.last = now;
        let due = s.count >= ASK_AFTER
            && (s.asked_at == 0 || s.count >= s.asked_at + ASK_AGAIN_AFTER)
            && verdict_after(from, to, s.count) == Verdict::Reusable;
        if due && !self.is_queued(from, to) {
            self.queued.push((from.into(), to.into()));
        }
        if self.seen.len() > KEEP {
            // The least recently seen go, never one waiting to be offered.
            self.seen.sort_by_key(|s| {
                let queued = self.queued.iter().any(|(f, t)| *f == s.from && *t == s.to);
                (std::cmp::Reverse(queued), std::cmp::Reverse(s.last))
            });
            self.seen.truncate(KEEP);
        }
        due
    }

    fn is_queued(&self, from: &str, to: &str) -> bool {
        self.queued.iter().any(|(f, t)| f == from && t == to)
    }

    /// The next offer waiting to be shown.
    pub fn next_queued(&self) -> Option<(String, String)> {
        self.queued.first().cloned()
    }

    /// Shown: no longer queued, and asked at this count.
    pub fn asked(&mut self, from: &str, to: &str) {
        self.queued.retain(|(f, t)| !(f == from && t == to));
        if let Some(s) = self.seen.iter_mut().find(|s| s.from == from && s.to == to) {
            s.asked_at = s.count;
        }
    }

    /// Learned or declined: no longer counted or queued.
    pub fn forget(&mut self, from: &str, to: &str) {
        self.seen.retain(|s| !(s.from == from && s.to == to));
        self.queued.retain(|(f, t)| !(f == from && t == to));
    }

    pub fn decline(&mut self, from: &str, to: &str) {
        self.forget(from, to);
        if !self.declined.iter().any(|(f, t)| f == from && t == to) {
            self.declined.push((from.into(), to.into()));
        }
    }
}

/// Already remembered: the custom word for a casing fix, the swap otherwise.
pub fn known(settings: &AppSettings, from: &str, to: &str) -> bool {
    if from.to_lowercase() == to.to_lowercase() {
        settings.custom_words.iter().any(|w| w == to)
    } else {
        settings
            .word_replacements
            .iter()
            .any(|r| r.from.eq_ignore_ascii_case(from) && r.to == to)
    }
}

fn ledger_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::portable::app_data_dir(app)
        .ok()
        .map(|d| d.join("corrections.json"))
}

/// A ledger that couldn't be saved, kept here so the next change builds on
/// it instead of on the older file (and the save is tried again then).
static UNSAVED: Mutex<Option<Ledger>> = Mutex::new(None);

/// Read the ledger at `path`. A file that's there but can't be read as a
/// ledger is moved aside (kept for a person to look at), never overwritten.
fn load_ledger(path: &std::path::Path) -> Ledger {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Ledger::default();
    };
    match serde_json::from_str(&raw) {
        Ok(ledger) => ledger,
        Err(e) => {
            let aside = path.with_extension(format!(
                "unreadable-{}.json",
                chrono::Utc::now().timestamp()
            ));
            match std::fs::rename(path, &aside) {
                Ok(()) => log::warn!(
                    "corrections: the ledger couldn't be read ({e}); kept it as {}",
                    aside.display()
                ),
                Err(err) => log::warn!(
                    "corrections: the ledger couldn't be read ({e}) or set aside ({err})"
                ),
            }
            Ledger::default()
        }
    }
}

/// Save the ledger; on failure keep it in memory for the next change.
fn save_ledger(path: &std::path::Path, ledger: &Ledger) {
    let saved = serde_json::to_string(ledger)
        .map_err(|e| e.to_string())
        .and_then(|json| std::fs::write(path, json).map_err(|e| e.to_string()));
    let mut unsaved = UNSAVED.lock().unwrap_or_else(|p| p.into_inner());
    match saved {
        Ok(()) => *unsaved = None,
        Err(e) => {
            log::warn!("corrections: couldn't save; keeping them in memory: {e}");
            *unsaved = Some(ledger.clone());
        }
    }
}

fn with_ledger<T>(app: &AppHandle, f: impl FnOnce(&mut Ledger) -> T) -> Option<T> {
    let _g = LEDGER_LOCK.lock().ok()?;
    let path = ledger_path(app)?;
    let pending = UNSAVED.lock().unwrap_or_else(|p| p.into_inner()).take();
    let retry = pending.is_some();
    let mut ledger = pending.unwrap_or_else(|| load_ledger(&path));
    let before = ledger.clone();
    let out = f(&mut ledger);
    if retry || ledger != before {
        save_ledger(&path, &ledger);
    }
    Some(out)
}

// ── Watching after a paste ───────────────────────────────────────────────

/// After a paste of `text`: watch the field it went into, off the caller's
/// thread. Nothing when the setting is off, the text was sent at once
/// (auto-submit), or the field can't be read.
pub fn watch(app: &AppHandle, text: &str) {
    let s = settings::get_settings(app);
    if !s.learn_corrections
        || s.auto_submit
        || s.paste_method == settings::PasteMethod::None
        || !SIZE_POLICY.watch_paste(text.split_whitespace().count())
    {
        return;
    }
    let pasted = if s.append_trailing_space {
        format!("{text} ")
    } else {
        text.to_string()
    };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("corrections".into())
        .spawn(move || run_watch(&app, &pasted, generation, &s.agent.never_watch));
    if let Err(e) = spawned {
        log::debug!("corrections: couldn't start watching: {e}");
    }
}

/// Where the pasted text sits in the field: what's before and after it.
fn anchor(value: &str, caret: Option<usize>, pasted: &str) -> Option<(String, String)> {
    let chars: Vec<char> = value.chars().collect();
    let (start, len) = caret
        .and_then(|c| crate::agent::writing::inserted_before_caret(value, c, pasted))
        .or_else(|| {
            // No caret: the last place it appears.
            let want = pasted.trim_end();
            let at = value.rfind(want)?;
            Some((value[..at].chars().count(), want.chars().count()))
        })?;
    Some((
        chars[..start].iter().collect(),
        chars[start + len..].iter().collect(),
    ))
}

/// The text between `prefix` and `suffix` now, if both are still there.
fn between<'a>(value: &'a str, prefix: &str, suffix: &str) -> Option<&'a str> {
    let rest = value.strip_prefix(prefix)?;
    rest.strip_suffix(suffix)
}

fn run_watch(app: &AppHandle, pasted: &str, generation: u64, never_watch: &[String]) {
    std::thread::sleep(Duration::from_millis(400));
    let Some(front) = crate::context::frontmost_app() else {
        return;
    };
    let Some(f) = field::focused_field(true, never_watch) else {
        log::debug!("corrections: the field can't be read here");
        return;
    };
    let Some(value) = f.value else {
        return;
    };
    if !SIZE_POLICY.read_field(value.chars().count()) {
        log::debug!("corrections: the field is too long to watch");
        return;
    }
    let Some((prefix, suffix)) = anchor(&value, f.caret, pasted) else {
        log::debug!("corrections: the pasted text isn't in the field");
        return;
    };
    let started = Instant::now();
    let mut latest: Option<String> = None;
    while started.elapsed() < WATCH_FOR {
        std::thread::sleep(POLL_EVERY);
        if GENERATION.load(Ordering::SeqCst) != generation {
            break;
        }
        if crate::context::frontmost_app().is_none_or(|a| a.pid != front.pid) {
            break;
        }
        // Gone (sent, cleared) or another field: what was seen last counts.
        let Some(now) = field::focused_field(true, never_watch).and_then(|f| f.value) else {
            break;
        };
        match between(&now, &prefix, &suffix) {
            Some(region) => latest = Some(region.to_string()),
            None => break,
        }
    }
    // Nothing edited still gives a queued offer its chance.
    let fixes = latest
        .map(|edited| substitutions(pasted, &edited))
        .unwrap_or_default();
    let s = settings::get_settings(app);
    let now = chrono::Utc::now().timestamp();
    // The next offer: one due now, or one queued from before (another card
    // was up then). Both stay queued until the offer is actually shown.
    let next = with_ledger(app, |l| {
        for (from, to) in &fixes {
            if known(&s, from, to) {
                continue;
            }
            let due = l.record(from, to, now);
            // Verdicts only: the words are the user's.
            log::debug!(
                "corrections: a fix seen ({:?}: {}){}",
                verdict(from, to).0,
                verdict(from, to).1,
                if due { "; due" } else { "" }
            );
        }
        // Remembered meanwhile (typed into Settings by hand): not offered.
        l.queued.retain(|(from, to)| !known(&s, from, to));
        l.next_queued()
    })
    .flatten();
    if let Some((from, to)) = next {
        offer(app, &from, &to);
    }
}

/// Offer to remember it: a quiet notice with Remember / Don't ask. Waits a
/// little for another card to go; if one stays, it stays queued and is
/// offered after a later paste.
fn offer(app: &AppHandle, from: &str, to: &str) {
    for _ in 0..10 {
        if !crate::hud::is_visible() {
            break;
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    if crate::hud::is_visible() {
        return;
    }
    with_ledger(app, |l| l.asked(from, to));
    let pair = serde_json::json!({ "from": from, "to": to }).to_string();
    use crate::agent::notice::{offer, Notice};
    Notice::cant("hud.learn.offer")
        .var("from", from)
        .var("to", to)
        .offer(offer::LEARN_WORD, "hud.learn.remember", pair.clone())
        .offer(offer::LEARN_SKIP, "hud.learn.never", pair)
        .show(app);
}

fn parse_pair(value: &str) -> Option<(String, String)> {
    let v: serde_json::Value = serde_json::from_str(value).ok()?;
    Some((
        v.get("from")?.as_str()?.to_string(),
        v.get("to")?.as_str()?.to_string(),
    ))
}

/// Remember: a casing fix becomes a custom word; a different spelling an
/// exact swap (and its spelling a custom word, so speech models hear it).
pub fn accept(app: &AppHandle, value: &str) {
    let Some((from, to)) = parse_pair(value) else {
        return;
    };
    let mut s = settings::get_settings(app);
    if !s.custom_words.iter().any(|w| w == &to) && to.chars().count() <= 50 {
        s.custom_words.push(to.clone());
    }
    if from.to_lowercase() != to.to_lowercase() && !known(&s, &from, &to) {
        s.word_replacements
            .retain(|r| !r.from.eq_ignore_ascii_case(&from));
        s.word_replacements.push(WordReplacement {
            from: from.clone(),
            to: to.clone(),
        });
    }
    settings::write_settings(app, s);
    let _ = app.emit(
        "settings-changed",
        serde_json::json!({ "setting": "custom_words" }),
    );
    with_ledger(app, |l| l.forget(&from, &to));
    crate::agent::notice::Notice::done("hud.learn.added")
        .var("to", to)
        .show(app);
}

/// Don't ask about this one again.
pub fn decline(app: &AppHandle, value: &str) {
    if let Some((from, to)) = parse_pair(value) {
        with_ledger(app, |l| l.decline(&from, &to));
    }
    crate::hud::hide(app);
}

/// The user's swaps applied to `text`.
pub fn apply(text: &str, replacements: &[WordReplacement]) -> String {
    if replacements.is_empty() {
        return text.to_string();
    }
    let pairs: Vec<(String, String)> = replacements
        .iter()
        .map(|r| (r.from.clone(), r.to.clone()))
        .collect();
    crate::audio_toolkit::apply_word_replacements(text, &pairs)
}

// ── Settings ─────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub fn change_learn_corrections_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.learn_corrections = enabled;
    settings::write_settings(&app, s);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn update_word_replacements(
    app: AppHandle,
    replacements: Vec<WordReplacement>,
) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.word_replacements = replacements;
    settings::write_settings(&app, s);
    Ok(())
}

/// Whether text fields can be read here at all (macOS: Accessibility
/// allowed; Linux: AT-SPI on; Windows: always).
#[tauri::command]
#[specta::specta]
pub fn can_read_text_fields() -> bool {
    crate::context::accessibility_trusted()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(a: &str, b: &str) -> Vec<(String, String)> {
        substitutions(a, b)
    }

    fn p(from: &str, to: &str) -> (String, String) {
        (from.to_string(), to.to_string())
    }

    #[test]
    fn finds_a_fixed_name_and_casing() {
        assert_eq!(
            pairs("Thanks Anna, see you then.", "Thanks Ana, see you then."),
            vec![p("Anna", "Ana")]
        );
        assert_eq!(
            pairs(
                "We deploy on kubernetes every week.",
                "We deploy on Kubernetes every week."
            ),
            vec![p("kubernetes", "Kubernetes")]
        );
        assert_eq!(
            pairs("Ask chat GPT about it", "Ask ChatGPT about it"),
            vec![p("chat GPT", "ChatGPT")]
        );
    }

    #[test]
    fn typing_on_is_not_a_fix() {
        assert!(pairs("Thanks Anna", "Thanks Anna, see you at five").is_empty());
        assert!(pairs("Thanks Anna", "Thanks Anna").is_empty());
    }

    #[test]
    fn rewrites_and_grammar_teach_nothing() {
        // Many words changed.
        assert!(pairs(
            "I think we should ship it next week",
            "Let's ship it on Monday instead, I reckon"
        )
        .is_empty());
        // A different everyday word.
        assert!(pairs("put it over their", "put it over there").is_empty());
        assert!(pairs("that was great", "that was awesome").is_empty());
        // Sentence casing.
        assert!(pairs("the plan is fine", "The plan is fine").is_empty());
        // Punctuation only.
        assert!(pairs("Thanks Anna", "Thanks Anna!").is_empty());
    }

    #[test]
    fn never_learns_keys_addresses_or_numbers() {
        assert!(!learnable("sk4f9a8b7c6d5e4f3g", "sk4f9a8b7c6d5e4f3h"));
        assert!(!learnable("anna", "anna@example.com"));
        assert!(!learnable("12345", "12346"));
        assert!(!learnable("token", "tok=en"));
        assert!(learnable("Anna", "Ana"));
        assert!(learnable("Jon", "John"));
        assert!(!learnable("Hello", "hello"));
    }

    #[test]
    fn offers_after_the_fix_recurs_and_respects_no() {
        let mut l = Ledger::default();
        assert!(!l.record("Anna", "Ana", 1));
        assert!(l.record("Anna", "Ana", 2));
        l.asked("Anna", "Ana");
        // Faded unanswered: asked again a few sightings later.
        assert!(!l.record("Anna", "Ana", 3));
        assert!(!l.record("Anna", "Ana", 4));
        assert!(l.record("Anna", "Ana", 5));
        l.decline("Anna", "Ana");
        for t in 6..12 {
            assert!(!l.record("Anna", "Ana", t));
        }
        assert!(l.seen.is_empty());
    }

    #[test]
    fn keeps_a_bounded_ledger() {
        let mut l = Ledger::default();
        for i in 0..(KEEP + 20) {
            l.record(&format!("w{i}"), &format!("W{i}"), i as i64);
        }
        assert_eq!(l.seen.len(), KEEP);
        assert!(l.seen.iter().all(|s| s.last >= 20));
    }

    #[test]
    fn anchors_the_pasted_text_in_the_field() {
        let value = "Hi team, Thanks Anna see you. Bye";
        let (pre, suf) = anchor(value, Some(29), "Thanks Anna see you.").unwrap();
        assert_eq!(pre, "Hi team, ");
        assert_eq!(suf, " Bye");
        assert_eq!(
            between("Hi team, Thanks Ana see you. Bye", &pre, &suf),
            Some("Thanks Ana see you.")
        );
        assert_eq!(between("Something else", &pre, &suf), None);
        // Without a caret: its last appearance.
        let (pre, suf) = anchor("a b a", None, "a").unwrap();
        assert_eq!((pre.as_str(), suf.as_str()), ("a b ", ""));
    }

    #[test]
    fn knows_what_is_already_remembered() {
        let s = AppSettings {
            custom_words: vec!["Kubernetes".into()],
            word_replacements: vec![WordReplacement {
                from: "Anna".into(),
                to: "Ana".into(),
            }],
            ..Default::default()
        };
        assert!(known(&s, "kubernetes", "Kubernetes"));
        assert!(known(&s, "anna", "Ana"));
        assert!(!known(&s, "Jon", "John"));
    }

    #[test]
    fn judges_fixes_three_ways() {
        use Verdict::*;
        // Names and terms: they'll come back.
        for (from, to) in [
            ("Anna", "Ana"),
            ("Jon", "John"),
            ("kubernetes", "Kubernetes"),
            ("iphone", "iPhone"),
            ("chat GPT", "ChatGPT"),
            ("Nowakowsky", "Nowakowski"),
            ("grafanna", "grafana"),
        ] {
            assert_eq!(verdict(from, to).0, Reusable, "{from} → {to}");
        }
        // Right for this sentence only.
        for (from, to) in [
            ("meeting", "meetings"),
            ("Anna", "Anna's"),
            ("deploy", "deployed"),
            ("their", "there"),
            ("great", "awesome"),
            ("Hello", "hello"),
            ("meeting", "Meeting"),
            ("12345", "12346"),
            ("anna", "anna@example.com"),
            ("Kowalski", "Smith"),
        ] {
            assert_eq!(verdict(from, to).0, Specific, "{from} → {to}");
        }
        // Could be either: wait.
        for (from, to) in [
            ("graet", "great"), // a misheard everyday word
            ("zorp", "zarp"),   // a short lowercase word
            ("abc", "abd"),     // too short to tell
            ("chat gpt", "chatgpt"),
            ("Kasia", "Kacha"), // spelt quite differently
        ] {
            assert_eq!(verdict(from, to).0, Uncertain, "{from} → {to}");
        }
    }

    #[test]
    fn uncertain_is_never_offered_until_it_keeps_happening() {
        let mut l = Ledger::default();
        // Uncertain: counted, not offered at the usual second sighting…
        for t in 1..CONFIRM_AFTER {
            assert!(!l.record("zorp", "zarp", i64::from(t)), "sighting {t}");
        }
        assert!(l.queued.is_empty());
        // …until the same fix has been made often enough to be the user's.
        assert!(l.record("zorp", "zarp", 99));
        assert_eq!(l.next_queued(), Some(p("zorp", "zarp")));
        // Specific fixes never get as far as the ledger.
        assert!(pairs("We had a meeting today", "We had a meetings today").is_empty());
        // Uncertain ones do (to be counted).
        assert_eq!(
            pairs("say zorp now", "say zarp now"),
            vec![p("zorp", "zarp")]
        );
    }

    #[test]
    fn a_due_offer_stays_queued_until_shown() {
        let mut l = Ledger::default();
        l.record("Anna", "Ana", 1);
        assert!(l.record("Anna", "Ana", 2));
        // Another card was up: nothing shown, still queued, not doubled.
        assert_eq!(l.next_queued(), Some(p("Anna", "Ana")));
        l.record("Anna", "Ana", 3);
        assert_eq!(l.queued.len(), 1);
        // A full ledger drops the oldest sightings, never a queued offer.
        for i in 0..(KEEP + 20) {
            l.record(&format!("w{i}"), &format!("W{i}"), 100 + i as i64);
        }
        assert_eq!(l.seen.len(), KEEP);
        assert!(l.seen.iter().any(|s| s.from == "Anna"));
        assert_eq!(l.next_queued(), Some(p("Anna", "Ana")));
        // Shown: off the queue.
        l.asked("Anna", "Ana");
        assert!(!l.is_queued("Anna", "Ana"));
        // The queue survives a save and a load (older files have none).
        let json = serde_json::to_string(&l).unwrap();
        assert_eq!(serde_json::from_str::<Ledger>(&json).unwrap(), l);
        let old: Ledger = serde_json::from_str(r#"{"seen":[],"declined":[]}"#).unwrap();
        assert!(old.queued.is_empty());
    }

    #[test]
    fn an_unreadable_ledger_is_set_aside_not_overwritten() {
        let dir =
            std::env::temp_dir().join(format!("ambient-corrections-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("corrections.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(load_ledger(&path), Ledger::default());
        assert!(!path.exists());
        let kept: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().contains("unreadable"))
            .collect();
        assert_eq!(kept.len(), 1);
        assert_eq!(
            std::fs::read_to_string(kept[0].path()).unwrap(),
            "{ not json"
        );
        // A save that fails keeps the ledger in memory for the next change.
        let mut l = Ledger::default();
        l.record("Anna", "Ana", 1);
        save_ledger(&dir.join("missing-dir").join("corrections.json"), &l);
        assert_eq!(UNSAVED.lock().unwrap().take(), Some(l.clone()));
        save_ledger(&path, &l);
        assert_eq!(load_ledger(&path), l);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn size_policy_decides_what_is_considered() {
        let policy = SIZE_POLICY;
        assert!(!policy.watch_paste(0));
        assert!(policy.watch_paste(12));
        assert!(!policy.watch_paste(policy.max_words + 1));
        assert!(policy.read_field(5_000));
        assert!(!policy.read_field(policy.max_field_chars + 1));
        // Four separate edits is a rewrite, and so is changing half of it.
        assert!(!policy.fixes(40, 4, 4));
        assert!(!policy.fixes(10, 1, 5));
        assert!(policy.fixes(10, 2, 2));
        // A long paste is never diffed.
        let long = "word ".repeat(policy.max_words + 1);
        assert!(substitutions(&long, &long.replacen("word", "Word", 1)).is_empty());
    }
}
