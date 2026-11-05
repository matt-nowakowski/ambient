//! What the screen says it is: a conversation, mail, a terminal. Read from
//! the evidence a snapshot already carries (the URL's shape, what the window
//! calls itself, the shape of its text), never from which app it is.

use once_cell::sync::Lazy;
use regex::Regex;

// The app lists are hints. A bundle id never says what a window shows, and
// a new client, a web app or another OS's build is simply absent from them,
// so the screen is read for evidence instead: the shape of the URL, what the
// window calls itself, and the shape of the text. An app nobody has listed
// yet is judged the same way as a known one whose screen says the same thing.

/// A chat or mail host or path: "web.whatsapp.com", ".../messages/123",
/// "mail.acme.com", ".../inbox". Applied to the URL only.
static MESSAGING_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:^|[/.:_-])(?:webmail|mail|gmail|hotmail|outlook|protonmail|fastmail|inbox|messages|messenger|chat|chats|conversation|conversations|threads|slack|teams|discord|whatsapp|telegram|signal|element|zulip|mattermost|rocket\.chat|dms?)(?:[/.:_-]|$)",
    )
    .expect("messaging url")
});

/// A window that calls itself an inbox or a chat: "Inbox (3) - Gmail",
/// "Ana Lopez | Slack", "Messages", "Team chat". Titles and app names only.
static MESSAGING_TITLE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)
          ^\s*(?:inbox|starred|sent|drafts|spam|trash)\s*[(\[]\d
        | \b(?:gmail|outlook|protonmail|fastmail|slack|teams|discord|whatsapp|telegram|signal|messenger|element|zulip|mattermost|rocket\.chat|mail)\b\s*(?:[-–—:|·]|$)
        | [-–—:|·]\s*(?:chat|chats|messages?|mail|inbox|slack|teams|discord|whatsapp|telegram|signal)\s*$
        | \b\d+\s+new\s+messages?\b
        | \bchat\s+(?:with|about)\b
        ",
    )
    .expect("messaging title")
});

/// Mail headers, one per message ("From:", "To:", "Subject:").
static MAIL_HEADER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?im)^\s*(?:from|to|cc|bcc|subject|sent|reply-to):\s*\S").expect("mail header")
});
/// A sender's address alone on its line, as a thread shows it.
static ADDRESS_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^\s*<?[\w.+-]+@[\w-]+(?:\.[\w-]+)+>?\s*$").expect("address line")
});
/// "On Mon, Oct 3, Ana Lopez wrote:" -- one per quoted reply.
static WROTE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?im)^\s*on\b.{5,80}\bwrote:\s*$").expect("wrote line"));
/// Gmail's "(2 days ago)" (or "(now)") stamp.
static AGO: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\(\s*(?:\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|now|just now)\s*\)",
    )
    .expect("ago")
});
/// A line that is only a message's time ("10:14 AM", "Today at 9:02"), how a
/// chat lays each message out; a terminal prints its stamps inside its lines.
static STAMP_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?im)^\s*(?:\d{1,2}:\d{2}\s?(?:[ap]m)?|(?:today|yesterday)\s+at\s+\d{1,2}:\d{2}\s?(?:[ap]m)?|\d{1,2}\s+\p{L}{3,9}\s+\d{4})\s*$",
    )
    .expect("stamp line")
});

/// Whether the URL, the window's title or its app name say "a conversation".
pub fn messaging_named(url: &str, title: &str, app: &str) -> bool {
    MESSAGING_URL.is_match(url) || MESSAGING_TITLE.is_match(title) || MESSAGING_TITLE.is_match(app)
}

/// The text is laid out as messages rather than a page: mail headers, a
/// "wrote:" line, "2 days ago", a sender's address on its own line, or
/// several lines that are only a time stamp. A terminal transcript shows
/// shell prompts and output instead, so it gives none of these (Matt
/// reported an offer to summarise an "email thread" over exactly one).
pub fn messaging_text(text: &str) -> bool {
    let t = tail(text, 3_000);
    if MAIL_HEADER.is_match(t) || WROTE.is_match(t) {
        return true;
    }
    if AGO.is_match(t) && (STAMP_LINE.is_match(t) || ADDRESS_LINE.is_match(t)) {
        return true;
    }
    if STAMP_LINE.find_iter(t).count() >= 2 {
        return true;
    }
    ADDRESS_LINE.find_iter(t).count() >= 2
}

/// The last `n` characters of `text`.
pub fn tail(text: &str, n: usize) -> &str {
    let count = text.chars().count();
    if count <= n {
        return text;
    }
    let skip = text.char_indices().nth(count - n).map_or(0, |(i, _)| i);
    &text[skip..]
}

/// An assistant's name on the window (its host, title or app).
static AI_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(?:chatgpt|openai|claude|anthropic|gemini|bard|perplexity|copilot|deepseek|grok|mistral|llama|chatbot|ai assistant)\b",
    )
    .expect("ai name")
});
pub fn ai_chat_named(url: &str, title: &str, app: &str) -> bool {
    AI_NAME.is_match(url) || AI_NAME.is_match(title) || AI_NAME.is_match(app)
}

