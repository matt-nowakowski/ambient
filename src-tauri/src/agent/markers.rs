//! Spoken markers: words at the start or end of a dictation that say what
//! it is for, decided here before any model is asked.
//!
//! "Reply that it's fine", "tell her that I'm late", "write to them that…"
//! ask for a draft; "remind me…" (or "…, remind me") is a reminder; "note to
//! self: …" or "note: …" is text to type, whatever it sounds like. When one
//! is said, it is a hard signal: routing follows it instead of weighing it
//! as one hint among many, and the trigger itself is stripped from what is
//! typed or remembered.
//!
//! Matching works on words, so a trigger never fires inside a longer word
//! ("tell them that" does not match "tell them thatched…"); triggers are
//! tried longest first, so "write to them that" wins over "write to them".
//!
//! "Tell her …" without "that", and "tell him that …" in languages where
//! "that" is grammar rather than a choice ("dile que…", "powiedz mu że…"),
//! are as often the message itself, said to its reader: those stay with
//! `compose` and the model, as in 0.1.8. The languages
//! are the ones `compose` already reads (and Japanese, Chinese and Korean,
//! matched as text since they are written without spaces).

use once_cell::sync::Lazy;

use super::router::without_address;

/// What a marker says the dictation is for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// An instruction to write a message for the user.
    Draft,
    /// A reminder to set.
    Remind,
    /// Words to type as they are, never a request.
    Note,
}

/// A marker found in a dictation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Marked {
    pub kind: Kind,
    /// The trigger as it was said ("Tell her that").
    pub trigger: String,
    /// The rest of the dictation, without the trigger.
    pub body: String,
    /// Said at the end ("…, remind me") rather than the start.
    pub trailing: bool,
    /// The trigger is English (dates in it are read by `when`).
    pub english: bool,
}

impl Marked {
    /// What the writer is asked to do: the trigger still says who it's to
    /// and whether it's a reply, so it stays, in the order it means.
    pub fn instruction(&self) -> String {
        if self.trailing {
            format!("{}: {}", self.trigger, self.body)
        } else {
            format!("{} {}", self.trigger, self.body)
        }
    }
}

struct Trigger {
    words: Vec<String>,
    kind: Kind,
    english: bool,
    /// Needs a colon straight after ("note:"), so plain prose that starts
    /// with the word is left alone.
    colon: bool,
}

