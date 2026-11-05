//! Write, answer, act or recall: decided from what the user said, in the same
//! model call that would have polished it. Writing works exactly like plain
//! dictation and is the default whenever the router is unsure.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::llm;
use super::shape::{ai_chat_named, messaging_named, messaging_text};

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
    /// A bug report or feedback for the team: shown in a card to confirm.
    Report(super::report::ReportIntent),
}

/// Things the agent can do without touching other apps' UI (P1's ladder rungs
/// 1–2). Multi-step computer use is P4.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    /// "Close that window", "quit Slack": another app's window, tab or the
    /// app itself. `what` is "window", "tab", "app" or the app's name.
    CloseWindow {
        what: String,
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

/// Requests and questions in any form: imperatives ("reply saying it's
/// fine", "send it to Sam"), "can we / could you / please …", "remind me",
/// "what / how / why …", "tell them / let them know". Broader than
/// `looks_like_request`: used where nothing can be typed (no text field has
/// focus), so a request always gets an answer instead of "Did you mean to
/// type this?".
static SOUNDS_LIKE_REQUEST: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:(?:please|pls|ok(?:ay)?|so|hey|just|now)[\s,]+)*(?:
            (?:can|could|would|will|shall)\s+(?:you|u|we|i)\b
          | (?:let's|lets|let\s+us)\b
          | (?:i\s+(?:need|want|would\s+like|'d\s+like)\s+(?:you\s+to|to)|i'd\s+like\s+(?:you\s+to|to)|id\s+like\s+to)\b
          | (?:what|what's|whats|who|who's|whose|when|where|why|how|which|is|are|was|were|do|does|did|should|have|has)\b
          | (?:reply|respond|answer|tell|let\s+\w+\s+know|send|forward|draft|write|compose|email|e-mail|message|text|dm|ping|call|ring
             |remind|set|add|create|make|schedule|book|cancel|move|reschedule|invite
             |open|launch|start|close|quit|go|show|find|search|look|google|check|read|play|pause|stop|turn|switch
             |summari[sz]e|explain|translate|define|calculate|convert|compare|list|give|get|help|fix|rewrite|shorten|improve|proofread
             |copy|save|note|jot|take|share|delete|remove|clear|undo)\b
        )",
    )
    .expect("sounds like request")
});

pub fn sounds_like_request(transcript: &str) -> bool {
    let t = without_address(transcript);
    looks_like_request(transcript)
        || SOUNDS_LIKE_REQUEST.is_match(t)
        || t.trim_end().ends_with('?')
        || super::compose::compose_intent(transcript) != super::compose::ComposeIntent::No
}

/// Commands that are for Ambient even with a text field focused: things only
/// a computer does ("open Linear", "remind me…", "summarise this thread",
/// "translate this"). With a field focused outside messaging these go to
/// the agent; in messaging the router still decides, told it's likely a
/// command.
static STRONG_REQUEST: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\s*(?:(?:please|ok(?:ay)?|hey|can\s+you|could\s+you|would\s+you)[\s,]+)*(?:
            (?:open|launch)\s+(?:up\s+)?(?:the\s+)?[\w.\-]+(?:\s+app)?\s*[.!]?\s*$
          | (?:search\s+(?:the\s+web|google|for)|google|look\s+up)\b
          | (?:remind\s+me|set\s+(?:a\s+|me\s+a\s+)?(?:reminder|timer|alarm))\b
          | (?:summari[sz]e|translate|explain|proofread)\s+(?:this|that|the|my|it)\b
          | (?:what's|what\s+is|whats)\s+(?:on|in)\s+(?:this|my)\s+(?:screen|page|window)\b
          | (?:add\s+(?:this|that|it|an?\s+event|a\s+meeting)\s+to\s+(?:my\s+)?calendar)\b
          | (?:run\s+(?:my\s+)?(?:shortcut|automation))\b
        )",
    )
    .expect("strong request")
});

pub fn strong_request(transcript: &str) -> bool {
    addresses_ambient(transcript) || STRONG_REQUEST.is_match(without_address(transcript))
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

/// An instruction to write something rather than the words to type ("reply
/// to this email saying we're happy", "draft a quick reply"), decided by the
/// first pass in `compose`, without a model call.
#[cfg_attr(not(test), allow(dead_code))]
pub fn compose_request(transcript: &str) -> Option<String> {
    match super::compose::compose_intent(transcript) {
        super::compose::ComposeIntent::Yes(s) => Some(s),
        _ => None,
    }
}

/// Might be an instruction to write ("tell them we're happy", "Reply to
/// Sam"): worth a router call, which can answer "compose".
pub fn compose_maybe(transcript: &str) -> bool {
    super::compose::compose_intent(transcript) == super::compose::ComposeIntent::Maybe
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

/// "Close that", "dismiss it", "hide this card", "go away", "never mind":
/// said while one of Ambient's cards is up, it closes the card. The same on
/// every OS; "close the tab" or "quit Slack" are about other apps instead.
static DISMISS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\W*(?:(?:please|pls|ok(?:ay)?|thanks|thank\s+you|cool|great|now|just|can\s+you|could\s+you)[\s,.!]+)*(?:
            (?:close|dismiss|hide|clear)(?:\s+(?:it|this|that|the|your))?(?:\s+(?:card|answer|window|box|popup|pop-up|panel|note|notice|message|thing|one))?
          | go\s+away
          | never\s*mind
          | that'?s\s+all
        )(?:[\s,]+(?:please|thanks|thank\s+you|now))?\W*$",
    )
    .expect("dismiss cues")
});

pub fn dismiss_request(transcript: &str) -> bool {
    DISMISS.is_match(without_address(transcript))
}

