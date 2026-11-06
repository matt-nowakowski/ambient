//! Joining a dictation to the text already before the caret, so two takes in
//! a row read as one: "…in San Miguel" + "Not doing much" types
//! " not doing much", not "San MiguelNot doing much".
//!
//! The rules only look at the few characters right before the caret (read
//! locally, never stored or sent):
//! - a space goes in after a letter, digit, sentence punctuation or a closing
//!   bracket or quote, unless the new text starts with a space or
//!   punctuation; never at the start of a field or line, after an opening
//!   bracket or quote, or around Chinese, Japanese or Thai (written without
//!   spaces);
//! - after `.`, `!` or `?` the first letter is capitalised; continuing a
//!   sentence, a capitalised common word ("Not", "The", "Und") is lowercased.
//!   Names, "I", acronyms ("NASA") and German "Sie" are never lowercased: only
//!   words on a short list of function words are;
//! - in a code editor or terminal (fixed-width text), case is left alone and
//!   no space goes in after `.` or `:` (`obj.`, `http:`).

/// How many characters before the caret are worth reading.
pub const BEFORE_CHARS: usize = 64;

/// What to type: `text`, after a space when `space` is set.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Joined {
    pub space: bool,
    pub text: String,
}

impl Joined {
    /// Exactly what goes into the field.
    pub fn typed(&self) -> String {
        if self.space {
            format!(" {}", self.text)
        } else {
            self.text.clone()
        }
    }
}

/// Join `text` to `before` (the characters right before the caret; empty at
/// the start of the field). `code` marks a code editor or terminal.
pub fn join(before: &str, text: &str, code: bool) -> Joined {
    let unchanged = Joined {
        space: false,
        text: text.to_string(),
    };
    let Some(first) = text.chars().next() else {
        return unchanged;
    };
    let Some(prev) = before.chars().last() else {
        // The start of the field.
        return unchanged;
    };
    if first.is_whitespace() {
        return unchanged;
    }
    if prev.is_whitespace() {
        // Already spaced: only the case may change, and not at the start of
        // a line.
        let trailing: String = before
            .chars()
            .rev()
            .take_while(|c| c.is_whitespace())
            .collect();
        if trailing.contains(['\n', '\r', '\u{2028}', '\u{2029}']) || code {
            return unchanged;
        }
        return Joined {
            space: false,
            text: recase(before, text),
        };
    }
    if no_space_script(prev) || no_space_script(first) {
        return unchanged;
    }
    if attaches_left(first) {
        return unchanged;
    }
    if !space_after(prev, before, code) {
        return unchanged;
    }
    Joined {
        space: true,
        text: if code {
            text.to_string()
        } else {
            recase(before, text)
        },
    }
}

/// Scripts written without spaces between words or sentences (Chinese,
/// Japanese, Thai, Lao, Khmer, Myanmar), and their full-width punctuation.
/// Korean is written with spaces, so Hangul isn't here.
fn no_space_script(c: char) -> bool {
    matches!(c as u32,
        0x0E00..=0x0EFF // Thai, Lao
        | 0x1000..=0x109F // Myanmar
        | 0x1780..=0x17FF // Khmer
        | 0x2E80..=0x2FDF // CJK radicals
        | 0x3000..=0x303F // CJK punctuation (、。「」…)
        | 0x3040..=0x30FF // Hiragana, Katakana
        | 0x31F0..=0x31FF
        | 0x3400..=0x4DBF // CJK extension A
        | 0x4E00..=0x9FFF // CJK unified
        | 0xF900..=0xFAFF
        | 0xFF00..=0xFF60 // full-width forms (，！？)
        | 0xFF61..=0xFF9F // half-width Katakana
        | 0x20000..=0x3134F)
}

/// Characters that sit against the word before them: a new text starting
/// with one gets no space ("," "." ")" "%" "'s").
fn attaches_left(c: char) -> bool {
    matches!(
        c,
        '.' | ','
            | '!'
            | '?'
            | ';'
            | ':'
            | ')'
            | ']'
            | '}'
            | '%'
            | '…'
            | '\''
            | '’'
            | '”'
            | '»'
            | '"'
            | '-'
            | '–'
            | '—'
            | '/'
    )
}