/// (trigger, kind, english). A trailing `:` means the colon is required.
const LEADING: &[(&str, Kind, bool)] = &[
    // ── English ──
    ("reply that", Kind::Draft, true),
    ("reply saying", Kind::Draft, true),
    ("reply and say", Kind::Draft, true),
    ("reply back saying", Kind::Draft, true),
    ("reply back that", Kind::Draft, true),
    ("respond that", Kind::Draft, true),
    ("respond saying", Kind::Draft, true),
    ("respond and say", Kind::Draft, true),
    ("answer saying", Kind::Draft, true),
    ("write back saying", Kind::Draft, true),
    ("write back that", Kind::Draft, true),
    ("write that", Kind::Draft, true),
    ("write to him", Kind::Draft, true),
    ("write to her", Kind::Draft, true),
    ("write to them", Kind::Draft, true),
    ("write to him that", Kind::Draft, true),
    ("write to her that", Kind::Draft, true),
    ("write to them that", Kind::Draft, true),
    ("tell him that", Kind::Draft, true),
    ("tell her that", Kind::Draft, true),
    ("tell them that", Kind::Draft, true),
    ("tell everyone that", Kind::Draft, true),
    ("tell the team that", Kind::Draft, true),
    ("let him know that", Kind::Draft, true),
    ("let her know that", Kind::Draft, true),
    ("let them know that", Kind::Draft, true),
    ("let everyone know that", Kind::Draft, true),
    ("let the team know that", Kind::Draft, true),
    ("remind me", Kind::Remind, true),
    ("set a reminder", Kind::Remind, true),
    ("set me a reminder", Kind::Remind, true),
    ("add a reminder", Kind::Remind, true),
    ("note to self", Kind::Note, true),
    ("take a note", Kind::Note, true),
    ("make a note", Kind::Note, true),
    ("note:", Kind::Note, true),
    ("type:", Kind::Note, true),
    // ── Polish ──
    ("odpisz że", Kind::Draft, false),
    ("odpisz mu że", Kind::Draft, false),
    ("odpisz jej że", Kind::Draft, false),
    ("odpisz im że", Kind::Draft, false),
    ("odpowiedz że", Kind::Draft, false),
    ("odpowiedz mu że", Kind::Draft, false),
    ("odpowiedz jej że", Kind::Draft, false),
    ("odpowiedz im że", Kind::Draft, false),
    ("napisz że", Kind::Draft, false),
    ("napisz mu że", Kind::Draft, false),
    ("napisz jej że", Kind::Draft, false),
    ("napisz im że", Kind::Draft, false),
    ("przypomnij mi", Kind::Remind, false),
    ("notatka:", Kind::Note, false),
    // ── German ──
    ("antworte dass", Kind::Draft, false),
    ("antworte ihm dass", Kind::Draft, false),
    ("antworte ihr dass", Kind::Draft, false),
    ("antworte ihnen dass", Kind::Draft, false),
    ("schreib ihm dass", Kind::Draft, false),
    ("schreib ihr dass", Kind::Draft, false),
    ("schreib ihnen dass", Kind::Draft, false),
    ("erinnere mich", Kind::Remind, false),
    ("erinner mich", Kind::Remind, false),
    ("notiz:", Kind::Note, false),
    // ── Spanish ──
    ("responde que", Kind::Draft, false),
    ("contesta que", Kind::Draft, false),
    ("contéstale que", Kind::Draft, false),
    ("respóndele que", Kind::Draft, false),
    ("escríbele que", Kind::Draft, false),
    ("recuérdame", Kind::Remind, false),
    ("nota:", Kind::Note, false),
    // ── French ──
    ("réponds que", Kind::Draft, false),
    ("réponds-lui que", Kind::Draft, false),
    ("répondez que", Kind::Draft, false),
    ("répondez-lui que", Kind::Draft, false),
    ("écris-lui que", Kind::Draft, false),
    ("rappelle-moi", Kind::Remind, false),
    ("rappelez-moi", Kind::Remind, false),
    // ── Italian ──
    ("rispondi che", Kind::Draft, false),
    ("rispondigli che", Kind::Draft, false),
    ("rispondile che", Kind::Draft, false),
    ("scrivigli che", Kind::Draft, false),
    ("scrivile che", Kind::Draft, false),
    ("ricordami", Kind::Remind, false),
    // ── Portuguese ──
    ("responda que", Kind::Draft, false),
    ("escreva que", Kind::Draft, false),
    ("lembra-me", Kind::Remind, false),
    ("lembre-me", Kind::Remind, false),
    // ── Dutch ──
    ("antwoord dat", Kind::Draft, false),
    ("herinner me", Kind::Remind, false),
    // ── Russian, Ukrainian ──
    ("ответь что", Kind::Draft, false),
    ("ответь ему что", Kind::Draft, false),
    ("ответь ей что", Kind::Draft, false),
    ("напиши ему что", Kind::Draft, false),
    ("напиши ей что", Kind::Draft, false),
    ("напомни мне", Kind::Remind, false),
    ("заметка:", Kind::Note, false),
    ("відпиши що", Kind::Draft, false),
    ("нагадай мені", Kind::Remind, false),
    // ── Czech, Slovak ──
    ("odpověz že", Kind::Draft, false),
    ("odepiš že", Kind::Draft, false),
    ("odpovedz že", Kind::Draft, false),
    ("připomeň mi", Kind::Remind, false),
    // ── Swedish, Danish, Norwegian ──
    ("svara att", Kind::Draft, false),
    ("påminn mig", Kind::Remind, false),
    ("påmind mig", Kind::Remind, false),
    ("påminn meg", Kind::Remind, false),
];

/// Said after the words ("call the dentist tomorrow, remind me").
const TRAILING: &[(&str, Kind, bool)] = &[
    ("remind me", Kind::Remind, true),
    ("remind me about that", Kind::Remind, true),
    ("remind me about it", Kind::Remind, true),
    ("as a reply", Kind::Draft, true),
    ("send that as a reply", Kind::Draft, true),
    ("przypomnij mi", Kind::Remind, false),
    ("erinnere mich daran", Kind::Remind, false),
    ("recuérdamelo", Kind::Remind, false),
];