/// "Close this tab", "close the browser", "quit Slack": closing another
/// app's window, tab or the app. Short commands only, so a sentence that
/// mentions closing a window ("can you close the window, it's cold") is
/// left alone. Returns what to close: "window", "tab", "app" or a name.
static CLOSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)^\W*(?:(?:please|pls|ok(?:ay)?|hey|now|just|can\s+you|could\s+you|would\s+you)[\s,]+)*
        (?:close|quit)\s+
        (?:(?:this|that|the|my|current|active|front|open)\s+)*
        (?P<what>[\w.\-]+(?:\s+[\w.\-]+)?)
        (?:\s+please)?\W*$",
    )
    .expect("close cues")
});

pub fn close_request(transcript: &str) -> Option<String> {
    let caps = CLOSE.captures(without_address(transcript))?;
    let said = caps.name("what")?.as_str().trim();
    let said = said.strip_suffix(" please").unwrap_or(said);
    let said = said
        .strip_suffix(" app")
        .or_else(|| said.strip_suffix(" App"))
        .unwrap_or(said);
    let kind = match said.to_lowercase().as_str() {
        "window" | "windows" | "browser window" => "window",
        "tab" | "tabs" | "browser tab" => "tab",
        "app" | "application" | "program" | "browser" => "app",
        // Pronouns and Ambient's own cards are dismissals, not this.
        "it" | "this" | "that" | "everything" | "all" | "card" | "answer" | "box" | "popup"
        | "pop-up" | "panel" | "notice" => return None,
        // A name, as said ("Slack").
        _ => return Some(said.to_string()),
    };
    Some(kind.to_string())
}

/// The user asked for the browser: to open or visit something, or to
/// search in the browser ("google it", "search Google for …"). A question
/// alone ("what's the weather") is answered in the card, even when it
/// needs the web.
static WANTS_BROWSER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?ix)\b(?:open|launch|go\s+to|visit|navigate\s+to|take\s+me\s+to|bring\s+up|pull\s+up)\b
        | \bin\s+(?:a|the|my)\s+(?:new\s+)?(?:browser|tab|window)\b
        | \b(?:browser|website|web\s+site|web\s+page|url)\b
        | ^\W*(?:(?:please|can\s+you|could\s+you)[\s,]+)*(?:google|bing)\b
        | \b(?:on|with|in|using)\s+(?:google|bing|duckduckgo)\b
        | \bgoogle\s+(?:it|that|this)\b
        | \bsearch\s+(?:google|bing)\b",
    )
    .expect("browser cues")
});

pub fn wants_browser(transcript: &str) -> bool {
    WANTS_BROWSER.is_match(without_address(transcript))
}

/// Questions are answered in the card on every OS. The router sometimes
/// picks "search the web in the browser" (or a site to open) for "what's
/// the weather"; unless the user asked for the browser, answer it here
/// with a web search instead.
pub fn answer_in_card(route: Route, transcript: &str) -> Route {
    let question = || {
        starts_like_question(without_address(transcript)) || transcript.trim_end().ends_with('?')
    };
    match route {
        Route::Act(Action::WebSearch { query }) if !wants_browser(transcript) => Route::Answer {
            query,
            needs_web: true,
            about_screen: false,
        },
        Route::Act(Action::OpenUrl { .. }) if !wants_browser(transcript) && question() => {
            Route::Answer {
                query: without_address(transcript).trim().to_string(),
                needs_web: true,
                about_screen: false,
            }
        }
        other => other,
    }
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
    /// Certainly no text field has focus, in an app whose accessibility can
    /// be trusted to say so: nothing said here can be typed, so speech goes
    /// to the agent unless it's clearly prose.
    pub no_field: bool,
    /// A little of the window's text, read only when asked (`place_for`), so
    /// an app or site no list knows is judged by the shape of what it shows.
    pub text: String,
}

/// AI assistants: anything said here is a prompt for them, not for Ambient.
/// The lists are hints, kept for the apps whose screens do not say what they
/// are; the screen itself decides (see `ai_chat_shape`).
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
    // Linux (lowercased app ids: executable, Snap or Flatpak).
    "cursor",
    "zed",
    "dev.zed.zed",
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
/// Messaging and email: requests here are usually addressed to people. The
/// lists are hints, kept for the apps whose screens do not say what they are;
/// the screen itself decides (see `messaging_shape`).
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
    // Linux (lowercased app ids: executable, Snap or Flatpak).
    "slack",
    "com.slack.slack",
    "teams-for-linux",
    "com.github.ismaelmartinez.teams_for_linux",
    "discord",
    "com.discordapp.discord",
    "thunderbird",
    "org.mozilla.thunderbird",
    "evolution",
    "org.gnome.evolution",
    "geary",
    "org.gnome.geary",
    "telegram-desktop",
    "org.telegram.desktop",
    "signal-desktop",
    "org.signal.signal",
    "element-desktop",
    "im.riot.riot",
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
            || ai_chat_shape(self)
    }
    pub fn is_messaging(&self) -> bool {
        MESSAGING_APPS.contains(&self.bundle_id.as_str())
            || MESSAGING_SITES.iter().any(|s| self.url.contains(s))
            || messaging_shape(self)
    }
    /// Recognised by its identity or its own labels, before any text is read.
    fn named(&self) -> bool {
        AI_CHAT_APPS.contains(&self.bundle_id.as_str())
            || MESSAGING_APPS.contains(&self.bundle_id.as_str())
            || AI_CHAT_SITES.iter().any(|s| self.url.contains(s))
            || MESSAGING_SITES.iter().any(|s| self.url.contains(s))
            || ai_chat_named(&self.url, &self.title, &self.app)
            || messaging_named(&self.url, &self.title, &self.app)
    }
}

