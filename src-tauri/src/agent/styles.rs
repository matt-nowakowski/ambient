//! Per-app and per-website writing styles: "Slack: casual", "Gmail:
//! polished", "Terminal: as said". These are the user's explicit
//! preferences, set in Settings › Writing; smart writing still judges each
//! dictation from the screen, and follows the style where one is set. No app
//! list is built in.
//!
//! A website beats its browser's app style, which beats the Writing setting.

use std::sync::Mutex;

use serde::Serialize;
use specta::Type;
use tauri::AppHandle;

use crate::settings::{self, AppSettings, AppStyle, WritingStyle};

/// A website's host from a URL: lowercased, without "www.", port or path.
pub fn site_host(url: &str) -> Option<String> {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let host = rest
        .split(['/', '?', '#'])
        .next()?
        .rsplit('@')
        .next()?
        .split(':')
        .next()?
        .trim()
        .trim_end_matches('.')
        .to_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    (host.contains('.') && !host.contains(char::is_whitespace)).then_some(host)
}

/// The style for where the user is: the most specific matching website
/// (its subdomains included), else the app (by bundle id, process name or
/// name), else None (the Writing setting decides).
pub fn resolve(
    styles: &[AppStyle],
    bundle: &str,
    app_name: &str,
    url: &str,
) -> Option<WritingStyle> {
    if let Some(host) = site_host(url) {
        let site = styles
            .iter()
            .filter(|s| s.site)
            .filter(|s| {
                let t = s.target.trim().to_lowercase();
                let t = t.strip_prefix("www.").unwrap_or(&t);
                !t.is_empty() && (host == t || host.ends_with(&format!(".{t}")))
            })
            .max_by_key(|s| s.target.len());
        if let Some(s) = site {
            return Some(s.style);
        }
    }
    let matches = |t: &str| {
        let t = t.trim();
        !t.is_empty() && (t.eq_ignore_ascii_case(bundle) || t.eq_ignore_ascii_case(app_name))
    };
    styles
        .iter()
        .find(|s| !s.site && matches(&s.target))
        .map(|s| s.style)
}

/// The style for the place in front.
pub fn for_place(settings: &AppSettings, place: &super::router::Place) -> Option<WritingStyle> {
    if settings.app_styles.is_empty() {
        return None;
    }
    resolve(
        &settings.app_styles,
        &place.bundle_id,
        &place.app,
        &place.url,
    )
}

/// What a polish or a draft is told, appended to its instructions.
pub fn note(style: Option<WritingStyle>) -> Option<&'static str> {
    match style? {
        WritingStyle::AsSaid => None,
        WritingStyle::Casual => Some(
            "Style here (the user's own setting): casual. Relaxed and conversational, contractions are fine, and no period at the end of a short message.",
        ),
        WritingStyle::Polished => Some(
            "Style here (the user's own setting): polished. Clear, complete sentences with careful punctuation and capitalization, keeping the user's meaning.",
        ),
    }
}

/// Abbreviations whose period stays.
const KEEP_PERIOD: &[&str] = &["etc.", "inc.", "ltd.", "jr.", "sr.", "vs.", "co."];

/// Casual: a short one-line message loses its final period ("Sounds good."
/// → "Sounds good"). Anything else is left as it is.
pub fn finish(style: Option<WritingStyle>, text: &str) -> String {
    if style != Some(WritingStyle::Casual) {
        return text.to_string();
    }
    let body = text.trim_end();
    let tail = &text[body.len()..];
    let last = body.split_whitespace().last().unwrap_or("").to_lowercase();
    let short = body.split_whitespace().count() <= 30 && !body.contains('\n');
    let one_period = body.ends_with('.') && !body.ends_with("..");
    // "p.m.", "e.g.": the period belongs to the word.
    let abbreviation =
        KEEP_PERIOD.contains(&last.as_str()) || last.trim_end_matches('.').contains('.');
    if short && one_period && !abbreviation {
        format!("{}{tail}", &body[..body.len() - 1])
    } else {
        text.to_string()
    }
}

// ── Recent places, for "Add app/site" ─────────────────────────────────────

/// An app or website the user dictated into, offered when adding a style.
#[derive(Serialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct StylePlace {
    pub target: String,
    pub label: String,
    pub site: bool,
}

/// Most recent first; this session only, never stored.
static RECENT: Mutex<Vec<StylePlace>> = Mutex::new(Vec::new());
const RECENT_MAX: usize = 12;

fn remember(list: &mut Vec<StylePlace>, p: StylePlace) {
    list.retain(|q| !(q.site == p.site && q.target.eq_ignore_ascii_case(&p.target)));
    list.insert(0, p);
    list.truncate(RECENT_MAX);
}

/// Note where a dictation went: the app, and the website in a browser.
pub fn note_place(place: &super::router::Place) {
    if place.bundle_id.is_empty() || place.bundle_id == env!("BRAND_IDENTIFIER") {
        return;
    }
    let Ok(mut g) = RECENT.lock() else {
        return;
    };
    remember(
        &mut g,
        StylePlace {
            target: place.bundle_id.clone(),
            label: if place.app.is_empty() {
                place.bundle_id.clone()
            } else {
                place.app.clone()
            },
            site: false,
        },
    );
    if super::is_browser(&place.bundle_id) {
        if let Some(host) = site_host(&place.url) {
            remember(
                &mut g,
                StylePlace {
                    target: host.clone(),
                    label: host,
                    site: true,
                },
            );
        }
    }
}

