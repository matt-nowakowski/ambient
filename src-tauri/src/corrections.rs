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
/// Pairs kept (the least recently seen go first).
const KEEP: usize = 200;
/// Longest paste worth diffing, in words.
const MAX_WORDS: usize = 200;

/// A newer paste ends the current watch.
static GENERATION: AtomicU64 = AtomicU64::new(0);
static LEDGER_LOCK: Mutex<()> = Mutex::new(());

// ── What changed ─────────────────────────────────────────────────────────

/// The word swaps between what was pasted and what the field holds now:
/// one word for one ("Anna" → "Ana") or a few for one ("Chat GPT" →
/// "ChatGPT"), punctuation around them aside. Empty when it looks like a
/// rewrite rather than a fix, or nothing learnable changed.
pub fn substitutions(pasted: &str, edited: &str) -> Vec<(String, String)> {
    let a: Vec<&str> = pasted.split_whitespace().collect();
    let b: Vec<&str> = edited.split_whitespace().collect();
    if a.is_empty() || b.is_empty() || a.len() > MAX_WORDS || b.len() > MAX_WORDS * 2 {
        return Vec::new();
    }
    let hunks = diff_hunks(&a, &b);
    // Typing on after the pasted text is an insertion, not a fix.
    let edits: Vec<&(Vec<&str>, Vec<&str>)> =
        hunks.iter().filter(|(del, _)| !del.is_empty()).collect();
    let changed: usize = edits.iter().map(|(del, _)| del.len()).sum();
    if edits.len() > 3 || changed * 10 > a.len().max(3) * 4 {
        return Vec::new();
    }
    edits
        .into_iter()
        .filter(|(del, ins)| ins.len() == 1 && (1..=3).contains(&del.len()))
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

/// Whether `from` → `to` is a spelling fix worth remembering: a name or a
/// term, not a different word, a grammar fix, or something that looks like
/// a key, an address or a path.
pub fn learnable(from: &str, to: &str) -> bool {
    if from.is_empty() || to.is_empty() || from == to {
        return false;
    }
    if to.chars().count() > 40 || from.chars().count() > 60 || to.contains(char::is_whitespace) {
        return false;
    }
    if !to.chars().any(char::is_alphabetic) || looks_secret(from) || looks_secret(to) {
        return false;
    }
    let (fl, tl) = (from.to_lowercase(), to.to_lowercase());
    let common = crate::audio_toolkit::text::is_common_word;
    if fl == tl {
        // Casing: "kubernetes" → "Kubernetes", never a sentence's first
        // word ("the" → "The") or lowercasing ("Hello" → "hello").
        return !common(&tl) && to.chars().any(char::is_uppercase) && !from.contains(' ');
    }
    let squashed: String = fl.split_whitespace().collect();
    // Words run together into a name ("chat GPT" → "ChatGPT").
    if from.contains(' ') && squashed == tl {
        return to.chars().any(char::is_uppercase);
    }
    // A different everyday word is a rewrite or grammar ("their" → "there").
    if from.split_whitespace().any(|w| common(&w.to_lowercase())) {
        return false;
    }
    let dist = strsim::levenshtein(&squashed, &tl) as f64;
    let len = squashed.chars().count().max(tl.chars().count()) as f64;
    dist / len <= 0.5
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

/// Word pairs seen, and the ones the user said no to. No field text.
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct Ledger {
    #[serde(default)]
    pub seen: Vec<Seen>,
    #[serde(default)]
    pub declined: Vec<(String, String)>,
}

impl Ledger {
    /// Count one sighting; true when it's time to offer it.
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
        let due =
            s.count >= ASK_AFTER && (s.asked_at == 0 || s.count >= s.asked_at + ASK_AGAIN_AFTER);
        if self.seen.len() > KEEP {
            self.seen.sort_by_key(|s| std::cmp::Reverse(s.last));
            self.seen.truncate(KEEP);
        }
        due
    }

    pub fn asked(&mut self, from: &str, to: &str) {
        if let Some(s) = self.seen.iter_mut().find(|s| s.from == from && s.to == to) {
            s.asked_at = s.count;
        }
    }

    /// Learned or declined: no longer counted.
    pub fn forget(&mut self, from: &str, to: &str) {
        self.seen.retain(|s| !(s.from == from && s.to == to));
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

fn with_ledger<T>(app: &AppHandle, f: impl FnOnce(&mut Ledger) -> T) -> Option<T> {
    let _g = LEDGER_LOCK.lock().ok()?;
    let path = ledger_path(app)?;
    let mut ledger: Ledger = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let out = f(&mut ledger);
    if let Ok(json) = serde_json::to_string(&ledger) {
        if let Err(e) = std::fs::write(&path, json) {
            log::warn!("corrections: couldn't save: {e}");
        }
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
        || text.trim().is_empty()
        || text.split_whitespace().count() > MAX_WORDS
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
    let Some(edited) = latest else {
        return;
    };
    let fixes = substitutions(pasted, &edited);
    if fixes.is_empty() {
        return;
    }
    log::debug!("corrections: {} word fix(es) seen", fixes.len());
    let s = settings::get_settings(app);
    let now = chrono::Utc::now().timestamp();
    let due: Vec<(String, String)> = with_ledger(app, |l| {
        fixes
            .into_iter()
            .filter(|(from, to)| !known(&s, from, to))
            .filter(|(from, to)| l.record(from, to, now))
            .collect()
    })
    .unwrap_or_default();
    if let Some((from, to)) = due.into_iter().next() {
        offer(app, &from, &to);
    }
}

/// Offer to remember it: a quiet notice with Remember / Don't ask. Waits a
/// little for another card to go; if one stays, it's offered another time.
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
        let mut s = AppSettings::default();
        s.custom_words = vec!["Kubernetes".into()];
        s.word_replacements = vec![WordReplacement {
            from: "Anna".into(),
            to: "Ana".into(),
        }];
        assert!(known(&s, "kubernetes", "Kubernetes"));
        assert!(known(&s, "anna", "Ana"));
        assert!(!known(&s, "Jon", "John"));
    }
}
