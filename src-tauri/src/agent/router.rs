//! Write, answer, act or recall: decided from what the user said, in the same
//! model call that would have polished it. Writing works exactly like plain
//! dictation and is the default whenever the router is unsure.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::Deserialize;
use tauri::AppHandle;

use super::llm;

#[derive(Debug, Clone, PartialEq)]
pub enum Route {
    /// Paste this text (already polished per the user's prompt).
    Write(String),
    Answer {
        query: String,
        needs_web: bool,
        about_screen: bool,
    },
    Act(Action),
    Recall(String),
    /// Draft text from an instruction ("reply here saying Thursday works"),
    /// then insert it where the cursor is, or offer it if nothing has focus.
    Compose(String),
    /// "What can I say?": show examples.
    Help,
    /// Already dealt with (e.g. the user answered a suggestion by voice).
    Handled,
}

/// Things the agent can do without touching other apps' UI (P1's ladder rungs
/// 1–2). Multi-step computer use is P4.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    OpenApp {
        name: String,
    },
    OpenUrl {
        url: String,
    },
    WebSearch {
        query: String,
    },
    Reminder {
        title: String,
        due: Option<String>,
    },
    CalendarEvent {
        title: String,
        start: String,
        end: Option<String>,
        location: Option<String>,
    },
    Shortcut {
        name: String,
    },
    Unsupported {
        description: String,
    },
}

/// Openers that suggest the user is talking *to* Ambient rather than
/// dictating. Only these phrases ever reach the router; everything else is
/// polished and pasted with no extra call.
static REQUEST_CUES: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:hey\s+ambient|ambient|ok(?:ay)?\s+ambient)\b
        | ^\s*(?:what|what's|whats|who|who's|when|where|why|how|which|is|are|was|were|do|does|did|can|could|should|would|will)\b
        | ^\s*(?:search|look\s+up|google|find|open|launch|start|go\s+to|show\s+me|tell\s+me|remind\s+me|set\s+(?:a\s+)?reminder|schedule|add|create|book|run|play|summari[sz]e|explain|translate|define|calculate|convert)\b
        | \b(?:this|that)\s+(?:page|email|thread|article|error|document|doc|message|window|pdf|code)\b
        | \?\s*$",
    )
    .expect("router cues")
});

static QUESTION_START: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:what|what's|whats|who|who's|when|where|why|how|which|is|are|does|do|can|could|should)\b").expect("question start")
});

pub fn starts_like_question(transcript: &str) -> bool {
    QUESTION_START.is_match(transcript)
}

pub fn looks_like_request(transcript: &str) -> bool {
    REQUEST_CUES.is_match(transcript) || addresses_ambient(transcript)
}

/// The cheap request cues are English. Someone who also dictates in other
/// languages gets the router on every dictation instead (with polish on that
/// costs nothing extra: the router's "write" result is the polished text).
pub fn cues_cover(spoken_languages: &[String]) -> bool {
    spoken_languages.is_empty()
        || spoken_languages
            .iter()
            .all(|l| l == "en" || l.starts_with("en-"))
}

/// Talking to Ambient by name ("hey Ambient, …") overrides the app context.
/// "Ambient, …" with an optional greeting in any language ("Hola Ambient",
/// "Hallo Ambient", "Hey Ambient"): the name is the same everywhere.
static ADDRESSED: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^\W*(?:(?:hey|hi|hello|ok|okay|yo|hola|oye|oi|olá|ola|hallo|hej|hei|salut|bonjour|ciao|ehi|привет|эй|слушай|привіт|здравей|здрасти|cześć|hej|ahoj|merhaba|selam|halo|hai|xin chào|مرحبا|اهلا|היי|שלום|嘿|你好|ねえ|こんにちは|안녕)[\s,!、，！]+)?ambient\b",
    )
    .expect("addressed")
});

pub fn addresses_ambient(transcript: &str) -> bool {
    ADDRESSED.is_match(transcript)
}

