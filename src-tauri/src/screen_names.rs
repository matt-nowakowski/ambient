//! Names on screen: spelling a dictation the way the window spells it.
//!
//! When the user dictates into a text field and screen context is allowed, a
//! background thread reads the frontmost window's text and keeps the names
//! and rare words it finds: capitalised tokens, @handles, product names,
//! email display names. They become a temporary vocabulary for that one
//! dictation — the fuzzy custom-words pass and the polish prompt consult it —
//! and are dropped when the dictation ends.
//!
//! The read starts at key-down and runs beside the recording, so it never
//! blocks the paste: if the names are not ready when the transcript is, the
//! dictation simply runs without them. The window text never leaves the
//! computer to find them.

use crate::audio_toolkit::text::is_common_word;
use crate::context::redact::redact;
use crate::settings;
use log::{debug, trace};
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, TryLockError};
use std::time::Instant;
use tauri::AppHandle;

/// Characters of the window read for names: enough for a message list, not a
/// whole document.
const SCREEN_CHARS: usize = 6000;
/// Most names kept for one dictation: a vocabulary, not a dictionary.
const MAX_NAMES: usize = 40;
/// Names put in the polish prompt. The rest stay only in the fuzzy pass.
const MAX_HINT_NAMES: usize = 20;

/// Closed-class words and chat chatter that are never a name on their own.
/// `is_common_word` covers the BIP-39 list; this fills its gaps ("the",
/// "and", "hey" and "let", for example, are not BIP-39 words).
const FUNCTION_WORDS: &[&str] = &[
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "nor",
    "yet",
    "so",
    "if",
    "then",
    "than",
    "as",
    "of",
    "to",
    "in",
    "on",
    "at",
    "for",
    "with",
    "without",
    "from",
    "by",
    "into",
    "onto",
    "over",
    "under",
    "about",
    "after",
    "before",
    "between",
    "during",
    "through",
    "up",
    "down",
    "off",
    "out",
    "again",
    "also",
    "too",
    "very",
    "just",
    "only",
    "even",
    "still",
    "ever",
    "never",
    "always",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "what",
    "which",
    "who",
    "whom",
    "whose",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "mine",
    "we",
    "us",
    "our",
    "ours",
    "you",
    "your",
    "yours",
    "he",
    "him",
    "his",
    "she",
    "her",
    "hers",
    "it",
    "its",
    "they",
    "them",
    "their",
    "theirs",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "am",
    "do",
    "does",
    "did",
    "have",
    "has",
    "had",
    "will",
    "would",
    "can",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "not",
    "no",
    "yes",
    "yeah",
    "yep",
    "nope",
    "ok",
    "okay",
    "sure",
    "hey",
    "hi",
    "hello",
    "please",
    "thanks",
    "thank",
    "cheers",
    "regards",
    "best",
    "dear",
    "re",
    "fwd",
    "fw",
    "subject",
    "sent",
    "cc",
    "bcc",
    "fyi",
    "tldr",
    "ps",
    "btw",
    "imo",
    "asap",
    "psa",
    "wfh",
    "ooo",
    "nm",
    "new",
    "let",
    "lets",
    "ill",
    "im",
    "ive",
    "got",
    "get",
    "gets",
    "going",
    "gonna",
    "wanna",
    "well",
    "much",
    "many",
    "more",
    "most",
    "less",
    "least",
    "some",
    "any",
    "all",
    "both",
    "each",
    "few",
    "other",
    "others",
    "another",
    "same",
    "own",
    "such",
    "none",
    "nothing",
    "anything",
    "something",
    "everything",
    "everyone",
    "anyone",
    "someone",
    "nobody",
    "really",
    "actually",
    "basically",
    "anyway",
    "maybe",
    "perhaps",
    "probably",
    "definitely",
    "today",
    "tomorrow",
    "yesterday",
    "now",
    "soon",
    "later",
    "tonight",
    "morning",
    "evening",
    "afternoon",
    "day",
    "week",
    "month",
    "year",
    "one",
    "two",
    "three",
    "first",
    "second",
    "third",
    "next",
    "last",
    "end",
    "top",
    "bottom",
    "left",
    "right",
    "open",
    "close",
    "closed",
    "old",
    "good",
    "great",
    "nice",
    "bad",
    "fine",
    "true",
    "false",
    "general",
    "random",
    "inbox",
    "drafts",
    "unread",
    "archive",
    "spam",
    "trash",
    "activity",
    "threads",
];