/// Japanese, Chinese and Korean, written without spaces: matched as text.
/// (text, kind, at the end).
const CJK: &[(&str, Kind, bool)] = &[
    ("と返信して", Kind::Draft, true),
    ("って返信して", Kind::Draft, true),
    ("と返事して", Kind::Draft, true),
    ("と伝えて", Kind::Draft, true),
    ("って伝えて", Kind::Draft, true),
    ("とリマインドして", Kind::Remind, true),
    ("ってリマインドして", Kind::Remind, true),
    ("回复说", Kind::Draft, false),
    ("回覆說", Kind::Draft, false),
    ("告诉他", Kind::Draft, false),
    ("告诉她", Kind::Draft, false),
    ("告诉他们", Kind::Draft, false),
    ("告訴他", Kind::Draft, false),
    ("提醒我", Kind::Remind, false),
    ("고 답장해", Kind::Draft, true),
    ("고 전해줘", Kind::Draft, true),
    ("고 전해", Kind::Draft, true),
];

fn compile(list: &[(&str, Kind, bool)]) -> Vec<Trigger> {
    let mut out: Vec<Trigger> = list
        .iter()
        .map(|(t, kind, english)| {
            let colon = t.ends_with(':');
            Trigger {
                words: words(t.trim_end_matches(':'))
                    .into_iter()
                    .map(|w| w.text)
                    .collect(),
                kind: *kind,
                english: *english,
                colon,
            }
        })
        .collect();
    // Longest first: "write to them that" before "write to them".
    out.sort_by_key(|t| {
        std::cmp::Reverse((
            t.words.len(),
            t.words.iter().map(|w| w.len()).sum::<usize>(),
        ))
    });
    out
}

static LEADING_TRIGGERS: Lazy<Vec<Trigger>> = Lazy::new(|| compile(LEADING));
static TRAILING_TRIGGERS: Lazy<Vec<Trigger>> = Lazy::new(|| compile(TRAILING));
static CJK_SORTED: Lazy<Vec<(&'static str, Kind, bool)>> = Lazy::new(|| {
    let mut v = CJK.to_vec();
    v.sort_by_key(|(t, _, _)| std::cmp::Reverse(t.chars().count()));
    v
});

struct Word {
    text: String,
    start: usize,
    end: usize,
}

/// Words with their byte spans: runs of letters, digits, apostrophes and
/// hyphens, lowercased ("Réponds-lui" is one word).
fn words(t: &str) -> Vec<Word> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    let part = |c: char| c.is_alphanumeric() || matches!(c, '\'' | '’' | '-');
    for (i, c) in t.char_indices() {
        match (part(c), start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                out.push(word(t, s, i));
                start = None;
            }
            _ => {}
        }
    }
    if let Some(s) = start {
        out.push(word(t, s, t.len()));
    }
    out
}

fn word(t: &str, start: usize, end: usize) -> Word {
    Word {
        text: t[start..end]
            .replace('’', "'")
            .trim_matches(|c| c == '\'' || c == '-')
            .to_lowercase(),
        start,
        end,
    }
}

/// Polite openers before a leading trigger ("please tell her…", "can you
/// remind me…"), as `compose` reads them.
fn polite_len(w: &[Word]) -> usize {
    let mut i = 0;
    'outer: loop {
        for p in super::compose::POLITE {
            if w.len() >= i + p.len() && p.iter().zip(&w[i..]).all(|(p, w)| w.text == *p) {
                i += p.len();
                continue 'outer;
            }
        }
        return i;
    }
}

/// Punctuation and spaces around a trigger that belong to neither side.
fn trim_joint(s: &str) -> &str {
    s.trim_matches(|c: char| {
        c.is_whitespace() || matches!(c, ',' | ':' | ';' | '-' | '–' | '—' | '、' | '，' | '：')
    })
}

/// The marker in `transcript`, if one was said. A trigger with nothing
/// after it ("remind me") is not one.
pub fn detect(transcript: &str) -> Option<Marked> {
    let t = without_address(transcript).trim();
    if t.is_empty() {
        return None;
    }
    leading(t).or_else(|| trailing(t)).or_else(|| cjk(t))
}

