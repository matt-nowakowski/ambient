//! The agent's Linux counterparts of macOS services: file search (Spotlight),
//! the calendar (EventKit) and the user's own actions (Shortcuts).
//!
//! Parsing is pure and tested on every platform; anything that touches the
//! system runs on Linux only.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

pub mod calendar;
pub mod files;
pub mod shortcut;

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Run a command and return its stdout, or None if it's missing, fails or
/// takes longer than `timeout` (then it's killed).
pub fn output_within(cmd: &mut Command, timeout: Duration) -> Option<String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    // Read on a thread so a full pipe can't stall the child past the deadline.
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let buf = reader.join().ok()?;
    status
        .filter(|s| s.success())
        .map(|_| String::from_utf8_lossy(&buf).into_owned())
}

/// `$HOME`, if set.
pub fn home() -> Option<String> {
    std::env::var("HOME").ok().filter(|h| !h.is_empty())
}

/// `$XDG_DATA_HOME`, or `~/.local/share`.
pub fn data_home() -> Option<std::path::PathBuf> {
    std::env::var("XDG_DATA_HOME")
        .ok()
        .filter(|d| d.starts_with('/'))
        .map(std::path::PathBuf::from)
        .or_else(|| home().map(|h| std::path::Path::new(&h).join(".local/share")))
}

/// Decode `%XX` escapes in a file URI path.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_file_uris() {
        assert_eq!(
            percent_decode("/home/sam/Q3%20deck.pdf"),
            "/home/sam/Q3 deck.pdf"
        );
        assert_eq!(percent_decode("/a/%C3%A9t%C3%A9"), "/a/été");
        assert_eq!(percent_decode("/50%"), "/50%");
        assert_eq!(percent_decode("/x%2"), "/x%2");
    }
}