/// Recent apps and sites without a style yet, then apps smart writing
/// learned about.
#[tauri::command]
#[specta::specta]
pub fn recent_style_places(app: AppHandle) -> Vec<StylePlace> {
    let s = settings::get_settings(&app);
    let mut out: Vec<StylePlace> = RECENT.lock().map(|g| g.clone()).unwrap_or_default();
    for (bundle, pref) in &s.agent.writing_prefs {
        if !out.iter().any(|p| !p.site && p.target == *bundle) {
            out.push(StylePlace {
                target: bundle.clone(),
                label: if pref.app_name.is_empty() {
                    bundle.clone()
                } else {
                    pref.app_name.clone()
                },
                site: false,
            });
        }
    }
    out.retain(|p| {
        !s.app_styles
            .iter()
            .any(|a| a.site == p.site && a.target.eq_ignore_ascii_case(&p.target))
    });
    out.truncate(RECENT_MAX);
    out
}

#[tauri::command]
#[specta::specta]
pub fn update_app_styles(app: AppHandle, styles: Vec<AppStyle>) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    s.app_styles = styles
        .into_iter()
        .filter(|a| !a.target.trim().is_empty())
        .take(100)
        .collect();
    settings::write_settings(&app, s);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn style(target: &str, site: bool, style: WritingStyle) -> AppStyle {
        AppStyle {
            target: target.into(),
            label: target.into(),
            site,
            style,
        }
    }

    #[test]
    fn reads_a_sites_host() {
        assert_eq!(
            site_host("https://mail.google.com/mail/u/0/#inbox").as_deref(),
            Some("mail.google.com")
        );
        assert_eq!(
            site_host("https://www.GitHub.com:443/x").as_deref(),
            Some("github.com")
        );
        assert_eq!(site_host("linear.app").as_deref(), Some("linear.app"));
        assert_eq!(site_host(""), None);
        assert_eq!(site_host("about:blank"), None);
    }

    #[test]
    fn site_beats_app_beats_default() {
        let styles = vec![
            style("com.google.Chrome", false, WritingStyle::Casual),
            style("google.com", true, WritingStyle::Polished),
            style("Slack", false, WritingStyle::Casual),
            style("com.apple.Terminal", false, WritingStyle::AsSaid),
        ];
        let chrome = "com.google.Chrome";
        // The site, subdomains included.
        assert_eq!(
            resolve(&styles, chrome, "Google Chrome", "https://mail.google.com/"),
            Some(WritingStyle::Polished)
        );
        // Another site in the same browser: the browser's style.
        assert_eq!(
            resolve(
                &styles,
                chrome,
                "Google Chrome",
                "https://news.ycombinator.com/"
            ),
            Some(WritingStyle::Casual)
        );
        // Not a lookalike host.
        assert_eq!(resolve(&styles, "x", "x", "https://notgoogle.com/"), None);
        // An app by its name.
        assert_eq!(
            resolve(&styles, "com.tinyspeck.slackmacgap", "Slack", ""),
            Some(WritingStyle::Casual)
        );
        assert_eq!(
            resolve(&styles, "com.apple.Terminal", "Terminal", ""),
            Some(WritingStyle::AsSaid)
        );
        // Nothing set: the Writing setting decides.
        assert_eq!(resolve(&styles, "com.apple.Notes", "Notes", ""), None);
        assert_eq!(
            resolve(&[], chrome, "Chrome", "https://mail.google.com"),
            None
        );
    }

    #[test]
    fn the_most_specific_site_wins() {
        let styles = vec![
            style("google.com", true, WritingStyle::Casual),
            style("mail.google.com", true, WritingStyle::Polished),
        ];
        assert_eq!(
            resolve(&styles, "b", "B", "https://mail.google.com/"),
            Some(WritingStyle::Polished)
        );
        assert_eq!(
            resolve(&styles, "b", "B", "https://docs.google.com/"),
            Some(WritingStyle::Casual)
        );
    }

    #[test]
    fn casual_drops_a_short_messages_period() {
        let c = Some(WritingStyle::Casual);
        assert_eq!(finish(c, "Sounds good."), "Sounds good");
        assert_eq!(finish(c, "Sounds good. "), "Sounds good ");
        assert_eq!(finish(c, "See you at 5 p.m."), "See you at 5 p.m.");
        assert_eq!(finish(c, "Wait..."), "Wait...");
        assert_eq!(finish(c, "Really?"), "Really?");
        assert_eq!(finish(c, "Line one.\nLine two."), "Line one.\nLine two.");
        assert_eq!(
            finish(Some(WritingStyle::Polished), "Sounds good."),
            "Sounds good."
        );
        assert_eq!(finish(None, "Sounds good."), "Sounds good.");
    }

    #[test]
    fn notes_only_where_a_style_says_how() {
        assert!(note(None).is_none());
        assert!(note(Some(WritingStyle::AsSaid)).is_none());
        assert!(note(Some(WritingStyle::Casual)).is_some());
        assert!(note(Some(WritingStyle::Polished)).is_some());
    }

    #[test]
    fn remembers_recent_places_once_each() {
        let mut list = Vec::new();
        for t in ["a", "b", "A"] {
            remember(
                &mut list,
                StylePlace {
                    target: t.into(),
                    label: t.into(),
                    site: false,
                },
            );
        }
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].target, "A");
    }
}