fn leading(t: &str) -> Option<Marked> {
    let all = words(t);
    let skip = polite_len(&all);
    let w = &all[skip..];
    for trig in LEADING_TRIGGERS.iter() {
        let n = trig.words.len();
        if w.len() <= n || !trig.words.iter().zip(w).all(|(a, b)| *a == b.text) {
            continue;
        }
        let end = w[n - 1].end;
        let after = &t[end..];
        if trig.colon && !after.trim_start().starts_with([':', '：']) {
            continue;
        }
        let body = trim_joint(after).trim_end_matches(|c: char| c.is_whitespace());
        // "Write that down", "write that up": an idiom, not a draft.
        let first = words(body).into_iter().next().map(|w| w.text);
        if body.is_empty()
            || (trig.words == ["write", "that"] && matches!(first.as_deref(), Some("down" | "up")))
        {
            continue;
        }
        return Some(Marked {
            kind: trig.kind,
            trigger: t[w[0].start..end].to_string(),
            body: body.to_string(),
            trailing: false,
            english: trig.english,
        });
    }
    None
}

fn trailing(t: &str) -> Option<Marked> {
    let w = words(t);
    for trig in TRAILING_TRIGGERS.iter() {
        let n = trig.words.len();
        if w.len() <= n {
            continue;
        }
        let tail = &w[w.len() - n..];
        if !trig.words.iter().zip(tail).all(|(a, b)| *a == b.text) {
            continue;
        }
        // Only punctuation may follow the trigger ("…, remind me.").
        if t[tail[n - 1].end..].chars().any(char::is_alphanumeric) {
            continue;
        }
        // A trigger at the end must be set off from the words before it
        // ("call Sam, remind me"), so "she asked them to remind me" is prose.
        let before = &t[..tail[0].start];
        if !before
            .trim_end()
            .ends_with([',', ';', '.', '-', '–', '—', ':'])
        {
            continue;
        }
        let body = trim_joint(before);
        // "Ok, remind me": nothing to be reminded of.
        let said = words(body);
        if said.is_empty() || polite_len(&said) == said.len() {
            continue;
        }
        return Some(Marked {
            kind: trig.kind,
            trigger: t[tail[0].start..tail[n - 1].end].to_string(),
            body: body.to_string(),
            trailing: true,
            english: trig.english,
        });
    }
    None
}