/// A mail host or path: "webmail.posteo.de", "mail.acme.com", ".../inbox",
/// Roundcube's "?_task=mail". Applied to the URL only.
static MAIL_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)(?:^|[/.:_=-])(?:webmail|mail|gmail|hotmail|outlook|protonmail|fastmail|roundcube|squirrelmail|inbox)(?:[/.:_&?#=-]|$)",
    )
    .expect("mail url")
});
/// Mail named in a short part of a title: "Posteo Webmail :: Re: Lease",
/// "Re: Q4 - Acme Mail". A sentence that mentions mail is not a name.
static MAIL_WORD: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(?:webmail|e-?mail|mail|inbox|gmail|outlook|protonmail|fastmail|roundcube)\b",
    )
    .expect("mail word")
});
/// What separates the parts of a window title ("Thread - Account - App").
const TITLE_SEPARATORS: &[&str] = &[" - ", " – ", " — ", " | ", " :: ", " · "];

/// The parts of a window title, trimmed ("Re: Q4 - Acme Mail" is two).
pub fn title_parts(title: &str) -> Vec<&str> {
    let mut parts = vec![title];
    for sep in TITLE_SEPARATORS {
        parts = parts.iter().flat_map(|p| p.split(sep)).collect();
    }
    parts
        .into_iter()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect()
}

/// The URL, or a short part of the title, says mail.
pub fn mail_named(url: &str, title: &str) -> bool {
    MAIL_URL.is_match(url)
        || title_parts(title)
            .iter()
            .any(|p| p.split_whitespace().count() <= 3 && MAIL_WORD.is_match(p))
}

/// The text is laid out as mail: two kinds of header ("From:" and "To:"),
/// a quoted "On … wrote:", or a sender's address beside "(2 days ago)".
pub fn mail_text(text: &str) -> bool {
    let t = tail(text, 6_000);
    let headers: std::collections::HashSet<String> = MAIL_HEADER
        .find_iter(t)
        .filter_map(|m| m.as_str().trim().split(':').next().map(str::to_lowercase))
        .collect();
    headers.len() >= 2 || WROTE.is_match(t) || (AGO.is_match(t) && ADDRESS_LINE.is_match(t))
}

/// A message's byline: who and when, at the end of a short line ("Ana Lopez
/// 10:42 AM", "Ana — Today at 10:42", "Ben Ito  14:02"), or the time alone.
static CHAT_BYLINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?im)^(?:[^\n\[\]]{0,60}\s)?(?:(?:today|yesterday)\s+at\s+)?\d{1,2}:\d{2}(?:\s?[ap]m)?\s*$",
    )
    .expect("chat byline")
});

/// The text is laid out as chat messages: several bylines with a time.
pub fn chat_text(text: &str) -> bool {
    CHAT_BYLINE.find_iter(tail(text, 3_000)).count() >= 2
}

/// A shell prompt starting a line: "$ cargo test", "sam@box:~/x$ ls",
/// "❯ npm test", "PS C:\src> dir".
static PROMPT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?m)^\s*(?:[\w.-]+@[\w.-]+[:\s][^\n$#%>]{0,80}[$#%]|[$%#❯➜λ»]|PS [A-Za-z]:\\[^>\n]{0,80}>|[A-Za-z]:\\[^>\n]{0,80}>)\s+\S",
    )
    .expect("prompt")
});

/// The text is a terminal transcript: more than one shell prompt.
pub fn terminal_text(text: &str) -> bool {
    PROMPT.find_iter(tail(text, 6_000)).count() >= 2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mail_is_read_from_the_url_the_title_and_the_text() {
        assert!(mail_named(
            "https://webmail.posteo.de/?_task=mail&_uid=12&_action=show",
            ""
        ));
        assert!(mail_named("https://mail.acme.dev/thread/9", ""));
        assert!(mail_named("", "Posteo Webmail :: Re: Lease renewal"));
        assert!(mail_named("", "Re: Q4 pricing - Acme Mail"));
        assert!(!mail_named("", "How to set up mail on a new phone"));
        assert!(!mail_named("https://example.com/blog/mailing-tips", "Tips"));
        assert!(mail_text("From: Ana Lopez <ana@x.com>\nTo: me\nHi"));
        assert!(mail_text(
            "Ana Lopez\n<ana@acme.com>\nMon, Nov 2, 10:14 AM (2 hours ago)\nto me\nHi"
        ));
        assert!(mail_text(
            "Sure.\n\nOn Mon, Nov 2, 2026, Ana Lopez wrote:\n> Hi"
        ));
        assert!(!mail_text(
            "From: the archive, a 1920s photo of the harbour."
        ));
    }

    #[test]
    fn chat_and_terminals_are_read_from_the_text() {
        assert!(chat_text(
            "Ana — Today at 10:42 AM\ncan you look?\nBen — Today at 10:44 AM\nsure"
        ));
        assert!(chat_text(
            "Ben Ito  9:58 AM\nshipped\nAna Lopez  10:42 AM\nnice"
        ));
        assert!(chat_text("Ana Lopez 14:02\nok\nBen 14:05\nyes"));
        assert!(!chat_text(
            "[10:14:22] server started\n[10:14:23] listening"
        ));
        assert!(!chat_text("The meeting moved to 10:30 and then to noon."));
        assert!(terminal_text("$ npm test\nok\n$ npm run build\nerror"));
        assert!(terminal_text(
            "sam@box:~/vault$ cargo test\nok\nsam@box:~/vault$ ls\n"
        ));
        assert!(terminal_text(
            "PS C:\\src> dir\nfoo\nPS C:\\src> npm test\n"
        ));
        assert!(!terminal_text("Ben  9:58 AM\nthe fee is $ 40 now\n"));
    }
}