/// Whether a space belongs after `prev` (the last character of `before`).
fn space_after(prev: char, before: &str, code: bool) -> bool {
    if prev.is_alphanumeric() {
        return true;
    }
    match prev {
        ',' | ';' | '!' | '?' | ')' | ']' | '}' | '”' | '’' | '»' | '%' | '…' => true,
        // `obj.` and `http:` in code; a sentence's end in prose.
        '.' | ':' => !code,
        // A straight quote closes when it follows a word ("said" / it's').
        '"' | '\'' => {
            let mut rev = before.chars().rev();
            rev.next();
            rev.next().is_some_and(|c| !c.is_whitespace() && !opens(c))
        }
        _ => false,
    }
}

/// Opening brackets and quotes, after which a new text starts directly.
fn opens(c: char) -> bool {
    matches!(
        c,
        '(' | '[' | '{' | '“' | '‘' | '«' | '„' | '‚' | '¿' | '¡' | '<'
    )
}

/// Adjust the first letter of `text` to what came before: capitalised after
/// the end of a sentence, lowercased (common words only) when continuing
/// one. Closing brackets and quotes are looked through: `"Done."` ends a
/// sentence, `(see above)` doesn't.
fn recase(before: &str, text: &str) -> String {
    let Some(last) = before
        .trim_end()
        .chars()
        .rev()
        .find(|c| !matches!(c, ')' | ']' | '}' | '”' | '’' | '»' | '"' | '\''))
    else {
        return text.to_string();
    };
    if matches!(last, '.' | '!' | '?') {
        return capitalise(text);
    }
    if last.is_alphanumeric() || matches!(last, ',' | ';' | ':') {
        return lowercase_common(text);
    }
    text.to_string()
}

