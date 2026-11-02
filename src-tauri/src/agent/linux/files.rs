//! Finding the user's documents on Linux, Spotlight's job on macOS. In order:
//!
//! 1. Tracker 3 (GNOME's indexer): names and contents, via `tracker3 search`.
//! 2. `plocate` / `locate`: file names, from the system's database.
//! 3. A bounded walk of the Desktop, Documents and Downloads folders, plus
//!    the recently used files list (`recently-used.xbel`).
//!
//! The results pass the same filter as Spotlight's (`is_user_file`): the
//! user's own documents, not code, caches or app internals.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use super::{home, output_within, percent_decode};
use crate::agent::personal::{content_words, is_user_file};

/// (display name, file:// URL) for up to `max` documents matching `query`.
pub fn search(query: &str, max: usize) -> Vec<(String, String)> {
    let words = content_words(query);
    let Some(home) = home() else {
        return Vec::new();
    };
    if words.is_empty() {
        return Vec::new();
    }
    let paths = tracker(&words)
        .filter(|p| !p.is_empty())
        .or_else(|| locate(&words))
        .unwrap_or_else(|| walk(&words, &home));
    let mut out: Vec<(String, String)> = Vec::new();
    for path in paths {
        if out.len() >= max {
            break;
        }
        if !is_user_file(&path, &home) || out.iter().any(|(_, u)| *u == to_url(&path)) {
            continue;
        }
        out.push((file_name(&path), to_url(&path)));
    }
    out
}

fn to_url(path: &str) -> String {
    format!("file://{}", path.replace(' ', "%20"))
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// Every word appears in the file's name (case-insensitive).
pub fn name_matches(path: &str, words: &[String]) -> bool {
    let name = file_name(path).to_lowercase();
    words.iter().all(|w| name.contains(&w.to_lowercase()))
}

/// File paths from `file://` URIs anywhere in a command's output.
pub fn file_uris(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let mut rest = line;
        while let Some(at) = rest.find("file://") {
            let uri = &rest[at + "file://".len()..];
            let end = uri
                .find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == '\u{1b}')
                .unwrap_or(uri.len());
            let path = percent_decode(&uri[..end]);
            if path.starts_with('/') && !out.contains(&path) {
                out.push(path);
            }
            rest = &uri[end..];
        }
    }
    out
}

/// Tracker 3: full-text and name search over the indexed folders. None when
/// Tracker isn't installed or running.
fn tracker(words: &[String]) -> Option<Vec<String>> {
    let mut cmd = Command::new("tracker3");
    cmd.args([
        "search",
        "--disable-color",
        "--and-operator",
        "--limit",
        "60",
    ])
    .args(words);
    let out = output_within(&mut cmd, Duration::from_secs(3))?;
    Some(file_uris(&out))
}

/// `plocate` or `locate`, matching file names. Searches for the longest word
/// (every `locate` takes that much) and checks the others here.
fn locate(words: &[String]) -> Option<Vec<String>> {
    let longest = words.iter().max_by_key(|w| w.chars().count())?;
    for bin in ["plocate", "locate"] {
        let mut cmd = Command::new(bin);
        cmd.args(["-i", "-b", "-l", "3000", "--"]).arg(longest);
        if let Some(out) = output_within(&mut cmd, Duration::from_secs(3)) {
            return Some(
                out.lines()
                    .filter(|p| name_matches(p, words))
                    .map(str::to_string)
                    .collect(),
            );
        }
    }
    None
}

/// The user's Desktop, Documents and Downloads folders (from
/// `~/.config/user-dirs.dirs`, which may name them in the user's language).
pub fn user_dirs(home: &str, user_dirs_file: Option<&str>) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for (key, default) in [
        ("XDG_DESKTOP_DIR", "Desktop"),
        ("XDG_DOCUMENTS_DIR", "Documents"),
        ("XDG_DOWNLOAD_DIR", "Downloads"),
    ] {
        let configured = user_dirs_file.and_then(|f| {
            f.lines().find_map(|line| {
                let value = line
                    .trim()
                    .strip_prefix(key)?
                    .trim_start()
                    .strip_prefix('=')?;
                let value = value.trim().trim_matches('"');
                let value = value.replace("$HOME", home);
                (value.starts_with('/') && value != home).then(|| PathBuf::from(value))
            })
        });
        let dir = configured.unwrap_or_else(|| Path::new(home).join(default));
        if !found.contains(&dir) {
            found.push(dir);
        }
    }
    found
}

