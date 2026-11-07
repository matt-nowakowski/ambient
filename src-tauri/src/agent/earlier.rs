//! What was on screen a moment ago, for "the page we just looked at" and
//! "their website": the windows before the one in front, newest first.
//!
//! With screen memory on, they come from it (every window the user passed
//! through, already redacted and encrypted at rest). With it off, only the
//! windows Ambient read for the user's own requests are kept, in memory, for
//! a few minutes; nothing is written anywhere.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;

/// How far back "a moment ago" goes.
const RECENT: Duration = Duration::from_secs(15 * 60);
/// How many earlier windows go with a request.
const KEEP: usize = 3;
/// Of each earlier window: its start (headers, what it's about)…
const HEAD_CHARS: usize = 900;
/// …and its outside links ("Website → https://…"), which may sit further down.
const LINK_LINES: usize = 15;

/// One window as it was read.
#[derive(Clone, Debug, PartialEq)]
pub struct Seen {
    pub app: String,
    pub title: String,
    pub url: String,
    /// Already redacted.
    pub text: String,
}

/// Windows read for the user's requests (screen memory off).
static READ: Mutex<VecDeque<(Instant, Seen)>> = Mutex::new(VecDeque::new());

/// Keep a window Ambient just read for a request (already redacted).
pub fn remember(seen: Seen) {
    if seen.text.trim().is_empty() {
        return;
    }
    if let Ok(mut g) = READ.lock() {
        g.retain(|(at, s)| at.elapsed() < RECENT && !same_window(s, &seen));
        g.push_front((Instant::now(), seen));
        g.truncate(8);
    }
}

fn same_window(a: &Seen, b: &Seen) -> bool {
    a.app == b.app && a.title == b.title && a.url == b.url
}

/// The windows before the one in front (`here`: its app, title and page),
/// newest first, each once. Empty while reading the screen isn't allowed.
pub fn windows(app: &AppHandle, here: Option<&Seen>) -> Vec<Seen> {
    let agent = crate::settings::get_settings(app).agent;
    if !agent.screen_context || agent.is_paused() {
        return Vec::new();
    }
    let mut found: Vec<Seen> = Vec::new();
    if agent.screen_memory {
        if let Some(recall) = crate::recall::get_if_open() {
            let since = chrono::Utc::now().timestamp() - RECENT.as_secs() as i64;
            if let Ok(entries) = recall.search_screen("", Some(since), 20) {
                found.extend(entries.into_iter().map(|e| Seen {
                    app: e.app,
                    title: e.title,
                    url: e.url.unwrap_or_default(),
                    text: e.text,
                }));
            }
        }
    }
    if let Ok(g) = READ.lock() {
        found.extend(
            g.iter()
                .filter(|(at, _)| at.elapsed() < RECENT)
                .map(|(_, s)| s.clone()),
        );
    }
    pick(found, here)
}

/// Newest first, each window once, never the one in front.
fn pick(found: Vec<Seen>, here: Option<&Seen>) -> Vec<Seen> {
    let mut out: Vec<Seen> = Vec::new();
    for s in found {
        if here.is_some_and(|h| same_window(h, &s)) || out.iter().any(|o| same_window(o, &s)) {
            continue;
        }
        out.push(s);
        if out.len() >= KEEP {
            break;
        }
    }
    out
}

/// One earlier window for a prompt: where it was, its start and its outside
/// links.
pub fn excerpt(s: &Seen) -> String {
    let mut out = s.app.clone();
    if !s.title.is_empty() {
        out.push_str(&format!(" — {}", s.title));
    }
    if !s.url.is_empty() {
        out.push_str(&format!(" ({})", s.url));
    }
    out.push('\n');
    let head: String = s.text.chars().take(HEAD_CHARS).collect();
    out.push_str(&head);
    let links: Vec<&str> = s
        .text
        .lines()
        .filter(|l| l.contains(" → http") && !head.contains(*l))
        .take(LINK_LINES)
        .collect();
    if !links.is_empty() {
        out.push('\n');
        out.push_str(&links.join("\n"));
    }
    out
}

/// The earlier windows as tagged blocks, newest first; empty when none.
pub fn tagged(windows: &[Seen]) -> String {
    windows
        .iter()
        .map(|s| super::prompt::tagged("earlier_window", &excerpt(s)))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Test mode: windows the scenario says were looked at just before.
pub(crate) fn seed(windows: Vec<Seen>) {
    if let Ok(mut g) = READ.lock() {
        g.clear();
        // Newest first, as given.
        for s in windows {
            g.push_back((Instant::now(), s));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seen(title: &str, text: &str) -> Seen {
        Seen {
            app: "Arc".into(),
            title: title.into(),
            url: format!("https://example.com/{title}"),
            text: text.into(),
        }
    }

    #[test]
    fn skips_the_window_in_front_and_repeats() {
        let here = seen("now", "x");
        let got = pick(
            vec![
                seen("now", "x"),
                seen("token", "a"),
                seen("token", "a"),
                seen("chart", "b"),
            ],
            Some(&here),
        );
        let titles: Vec<_> = got.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, ["token", "chart"]);
    }

    #[test]
    fn keeps_outside_links_from_further_down() {
        let mut text = "Truth Network (TRUTH)\n".to_string();
        text.push_str(&"price row\n".repeat(200));
        text.push_str("Website → https://truth.network\n");
        let e = excerpt(&seen("token", &text));
        assert!(e.contains("Truth Network (TRUTH)"));
        assert!(e.contains("Website → https://truth.network"));
    }
}
