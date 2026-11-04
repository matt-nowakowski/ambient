//! "Reply saying…", "tell them…", "draft an email…": is the user dictating
//! the words, or asking Ambient to write them?
//!
//! A cheap, deterministic first pass over the words (no model call). It says
//! `Yes` for clear instructions to write something, `Maybe` for phrasings
//! that are just as often the message itself ("tell them I'm late", a bare
//! "reply to Sam"), which the router model then decides with the screen in
//! view, and `No` for everything else, which is typed as dictation.

use super::router::without_address;

/// What the first pass makes of a transcript.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ComposeIntent {
    /// Certainly an instruction to draft; carries the instruction (without
    /// a leading "Hey Ambient,").
    Yes(String),
    /// Could be either; ask the router.
    Maybe,
    No,
}

/// Politeness and filler before the verb ("please", "can you", "could you
/// please", "I'd like you to", "go ahead and"). Stripped repeatedly.
const POLITE: &[&[&str]] = &[
    &["please"],
    &["kindly"],
    &["just"],
    &["ok"],
    &["okay"],
    &["so"],
    &["now"],
    &["can", "you"],
    &["could", "you"],
    &["would", "you"],
    &["will", "you"],
    &["can", "u"],
    &["could", "u"],
    &["would", "you", "mind"],
    &["i", "want", "you", "to"],
    &["i'd", "like", "you", "to"],
    &["id", "like", "you", "to"],
    &["i", "need", "you", "to"],
    &["go", "ahead", "and"],
    &["help", "me"],
    // The same in the other languages people dictate in most.
    &["proszę"],
    &["prosze"],
    &["możesz"],
    &["mozesz"],
    &["czy", "możesz"],
    &["czy", "mozesz"],
    &["bitte"],
    &["kannst", "du"],
    &["könntest", "du"],
    &["por", "favor"],
    &["puedes"],
    &["podrías"],
    &["s'il", "te", "plaît"],
    &["s'il", "vous", "plaît"],
    &["peux-tu"],
    &["pourrais-tu"],
    &["per", "favore"],
    &["puoi"],
    &["potresti"],
    &["pode"],
    &["podes"],
    &["alsjeblieft"],
    &["kun", "je"],
    &["пожалуйста"],
    &["можешь"],
    &["будь", "ласка"],
    &["prosím"],
    &["snälla"],
];

/// "We" forms ("can we reply…", "let's tell them…"): as often said to a
/// colleague as to Ambient, so at most `Maybe` (and a draft when nothing
/// can be typed: see `actions`).
const WE: &[&[&str]] = &[
    &["can", "we"],
    &["could", "we"],
    &["shall", "we"],
    &["should", "we"],
    &["let's"],
    &["lets"],
    &["let", "us"],
];

/// Things one replies to or drafts.
const MESSAGE_NOUNS: &[&str] = &[
    "email",
    "e-mail",
    "emails",
    "mail",
    "message",
    "messages",
    "thread",
    "reply",
    "response",
    "answer",
    "note",
    "text",
    "dm",
    "letter",
    "follow-up",
    "followup",
    "comment",
    "post",
    "invite",
    "invitation",
];

/// Who or what a reply goes to, pointing at what's on screen.
const DEICTIC: &[&str] = &[
    "this",
    "that",
    "these",
    "him",
    "her",
    "them",
    "it",
    "everyone",
    "everybody",
    "all",
    "sender",
];

const DETERMINERS: &[&str] = &[
    "this", "that", "the", "his", "her", "their", "my", "our", "your", "these", "a", "an",
];

/// Words allowed between "write a" and the noun ("a quick polite reply").
const DRAFT_ADJECTIVES: &[&str] = &[
    "quick",
    "short",
    "brief",
    "polite",
    "friendly",
    "formal",
    "informal",
    "nice",
    "professional",
    "kind",
    "warm",
    "simple",
    "thank-you",
    "thank",
    "you",
    "follow",
    "up",
    "new",
    "reply",
    "response",
];

/// After a reply verb (and its target), what makes it an instruction: the
/// content of the reply, or how to write it.
const CONNECTORS: &[&str] = &[
    "saying",
    "say",
    "telling",
    "tell",
    "letting",
    "let",
    "asking",
    "ask",
    "that",
    "with",
    "mentioning",
    "mention",
    "confirming",
    "confirm",
    "declining",
    "decline",
    "accepting",
    "accept",
    "thanking",
    "thank",
    "explaining",
    "explain",
    "suggesting",
    "suggest",
    "proposing",
    "propose",
    "agreeing",
    "agree",
    "apologising",
    "apologizing",
    "apologise",
    "apologize",
    "informing",
    "inform",
    "politely",
    "nicely",
    "briefly",
    "kindly",
    "quickly",
    "yes",
    "no",
    "about",
];