/// Files in `recently-used.xbel` (GTK's recent files list).
pub fn recent_files(xbel: &str) -> Vec<String> {
    let mut out = Vec::new();
    for chunk in xbel.split("<bookmark ").skip(1) {
        let Some(start) = chunk.find("href=\"") else {
            continue;
        };
        let href = &chunk[start + 6..];
        let Some(end) = href.find('"') else { continue };
        if let Some(path) = href[..end].strip_prefix("file://") {
            let path = percent_decode(&path.replace("&amp;", "&"));
            if !out.contains(&path) {
                out.push(path);
            }
        }
    }
    out
}

/// Folders never descended into.
const PRUNE: &[&str] = &[
    "node_modules",
    "target",
    "build",
    "dist",
    "vendor",
    "venv",
    "src",
];

/// A bounded walk of the user's folders by file name, plus recent files.
fn walk(words: &[String], home: &str) -> Vec<String> {
    let deadline = Instant::now() + Duration::from_millis(800);
    let mut out = Vec::new();
    let recent = std::fs::read_to_string(Path::new(home).join(".local/share/recently-used.xbel"))
        .map(|x| recent_files(&x))
        .unwrap_or_default();
    out.extend(
        recent
            .into_iter()
            .filter(|p| name_matches(p, words) && Path::new(p).exists()),
    );
    let config = std::fs::read_to_string(Path::new(home).join(".config/user-dirs.dirs")).ok();
    let mut stack: Vec<(PathBuf, u32)> = user_dirs(home, config.as_deref())
        .into_iter()
        .map(|d| (d, 0))
        .collect();
    let mut seen = 0usize;
    while let Some((dir, depth)) = stack.pop() {
        if Instant::now() > deadline || seen > 20_000 || out.len() > 200 {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            seen += 1;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if kind.is_dir() {
                if depth < 5 && !PRUNE.contains(&name.as_str()) {
                    stack.push((path, depth + 1));
                }
            } else if kind.is_file() {
                let p = path.to_string_lossy().into_owned();
                if name_matches(&p, words) && !out.contains(&p) {
                    out.push(p);
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_file_uris_from_tracker_output() {
        let out = "Files:\n  \u{1b}[32mfile:///home/sam/Documents/Q3%20deck.pdf\u{1b}[0m\n  \
                   file:///home/sam/Notes/q3.txt\n  Q3 plan\n";
        assert_eq!(
            file_uris(out),
            vec!["/home/sam/Documents/Q3 deck.pdf", "/home/sam/Notes/q3.txt"]
        );
    }

    #[test]
    fn matches_every_word_in_the_name() {
        let words = vec!["q3".to_string(), "Deck".to_string()];
        assert!(name_matches("/home/sam/Q3_deck_final.pdf", &words));
        assert!(!name_matches("/home/sam/q3/notes.pdf", &words));
    }

    #[test]
    fn finds_localised_user_dirs() {
        let cfg = "# comment\nXDG_DESKTOP_DIR=\"$HOME/Schreibtisch\"\nXDG_DOWNLOAD_DIR=\"$HOME\"\n";
        assert_eq!(
            user_dirs("/home/sam", Some(cfg)),
            vec![
                PathBuf::from("/home/sam/Schreibtisch"),
                PathBuf::from("/home/sam/Documents"),
                PathBuf::from("/home/sam/Downloads"),
            ]
        );
    }

    #[test]
    fn reads_recent_files() {
        let xbel = r#"<?xml version="1.0"?><xbel version="1.0">
  <bookmark href="file:///home/sam/Budget%202026.ods" added="x"><info/></bookmark>
  <bookmark href="https://example.com" added="x"/>
  <bookmark href="file:///home/sam/R&amp;D.txt" added="x"/>
</xbel>"#;
        assert_eq!(
            recent_files(xbel),
            vec!["/home/sam/Budget 2026.ods", "/home/sam/R&D.txt"]
        );
    }
}