// What the screen says it is: see `super::shape`.

/// How an assistant's chat shows its turns ("You said:", "Assistant:").
static AI_TURNS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?im)^\s*(?:you said|chatgpt said|claude said|gemini said|copilot said|assistant|human)\s*:\s*\S",
    )
    .expect("ai turns")
});

/// Typing into an assistant's prompt is writing, not asking Ambient, so an
/// unfamiliar one has to be recognised: its name on the window, or the shape
/// of its transcript (two turns, so a document mentioning "User:" is not one).
fn ai_chat_shape(p: &Place) -> bool {
    ai_chat_named(&p.url, &p.title, &p.app) || AI_TURNS.find_iter(&p.text).count() >= 2
}

/// The URL, the window's title, its app name or the shape of its text say a
/// conversation. An assistant's chat is not one.
fn messaging_shape(p: &Place) -> bool {
    if ai_chat_named(&p.url, &p.title, &p.app) {
        return false;
    }
    messaging_named(&p.url, &p.title, &p.app) || messaging_text(&p.text)
}

/// How much of the window's text is read when the app or site is not
/// recognised: enough to tell a conversation from a page or a terminal.
const PLACE_TEXT_CHARS: usize = 1_200;

/// Read where the user is (metadata only: app, title, URL, focus).
pub fn place() -> Place {
    read_place(&[], false)
}

/// Like `place`, and, when `routing` is set, a little of the window's text
/// when the app or site is not one the lists recognise: an unfamiliar chat
/// client or web app is then judged by what it shows (its URL's shape, what
/// its window calls itself, the shape of its text) instead of by its bundle
/// id. Asked for only when the dictation is going to the router anyway, so
/// plain dictation into a new app keeps its speed. The user's never-watch
/// list applies, and text is read only while reading the screen is allowed
/// (the screen-context setting on, the agent not paused).
pub fn place_for(routing: bool, agent: &crate::settings::AgentSettings) -> Place {
    let read_text = routing && agent.screen_context && !agent.is_paused();
    read_place(&agent.never_watch, read_text)
}

fn read_place(never_watch: &[String], read_text: bool) -> Place {
    let Some(front) = crate::context::frontmost_app() else {
        return Place::default();
    };
    let mut p = Place {
        bundle_id: front.bundle_id.clone(),
        app: front.name.clone(),
        ..Default::default()
    };
    if !crate::context::accessibility_trusted() {
        return p;
    }
    // Metadata only; the never-watch list still applies.
    if let Ok(s) = crate::context::snapshot(0, never_watch) {
        let url = s.url.clone().unwrap_or_default();
        p.no_field = front.bundle_id != env!("BRAND_IDENTIFIER")
            && super::focus_is_reliable(&front.bundle_id)
            && super::classify_focus(
                s.focused_role.as_deref(),
                s.editable && !s.secure,
                &s.window_title,
                &url,
            ) == Some(false);
        p.title = s.window_title;
        p.url = url;
        p.editable = s.editable;
    }
    // An app or site nothing recognises: let the screen itself say.
    if read_text && !p.named() {
        if let Ok(s) = crate::context::snapshot(PLACE_TEXT_CHARS, never_watch) {
            p.text = s.text.unwrap_or_default();
            if p.is_messaging() || p.is_ai_chat() {
                log::debug!(
                    "router: {} is judged from its screen (messaging={}, ai_chat={})",
                    p.bundle_id,
                    p.is_messaging(),
                    p.is_ai_chat()
                );
            }
        }
    }
    p
}

/// What routing knows before any model call.
#[derive(Debug, Clone, Copy)]
pub struct Situation {
    /// Certainly no text field has focus (see `Place::no_field`).
    pub no_field: bool,
    /// A text field has focus (a hint).
    pub editable: bool,
    /// Email, chat or docs in front.
    pub messaging: bool,
    /// An AI assistant's chat in front.
    pub ai_chat: bool,
    /// Said with the Ask key.
    pub ask: bool,
    /// An answer card is up.
    pub follow_up: bool,
    /// The agent config's `router.did_you_mean_bias`: with no text field,
    /// how eagerly speech is doubted as dictation and sent to the agent
    /// (≤ 0.25 only clear commands, 0.5 any request or question, ≥ 0.75
    /// everything).
    pub did_you_mean_bias: f32,
}

impl Default for Situation {
    fn default() -> Self {
        Self {
            no_field: false,
            editable: false,
            messaging: false,
            ai_chat: false,
            ask: false,
            follow_up: false,
            did_you_mean_bias: 0.5,
        }
    }
}

/// With nothing to type into, is this for the agent? Depends on the bias.
fn no_field_agent(transcript: &str, bias: f32) -> bool {
    if bias >= 0.75 {
        true
    } else if bias <= 0.25 {
        looks_like_request(transcript) || strong_request(transcript)
    } else {
        sounds_like_request(transcript)
    }
}

/// The first pass's decision.
#[derive(Debug, Clone, PartialEq)]
pub struct Decision {
    /// Decided without a model call.
    pub route: Option<Route>,
    /// For the agent: the router may not choose "write".
    pub to_agent: bool,
}