fn capitalise(text: &str) -> String {
    let mut chars = text.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    // "iPhone", "eBay": a lowercase start followed by a capital is a name.
    let second_upper = text.chars().nth(1).is_some_and(char::is_uppercase);
    if !first.is_lowercase() || second_upper {
        return text.to_string();
    }
    let mut upper = first.to_uppercase();
    if upper.len() != 1 {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    out.extend(upper.by_ref());
    out.push_str(chars.as_str());
    out
}

/// The first word, lowercased, if it's capitalised only because it started
/// a take: a common word, in "Xxxx" form (never "I", "NASA" or a name).
fn lowercase_common(text: &str) -> String {
    let word: &str = text
        .split(|c: char| c.is_whitespace() || (c.is_ascii_punctuation() && c != '\''))
        .next()
        .unwrap_or("");
    let word = word.trim_end_matches(['\'', '’']);
    let mut letters = word.chars().filter(|c| c.is_alphabetic());
    let Some(first) = letters.next() else {
        return text.to_string();
    };
    if !first.is_uppercase() || letters.any(char::is_uppercase) {
        return text.to_string();
    }
    let key = word.to_lowercase().replace('’', "'");
    if !COMMON_WORDS.contains(&key.as_str()) {
        return text.to_string();
    }
    let mut chars = text.chars();
    let Some(head) = chars.next() else {
        return text.to_string();
    };
    let mut lower = head.to_lowercase();
    if lower.len() != 1 {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    out.extend(lower.by_ref());
    out.push_str(chars.as_str());
    out
}

/// Words that are only capitalised at the start of a sentence, in the
/// languages people dictate most. Left out on purpose: "I" (and Italian and
/// Polish "i", which look the same), German "Sie"/"Ihr"/"Ihnen" (formal
/// you), Polish "Ty"/"Wy" (capitalised in letters), and words that are also
/// common names ("Will", "May", "Mark", "Bill", "Art").
const COMMON_WORDS: &[&str] = &[
    // English
    "a", "about", "actually", "after", "again", "all", "also", "although", "an", "and", "any",
    "anyway", "are", "as", "at", "because", "been", "before", "both", "but", "by", "can", "can't",
    "could", "did", "didn't", "do", "does", "doesn't", "don't", "each", "even", "every", "for",
    "from", "had", "has", "have", "he", "he's", "her", "here", "his", "how", "if", "in", "is",
    "isn't", "it", "it's", "its", "just", "let's", "like", "maybe", "more", "most", "much", "my",
    "no", "nor", "not", "now", "of", "ok", "okay", "on", "only", "or", "our", "please", "probably",
    "really", "she", "she's", "should", "since", "so", "some", "still", "than", "thanks", "that",
    "that's", "the", "their", "them", "then", "there", "there's", "these", "they", "they're",
    "this", "those", "though", "to", "too", "until", "very", "was", "wasn't", "we", "we'll",
    "we're", "we've", "well", "were", "what", "what's", "when", "where", "which", "while", "who",
    "why", "with", "would", "yes", "yet", "you", "you'll", "you're", "your", // Spanish
    "al", "bueno", "como", "con", "cuando", "de", "del", "el", "en", "entonces", "es", "está",
    "estoy", "la", "las", "lo", "los", "más", "me", "mi", "muy", "nada", "nos", "para", "pero",
    "por", "porque", "pues", "que", "se", "si", "sin", "su", "también", "te", "todo", "tu", "un",
    "una", "y", "ya", // French
    "alors", "au", "aussi", "avec", "ce", "c'est", "ça", "dans", "des", "donc", "du", "elle", "et",
    "il", "ils", "je", "j'ai", "le", "les", "mais", "ne", "nous", "on", "ou", "pas", "pour",
    "puis", "qui", "sur", "très", "une", "vous", // German
    "aber", "als", "auch", "auf", "bei", "bin", "dann", "das", "dass", "dem", "den", "denn", "der",
    "des", "die", "doch", "ein", "eine", "einen", "er", "es", "für", "habe", "haben", "hat", "ich",
    "im", "ist", "ja", "mit", "nach", "nein", "nicht", "noch", "nur", "oder", "schon", "sehr",
    "sind", "und", "von", "war", "weil", "wenn", "wir", "zu", // Italian
    "anche", "che", "di", "e", "gli", "il", "ma", "molto", "non", "perché", "per", "poi", "quindi",
    "sono", "è", // Portuguese
    "às", "eu", "então", "isso", "mas", "muito", "não", "na", "nas", "os", "ou", "uma", "um",
    "você", // Polish
    "ale", "bo", "czy", "dla", "jak", "jeszcze", "jest", "już", "także", "tak", "też", "to", "więc",
    "że", "nie", "się", "są", // Dutch
    "dat", "een", "en", "het", "ik", "maar", "niet", "ook", "want",
];

#[cfg(test)]
mod tests {
    use super::*;

    fn typed(before: &str, text: &str) -> String {
        join(before, text, false).typed()
    }

    fn code(before: &str, text: &str) -> String {
        join(before, text, true).typed()
    }

    #[test]
    fn the_founders_two_takes_read_as_one() {
        assert_eq!(
            typed(
                "We're just staying in San Miguel",
                "Not doing much to be honest"
            ),
            " not doing much to be honest"
        );
    }

    #[test]
    fn a_space_after_words_digits_and_punctuation() {
        assert_eq!(typed("hello", "world"), " world");
        assert_eq!(typed("room 12", "is free"), " is free");
        assert_eq!(typed("Done.", "next one"), " Next one");
        assert_eq!(typed("Really?", "yes"), " Yes");
        assert_eq!(typed("Wow!", "great"), " Great");
        assert_eq!(typed("first,", "Then second"), " then second");
        assert_eq!(typed("as follows:", "The plan"), " the plan");
        assert_eq!(typed("one;", "two"), " two");
        assert_eq!(typed("(see above)", "Then"), " then");
        assert_eq!(typed("he said “hi”", "And left"), " and left");
        assert_eq!(typed("he said \"hi\"", "And left"), " and left");
        assert_eq!(typed("up 5%", "today"), " today");
        assert_eq!(typed("well…", "maybe"), " maybe");
    }

    #[test]
    fn no_space_at_the_start_of_a_field_or_line() {
        assert_eq!(typed("", "Hello there"), "Hello there");
        assert_eq!(typed("Hi Anna,\n", "Thanks for this"), "Thanks for this");
        assert_eq!(typed("Line one.\r\n", "Line two"), "Line two");
        assert_eq!(typed("Hi,\n\n", "The report"), "The report");
    }

    #[test]
    fn already_spaced_only_adjusts_case() {
        assert_eq!(typed("staying in town ", "Not much"), "not much");
        assert_eq!(typed("It works. ", "then we ship"), "Then we ship");
        assert_eq!(typed("   ", "Hello"), "Hello");
        assert_eq!(typed("word ", " extra"), " extra");
    }

    #[test]
    fn no_space_after_opening_brackets_quotes_or_joiners() {
        assert_eq!(typed("call (", "Maybe"), "Maybe");
        assert_eq!(typed("[", "note"), "note");
        assert_eq!(typed("he said “", "Hi"), "Hi");
        assert_eq!(typed("he said \"", "Hi"), "Hi");
        assert_eq!(typed("he said '", "hi"), "hi");
        assert_eq!(typed("«", "Bonjour"), "Bonjour");
        assert_eq!(typed("¿", "Qué tal"), "Qué tal");
        assert_eq!(typed("well-", "known"), "known");
        assert_eq!(typed("and/", "or"), "or");
        assert_eq!(typed("@", "anna"), "anna");
        assert_eq!(typed("#", "general"), "general");
        assert_eq!(typed("snake_", "case"), "case");
    }

    #[test]
    fn no_space_before_punctuation_or_whitespace() {
        assert_eq!(typed("hello", ", world"), ", world");
        assert_eq!(typed("the end", "."), ".");
        assert_eq!(typed("Anna", "'s laptop"), "'s laptop");
        assert_eq!(typed("why", "?"), "?");
        assert_eq!(typed("one", ")"), ")");
        assert_eq!(typed("one", " two"), " two");
        assert_eq!(typed("one", "\ntwo"), "\ntwo");
        assert_eq!(typed("one", ""), "");
    }

    #[test]
    fn i_names_and_acronyms_keep_their_capitals() {
        assert_eq!(typed("and then", "I left"), " I left");
        assert_eq!(typed("and then", "I'm here"), " I'm here");
        assert_eq!(typed("and then", "I'll go"), " I'll go");
        assert_eq!(typed("we met", "Anna yesterday"), " Anna yesterday");
        assert_eq!(typed("flying to", "San Miguel"), " San Miguel");
        assert_eq!(typed("working at", "NASA now"), " NASA now");
        assert_eq!(typed("see", "OK then"), " OK then");
        assert_eq!(typed("ask", "Will about it"), " Will about it");
        assert_eq!(typed("since", "May"), " May");
        assert_eq!(typed("bought an", "iPhone"), " iPhone");
        assert_eq!(typed("It's done.", "iPhone works"), " iPhone works");
        assert_eq!(typed("Danke,", "Sie sind nett"), " Sie sind nett");
        // German nouns are capitalised mid-sentence.
        assert_eq!(typed("wir haben", "Zeit"), " Zeit");
    }

    #[test]
    fn other_languages_with_spaces() {
        assert_eq!(
            typed("Estamos en Madrid", "Pero mañana no"),
            " pero mañana no"
        );
        assert_eq!(typed("Fin.", "él vino"), " Él vino");
        assert_eq!(typed("On est à Paris", "Et il pleut"), " et il pleut");
        assert_eq!(
            typed("Wir sind in Berlin", "Und es regnet"),
            " und es regnet"
        );
        assert_eq!(typed("Fertig.", "über alles"), " Über alles");
        assert_eq!(
            typed("Jesteśmy w Krakowie", "Ale jutro wracamy"),
            " ale jutro wracamy"
        );
        assert_eq!(typed("Siamo a Roma", "Ma domani no"), " ma domani no");
        assert_eq!(
            typed("Estamos em Lisboa", "Mas amanhã não"),
            " mas amanhã não"
        );
        assert_eq!(typed("Мы в Москве", "Завтра домой"), " Завтра домой");
        assert_eq!(typed("Готово.", "завтра домой"), " Завтра домой");
        assert_eq!(typed("Είμαστε εδώ", "τώρα"), " τώρα");
        assert_eq!(typed("우리는 서울에", "있어요"), " 있어요");
        assert_eq!(typed("نحن في القاهرة", "الآن"), " الآن");
        assert_eq!(typed("हम दिल्ली में हैं", "अभी"), " अभी");
    }

    #[test]
    fn chinese_japanese_and_thai_take_no_spaces() {
        assert_eq!(typed("我们在北京", "明天回家"), "明天回家");
        assert_eq!(typed("我们在北京。", "明天回家"), "明天回家");
        assert_eq!(typed("东京にいます", "明日帰ります"), "明日帰ります");
        assert_eq!(typed("終わりました。", "次へ"), "次へ");
        assert_eq!(typed("好的，", "没问题"), "没问题");
        assert_eq!(typed("我用", "iPhone"), "iPhone");
        assert_eq!(typed("Meeting with", "张伟"), "张伟");
        assert_eq!(typed("เราอยู่ที่กรุงเทพ", "พรุ่งนี้กลับบ้าน"), "พรุ่งนี้กลับบ้าน");
    }

    #[test]
    fn code_editors_and_terminals_keep_case_and_member_access() {
        assert_eq!(code("obj.", "method"), "method");
        assert_eq!(code("http:", "example"), "example");
        assert_eq!(code("fix the bug", "Then run tests"), " Then run tests");
        assert_eq!(code("fn(a,", "b"), " b");
        assert_eq!(code("print(", "x"), "x");
        assert_eq!(code("$ ", "ls"), "ls");
        assert_eq!(code("it works. ", "then ship"), "then ship");
        assert_eq!(code("", "Hello"), "Hello");
    }
}