/// Words after "to" that are a time, not a person ("reply to John by Friday"
/// has "John"; "respond by Friday" has no target at all).
const NOT_NAMES: &[&str] = &[
    "by",
    "on",
    "at",
    "before",
    "after",
    "tomorrow",
    "today",
    "tonight",
    "later",
    "soon",
    "asap",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

fn words_of(t: &str) -> Vec<String> {
    t.split(|c: char| {
        c.is_whitespace() || matches!(c, ',' | ':' | ';' | '!' | '?' | '"' | '“' | '”' | '.')
    })
    .map(|w| {
        w.replace('’', "'")
            .trim_matches(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-')
            .trim_matches('\'')
            .to_lowercase()
    })
    .filter(|w| !w.is_empty())
    .collect()
}

fn starts_with(words: &[String], phrase: &[&str]) -> bool {
    words.len() >= phrase.len() && phrase.iter().zip(words).all(|(p, w)| w == p)
}

fn strip_polite(mut w: &[String]) -> &[String] {
    while let Some(p) = POLITE.iter().find(|p| starts_with(w, p)) {
        w = &w[p.len()..];
    }
    w
}

fn is_noun(w: &[String], i: usize) -> bool {
    w.get(i)
        .is_some_and(|x| MESSAGE_NOUNS.contains(&x.as_str()))
}

/// The reply verb at the start, and how many words it takes.
fn reply_verb(w: &[String]) -> Option<usize> {
    [
        &["write", "back"][..],
        &["get", "back"],
        &["reply"],
        &["respond"],
        &["answer"],
    ]
    .iter()
    .find(|p| starts_with(w, p))
    .map(|p| p.len())
}

/// After a reply verb: who or what it's to. Returns (words used, whether it
/// points at what's on screen: "this email", "them", "here", "all").
fn reply_target(w: &[String]) -> (usize, bool) {
    let mut i = 0;
    let mut deictic = false;
    // "back", "here", "all" right after the verb ("reply all", "write back").
    while let Some(x) = w.get(i) {
        match x.as_str() {
            "back" => i += 1,
            "here" | "all" => {
                i += 1;
                deictic = true;
            }
            _ => break,
        }
    }
    let to = w.get(i).is_some_and(|x| x == "to");
    let j = if to { i + 1 } else { i };
    let Some(first) = w.get(j).map(String::as_str) else {
        return (i, deictic);
    };
    if DETERMINERS.contains(&first) {
        // "to this email", "the thread", "to her last message"
        if is_noun(w, j + 1) {
            return (j + 2, !matches!(first, "a" | "an"));
        }
        if is_noun(w, j + 2) {
            return (j + 3, !matches!(first, "a" | "an"));
        }
        if DEICTIC.contains(&first) {
            // "reply to this", "answer her", "respond to that"
            return (j + 1, true);
        }
        return (i, deictic);
    }
    if DEICTIC.contains(&first) {
        // "to them", "to everyone", "him"
        let k = if is_noun(w, j + 1) { j + 2 } else { j + 1 };
        return (k, true);
    }
    if to && !NOT_NAMES.contains(&first) {
        // "to Sam", "to Sam's email": a person, which doesn't point at the
        // screen on its own ("Reply to Sam" may be a note to self).
        let k = if is_noun(w, j + 1) { j + 2 } else { j + 1 };
        return (k, false);
    }
    (i, deictic)
}

/// "tell them …", "let her know …", "say that …", "ask them if …".
fn tell_form(w: &[String]) -> bool {
    let person = |i: usize| {
        w.get(i).is_some_and(|x| {
            matches!(
                x.as_str(),
                "him" | "her" | "them" | "everyone" | "everybody" | "all"
            )
        })
    };
    match w.first().map(String::as_str) {
        Some("tell") => w.len() >= 3,
        // "let them know …", "let Sam know …"
        Some("let") => w.get(2).is_some_and(|x| x == "know") && w.len() >= 4,
        Some("say") => w.get(1).is_some_and(|x| x == "that") && w.len() >= 3,
        Some("ask") => {
            person(1)
                && w.get(2).is_some_and(|x| {
                    matches!(
                        x.as_str(),
                        "if" | "whether" | "to" | "for" | "about" | "when"
                    )
                })
        }
        Some("thank") => person(1),
        _ => false,
    }
}

// ── Other languages ──────────────────────────────────────────────────────
//
// A small fast path, not a dictionary: the model decides everything these
// don't (see `writing::MODEL_SYSTEM`). The shape is the same in every
// language: a verb telling someone to reply or write, then "that" and what
// to say ("odpisz że wszystko ok", "dile que llego tarde").

/// "Reply", "answer", "write back", imperative or after "can you" (Polish,
/// German, Spanish, French, Italian, Portuguese, Dutch, Russian, Ukrainian,
/// Czech, Slovak, Swedish, Danish, Norwegian).
const REPLY_VERBS: &[&str] = &[
    "odpisz",
    "odpowiedz",
    "odpisać",
    "odpowiedzieć",
    "antworte",
    "antworten",
    "beantworte",
    "responde",
    "contesta",
    "respóndele",
    "contéstale",
    "respondele",
    "contestale",
    "responder",
    "contestar",
    "réponds",
    "répondez",
    "réponds-lui",
    "répondez-lui",
    "réponds-leur",
    "répondre",
    "rispondi",
    "rispondigli",
    "rispondile",
    "rispondere",
    "responda",
    "antwoord",
    "beantwoord",
    "ответь",
    "ответьте",
    "ответить",
    "відповідай",
    "відповідайте",
    "відповісти",
    "відпиши",
    "odpověz",
    "odepiš",
    "odpovedz",
    "odpíš",
    "svara",
    "svar",
];

/// "Write", "send": with "that …" an instruction to write it.
const WRITE_VERBS: &[&str] = &[
    "napisz",
    "napisać",
    "wyślij",
    "schreib",
    "schreibe",
    "schreiben",
    "escribe",
    "escríbele",
    "escribir",
    "écris",
    "écris-lui",
    "écrivez",
    "écrire",
    "scrivi",
    "scrivigli",
    "scrivile",
    "scrivere",
    "escreve",
    "escreva",
    "escrever",
    "schrijf",
    "напиши",
    "напишите",
    "написать",
    "напишіть",
    "napiš",
    "skriv",
];

/// "Tell", "say", "let know": as often the message itself as an instruction
/// (like English "tell them…"), so at most `Maybe` unless asked politely.
const TELL_VERBS: &[&str] = &[
    "powiedz",
    "przekaż",
    "daj",
    "sag",
    "sage",
    "sagen",
    "dile",
    "diles",
    "di",
    "dígale",
    "decir",
    "dis",
    "dis-lui",
    "dis-leur",
    "dites-lui",
    "dire",
    "digli",
    "dille",
    "di'",
    "diga",
    "diz",
    "diz-lhe",
    "dizer",
    "zeg",
    "скажи",
    "скажите",
    "передай",
    "сказати",
    "řekni",
    "povedz",
    "säg",
    "sig",
];

/// "That", introducing what to say.
const THAT: &[&str] = &[
    "że",
    "ze",
    "iż",
    "dass",
    "daß",
    "que",
    "qu'",
    "che",
    "dat",
    "что",
    "чтобы",
    "що",
    "že",
    "att",
    "at",
];

fn is_that(w: &str) -> bool {
    THAT.contains(&w) || w.starts_with("qu'")
}

/// Verb-final languages: the instruction ends the sentence ("大丈夫だと返信して",
/// "告诉他我晚点到" starts with it). Matched as text, not words.
const CJK_INSTRUCTIONS: &[&str] = &[
    "と返信して",
    "って返信して",
    "と返事して",
    "って返事して",
    "と伝えて",
    "って伝えて",
    "と書いて",
    "回复说",
    "回覆說",
    "回复他",
    "回复她",
    "回信说",
    "告诉他",
    "告诉她",
    "告诉他们",
    "告訴他",
    "跟他说",
    "跟她说",
    "고 답장해",
    "고 답장 해",
    "고 전해",
    "라고 써",
];

/// The other languages' first pass: `Yes` for "reply/write (to X) that …",
/// `Maybe` for "tell X that …" or a bare "reply …", else `No`.
fn other_languages(instruction: &str, w: &[String], polite: bool) -> ComposeIntent {
    let yes = || ComposeIntent::Yes(instruction.to_string());
    if CJK_INSTRUCTIONS.iter().any(|c| instruction.contains(c)) {
        return yes();
    }
    let Some(first) = w.first().map(String::as_str) else {
        return ComposeIntent::No;
    };
    // "that" within the next few words ("odpisz Ani że…", "dile a Juan que…").
    let then_that = w.iter().skip(1).take(4).any(|x| is_that(x));
    if REPLY_VERBS.contains(&first) {
        return if then_that || polite {
            yes()
        } else if w.len() >= 2 {
            ComposeIntent::Maybe
        } else {
            ComposeIntent::No
        };
    }
    if WRITE_VERBS.contains(&first) && then_that {
        return yes();
    }
    // "daj znać że…" (let know that…).
    let tell =
        TELL_VERBS.contains(&first) && (first != "daj" || w.get(1).is_some_and(|x| x == "znać"));
    if tell && then_that {
        return if polite { yes() } else { ComposeIntent::Maybe };
    }
    ComposeIntent::No
}

/// The first pass. `transcript` may start with "Hey Ambient,".
pub fn compose_intent(transcript: &str) -> ComposeIntent {
    let instruction = without_address(transcript).trim();
    let all = words_of(instruction);
    let w = strip_polite(&all);
    // "Can we please reply to this email saying it's all good?"
    if let Some(we) = WE.iter().find(|p| starts_with(w, p)) {
        let rest = strip_polite(&w[we.len()..]);
        return match first_pass(instruction, rest, true) {
            ComposeIntent::No => ComposeIntent::No,
            _ => ComposeIntent::Maybe,
        };
    }
    let polite = w.len() < all.len();
    match first_pass(instruction, w, polite) {
        ComposeIntent::No => other_languages(instruction, w, polite),
        intent => intent,
    }
}

fn first_pass(instruction: &str, w: &[String], polite: bool) -> ComposeIntent {
    if w.is_empty() {
        return ComposeIntent::No;
    }
    let yes = || ComposeIntent::Yes(instruction.to_string());

    // "reply to this email saying…", "respond and say thanks", "answer her".
    if let Some(n) = reply_verb(w) {
        let (used, deictic) = reply_target(&w[n..]);
        let rest = &w[n + used..];
        return match rest.first().map(String::as_str) {
            // "reply to this email", "answer her", "respond to all"
            None if deictic || polite => yes(),
            // "Reply", "Reply to Sam": maybe a note to self.
            None => ComposeIntent::Maybe,
            // "reply and say…", "respond to say…": a content verb must follow.
            Some("and") | Some("to") => match rest.get(1).map(String::as_str) {
                Some(next) if CONNECTORS.contains(&next) => yes(),
                _ => ComposeIntent::No,
            },
            Some(c) if CONNECTORS.contains(&c) => yes(),
            // "Reply to John by Friday", "answer the phone"
            _ => ComposeIntent::No,
        };
    }

    // "write/draft/compose (me) a (quick) reply/email/message …"
    if matches!(
        w[0].as_str(),
        "write" | "draft" | "compose" | "prepare" | "send"
    ) {
        let mut i = 1;
        if w.get(i)
            .is_some_and(|x| matches!(x.as_str(), "me" | "him" | "her" | "them" | "us"))
        {
            i += 1;
        }
        if w.get(i).is_some_and(|x| DETERMINERS.contains(&x.as_str())) {
            i += 1;
        }
        // Adjectives, but a noun that's also an adjective ("reply") ends it.
        while w
            .get(i)
            .is_some_and(|x| DRAFT_ADJECTIVES.contains(&x.as_str()))
            && (!is_noun(w, i) || is_noun(w, i + 1))
        {
            i += 1;
        }
        if !is_noun(w, i) {
            return ComposeIntent::No;
        }
        // "send a message to the team" is an action; with what to say, it's
        // a draft like the others.
        if w[0] == "send" {
            let says = w[i + 1..].iter().any(|x| {
                matches!(
                    x.as_str(),
                    "saying" | "telling" | "asking" | "letting" | "that" | "thanking"
                )
            });
            return if says { yes() } else { ComposeIntent::Maybe };
        }
        return yes();
    }

    // "tell them we're happy", "let them know…", "say that…": as often the
    // message itself as an instruction. A leading "please"/"can you" says
    // it's for Ambient.
    if tell_form(w) {
        return if polite { yes() } else { ComposeIntent::Maybe };
    }
    ComposeIntent::No
}

#[cfg(test)]
mod tests {
    use super::*;

    fn yes(s: &str) -> bool {
        matches!(compose_intent(s), ComposeIntent::Yes(_))
    }

    #[test]
    fn hears_instructions_to_reply() {
        for s in [
            // The tester's phrasings.
            "please reply to this email saying that we're happy",
            "reply to this email",
            "Reply here saying Thursday works",
            "reply saying Thursday works for me",
            // Politeness and variations.
            "Can you reply to this email and say we're in?",
            "could you please respond to this message saying thanks",
            "Hey Ambient, reply to them saying yes",
            "respond and say thanks",
            "write back saying I'll be late",
            "answer her saying the deck is ready",
            "reply to all saying the meeting moved",
            "Reply to Sam's email saying we'll ship Friday",
            "reply politely declining",
            "respond to this",
            "reply to him",
            "get back to them saying we're interested",
            "Please answer this email.",
            "I'd like you to reply to this thread confirming the date",
            "reply to the last message asking for the invoice",
        ] {
            assert!(yes(s), "{s}");
        }
    }

    #[test]
    fn hears_instructions_to_draft() {
        for s in [
            "write a reply telling them we're in",
            "Draft an email to Sam about the launch",
            "can you draft a quick reply",
            "write me a short polite email declining the offer",
            "compose a message to the team",
            "send them a message saying we're running late",
            "Please tell them we're happy with the proposal",
            "can you let them know the build is green",
        ] {
            assert!(yes(s), "{s}");
        }
    }

    #[test]
    fn leaves_ambiguous_phrasings_to_the_router() {
        for s in [
            "tell them we're happy",
            "let them know I'll be late",
            "say that we agree",
            "Reply to Sam",
            "send a message to the team",
            "ask them if Friday works",
            // "We" forms: a draft only when nothing can be typed.
            "Can we please reply to this email saying it's all good?",
            "could we reply saying Thursday works",
            "let's tell them we're happy",
        ] {
            assert_eq!(compose_intent(s), ComposeIntent::Maybe, "{s}");
        }
    }

    #[test]
    fn leaves_dictation_alone() {
        for s in [
            "Reply to John by Friday",
            "I'll reply tomorrow",
            "The response was great, thanks",
            "Thanks for the reply, I'll send the numbers tomorrow.",
            "We should write the email copy next week",
            "Answer the phone when it rings",
            "respond by Monday please",
            "Let's push the sync to Thursday",
            "Can we push the sync to Thursday?",
            "I told them we're happy",
            "",
            "   ",
        ] {
            assert_eq!(compose_intent(s), ComposeIntent::No, "{s}");
        }
    }

    #[test]
    fn hears_instructions_in_other_languages() {
        for s in [
            // The founder's: typed verbatim in 0.1.7.
            "odpisz że wszystko ok",
            "Odpisz, że wszystko OK.",
            "odpisz mu że będę o piątej",
            "proszę odpowiedz że się zgadzamy",
            "napisz jej że spotkanie jest przeniesione",
            "możesz odpisać że dziękuję",
            "antworte, dass alles passt",
            "Bitte sag ihm, dass ich später komme",
            "responde que sí, que nos vemos el lunes",
            "contéstale que todo bien",
            "réponds-lui que c'est bon",
            "Réponds que je suis d'accord",
            "rispondi che va bene",
            "responda que está tudo certo",
            "antwoord dat het goed is",
            "ответь что всё в порядке",
            "напиши что я опоздаю",
            "svara att det går bra",
            "大丈夫だと返信して",
            "回复说没问题",
            "괜찮다고 답장해",
        ] {
            assert!(yes(s), "{s}: {:?}", compose_intent(s));
        }
    }

    #[test]
    fn other_languages_leave_the_unsure_ones_to_a_model() {
        for s in [
            "powiedz mu że będę o piątej",
            "dile que llego tarde",
            "sag ihr, dass es klappt",
            "dis-lui que c'est bon",
            "скажи что я опоздаю",
            "odpowiedz na tego maila",
            "daj znać że wszystko gra",
        ] {
            assert_eq!(compose_intent(s), ComposeIntent::Maybe, "{s}");
        }
    }

    #[test]
    fn other_languages_dictation_stays_dictation() {
        for s in [
            "Dzięki, wszystko ok, do jutra",
            "Myślę że to dobry pomysł",
            "Odpisałem mu wczoraj że wszystko ok",
            "Ich glaube, dass alles passt",
            "Creo que nos vemos el lunes",
            "Je pense que c'est bon",
            "Penso che vada bene",
            "Я думаю что всё в порядке",
            "ありがとうございます",
            "谢谢，没问题",
            "odpisz",
        ] {
            assert_eq!(compose_intent(s), ComposeIntent::No, "{s}");
        }
    }

    #[test]
    fn keeps_the_instruction_without_the_address() {
        assert_eq!(
            compose_intent("Hey Ambient, reply saying yes"),
            ComposeIntent::Yes("reply saying yes".into())
        );
    }
}