/// Route what can be routed from the words and where the user is, with no
/// model call: "what can I say?", "report a bug: …", "reply saying …",
/// "remind me tomorrow morning to …". Otherwise say whether it's certainly
/// for the agent (never typed): the Ask key, a follow-up with no field, any
/// request or question with nothing to type into, or a command only a
/// computer does (outside chats). Everything else is the router's call, and
/// with a field focused, typing stays the default.
pub fn decide(transcript: &str, s: &Situation, now: chrono::NaiveDateTime) -> Decision {
    use super::compose::{compose_intent, ComposeIntent};
    let decided = |route: Route| Decision {
        route: Some(route),
        to_agent: true,
    };
    if is_help_request(transcript) {
        return decided(Route::Help);
    }
    if let Some(r) = super::report::report_intent(transcript) {
        if r.explicit || s.ask || s.no_field || s.follow_up {
            return decided(Route::Report(r));
        }
    }
    // Typing to people in a chat or email: "remind me…" may be for them.
    let typing_to_people = s.editable && s.messaging && !s.ask;
    // A spoken marker ("reply that…", "tell her…", "remind me…", "note: …")
    // is a hard signal: it decides here, before anything weighs the words.
    if let Some(m) = super::markers::detect(transcript) {
        use super::markers::Kind;
        match m.kind {
            Kind::Draft => return decided(Route::Compose(m.instruction())),
            // Typed as said, without the marker (see `actions`). Said with
            // the Ask key it is still for the agent.
            Kind::Note if !s.ask => {
                return Decision {
                    route: None,
                    to_agent: false,
                }
            }
            Kind::Remind if !typing_to_people => {
                let spoken = if m.english && !m.trailing {
                    transcript.to_string()
                } else {
                    format!("remind me to {}", m.body)
                };
                // English dates are read here; other languages' go to the
                // router, which may not type it.
                match super::when::reminder_request(&spoken, now) {
                    Some(r) if m.english || r.due.is_some() => {
                        return decided(Route::Act(Action::Reminder {
                            due: r.due_string(),
                            title: if m.english { r.title } else { m.body.clone() },
                        }))
                    }
                    _ => {
                        return Decision {
                            route: None,
                            to_agent: true,
                        }
                    }
                }
            }
            Kind::Remind | Kind::Note => {}
        }
    }
    match compose_intent(transcript) {
        ComposeIntent::Yes(instruction) => return decided(Route::Compose(instruction)),
        // "Tell them it's fine" with nothing to type into: a reply to draft.
        ComposeIntent::Maybe if s.no_field || s.ask => {
            return decided(Route::Compose(
                without_address(transcript).trim().to_string(),
            ))
        }
        _ => {}
    }
    if let Some(r) = super::when::reminder_request(transcript, now) {
        if !typing_to_people {
            return decided(Route::Act(Action::Reminder {
                due: r.due_string(),
                title: r.title,
            }));
        }
    }
    // "Close that window", "quit Slack": said plainly how, on any OS. Where
    // it could be words to type ("close the window" in a note), the router
    // decides (it knows "close_window" too).
    if let Some(what) = close_request(transcript) {
        if s.ask || s.no_field || s.follow_up || addresses_ambient(transcript) {
            return decided(Route::Act(Action::CloseWindow { what }));
        }
    }
    let to_agent = s.ask
        || (s.follow_up && !s.editable)
        || (s.no_field && no_field_agent(transcript, s.did_you_mean_bias))
        || addresses_ambient(transcript)
        || (strong_request(transcript) && !s.messaging && !s.ai_chat);
    Decision {
        route: None,
        to_agent,
    }
}

/// Plain dictation should skip the router entirely here: the user is typing
/// a prompt into an AI assistant, and isn't talking to Ambient.
pub fn always_write_here(place: &Place, transcript: &str) -> bool {
    place.is_ai_chat() && !addresses_ambient(transcript)
}

/// The router's opening sentence. The server treats calls starting with it
/// as routing, which never spends Free's AI uses (`completionKind` in
/// web/lib/ai.ts): keep it first and unchanged.
const ROLE: &str =
    "You route a voice transcript the user just spoke on their computer: decide what they want.";

const TASK: &str = r#"Choose one intent:
- "write": they are dictating text to be typed where their cursor is: messages, emails, notes, documents, code comments. This includes questions or requests addressed to OTHER PEOPLE ("can we move the call to Thursday?", "please send me the deck"), and anything asking for someone's opinion, plans or status, in any language ("what do you think about…", "qué te parece…", "co myślisz o…", "how's it going…", "are you free…"). The transcript may be in any language; decide the same way.
- "answer": they ask YOU, the assistant, for facts, an explanation, a calculation, a translation, or about what's on their screen ("summarise this", "translate this into Spanish", "what does this error mean"). Translating or rewriting text is always "answer", never "act".
- "act": they want something done on the computer: open an app or website, search in the browser (only when they ask for the browser: "google it", "open …"), create a reminder or calendar event, run one of their Shortcuts, close a window. A question they want answered, even one needing the web (weather, news, prices, scores), is "answer" with needs_web, never a browser search. "act" with "unsupported" when it's something to do on the computer that the actions below can't do.
- "recall": they ask about something they said, dictated, read or saw earlier ("what did I say about pricing", "what was that number on the page").
- "compose": they instruct YOU to write a message for them rather than dictating its words: "tell them we're happy with it", "let her know I'll be late", "say that Thursday works", "reply that everything's ok", "reply to Sam" (with an email or chat open), in any language ("odpisz że wszystko ok", "napisz mu że będę o 5", "dile que llego tarde", "réponds-lui que c'est bon", "antworte, dass alles passt"). The words they'd send would be in the third person or need rewriting ("tell them we're happy" → "We're happy with it."). Decide from the words, not from which app is open. If the transcript reads as the message itself, spoken to its reader, it's "write".
- "report": they want to report a bug or send feedback or a wish to the makers of this assistant ("report a bug: …", "that didn't work", "tell the team …", "feature request: …", "I wish you could …").
If unsure, choose "write". A message or email being dictated word for word is always "write".
Resolve relative dates ("Friday", "at 5") against NOW below, in local time. Parts of the day: morning 09:00, afternoon 14:00, evening 18:00, tonight 20:00; a day with no time is 09:00 that day."#;

