//! Finding the user's own things with nothing connected: the Mac's Spotlight
//! index (files, Mail.app messages, notes), Ambient's screen memory (docs and
//! pages they've had open, with links), and one-click searches in the
//! browser they're already signed into (Drive, Gmail).

const MAX_FILES: usize = 4;
const MAX_SEEN: usize = 3;

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            b' ' => "+".into(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// (title, url) links for the answer card's sources row.
pub fn find(query: &str) -> Vec<(String, String)> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    out.extend(spotlight(query));
    if let Some(r) = crate::recall::get_if_open() {
        if let Ok(seen) = r.search_screen(query, None, MAX_SEEN) {
            for e in seen {
                if let Some(url) = e.url.filter(|u| u.starts_with("http")) {
                    let title = if e.title.is_empty() {
                        e.app.clone()
                    } else {
                        e.title.clone()
                    };
                    out.push((title, url));
                }
            }
        }
    }
    let q = urlencode(query);
    out.push((
        "Search Google Drive".into(),
        format!("https://drive.google.com/drive/search?q={q}"),
    ));
    out.push((
        "Search Gmail".into(),
        format!("https://mail.google.com/mail/u/0/#search/{q}"),
    ));
    out
}

/// Spotlight matches only (files, Mail messages, notes), for recall.
pub fn spotlight_hits(query: &str) -> Vec<(String, String)> {
    spotlight(query.trim())
}

#[cfg(target_os = "macos")]
fn spotlight(query: &str) -> Vec<(String, String)> {
    // Words, not a phrase: "Q3 numbers" should find "Q3_numbers_final.xlsx".
    let words: Vec<String> = query
        .split_whitespace()
        .filter(|w| w.len() > 1)
        .take(5)
        .map(|w| w.replace(['"', '\\', '*'], ""))
        .collect();
    if words.is_empty() {
        return Vec::new();
    }
    let clause = words
        .iter()
        .map(|w| format!("(kMDItemDisplayName == \"*{w}*\"cd || kMDItemTextContent == \"{w}\"cd)"))
        .collect::<Vec<_>>()
        .join(" && ");
    let Some(home) = dirs_home() else {
        return Vec::new();
    };
    let output = std::process::Command::new("/usr/bin/mdfind")
        .args(["-onlyin", &home, &clause])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|p| {
            !p.contains("/Library/Caches/")
                && !p.contains("/.Trash/")
                && !p.contains("/node_modules/")
        })
        .take(MAX_FILES)
        .map(|p| {
            let name = std::path::Path::new(p)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| p.to_string());
            (name, format!("file://{}", p.replace(' ', "%20")))
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn spotlight(_query: &str) -> Vec<(String, String)> {
    Vec::new()
}

#[cfg(target_os = "macos")]
fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}
