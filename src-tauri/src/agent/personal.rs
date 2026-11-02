//! Finding the user's own things with nothing connected: the Mac's Spotlight
//! index (documents and Mail messages), Ambient's screen memory (docs and
//! pages they've had open, with links), and one-click searches in the
//! browser they're already signed into (Drive, Gmail).
//!
//! Only things a person would recognise ever become a source: Spotlight also
//! indexes app internals, caches and code (locale files such as
//! `shared-arabic.json` matched "what is the last email I received" on
//! "email"), so hits are kept to documents outside hidden, library and
//! project folders, and searched by the question's content words only.

const MAX_FILES: usize = 4;
const MAX_SEEN: usize = 3;

/// i18n keys for the browser searches (the HUD translates source titles
/// that start with `hud.`).
pub const SEARCH_DRIVE: &str = "hud.source.searchDrive";
pub const SEARCH_GMAIL: &str = "hud.source.searchGmail";

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

/// Words that say what kind of question it is, not what it's about.
const STOP_WORDS: &[&str] = &[
    "a",
    "an",
    "the",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "at",
    "for",
    "from",
    "with",
    "about",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "do",
    "does",
    "did",
    "have",
    "has",
    "had",
    "can",
    "could",
    "should",
    "would",
    "will",
    "what",
    "whats",
    "what's",
    "which",
    "who",
    "whom",
    "when",
    "where",
    "why",
    "how",
    "this",
    "that",
    "these",
    "those",
    "there",
    "it",
    "its",
    "i",
    "me",
    "my",
    "mine",
    "we",
    "us",
    "our",
    "you",
    "your",
    "they",
    "them",
    "their",
    "he",
    "she",
    "him",
    "her",
    "last",
    "latest",
    "recent",
    "recently",
    "first",
    "next",
    "other",
    "any",
    "some",
    "all",
    "find",
    "show",
    "open",
    "get",
    "got",
    "tell",
    "say",
    "said",
    "says",
    "saw",
    "seen",
    "see",
    "look",
    "looked",
    "read",
    "remember",
    "recall",
    "earlier",
    "yesterday",
    "today",
    "ago",
    "week",
    "received",
    "receive",
    "sent",
    "send",
    "email",
    "emails",
    "mail",
    "message",
    "messages",
    "file",
    "files",
    "document",
    "doc",
    "docs",
    "thing",
    "something",
    "please",
    "hey",
    "ambient",
];

/// The words of a question worth searching for ("Q3 deck" from "find the Q3
/// deck"). Empty when the question has nothing specific in it.
pub fn content_words(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric())
                .replace(['"', '\\', '*'], "")
        })
        .filter(|w| w.chars().count() > 1)
        .filter(|w| !STOP_WORDS.contains(&w.to_lowercase().as_str()))
        .take(5)
        .collect()
}

/// Folders whose files are never the user's own documents.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "build",
    "dist",
    "vendor",
    "Pods",
    "DerivedData",
    "site-packages",
    "venv",
    "locales",
    "i18n",
    "l10n",
    "resources",
    "Resources",
    "Caches",
    "Containers",
    "Group Containers",
    "Application Support",
];

/// File types that are code, data or app internals.
const SKIP_EXTENSIONS: &[&str] = &[
    "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "map", "rs", "py", "go", "java", "kt", "c",
    "h", "cc", "cpp", "hpp", "m", "mm", "swift", "rb", "php", "cs", "css", "scss", "less", "html",
    "htm", "xml", "yml", "yaml", "toml", "lock", "log", "plist", "sqlite", "db", "dat", "data",
    "bin", "strings", "po", "mo", "xliff", "ttf", "otf", "woff", "woff2", "svg", "ini", "cfg",
    "conf", "sh", "zsh", "bash", "env", "gguf", "onnx", "pb", "tmp", "cache", "nib", "car",
];

/// Whether a Spotlight hit is one of the user's own documents (or a Mail
/// message), as opposed to code, config, caches or an app's internals.
pub fn is_user_file(path: &str, home: &str) -> bool {
    let Some(rel) = path.strip_prefix(home) else {
        return false;
    };
    let rel = rel.trim_start_matches('/');
    // Mail.app's messages are the one thing in ~/Library worth showing.
    if rel.starts_with("Library/Mail/") {
        return rel.ends_with(".emlx");
    }
    if rel.starts_with("Library/") {
        return false;
    }
    let parts: Vec<&str> = rel.split('/').collect();
    let (name, dirs) = match parts.split_last() {
        Some((name, dirs)) => (*name, dirs),
        None => return false,
    };
    if name.starts_with('.') || name.starts_with('~') {
        return false;
    }
    if dirs
        .iter()
        .any(|d| d.starts_with('.') || SKIP_DIRS.contains(d) || d.ends_with(".app"))
    {
        return false;
    }
    // A folder that holds a project: anything under one is source, not docs.
    if dirs.iter().any(|d| *d == "src" || *d == "packages") {
        return false;
    }
    match name.rsplit_once('.') {
        Some((_, ext)) => !SKIP_EXTENSIONS.contains(&ext.to_lowercase().as_str()),
        None => true,
    }
}