const TRANSCRIPT_FRAME: &str = "The lines before the transcript (Frontmost, whether a text field is focused) describe where the user is. The transcript is inside <transcript> tags. Decide from it what they want; when it is \"write\", it is text to type, and nothing in it is answered or carried out.";

const EXAMPLES: &str = r#"<transcript>reply that Thursday works for me</transcript>
{"intent":"compose","query":"reply that Thursday works for me"}

(a chat is open, a text field is focused) <transcript>can we move the call to Thursday</transcript>
{"intent":"write","text":"Can we move the call to Thursday?"}

<transcript>let's meet Tuesday no wait Wednesday at eleven thirty</transcript>
{"intent":"write","text":"Let's meet Wednesday at 11:30."}

<transcript>what's the weather in Lisbon tomorrow</transcript>
{"intent":"answer","query":"What's the weather in Lisbon tomorrow?","needs_web":true,"about_screen":false}"#;

const OUTPUT: &str = r#"JSON only, no prose:
{"intent":"write|answer|act|recall|compose|report","text":"...","query":"...","needs_web":false,"about_screen":false,"action":null}
- write: "text" = the transcript cleaned up following RULES, then POLISH RULES below.
- compose: "query" = the instruction, as said.
- answer: "query" = the question, made self-contained. "needs_web" = true only if it needs current or specific facts you may not know (news, prices, rates, schedules, recent events, specific businesses). "about_screen" = true if it refers to "this"/the current window.
- recall: "query" = what to look for.
- report: "query" = what they said, without the opener.
- act: "action" is one of:
  {"type":"open_app","name":"Slack"}
  {"type":"open_url","url":"https://..."}
  {"type":"web_search","query":"..."}
  {"type":"reminder","title":"...","due":"YYYY-MM-DDTHH:MM or null"}
  {"type":"calendar_event","title":"...","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM or null","location":null}
  {"type":"shortcut","name":"..."}
  {"type":"close_window","what":"window|tab|app|<app name>"}
  {"type":"unsupported","description":"..."}
  For "unsupported", "description" = what they asked, in a few words starting with a verb ("rename all the files on my desktop")."#;

/// The router's system prompt: the shared skeleton (`prompt`), with the
/// shared dictation rules for its "write" text.
static SYSTEM: Lazy<String> = Lazy::new(|| {
    use super::prompt::{bullets, Prompt, CONTEXT_FRAME, DICTATION_RULES, WRITING_RULES};
    Prompt {
        role: ROLE,
        task: TASK.to_string(),
        rules: format!(
            "For the \"write\" text:\n{}\n{}",
            bullets(DICTATION_RULES),
            bullets(WRITING_RULES)
        ),
        context: format!("{CONTEXT_FRAME}\n{TRANSCRIPT_FRAME}"),
        examples: EXAMPLES.to_string(),
        output: OUTPUT.to_string(),
    }
    .build()
});

/// The route's name, for logs (never its text).
pub fn route_name(route: Option<&Route>) -> &'static str {
    match route {
        None => "none",
        Some(Route::Write(_)) => "write",
        Some(Route::Answer { .. }) => "answer",
        Some(Route::Act(_)) => "act",
        Some(Route::Recall(_)) => "recall",
        Some(Route::Compose(_)) => "compose",
        Some(Route::Help) => "help",
        Some(Route::Handled) => "handled",
        Some(Route::Report(_)) => "report",
    }
}

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
    // Shared with the judge: a reply that says the right thing in a slightly
    // untidy way still routes, instead of quietly becoming something else.
    let raw: Raw = super::judge::parse_json_object(reply)?;
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
        "report" => nonempty(raw.query).or(nonempty(raw.text)).map(|message| {
            Route::Report(super::report::ReportIntent {
                kind: super::report::classify(&message),
                message,
                explicit: true,
            })
        }),
        "compose" => nonempty(raw.query)
            .or(nonempty(raw.text))
            .map(Route::Compose),
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