/// The transcript without a leading "Hey Ambient," / "Ambient,".
pub fn without_address(transcript: &str) -> &str {
    match ADDRESSED.find(transcript) {
        Some(m) => transcript[m.end()..].trim_start_matches(|c: char| {
            c.is_whitespace() || matches!(c, ',' | ':' | ';' | '.' | '!' | '、' | '，')
        }),
        None => transcript,
    }
}

/// An instruction to write something rather than the words to type: "reply
/// here saying Thursday works", "write a reply telling them yes", "draft an
/// email to Sam about the launch". Plain dictation that happens to start with
/// "reply" ("Reply to John by Friday") has no "saying/telling/that…" and
/// stays text.
static COMPOSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?
        (?:
            (?:reply|respond|answer|write\s+back)(?:\s+(?:here|to\s+(?:this|that|them|him|her|it|the\s+\w+)|all))?
              [\s,]+(?:saying|and\s+say|to\s+say|telling\s+\w+|and\s+tell\s+\w+|that|with)\b
          | (?:write|draft|compose)\s+(?:a|an|the|my|me\s+a)?\s*(?:quick\s+|short\s+|polite\s+|friendly\s+)?
              (?:reply|response|email|message|answer|follow[\s-]?up|note)\b
        )",
    )
    .expect("compose cues")
});

/// What to compose, if the transcript is an instruction to write.
pub fn compose_request(transcript: &str) -> Option<String> {
    let t = without_address(transcript).trim();
    COMPOSE.is_match(t).then(|| t.to_string())
}

/// "What can I say?", "what can you do?", "help": the user wants the examples.
static HELP: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:
            what\s+(?:can|should|do)\s+i\s+(?:say|ask)(?:\s+(?:you|here))?
          | what\s+can\s+you\s+do(?:\s+for\s+me)?
          | what\s+(?:are\s+)?(?:your|the)\s+commands
          | how\s+do\s+i\s+use\s+(?:you|this|ambient)
          | (?:show\s+(?:me\s+)?)?(?:the\s+)?(?:help|examples|commands)
          | help(?:\s+me)?
        )\s*[?.!]*\s*$",
    )
    .expect("help cues")
});

pub fn is_help_request(transcript: &str) -> bool {
    HELP.is_match(without_address(transcript))
}

/// Where the user is, as far as routing cares.
#[derive(Debug, Clone, Default)]
pub struct Place {
    pub bundle_id: String,
    pub app: String,
    pub title: String,
    pub url: String,
    /// macOS reports a focused text field (a hint only).
    pub editable: bool,
}

/// AI assistants: anything said here is a prompt for them, not for Ambient.
const AI_CHAT_APPS: &[&str] = &[
    "com.openai.chat",
    "com.anthropic.claudefordesktop",
    "com.google.GeminiMacOS",
    "ai.perplexity.mac",
    "com.microsoft.copilot-mac",
    "com.todesktop.230313mzl4w4u92", // Cursor (its chat and editor)
    "dev.zed.Zed",
    "com.raycast.macos",
    // Windows (executable names).
    "chatgpt.exe",
    "claude.exe",
    "perplexity.exe",
    "cursor.exe",
    "zed.exe",
];
const AI_CHAT_SITES: &[&str] = &[
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "gemini.google.com",
    "perplexity.ai",
    "copilot.microsoft.com",
    "chat.deepseek.com",
    "grok.com",
    "poe.com",
];
/// Messaging and email: requests here are usually addressed to people.
const MESSAGING_APPS: &[&str] = &[
    "com.tinyspeck.slackmacgap",
    "com.microsoft.teams2",
    "com.microsoft.teams",
    "com.hnc.Discord",
    "com.apple.mail",
    "com.microsoft.Outlook",
    "com.superhuman.electron",
    "com.readdle.SparkDesktop",
    "net.whatsapp.WhatsApp",
    "ru.keepcoder.Telegram",
    "com.apple.MobileSMS",
    "notion.id",
    "com.linear",
    // Windows (executable names).
    "slack.exe",
    "ms-teams.exe",
    "teams.exe",
    "discord.exe",
    "outlook.exe",
    "olk.exe",
    "whatsapp.exe",
    "whatsapp.root.exe",
    "telegram.exe",
    "notion.exe",
    "linear.exe",
];
const MESSAGING_SITES: &[&str] = &[
    "mail.google.com",
    "outlook.live.com",
    "outlook.office",
    "app.slack.com",
    "teams.microsoft.com",
    "web.whatsapp.com",
    "discord.com/channels",
    "linear.app",
    "notion.so",
    "docs.google.com",
];