/// Words dropped from the start or end of a capitalised phrase ("The
/// ChargeBee" → "ChargeBee", "Hey Ana" → "Ana"). Deliberately small: "New"
/// is left in place so "New York" survives.
const EDGE_WORDS: &[&str] = &[
    "the", "a", "an", "of", "to", "in", "on", "at", "for", "and", "or", "but", "from", "with",
    "by", "hey", "hi", "hello", "dear", "re", "fwd", "fw", "subject", "cc", "bcc", "thanks",
    "thank", "best", "regards", "cheers", "sent", "date",
];

/// Role and channel handles that are not names ("@general", "@support").
const HANDLE_STOP: &[&str] = &[
    "general",
    "random",
    "here",
    "everyone",
    "all",
    "channel",
    "channels",
    "team",
    "teams",
    "support",
    "help",
    "admin",
    "info",
    "news",
    "updates",
    "noreply",
    "billing",
    "sales",
    "marketing",
    "design",
    "product",
    "ops",
    "dev",
    "test",
    "tests",
    "main",
    "announcements",
    "engineering",
    "eng",
    "hr",
    "legal",
    "finance",
    "security",
    "accounting",
];

static EMAIL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)([a-z0-9][a-z0-9._%+\-]{0,63})@[a-z0-9\-]+(?:\.[a-z0-9\-]+)+")
        .expect("email pattern")
});

/// An @handle, but not the `@` inside an email address: it must follow a
/// boundary, not a letter or a dot.
static HANDLE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?:^|[\s(\[<{,;:'\-])@([A-Za-z0-9][A-Za-z0-9._\-]{1,29})").expect("handle pattern")
});

/// The names read for the dictation now in progress, and the generation that
/// owns them so a slow read can't land on a later dictation.
struct Session {
    generation: u64,
    /// None until the reader finishes; then the names it found.
    names: Option<Vec<String>>,
}

static SESSION: Mutex<Session> = Mutex::new(Session {
    generation: 0,
    names: None,
});
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Begin reading names for a dictation starting now. Cheap to call: the read
/// itself runs on its own thread, beside the recording. Does nothing when the
/// user hasn't allowed reading the screen.
pub fn begin(app: &AppHandle) {
    let generation = NEXT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if let Ok(mut session) = SESSION.lock() {
        session.generation = generation;
        session.names = None;
    }

    let settings = settings::get_settings(app);
    if !settings.agent.screen_context || settings.agent.is_paused() {
        return;
    }
    let never_watch = settings.agent.never_watch.clone();
    let started = Instant::now();
    let spawned = std::thread::Builder::new()
        .name("screen-names".into())
        .spawn(move || {
            let names = match crate::context::snapshot(SCREEN_CHARS, &never_watch) {
                Ok(snapshot) => {
                    // The title holds names too ("Chat with Ana Ruiz").
                    let mut text = snapshot.window_title.clone();
                    if let Some(body) = snapshot.text.as_deref() {
                        text.push('\n');
                        text.push_str(body);
                    }
                    names_from(&text)
                }
                Err(reason) => {
                    trace!("screen names: no window to read ({reason:?})");
                    Vec::new()
                }
            };
            // One line per dictation: how long the read took, and how many
            // names it found, so it can be seen to finish well before the
            // transcript does.
            debug!(
                "screen names: {} ready in {:?}",
                names.len(),
                started.elapsed()
            );
            if names.is_empty() {
                return;
            }
            if let Ok(mut session) = SESSION.lock() {
                if session.generation == generation {
                    session.names = Some(names);
                }
            }
        });
    if let Err(e) = spawned {
        debug!("screen names: reader thread did not start: {e}");
    }
}

/// The names ready for the dictation in progress. Never waits: if the reader
/// is still working (or just finished), this returns whatever is there, so
/// the paste path can't be slowed by it.
pub fn read() -> Vec<String> {
    match SESSION.try_lock() {
        Ok(session) => session.names.clone().unwrap_or_default(),
        Err(TryLockError::Poisoned(poisoned)) => {
            poisoned.into_inner().names.clone().unwrap_or_default()
        }
        Err(TryLockError::WouldBlock) => Vec::new(),
    }
}

/// Drop the names read for the dictation that just finished.
pub fn clear() {
    if let Ok(mut session) = SESSION.lock() {
        session.names = None;
    }
}

/// The user's custom words plus this dictation's screen names, for the fuzzy
/// pass and the model's vocabulary slot. Custom words come first: they win
/// when a name and a custom word are the same word, case aside.
pub fn merged_words(custom: &[String]) -> Vec<String> {
    let names = read();
    if names.is_empty() {
        return custom.to_vec();
    }
    let mut words = custom.to_vec();
    for name in names {
        if !words.iter().any(|w| w.eq_ignore_ascii_case(&name)) {
            words.push(name);
        }
    }
    // The read already happened off the paste path; this only reports what it
    // left behind.
    trace!(
        "screen names: {} joined this dictation's vocabulary",
        words.len() - custom.len()
    );
    words
}

/// A line for the polish prompt: the names on screen, spelled as the window
/// spells them. `None` when there are none.
pub fn hint() -> Option<String> {
    let names = read();
    if names.is_empty() {
        return None;
    }
    let listed = names
        .iter()
        .take(MAX_HINT_NAMES)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!(
        "Names taken from the window the user is writing in, spelled as their screen spells them: {listed}. Use one of them only where it fits what was said; never change other words."
    ))
}

/// The names and rare words in a window's text. Everything is lower-cased for
/// comparison only; the returned spellings keep the window's own case.
fn names_from(text: &str) -> Vec<String> {
    // Secrets are blanked before anything is looked at, so a token that only
    // looks like a name can never be one.
    let (clean, _) = redact(text);

    let mut candidates: Vec<(String, i32)> = Vec::new();
    for (phrase, sentence_initial) in name_phrases(&clean) {
        candidates.extend(phrase_names(&phrase, sentence_initial));
    }
    // Handles and email locals are strong evidence of a name.
    for name in marked_names(&clean) {
        candidates.push((name, 6));
    }

    // Deduplicate case- and spacing-insensitively ("Ana Ruiz" and "@ana.ruiz"
    // are the same name), keeping the best-scoring spelling.
    let mut best: HashMap<String, (String, i32)> = HashMap::new();
    for (text, score) in candidates {
        let key = match_key(&text);
        if key.chars().count() < 2 {
            continue;
        }
        match best.get(&key) {
            Some((_, existing)) if *existing >= score => {}
            _ => {
                best.insert(key, (text, score));
            }
        }
    }

    let mut items: Vec<(String, i32)> = best.into_values().collect();
    items.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| b.0.chars().count().cmp(&a.0.chars().count()))
            .then_with(|| a.0.cmp(&b.0))
    });
    items.truncate(MAX_NAMES);
    items.into_iter().map(|(text, _)| text).collect()
}