/// The router's deadline: like polish's, a little over the server's own
/// budget for a short reply.
const ROUTE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

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
    let system = format!("{}\n\nNOW: {now}\n\nPOLISH RULES:\n{rules}", *SYSTEM);
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
    if place.no_field {
        where_.push_str(". NO text field is focused, so nothing can be typed here: choose \"write\" only if this is clearly prose meant to be typed (a sentence for a message, note or document); any request, question or instruction is for you (answer/act/compose/recall)");
    } else if strong_request(transcript) && !place.is_ai_chat() {
        where_.push_str(". It starts like a command for you, the assistant: don't choose \"write\" unless it's clearly words for the people in the conversation");
    }
    // Write or compose is decided from the words and the field, the same in
    // every app (it used to lean on a list of messaging apps, which drafted
    // in Mail but typed "tell him…" verbatim in Messages and Slack).
    if place.editable
        && !addresses_ambient(transcript)
        && !place.no_field
        && !strong_request(transcript)
    {
        where_.push_str(". With a text field focused, questions and requests are usually text for the people being written to → \"write\", unless they clearly address you, the assistant, or instruct you to write the message for them (\"compose\")");
    }
    if super::markers::detect(transcript).is_some_and(|m| m.kind == super::markers::Kind::Remind) {
        where_
            .push_str(". It starts or ends with \"remind me\" in their language: a reminder (act)");
    }
    if compose_maybe(transcript) {
        where_.push_str(". The wording may be an instruction to write a message for them: choose \"compose\" if so");
    }
    let follow_up = previous
        .map(|(q, a)| {
            let a: String = a.chars().take(600).collect();
            format!(
                "(Your previous answer is still on screen. If this follows up on it, make \"query\" self-contained using it.)\nPrevious question: {q}\n{}\n",
                super::prompt::tagged("previous_answer", &a)
            )
        })
        .unwrap_or_default();
    let said = super::prompt::tagged("transcript", transcript);
    let user = if ask {
        format!(
            "(The user is talking to you: never choose \"write\".)\n{follow_up}{where_}\n{said}"
        )
    } else {
        format!("{follow_up}{where_}\n{said}")
    };
    // The reply is a short JSON object, its "text" about the transcript's
    // length: capping it bounds a runaway reply and, for short dictations,
    // gets the server's short time budget.
    let chars = u32::try_from(transcript.chars().count()).unwrap_or(u32::MAX);
    let limits = crate::llm_client::RequestLimits {
        max_tokens: Some(chars.saturating_mul(2).saturating_add(320).min(2_048)),
        // Past this, plain dictation goes on without it.
        timeout: Some(ROUTE_TIMEOUT),
    };
    let reply = llm::complete_hosted_limited(app, "route", &system, &user, limits).await?;
    let route = parse(&reply).map(|r| answer_in_card(r, transcript));
    log::debug!(
        "router decided {} ({} words, messaging={}, editable={})",
        route_name(route.as_ref()),
        transcript.split_whitespace().count(),
        place.is_messaging(),
        place.editable
    );
    if route.is_none() {
        // A reply we can't read decides what the user's dictation does, so it
        // belongs in the log at a level the next repro will actually show.
        log::warn!(
            "router reply didn't parse ({} chars for {} words); falling back",
            reply.chars().count(),
            transcript.split_whitespace().count()
        );
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

    fn now() -> chrono::NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 11, 2)
            .unwrap()
            .and_hms_opt(15, 20, 0)
            .unwrap()
    }

    fn gmail_no_field() -> Situation {
        Situation {
            no_field: true,
            messaging: true,
            ..Default::default()
        }
    }

    /// The tester's log: with no text field focused, these got "Did you
    /// mean to type this?" instead of the agent.
    #[test]
    fn requests_with_no_field_go_to_the_agent() {
        let d = decide(
            "remind me tomorrow morning to fix the vault",
            &gmail_no_field(),
            now(),
        );
        assert_eq!(
            d.route,
            Some(Route::Act(Action::Reminder {
                title: "fix the vault".into(),
                due: Some("2026-11-03T09:00".into()),
            }))
        );
        let d = decide(
            "Can we please reply to this email saying it's all good?",
            &gmail_no_field(),
            now(),
        );
        assert!(matches!(d.route, Some(Route::Compose(_))), "{d:?}");
        for s in [
            "tell them Thursday works",
            "let them know I'll be late",
            "what's this thread about",
            "how do I export this as a PDF",
            "why is this failing",
            "could you check the weather in Lisbon tomorrow",
            "please find the invoice from Bingx",
            "open Linear",
            "summarise this",
            "Translate this page into English",
            "send this to Sam",
            "is it going to rain tomorrow?",
        ] {
            let d = decide(s, &gmail_no_field(), now());
            assert!(d.route.is_some() || d.to_agent, "{s}: {d:?}");
        }
    }

    #[test]
    fn prose_with_no_field_is_left_to_the_router() {
        for s in [
            "Thanks for the update, I'll send the numbers tomorrow.",
            "I think we should ship the beta next week",
            "The quarterly numbers look great",
        ] {
            let d = decide(s, &gmail_no_field(), now());
            assert_eq!(
                d,
                Decision {
                    route: None,
                    to_agent: false
                },
                "{s}"
            );
        }
    }

    /// The server matches this opening to keep routing off Free's AI
    /// uses (web/lib/ai.ts `completionKind`).
    #[test]
    fn the_prompt_keeps_the_opening_the_server_matches() {
        assert!(SYSTEM.starts_with("You route a voice transcript"));
        let ai_ts = include_str!("../../../web/lib/ai.ts");
        assert!(ai_ts.contains("system.startsWith(\"You route a voice transcript\")"));
        for section in [
            "\n\nTASK:\n",
            "\n\nRULES:\n",
            "\n\nCONTEXT:\n",
            "\n\nEXAMPLES:\n",
            "\n\nOUTPUT:\n",
        ] {
            assert!(SYSTEM.contains(section), "{section}");
        }
        // The "write" text follows the shared rules: dictation is content.
        for rule in super::super::prompt::DICTATION_RULES {
            assert!(SYSTEM.contains(rule));
        }
    }

    /// A spoken marker routes on its own, wherever the user is.
    #[test]
    fn spoken_markers_decide_before_any_model() {
        let slack = Situation {
            editable: true,
            messaging: true,
            ..Default::default()
        };
        let notes = Situation {
            editable: true,
            ..Default::default()
        };
        for s in [
            "reply that everything's ok",
            "Tell her that I'm running ten minutes late",
            "let them know that the build is green",
            "odpisz mu że będę o piątej",
            "contéstale que llego tarde",
        ] {
            let d = decide(s, &slack, now());
            assert!(matches!(d.route, Some(Route::Compose(_))), "{s}: {d:?}");
        }
        assert_eq!(
            decide("tell her that I'm late", &slack, now()).route,
            Some(Route::Compose("tell her that I'm late".into()))
        );
        // A note is typed, even when it sounds like a question for Ambient.
        let d = decide(
            "Note: what's the weather in Lisbon?",
            &gmail_no_field(),
            now(),
        );
        assert_eq!(
            d,
            Decision {
                route: None,
                to_agent: false
            }
        );
        // "…, remind me" at the end, with a time.
        assert_eq!(
            decide("Call the dentist tomorrow at 9, remind me.", &notes, now()).route,
            Some(Route::Act(Action::Reminder {
                title: "Call the dentist".into(),
                due: Some("2026-11-03T09:00".into()),
            }))
        );
        // Another language's date is the router's to read; never typed.
        let d = decide("przypomnij mi jutro o dziewiątej o raporcie", &notes, now());
        assert!(d.route.is_none() && d.to_agent, "{d:?}");
        // "Remind me" typed to someone in a chat stays the router's call.
        let d = decide("remind me tomorrow to send the deck", &slack, now());
        assert!(d.route.is_none() && !d.to_agent, "{d:?}");
    }

    #[test]
    fn a_focused_field_keeps_typing_unless_clearly_a_request() {
        let notes = Situation {
            editable: true,
            ..Default::default()
        };
        let slack = Situation {
            editable: true,
            messaging: true,
            ..Default::default()
        };
        // Plain sentences and questions to people are typed (router decides).
        for s in [
            "Can we move the call to Thursday?",
            "what do you think about the new logo",
            "Thanks for the update, I'll send the numbers tomorrow.",
        ] {
            assert!(!decide(s, &slack, now()).to_agent, "{s}");
            assert!(decide(s, &slack, now()).route.is_none(), "{s}");
        }
        // Commands only a computer does go to the agent outside chats…
        for s in [
            "open Linear",
            "summarise this page",
            "remind me at 5 to call Sam",
        ] {
            let d = decide(s, &notes, now());
            assert!(d.to_agent || d.route.is_some(), "{s}");
        }
        // …and "remind me" typed to someone in a chat stays the router's call.
        let d = decide("remind me tomorrow to send the deck", &slack, now());
        assert!(d.route.is_none() && !d.to_agent, "{d:?}");
        // "Hey Ambient, …" is always for the agent.
        assert!(decide("Hey Ambient, what's on my calendar", &slack, now()).to_agent);
    }

    #[test]
    fn reports_by_voice() {
        let d = decide(
            "report a bug: the summary missed the last email",
            &Situation::default(),
            now(),
        );
        assert!(matches!(d.route, Some(Route::Report(_))));
        // "That's wrong" typed to a colleague stays text…
        let slack = Situation {
            editable: true,
            messaging: true,
            ..Default::default()
        };
        assert!(decide("that's wrong", &slack, now()).route.is_none());
        // …but with the Ask key it's a report.
        let ask = Situation {
            ask: true,
            ..Default::default()
        };
        assert!(matches!(
            decide("that didn't work", &ask, now()).route,
            Some(Route::Report(_))
        ));
    }

    #[test]
    fn the_did_you_mean_bias_moves_the_line() {
        let at = |bias: f32| Situation {
            did_you_mean_bias: bias,
            ..gmail_no_field()
        };
        let prose = "The quarterly numbers look great";
        let soft = "send this to Sam";
        assert!(!decide(prose, &at(0.5), now()).to_agent);
        assert!(decide(soft, &at(0.5), now()).to_agent);
        // Eager: everything with no field goes to the agent.
        assert!(decide(prose, &at(0.9), now()).to_agent);
        // Cautious: only clear commands and questions do.
        assert!(!decide(soft, &at(0.1), now()).to_agent);
        assert!(decide("what's the weather in Lisbon", &at(0.1), now()).to_agent);
    }

    #[test]
    fn sounds_like_request_is_broad() {
        for s in [
            "can we reply saying yes",
            "please send it to Ana",
            "reply to Sam",
            "let them know it's done",
            "what time is it in Tokyo",
            "show me my last email",
            "I need you to draft a note",
        ] {
            assert!(sounds_like_request(s), "{s}");
        }
        for s in [
            "Thanks for the update",
            "The numbers look great",
            "I'll send it tomorrow",
            "Great work everyone",
        ] {
            assert!(!sounds_like_request(s), "{s}");
        }
    }

    /// A Windows tester's "what's the weather" opened a browser: the router
    /// had picked a browser search. Questions stay in the card.
    #[test]
    fn questions_are_answered_in_the_card() {
        let search = |q: &str| Route::Act(Action::WebSearch { query: q.into() });
        for s in [
            "what's the weather",
            "Hey Ambient, what's the weather in Lisbon tomorrow?",
            "search for the best ramen near me",
            "look up the Lakers score",
            "who won the game last night",
        ] {
            assert!(
                matches!(
                    answer_in_card(search(s), s),
                    Route::Answer {
                        needs_web: true,
                        ..
                    }
                ),
                "{s}"
            );
        }
        let site = Route::Act(Action::OpenUrl {
            url: "https://weather.com".into(),
        });
        assert!(matches!(
            answer_in_card(site.clone(), "what's the weather today?"),
            Route::Answer {
                needs_web: true,
                ..
            }
        ));
        // Asked for the browser: it opens.
        for s in [
            "google the weather in Lisbon",
            "search Google for flights to Porto",
            "open the weather website",
            "show me the weather in my browser",
            "go to weather.com",
        ] {
            assert!(matches!(answer_in_card(search(s), s), Route::Act(_)), "{s}");
        }
        assert_eq!(answer_in_card(site.clone(), "weather.com"), site);
        let app = Route::Act(Action::OpenApp {
            name: "Slack".into(),
        });
        assert_eq!(answer_in_card(app.clone(), "what's in Slack"), app);
    }

    #[test]
    fn dismisses_its_own_cards_by_voice() {
        for s in [
            "close that",
            "close that window",
            "Close it.",
            "dismiss",
            "hide this card",
            "thanks, close it",
            "never mind",
            "go away",
            "Hey Ambient, close this please",
        ] {
            assert!(dismiss_request(s), "{s}");
        }
        for s in [
            "close the tab",
            "quit Slack",
            "close the deal by Friday",
            "Thanks for the update",
            "can you close the window, it's cold",
        ] {
            assert!(!dismiss_request(s), "{s}");
        }
    }

    #[test]
    fn close_requests_say_how_on_every_os() {
        assert_eq!(
            close_request("close that window").as_deref(),
            Some("window")
        );
        assert_eq!(
            close_request("close this tab please").as_deref(),
            Some("tab")
        );
        assert_eq!(close_request("quit the browser").as_deref(), Some("app"));
        assert_eq!(close_request("Quit Slack").as_deref(), Some("Slack"));
        assert_eq!(
            close_request("close the Spotify app").as_deref(),
            Some("Spotify")
        );
        assert_eq!(close_request("close it"), None);
        assert_eq!(close_request("close the card"), None);
        assert_eq!(close_request("can you close the window, it's cold"), None);
        // With the Ask key or nothing to type into it's decided here…
        let ask = Situation {
            ask: true,
            ..Default::default()
        };
        assert_eq!(
            decide("close that window", &ask, now()).route,
            Some(Route::Act(Action::CloseWindow {
                what: "window".into()
            }))
        );
        // …with a field focused it may be words to type: the router's call.
        let notes = Situation {
            editable: true,
            ..Default::default()
        };
        assert_eq!(decide("close the window", &notes, now()).route, None);
        assert_eq!(
            parse(r#"{"intent":"act","action":{"type":"close_window","what":"tab"}}"#),
            Some(Route::Act(Action::CloseWindow { what: "tab".into() }))
        );
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
        assert_eq!(
            parse(r#"{"intent":"compose","query":"tell them we're happy"}"#),
            Some(Route::Compose("tell them we're happy".into()))
        );
    }

    /// Matt: recognition by identity lists is not the way. A chat client
    /// nobody has listed is judged on what its screen shows.
    #[test]
    fn an_unfamiliar_chat_screen_is_recognised_by_its_content() {
        // A company's own client: no URL, a bundle id from nowhere, and a
        // window that names only the person. The text is laid out as messages.
        let chatter = Place {
            bundle_id: "com.acme.Chatter".into(),
            app: "Chatter".into(),
            title: "Ana Lopez".into(),
            text:
                "Ana Lopez\n10:14 AM\nCan you send the deck by Friday?\nSam Lee\n10:15 AM\nOn it.\n"
                    .into(),
            ..Default::default()
        };
        assert!(chatter.is_messaging(), "{chatter:?}");
        assert!(!chatter.is_ai_chat());

        // The same shape over the web, told by the URL alone.
        let web = Place {
            bundle_id: "com.google.Chrome".into(),
            app: "Google Chrome".into(),
            title: "Acme".into(),
            url: "https://chat.acme.com/inbox/42".into(),
            ..Default::default()
        };
        assert!(web.is_messaging(), "{web:?}");

        // A window that calls itself an inbox.
        let inbox = Place {
            bundle_id: "com.acme.Whatever".into(),
            app: "Whatever".into(),
            title: "Inbox (3) - Acme Mail".into(),
            ..Default::default()
        };
        assert!(inbox.is_messaging(), "{inbox:?}");

        // A terminal transcript is not a conversation, however long it is
        // (this is the screen the offer Matt reported got wrong).
        let terminal = Place {
            bundle_id: "com.apple.Terminal".into(),
            app: "Terminal".into(),
            title: "codex".into(),
            text: "Ana Lopez\n$ cargo test\nrunning 3 tests\ntest result: ok. 3 passed\n".into(),
            ..Default::default()
        };
        assert!(!terminal.is_messaging(), "{terminal:?}");

        // An assistant nobody has listed: typing there is writing, not
        // asking Ambient.
        let assistant = Place {
            bundle_id: "com.acme.CopilotDesk".into(),
            app: "Acme Assistant".into(),
            title: "New chat".into(),
            text: "You said: summarise the notes\nAssistant: Here is the summary.\n".into(),
            ..Default::default()
        };
        assert!(assistant.is_ai_chat(), "{assistant:?}");
    }

    /// The apps and sites the lists already know keep working: the lists are
    /// still the fast yes, the screen only adds to them.
    #[test]
    fn the_places_the_lists_know_are_unchanged() {
        let slack = Place {
            bundle_id: "com.tinyspeck.slackmacgap".into(),
            ..Default::default()
        };
        assert!(slack.is_messaging());
        let gmail = Place {
            bundle_id: "com.google.Chrome".into(),
            url: "https://mail.google.com/mail/u/0/#inbox".into(),
            ..Default::default()
        };
        assert!(gmail.is_messaging());
        let chatgpt = Place {
            bundle_id: "com.google.Chrome".into(),
            url: "https://chatgpt.com/c/1".into(),
            ..Default::default()
        };
        assert!(chatgpt.is_ai_chat());
        assert!(!chatgpt.is_messaging());
        // A plain field in an app nobody special is still just a field:
        // writing there is typing, not a chat.
        let notes = Place {
            bundle_id: "com.apple.Notes".into(),
            app: "Notes".into(),
            title: "Ideas".into(),
            text: "Buy milk\nCall Ana about the deck\n".into(),
            ..Default::default()
        };
        assert!(!notes.is_messaging(), "{notes:?}");
        assert!(!notes.is_ai_chat());
    }
}