impl Place {
    pub fn is_ai_chat(&self) -> bool {
        AI_CHAT_APPS.contains(&self.bundle_id.as_str())
            || AI_CHAT_SITES.iter().any(|s| self.url.contains(s))
    }
    pub fn is_messaging(&self) -> bool {
        MESSAGING_APPS.contains(&self.bundle_id.as_str())
            || MESSAGING_SITES.iter().any(|s| self.url.contains(s))
    }
}

/// Read where the user is (metadata only: app, title, URL, focus).
pub fn place() -> Place {
    let Some(front) = crate::context::frontmost_app() else {
        return Place::default();
    };
    let mut p = Place {
        bundle_id: front.bundle_id.clone(),
        app: front.name.clone(),
        ..Default::default()
    };
    if crate::context::accessibility_trusted() {
        // Metadata only; the never-watch list still applies.
        if let Ok(s) = crate::context::snapshot(0, &[]) {
            p.title = s.window_title;
            p.url = s.url.unwrap_or_default();
            p.editable = s.editable;
        }
    }
    p
}

/// Plain dictation should skip the router entirely here: the user is typing
/// a prompt into an AI assistant, and isn't talking to Ambient.
pub fn always_write_here(place: &Place, transcript: &str) -> bool {
    place.is_ai_chat() && !addresses_ambient(transcript)
}

const SYSTEM: &str = r#"You route a voice transcript the user just spoke on their computer. Decide what they want:
- "write": they are dictating text to be typed where their cursor is: messages, emails, notes, documents, code comments. This includes questions or requests addressed to OTHER PEOPLE ("can we move the call to Thursday?", "please send me the deck"), and anything asking for someone's opinion, plans or status, in any language ("what do you think about…", "qué te parece…", "co myślisz o…", "how's it going…", "are you free…"). The transcript may be in any language; decide the same way.
- "answer": they ask YOU, the assistant, for facts, an explanation, a calculation, a translation, or about what's on their screen ("summarise this", "translate this into Spanish", "what does this error mean"). Translating or rewriting text is always "answer", never "act".
- "act": they want something done on the computer: open an app or website, search the web in the browser, create a reminder or calendar event, run one of their Shortcuts.
- "recall": they ask about something they said, dictated, read or saw earlier ("what did I say about pricing", "what was that number on the page").
If unsure, choose "write". A message or email being composed is always "write".

Reply with JSON only, no prose:
{"intent":"write|answer|act|recall","text":"...","query":"...","needs_web":false,"about_screen":false,"action":null}
- write: "text" = the transcript cleaned up following POLISH RULES below.
- answer: "query" = the question, made self-contained. "needs_web" = true only if it needs current or specific facts you may not know (news, prices, rates, schedules, recent events, specific businesses). "about_screen" = true if it refers to "this"/the current window.
- recall: "query" = what to look for.
- act: "action" is one of:
  {"type":"open_app","name":"Slack"}
  {"type":"open_url","url":"https://..."}
  {"type":"web_search","query":"..."}
  {"type":"reminder","title":"...","due":"YYYY-MM-DDTHH:MM or null"}
  {"type":"calendar_event","title":"...","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM or null","location":null}
  {"type":"shortcut","name":"..."}
  {"type":"unsupported","description":"..."}
Resolve relative dates ("Friday", "at 5") against NOW below, in local time."#;

#[derive(Deserialize)]
struct Raw {
    intent: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    needs_web: bool,
    #[serde(default)]
    about_screen: bool,
    #[serde(default)]
    action: Option<Action>,
}