/// Capitalised phrases in order, each with whether its first token opened a
/// sentence (used to stay away from sentence-initial ordinary words).
fn name_phrases(text: &str) -> Vec<(String, bool)> {
    let mut out: Vec<(String, bool)> = Vec::new();
    // Each line starts a sentence: a name on one line never joins the
    // capitalised word that opens the next.
    for line in text.lines() {
        let mut current: Vec<String> = Vec::new();
        let mut current_initial = false;
        let mut sentence_start = true;
        for chunk in line.split_whitespace() {
            let token = strip_edges(chunk);
            if token.is_empty() {
                if ends_clause(chunk) {
                    flush(&mut current, &mut current_initial, &mut out);
                    sentence_start = true;
                }
                continue;
            }
            if is_name_like(token) {
                if current.is_empty() {
                    current_initial = sentence_start;
                }
                current.push(token.to_string());
            } else {
                flush(&mut current, &mut current_initial, &mut out);
            }
            if ends_clause(chunk) {
                flush(&mut current, &mut current_initial, &mut out);
                sentence_start = true;
            } else {
                sentence_start = false;
            }
        }
        flush(&mut current, &mut current_initial, &mut out);
    }
    out
}

fn flush(current: &mut Vec<String>, current_initial: &mut bool, out: &mut Vec<(String, bool)>) {
    if !current.is_empty() {
        out.push((current.join(" "), *current_initial));
        current.clear();
    }
}