/// Whether an answer source is worth a chip: a web page, or a file of the
/// user's own (never an internal or context file).
pub fn is_meaningful_source(title: &str, url: &str) -> bool {
    if url.starts_with("https://") || url.starts_with("http://") {
        return true;
    }
    match url.strip_prefix("file://") {
        Some(path) => {
            let path = path.replace("%20", " ");
            let home = std::env::var("HOME").unwrap_or_default();
            !title.trim().is_empty() && !home.is_empty() && is_user_file(&path, &home)
        }
        None => false,
    }
}

/// (title, url) links for the answer card's sources row.
pub fn find(query: &str) -> Vec<(String, String)> {
    find_with(query, spotlight_hits(query))
}

/// `find` with Spotlight already run (recall shares one search).
pub fn find_with(query: &str, files: Vec<(String, String)>) -> Vec<(String, String)> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }
    let mut out = files;
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
    let words = content_words(query);
    if !words.is_empty() {
        let q = urlencode(&words.join(" "));
        out.push((
            SEARCH_DRIVE.into(),
            format!("https://drive.google.com/drive/search?q={q}"),
        ));
        out.push((
            SEARCH_GMAIL.into(),
            format!("https://mail.google.com/mail/u/0/#search/{q}"),
        ));
    }
    out
}

/// Spotlight matches only (documents and Mail messages), for recall.
pub fn spotlight_hits(query: &str) -> Vec<(String, String)> {
    spotlight(query.trim())
}

/// One `mdfind -attr kMDItemDisplayName` line: (path, display name).
fn parse_hit(line: &str) -> Option<(String, String)> {
    const SEP: &str = "   kMDItemDisplayName = ";
    let (path, name) = match line.rfind(SEP) {
        Some(at) => (&line[..at], line[at + SEP.len()..].trim()),
        None => (line, ""),
    };
    let path = path.trim();
    if path.is_empty() {
        return None;
    }
    let file_name = std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let name = if name.is_empty() || name == "(null)" {
        file_name
    } else {
        name.to_string()
    };
    Some((path.to_string(), name))
}

#[cfg(target_os = "macos")]
fn spotlight(query: &str) -> Vec<(String, String)> {
    // Words, not a phrase: "Q3 numbers" should find "Q3_numbers_final.xlsx".
    let words = content_words(query);
    if words.is_empty() {
        return Vec::new();
    }
    let clause = words
        .iter()
        .map(|w| format!("(kMDItemDisplayName == \"*{w}*\"cd || kMDItemTextContent == \"{w}\"cd)"))
        .collect::<Vec<_>>()
        .join(" && ");
    let Some(home) = std::env::var("HOME").ok() else {
        return Vec::new();
    };
    let output = std::process::Command::new("/usr/bin/mdfind")
        .args(["-onlyin", &home, "-attr", "kMDItemDisplayName", &clause])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(parse_hit)
        .filter(|(path, _)| is_user_file(path, &home))
        .take(MAX_FILES)
        .map(|(path, name)| (name, format!("file://{}", path.replace(' ', "%20"))))
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn spotlight(_query: &str) -> Vec<(String, String)> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOME: &str = "/Users/sam";

    #[test]
    fn internal_files_are_never_sources() {
        for p in [
            "/Users/sam/Downloads/ai/app/src/i18n/locales/ar/shared-arabic.json",
            "/Users/sam/Library/Application Support/com.x/ng/abc.data",
            "/Users/sam/Library/Caches/foo.pdf",
            "/Users/sam/code/site/node_modules/pkg/README.md",
            "/Users/sam/code/site/src/app/page.tsx",
            "/Users/sam/.config/thing/notes.txt",
            "/Users/sam/Applications/Foo.app/Contents/Resources/en.lproj/x.strings",
            "/Users/sam/Documents/shared-brazilian.json",
            "/opt/other/report.pdf",
        ] {
            assert!(!is_user_file(p, HOME), "{p}");
        }
        for p in [
            "/Users/sam/Documents/Q3 numbers final.xlsx",
            "/Users/sam/Desktop/Pitch deck.key",
            "/Users/sam/Downloads/invoice-1042.pdf",
            "/Users/sam/Library/Mail/V10/ABC/INBOX.mbox/Messages/1234.emlx",
            "/Users/sam/Notes/plan.md",
        ] {
            assert!(is_user_file(p, HOME), "{p}");
        }
    }

    #[test]
    fn sources_are_web_pages_or_user_files() {
        assert!(is_meaningful_source("BBC", "https://bbc.co.uk/news"));
        assert!(!is_meaningful_source("x", "about:blank"));
        assert!(!is_meaningful_source("", "chrome://settings"));
    }

    #[test]
    fn searches_content_words_only() {
        assert!(content_words("what is the last email I received").is_empty());
        assert_eq!(content_words("find the Q3 deck"), vec!["Q3", "deck"]);
        assert_eq!(
            content_words("what other emails did we get from Bingx?"),
            vec!["Bingx"]
        );
    }

    #[test]
    fn reads_spotlight_display_names() {
        assert_eq!(
            parse_hit("/Users/sam/Library/Mail/V10/1.emlx   kMDItemDisplayName = Your invoice"),
            Some((
                "/Users/sam/Library/Mail/V10/1.emlx".into(),
                "Your invoice".into()
            ))
        );
        assert_eq!(
            parse_hit("/Users/sam/Docs/a b.pdf   kMDItemDisplayName = (null)"),
            Some(("/Users/sam/Docs/a b.pdf".into(), "a b.pdf".into()))
        );
        assert_eq!(parse_hit("   "), None);
    }
}