fn parse(reply: &str) -> Option<Route> {
    let start = reply.find('{')?;
    let end = reply.rfind('}')?;
    let raw: Raw = serde_json::from_str(reply.get(start..=end)?).ok()?;
    let nonempty = |s: Option<String>| s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    match raw.intent.as_str() {
        "write" => nonempty(raw.text).map(Route::Write),
        "answer" => nonempty(raw.query).map(|query| Route::Answer {
            query,
            needs_web: raw.needs_web,
            about_screen: raw.about_screen,
        }),
        "act" => raw.action.map(Route::Act),
        "recall" => nonempty(raw.query).map(Route::Recall),
        _ => None,
    }
}

/// Route a transcript. `polish_rules` is the user's selected polish prompt
/// (empty when polish is off, in which case "write" returns the transcript
/// with only obvious fixes). `editable_hint` is true when macOS reports a
/// focused text field: a nudge toward writing, never a requirement.
/// First pass on this Mac (Apple Intelligence, guided to four labels).
/// "write" ends routing here: the text stays on the Mac and is polished as
/// plain dictation. Anything else goes to the full router for the details.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn classify_on_device(transcript: &str) -> Option<String> {
    extern "C" {
        fn ambient_classify_route(text: *const std::ffi::c_char) -> *mut std::ffi::c_char;
    }
    let c = std::ffi::CString::new(transcript.replace('\0', "")).ok()?;
    let ptr = unsafe { ambient_classify_route(c.as_ptr()) };
    if ptr.is_null() {
        return None;
    }
    let label = unsafe { std::ffi::CStr::from_ptr(ptr) }
        .to_string_lossy()
        .to_string();
    unsafe { libc_free(ptr) };
    Some(label)
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
unsafe fn libc_free(ptr: *mut std::ffi::c_char) {
    extern "C" {
        fn free(p: *mut std::ffi::c_void);
    }
    free(ptr as *mut std::ffi::c_void);
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn classify_on_device(_transcript: &str) -> Option<String> {
    None
}

/// True when the Mac's own model says these words are just text to type.
///
/// Not used for routing: measured 29/33 on the labelled set against 33/33
/// hosted, and its misses typed real requests ("summarise this thread")
/// instead of answering them. Kept for re-evaluation as Apple's model improves.
#[allow(dead_code)]
pub async fn on_device_says_write(app: &AppHandle, transcript: &str) -> bool {
    if !super::llm::use_on_device(app, transcript.len() + 1_500) || addresses_ambient(transcript) {
        return false;
    }
    let t = transcript.to_string();
    let label = tauri::async_runtime::spawn_blocking(move || classify_on_device(&t))
        .await
        .ok()
        .flatten();
    label.as_deref() == Some("write")
}

/// `ask` is set for the Ask shortcut: the user is talking to the agent.
/// `previous` is the last question and answer while that card is still up
/// (or just closed), so "what other emails did we get from them" resolves.
pub async fn route(
    app: &AppHandle,
    transcript: &str,
    polish_rules: &str,
    place: &Place,
    ask: bool,
    previous: Option<(String, String)>,
) -> Option<Route> {
    let now = chrono::Local::now().format("%A %Y-%m-%d %H:%M").to_string();
    let rules = if polish_rules.trim().is_empty() {
        "Keep the user's words; fix only punctuation and capitalisation.".to_string()
    } else {
        polish_rules.replace("${output}", "the transcript")
    };
    let system = format!("{SYSTEM}\n\nNOW: {now}\n\nPOLISH RULES:\n{rules}");
    let mut where_ = format!("Frontmost: {}", place.app);
    if !place.title.is_empty() {
        where_.push_str(&format!(" — {}", place.title));
    }
    if !place.url.is_empty() {
        let host = place
            .url
            .split("://")
            .nth(1)
            .unwrap_or(&place.url)
            .split('/')
            .next()
            .unwrap_or("");
        where_.push_str(&format!(" ({host})"));
    }
    if place.editable {
        where_.push_str(", a text field is focused");
    }
    if place.is_messaging() && !addresses_ambient(transcript) {
        where_.push_str(". This is a messaging/email/docs app: requests, questions and commands here are almost always text for the people or the document → \"write\", unless they clearly address you, the assistant");
    }
    let follow_up = previous
        .map(|(q, a)| {
            let a: String = a.chars().take(600).collect();
            format!("(Your previous answer is still on screen. If this follows up on it, make \"query\" self-contained using it.)\nPrevious question: {q}\nPrevious answer: {a}\n")
        })
        .unwrap_or_default();
    let user = if ask {
        format!("(The user is talking to you: never choose \"write\".)\n{follow_up}{where_}\nTranscript: {transcript}")
    } else {
        format!("{follow_up}{where_}\nTranscript: {transcript}")
    };
    let reply = llm::complete_hosted(app, "route", &system, &user).await?;
    let route = parse(&reply);
    if route.is_none() {
        log::debug!("router reply didn't parse; writing instead");
    }
    route
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cues_catch_requests_and_skip_dictation() {
        for s in [
            "what's the weather in Lisbon",
            "remind me at 5 to call Sam",
            "summarise this thread",
            "open Linear",
            "hey ambient translate this to Spanish",
            "is it going to rain tomorrow?",
        ] {
            assert!(looks_like_request(s), "{s}");
        }
        for s in [
            "Thanks for the update, I'll send the numbers tomorrow.",
            "Let's push the sync to Thursday",
            "I think we should ship the beta next week",
        ] {
            assert!(!looks_like_request(s), "{s}");
        }
    }

    #[test]
    fn hears_its_name_in_any_language() {
        for s in [
            "Hey Ambient, what's the time",
            "Hola Ambient, ¿qué hora es?",
            "Ambient, summarise this",
            "привет ambient",
            "嘿，Ambient",
            "Привіт Ambient",
        ] {
            assert!(addresses_ambient(s), "{s}");
        }
        for s in ["The ambient lighting is too dim", "I like ambient music"] {
            assert!(!addresses_ambient(s), "{s}");
        }
    }

    #[test]
    fn spots_compose_instructions() {
        for s in [
            "Reply here saying Thursday works",
            "reply saying Thursday works for me",
            "Hey Ambient, reply to them saying yes",
            "write a reply telling them we're in",
            "Draft an email to Sam about the launch",
            "respond and say thanks",
            "write back saying I'll be late",
            "can you draft a quick reply",
        ] {
            assert!(compose_request(s).is_some(), "{s}");
        }
        assert_eq!(
            compose_request("Hey Ambient, reply saying yes").as_deref(),
            Some("reply saying yes")
        );
        for s in [
            "Reply to John by Friday",
            "I'll reply tomorrow",
            "The response was great, thanks",
            "Thanks for the reply, I'll send the numbers tomorrow.",
            "We should write the email copy next week",
        ] {
            assert!(compose_request(s).is_none(), "{s}");
        }
    }

    #[test]
    fn spots_help_requests() {
        for s in [
            "Hey Ambient, what can I say?",
            "what can I say",
            "What can you do?",
            "Ambient, help",
            "show me the commands",
        ] {
            assert!(is_help_request(s), "{s}");
        }
        for s in [
            "What can I say to Sam about the delay?",
            "help me write this email",
            "I need help with the deck",
        ] {
            assert!(!is_help_request(s), "{s}");
        }
    }

    #[test]
    fn strips_the_address() {
        assert_eq!(without_address("Hey Ambient, open Notes"), "open Notes");
        assert_eq!(without_address("open Notes"), "open Notes");
    }

    #[test]
    fn parses_router_json() {
        assert_eq!(
            parse(r#"{"intent":"write","text":"Hi there."}"#),
            Some(Route::Write("Hi there.".into()))
        );
        assert_eq!(
            parse(r#"Sure: {"intent":"act","action":{"type":"open_app","name":"Slack"}}"#),
            Some(Route::Act(Action::OpenApp {
                name: "Slack".into()
            }))
        );
        assert!(matches!(
            parse(r#"{"intent":"answer","query":"UK CGT rate","needs_web":true}"#),
            Some(Route::Answer {
                needs_web: true,
                ..
            })
        ));
        assert_eq!(parse("not json"), None);
    }
}