/// The names a capitalised phrase yields: the phrase itself, and (so a first
/// name said alone still lands) its longer words.
fn phrase_names(phrase: &str, sentence_initial: bool) -> Vec<(String, i32)> {
    let original: Vec<&str> = phrase.split(' ').collect();
    if original.is_empty() {
        return Vec::new();
    }
    let mut words: Vec<&str> = original.clone();
    while words.len() > 1 && is_edge_word(words[0]) {
        words.remove(0);
    }
    while words.len() > 1 && is_edge_word(words[words.len() - 1]) {
        words.pop();
    }
    // Trimming a leading word moves the phrase off the sentence start.
    let initial = sentence_initial && words.first() == original.first();

    match words.len() {
        0 => Vec::new(),
        1 => {
            let word = words[0];
            if is_ordinary(word) || (initial && !distinctive(word)) {
                return Vec::new();
            }
            vec![(word.to_string(), 2 + i32::from(distinctive(word)))]
        }
        _ => {
            if words.iter().all(|word| is_ordinary(word)) {
                return Vec::new();
            }
            let mut out = vec![(words.join(" "), 5)];
            for word in &words {
                if word.chars().count() >= 3 && !is_ordinary(word) {
                    out.push((word.to_string(), 3));
                }
            }
            out
        }
    }
}

/// Names from @handles and email addresses. A bare email local part counts
/// only when it looks like "first.last"; a handle counts unless it names a
/// role or channel.
fn marked_names(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for captures in EMAIL.captures_iter(text) {
        if let Some(name) = name_from_parts(&captures[1], true) {
            out.push(name);
        }
    }
    for captures in HANDLE.captures_iter(text) {
        if let Some(name) = name_from_parts(&captures[1], false) {
            out.push(name);
        }
    }
    out
}

fn name_from_parts(raw: &str, require_separator: bool) -> Option<String> {
    if require_separator && !raw.contains(['.', '_', '-', '+']) {
        return None;
    }
    let parts: Vec<String> = raw
        .split(['.', '_', '-', '+'])
        .filter(|part| part.chars().count() >= 2 && part.chars().all(char::is_alphabetic))
        .filter(|part| {
            let lower = part.to_lowercase();
            !is_ordinary(&lower) && !HANDLE_STOP.contains(&lower.as_str())
        })
        .map(capitalize)
        .collect();
    if parts.is_empty() {
        return None;
    }
    let name = parts.join(" ");
    (name.chars().count() <= 40).then_some(name)
}

/// Whether a whitespace chunk names something: it opens with a capital, or
/// hides one inside ("GitHub", "ChargeBee"), or is a short acronym ("API").
fn is_name_like(token: &str) -> bool {
    let chars: Vec<char> = token.chars().collect();
    let len = chars.len();
    if !(2..=40).contains(&len) {
        return false;
    }
    if !chars
        .iter()
        .all(|c| c.is_alphabetic() || matches!(c, '\'' | '\u{2019}' | '-' | '.'))
    {
        return false;
    }
    if !chars.iter().any(|c| c.is_alphabetic()) {
        return false;
    }
    // An all-caps token ("PM", "ASAP") is only a name when it is a short
    // acronym; otherwise the whole thing being shouted is the signal, not a name.
    if chars.iter().all(|c| !c.is_lowercase()) {
        return (3..=6).contains(&len);
    }
    let first_upper = chars[0].is_uppercase();
    let internal_upper = chars.iter().skip(1).any(|c| c.is_uppercase());
    first_upper || internal_upper
}

/// A spelling that isn't just a capitalised ordinary word: it carries an
/// uppercase inside, or is a short acronym.
fn distinctive(word: &str) -> bool {
    let chars: Vec<char> = word.chars().collect();
    let internal_upper = chars.iter().skip(1).any(|c| c.is_uppercase());
    let acronym = (3..=6).contains(&chars.len()) && chars.iter().all(|c| !c.is_lowercase());
    internal_upper || acronym
}

/// An everyday word that a lone capitalised token must not be taken for.
fn is_ordinary(word: &str) -> bool {
    let lower = word.to_lowercase();
    is_common_word(&lower) || FUNCTION_WORDS.contains(&lower.as_str())
}

fn is_edge_word(word: &str) -> bool {
    EDGE_WORDS.contains(&word.to_lowercase().as_str())
}

/// Strips leading and trailing punctuation, keeping what sits inside a word.
fn strip_edges(chunk: &str) -> &str {
    chunk.trim_matches(|c: char| !c.is_alphanumeric())
}