fn cjk(t: &str) -> Option<Marked> {
    let t = t.trim_end_matches(['。', '！', '.', '!', ' ']);
    for (trigger, kind, at_end) in CJK_SORTED.iter() {
        let body = if *at_end {
            t.strip_suffix(trigger)
        } else {
            t.strip_prefix(trigger)
        };
        if let Some(body) = body.map(trim_joint).filter(|b| !b.is_empty()) {
            return Some(Marked {
                kind: *kind,
                trigger: trigger.to_string(),
                body: body.to_string(),
                trailing: *at_end,
                english: false,
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(s: &str) -> Option<Kind> {
        detect(s).map(|m| m.kind)
    }

    fn body(s: &str) -> String {
        detect(s).map(|m| m.body).unwrap_or_default()
    }

    #[test]
    fn hears_leading_triggers_and_strips_them() {
        assert_eq!(kind("Reply that everything's fine"), Some(Kind::Draft));
        assert_eq!(body("Reply that everything's fine"), "everything's fine");
        assert_eq!(body("tell her that I'm running late"), "I'm running late");
        assert_eq!(
            body("Let them know that the build is green."),
            "the build is green."
        );
        assert_eq!(body("write to them that we ship Friday"), "we ship Friday");
        assert_eq!(kind("remind me to call Sam at 5"), Some(Kind::Remind));
        assert_eq!(body("remind me to call Sam at 5"), "to call Sam at 5");
        assert_eq!(kind("Note to self: buy milk"), Some(Kind::Note));
        assert_eq!(body("Note to self: buy milk"), "buy milk");
        assert_eq!(
            body("Note: what's the plan for Friday?"),
            "what's the plan for Friday?"
        );
        // After "Hey Ambient," and politeness.
        assert_eq!(
            body("Hey Ambient, please reply that it's done"),
            "it's done"
        );
        assert_eq!(kind("could you remind me to stretch"), Some(Kind::Remind));
    }

    #[test]
    fn longest_trigger_wins() {
        let m = detect("Write to them that the deck is ready").unwrap();
        assert_eq!(m.trigger, "Write to them that");
        assert_eq!(m.body, "the deck is ready");
        let m = detect("reply back saying we're live").unwrap();
        assert_eq!(m.trigger, "reply back saying");
        assert_eq!(m.body, "we're live");
    }

    #[test]
    fn never_fires_inside_a_longer_word() {
        for s in [
            "tell them thatched roofs leak",
            "Tell heroes their stories",
            "reply thatched roofs are nice",
            "reminders are on the list",
            "notes: buy milk",
            "remind meeting attendees tomorrow",
            "the team will tell him later",
            "Telling her was hard",
        ] {
            assert_eq!(detect(s), None, "{s}");
        }
    }

    #[test]
    fn plain_dictation_has_no_marker() {
        for s in [
            "Thanks for the update, I'll send the numbers tomorrow.",
            "Note that the office is closed Friday",
            "Can we move the call to Thursday?",
            "remind me",
            "tell her that",
            "note:",
            // Said to the reader as often as to Ambient: the model decides.
            "Tell them we're happy with it.",
            "tell her the build is green",
            "she asked them to remind me",
            "I wrote that yesterday",
            "Write that down before you forget",
            "Ok, remind me.",
            "",
        ] {
            assert_eq!(detect(s), None, "{s}");
        }
    }

    #[test]
    fn hears_trailing_triggers() {
        let m = detect("Call the dentist tomorrow at 9, remind me.").unwrap();
        assert_eq!(m.kind, Kind::Remind);
        assert!(m.trailing);
        assert_eq!(m.body, "Call the dentist tomorrow at 9");
        let m = detect("Thursday works for me — as a reply").unwrap();
        assert_eq!(m.kind, Kind::Draft);
        assert_eq!(m.body, "Thursday works for me");
        assert_eq!(m.instruction(), "as a reply: Thursday works for me");
    }

    #[test]
    fn hears_other_languages() {
        for (s, k, b) in [
            ("odpisz że wszystko ok", Kind::Draft, "wszystko ok"),
            ("Odpisz mu, że będę o piątej", Kind::Draft, "będę o piątej"),
            (
                "przypomnij mi jutro o 9 o raporcie",
                Kind::Remind,
                "jutro o 9 o raporcie",
            ),
            ("antworte ihm, dass alles passt", Kind::Draft, "alles passt"),
            ("contéstale que llego tarde", Kind::Draft, "llego tarde"),
            ("Réponds-lui que c'est bon", Kind::Draft, "c'est bon"),
            ("rispondi che va bene", Kind::Draft, "va bene"),
            (
                "responda que está tudo certo",
                Kind::Draft,
                "está tudo certo",
            ),
            ("antwoord dat het goed is", Kind::Draft, "het goed is"),
            ("ответь что всё в порядке", Kind::Draft, "всё в порядке"),
            ("відпиши що я запізнюсь", Kind::Draft, "я запізнюсь"),
            ("odpověz že souhlasím", Kind::Draft, "souhlasím"),
            ("svara att det går bra", Kind::Draft, "det går bra"),
            ("recuérdame llamar a Ana", Kind::Remind, "llamar a Ana"),
            ("Notiz: Milch kaufen", Kind::Note, "Milch kaufen"),
            ("大丈夫だと返信して", Kind::Draft, "大丈夫だ"),
            ("回复说没问题", Kind::Draft, "没问题"),
            ("提醒我明天开会", Kind::Remind, "明天开会"),
            ("괜찮다고 답장해", Kind::Draft, "괜찮다"),
        ] {
            let m = detect(s).unwrap_or_else(|| panic!("{s}"));
            assert_eq!((m.kind, m.body.as_str()), (k, b), "{s}");
        }
        for s in [
            "Myślę że to dobry pomysł",
            "Odpisałem mu wczoraj że wszystko ok",
            "Ich glaube, dass alles passt",
            "Je pense que c'est bon",
            "谢谢，没问题",
            "powiedz mu że będę o piątej",
            "dile que llego tarde",
        ] {
            assert_eq!(detect(s), None, "{s}");
        }
    }

    #[test]
    fn the_instruction_keeps_who_it_is_for() {
        let m = detect("tell her that I'm late").unwrap();
        assert_eq!(m.instruction(), "tell her that I'm late");
    }
}
