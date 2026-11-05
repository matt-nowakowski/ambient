//! Fresh facts for accepted suggestions: whether the answer would be better
//! with a web search, and what to search for.
//!
//! Decided from the kind of offer and what's on screen, never from a list of
//! apps: an error message worth looking up, a company you're about to meet,
//! a news article, an offer that asks about prices or what's current. Price
//! checks and repeated searches already search (they have no window text).
//!
//! Only the query leaves for the search provider (the server searches the
//! query, not the window), and it's scrubbed of paths, addresses and long
//! ids first. The caller skips all of this on "On this computer only".

use std::collections::{BTreeMap, HashMap};

use once_cell::sync::Lazy;
use regex::Regex;

use super::proactive::Kind;

/// Longest query sent: a search wants the gist, not the paragraph.
const MAX_QUERY: usize = 160;

static EMAIL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b[\w.+-]+@((?:[a-z0-9-]+\.)+[a-z]{2,})\b").expect("email"));
/// Unix and Windows paths, URLs, long hex or digit runs (hashes, ids,
/// addresses), and line:col positions: specific to this machine, useless
/// (or private) in a search.
static NOISE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)https?://\S+|[a-z]:\\\S+|(?:~|\.{1,2})?/[\w.@-]+(?:/[\w.@-]+)+|\b0x[0-9a-f]+\b|\b[0-9a-f]{8,}\b|\b\d{6,}\b|:\d+:\d+\b",
    )
    .expect("noise")
});
static CODE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b(?:E\d{4}|TS\d{4}|[A-Z][a-zA-Z]*(?:Error|Exception))\b").expect("code")
});
/// An article: a byline time ("Updated 2 hours ago", "Published 4 Nov
/// 2026"), "5 min read", or a live blog.
static NEWS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:published|updated|posted)\b[^\n]{0,40}\b(?:ago|20\d\d|gmt|utc|[ap]\.?m\.?)\b|\b\d+\s+(?:minutes?|mins?|hours?|hrs?)\s+ago\b|\b\d+\s+min(?:ute)?\s+read\b|\blive updates?\b|\bbreaking\b")
        .expect("news")
});
/// A title's separators before the site's name.
static TITLE_SEP: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+[|—·–-]\s+").expect("title sep"));
/// The judge's own offer asks about something that changes.
static FRESH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:latest|current(?:ly)?|today'?s?|news|prices?|pricing|costs?|cheaper|deals?|reviews?|compare|comparison|alternatives?|release(?:d|s)?|version|outage|status|announce(?:d|ment))\b")
        .expect("fresh")
});
/// Mail and calendar addresses that say nothing about who you're meeting.
const PERSONAL_MAIL: &[&str] = &[
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "yahoo.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "gmx.com",
    "gmx.de",
    "fastmail.com",
    "zoho.com",
    "yandex.ru",
    "mail.ru",
    "qq.com",
    "163.com",
];

/// What the offer is about, as the caller knows it.
pub struct Offer<'a> {
    pub kind: Kind,
    pub vars: &'a BTreeMap<String, String>,
    /// The window's text (or the event's, for a meeting).
    pub text: &'a str,
    /// The window title (or the meeting's title).
    pub title: &'a str,
    /// The judge's offer, for `Help`.
    pub focus: &'a str,
    /// The signed-in account's email domain: your own company isn't news.
    pub own_domain: Option<&'a str>,
}

/// The search for this offer, if it would help.
pub fn web_query(o: &Offer) -> Option<String> {
    let query = match o.kind {
        // The message itself is the best search for an error.
        Kind::ExplainError => o
            .vars
            .get("error")
            .map(|e| scrub(e))
            .filter(|e| CODE.is_match(e) || e.split_whitespace().count() >= 3)?,
        Kind::MeetingPrep => {
            let company = external_company(o.text, o.own_domain)?;
            format!("{company} company news")
        }
        Kind::SummarisePage if NEWS.is_match(o.text) => scrub(headline(o.title)),
        Kind::Help if FRESH.is_match(o.focus) => scrub(o.focus),
        _ => return None,
    };
    let query = query.trim().to_string();
    (query.chars().count() >= 4).then_some(query)
}

/// Paths, links, ids and positions out; whitespace collapsed; kept short.
fn scrub(s: &str) -> String {
    let s = NOISE.replace_all(s, " ");
    let s = EMAIL.replace_all(&s, " ");
    let words: Vec<&str> = s.split_whitespace().collect();
    let mut out = String::new();
    for w in words {
        if out.chars().count() + w.chars().count() + 1 > MAX_QUERY {
            break;
        }
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(w);
    }
    out.trim_matches(|c: char| c == ':' || c == '-' || c == '|' || c.is_whitespace())
        .to_string()
}

/// A page title without the site's name ("Rates held | Reuters" → "Rates
/// held").
fn headline(title: &str) -> &str {
    TITLE_SEP
        .split(title)
        .max_by_key(|part| part.chars().count())
        .unwrap_or(title)
}