/// Whether a chunk ends a clause, so the next capital starts a new sentence.
fn ends_clause(chunk: &str) -> bool {
    chunk
        .chars()
        .next_back()
        .is_some_and(|c| matches!(c, '.' | '!' | '?' | '\u{2026}' | ':' | ';'))
}

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
        None => String::new(),
    }
}

/// A comparison key: lower-cased alphanumerics only, so "Ana Ruiz" and
/// "@ana.ruiz" collapse to the same name.
fn match_key(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::apply_custom_words;

    const THRESHOLD: f64 = 0.18;

    #[test]
    fn slack_screen_yields_the_names_it_shows() {
        let screen = "Acme Corp\n#engineering\n9:41 AM\nAna Ruiz  3:12 PM\n\
            Hey, can you take a look at the ChargeBee invoice before the call?\n\
            Marcus Lee  3:14 PM\nSure. Also, @dana.kim sent the Figma link. Thanks!";
        let names = names_from(screen);
        for expected in ["Ana Ruiz", "Marcus Lee", "ChargeBee", "Dana Kim", "Figma"] {
            assert!(
                names.contains(&expected.to_string()),
                "{expected} in {names:?}"
            );
        }
        for ordinary in [
            "Hey",
            "Sure",
            "Thanks",
            "Also",
            "the",
            "call",
            "engineering",
        ] {
            assert!(
                !names.iter().any(|n| n.eq_ignore_ascii_case(ordinary)),
                "{ordinary} should not be a name: {names:?}"
            );
        }
    }

    #[test]
    fn mail_screen_yields_people_and_products() {
        let screen = "Inbox\nAna Ruiz <ana.ruiz@example.com>\n\
            Invoice from ChargeBee, paid with Stripe.\n\
            Hi Matt, please review the Acme contract by Friday.";
        let names = names_from(screen);
        for expected in ["Ana Ruiz", "ChargeBee", "Stripe", "Matt", "Acme"] {
            assert!(
                names.contains(&expected.to_string()),
                "{expected} in {names:?}"
            );
        }
        assert!(!names.iter().any(|n| n == "Invoice"), "{names:?}");
    }

    #[test]
    fn a_name_on_screen_fixes_the_dictation() {
        let names = names_from("Ana Ruiz  3:12 PM\nChargeBee invoice");
        assert!(names.contains(&"Ana Ruiz".to_string()), "{names:?}");
        assert_eq!(
            apply_custom_words(
                "Anna Ruiz, can you send the ChargeBee invoice?",
                &names,
                THRESHOLD
            ),
            "Ana Ruiz, can you send the ChargeBee invoice?"
        );
    }

    #[test]
    fn ordinary_words_are_left_alone() {
        let names = names_from("Hey team, the meeting is at noon. Sure, that works. Thanks!");
        assert!(names.is_empty(), "{names:?}");
        let said = "the meeting is at noon and that works";
        assert_eq!(apply_custom_words(said, &names, THRESHOLD), said);
    }

    #[test]
    fn numbers_and_handles_that_are_not_names_are_skipped() {
        let names = names_from("Order 12345 shipped on 2026-11-04 by @general and @ana");
        assert_eq!(names, vec!["Ana".to_string()], "{names:?}");
    }

    #[test]
    fn secrets_never_become_names() {
        let names = names_from(
            "key sk-proj-abcdefghijklmnopqrstuvwx and AKIAIOSFODNN7EXAMPLE, 
             password: hunter2",
        );
        assert!(names.is_empty(), "{names:?}");
    }

    #[test]
    fn session_names_are_read_once_then_cleared() {
        // Deliberately unlike any name another test might type, so the global
        // can't leak into one running beside it.
        let name = "Zqwwx Vybb".to_string();
        SESSION.lock().unwrap().generation = 1;
        SESSION.lock().unwrap().names = Some(vec![name.clone()]);
        assert_eq!(read(), vec![name.clone()]);
        assert_eq!(
            merged_words(&["Valenor".to_string()]),
            vec!["Valenor".to_string(), name]
        );
        assert!(hint().is_some());
        clear();
        assert!(read().is_empty());
        assert_eq!(
            merged_words(&["Valenor".to_string()]),
            vec!["Valenor".to_string()]
        );
        assert!(hint().is_none());
    }
}