/// The company most of the outside guests come from ("ana@acme.co.uk" →
/// "Acme"): not personal mail, not calendar resources, not your own.
fn external_company(text: &str, own_domain: Option<&str>) -> Option<String> {
    let own = own_domain.map(str::to_lowercase);
    let mut counts: HashMap<String, usize> = HashMap::new();
    for c in EMAIL.captures_iter(text) {
        let domain = c[1].to_lowercase();
        if PERSONAL_MAIL.contains(&domain.as_str())
            || domain.contains("calendar.google.com")
            || own
                .as_deref()
                .is_some_and(|o| domain == o || domain.ends_with(&format!(".{o}")))
        {
            continue;
        }
        if let Some(name) = organisation(&domain) {
            *counts.entry(name).or_default() += 1;
        }
    }
    let (name, _) = counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0)))?;
    let mut chars = name.chars();
    let first = chars.next()?.to_uppercase().collect::<String>();
    Some(first + chars.as_str())
}

/// The registrable name in a domain: "mail.acme.com" → "acme",
/// "acme.co.uk" → "acme".
fn organisation(domain: &str) -> Option<String> {
    let labels: Vec<&str> = domain.split('.').filter(|l| !l.is_empty()).collect();
    if labels.len() < 2 {
        return None;
    }
    let tld = labels[labels.len() - 1];
    let second = labels[labels.len() - 2];
    // "co.uk", "com.au", "co.jp": the name is one label further left.
    let name = if tld.len() == 2 && second.len() <= 3 && labels.len() >= 3 {
        labels[labels.len() - 3]
    } else {
        second
    };
    (name.len() >= 2).then(|| name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offer<'a>(kind: Kind, vars: &'a BTreeMap<String, String>, text: &'a str) -> Offer<'a> {
        Offer {
            kind,
            vars,
            text,
            title: "",
            focus: "",
            own_domain: None,
        }
    }

    #[test]
    fn an_error_message_is_searched_without_paths_or_positions() {
        let mut vars = BTreeMap::new();
        vars.insert(
            "error".into(),
            "TypeError: Cannot read properties of undefined /Users/ana/app/src/x.ts:12:4".into(),
        );
        let q = web_query(&offer(Kind::ExplainError, &vars, "")).unwrap();
        assert_eq!(q, "TypeError: Cannot read properties of undefined");
        assert!(!q.contains("Users"));
    }

    #[test]
    fn a_bare_failure_count_is_not_worth_a_search() {
        let mut vars = BTreeMap::new();
        vars.insert("error".into(), "FAILED".into());
        assert_eq!(web_query(&offer(Kind::ExplainError, &vars, "")), None);
    }

    #[test]
    fn a_meeting_with_another_company_looks_them_up() {
        let vars = BTreeMap::new();
        let text =
            "Meeting: Intro\nWith: ana@acme.co.uk, bo@acme.co.uk, me@ambient.dev, x@gmail.com";
        let mut o = offer(Kind::MeetingPrep, &vars, text);
        o.own_domain = Some("ambient.dev");
        assert_eq!(web_query(&o).as_deref(), Some("Acme company news"));
    }

    #[test]
    fn an_internal_meeting_is_not_searched() {
        let vars = BTreeMap::new();
        let text = "Meeting: Standup\nWith: ana@ambient.dev, bo@ambient.dev, sam@gmail.com, room@resource.calendar.google.com";
        let mut o = offer(Kind::MeetingPrep, &vars, text);
        o.own_domain = Some("ambient.dev");
        assert_eq!(web_query(&o), None);
        // Names only (no addresses): nothing to go on.
        let o = offer(Kind::MeetingPrep, &vars, "Meeting: Intro\nWith: Ana, Bo");
        assert_eq!(web_query(&o), None);
    }

    #[test]
    fn news_pages_search_their_headline_other_pages_do_not() {
        let vars = BTreeMap::new();
        let mut o = offer(
            Kind::SummarisePage,
            &vars,
            "Central bank holds rates\nUpdated 2 hours ago\nThe bank said…",
        );
        o.title = "Central bank holds rates steady | Reuters";
        assert_eq!(
            web_query(&o).as_deref(),
            Some("Central bank holds rates steady")
        );
        let mut docs = offer(
            Kind::SummarisePage,
            &vars,
            "Getting started\nInstall the CLI…",
        );
        docs.title = "Getting started | Docs";
        assert_eq!(web_query(&docs), None);
    }

    #[test]
    fn the_judges_offer_searches_when_it_asks_about_something_current() {
        let vars = BTreeMap::new();
        let mut o = offer(Kind::Help, &vars, "");
        o.focus = "Compare the latest prices for this laptop?";
        assert!(web_query(&o).is_some());
        o.focus = "Turn these notes into a to-do list?";
        assert_eq!(web_query(&o), None);
    }

    #[test]
    fn writing_kinds_never_search() {
        let vars = BTreeMap::new();
        for kind in [
            Kind::DraftReply,
            Kind::TightenDraft,
            Kind::CommitMessage,
            Kind::TranslatePage,
            Kind::AddToCalendar,
            Kind::AddReminder,
        ] {
            let mut o = offer(kind, &vars, "Updated 2 hours ago, latest prices");
            o.focus = "latest prices";
            assert_eq!(web_query(&o), None, "{kind:?}");
        }
    }

    #[test]
    fn organisations_from_domains() {
        assert_eq!(organisation("mail.acme.com").as_deref(), Some("acme"));
        assert_eq!(organisation("acme.co.uk").as_deref(), Some("acme"));
        assert_eq!(organisation("localhost"), None);
    }
}
