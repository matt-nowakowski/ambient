//! The user's own automations on Windows, the analogue of macOS Shortcuts:
//! a Start menu shortcut (`.lnk`) by name, or a Power Automate Desktop flow.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use windows::core::{w, HSTRING, PCWSTR};
use windows::Win32::UI::Shell::{FOLDERID_CommonPrograms, FOLDERID_Programs, ShellExecuteW};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::files::known_folder;
use super::rules;

/// The Start menu shortcut whose name matches `name` (letters and digits
/// only, any case), searched in the user's and everyone's Programs folders.
pub fn find_start_menu(name: &str) -> Option<PathBuf> {
    let wanted = rules::loose(name);
    if wanted.is_empty() {
        return None;
    }
    let deadline = Instant::now() + Duration::from_millis(500);
    let mut queue: VecDeque<(PathBuf, usize)> = [&FOLDERID_Programs, &FOLDERID_CommonPrograms]
        .iter()
        .filter_map(|id| known_folder(id))
        .map(|p| (p, 0))
        .collect();
    while let Some((dir, depth)) = queue.pop_front() {
        if Instant::now() > deadline {
            break;
        }
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let file = entry.file_name().to_string_lossy().to_string();
            match entry.file_type() {
                Ok(t) if t.is_dir() && depth < 4 => queue.push_back((entry.path(), depth + 1)),
                Ok(t) if t.is_file() => {
                    if rules::shortcut_stem(&file).is_some_and(|s| rules::loose(s) == wanted) {
                        return Some(entry.path());
                    }
                }
                _ => {}
            }
        }
    }
    None
}

/// Power Automate Desktop's console, if it's installed.
fn power_automate() -> Option<PathBuf> {
    ["ProgramFiles(x86)", "ProgramFiles"]
        .iter()
        .filter_map(|v| std::env::var(v).ok())
        .map(|base| {
            Path::new(&base)
                .join("Power Automate Desktop")
                .join("PAD.Console.Host.exe")
        })
        .find(|p| p.is_file())
}

fn shell_open(target: &str) -> bool {
    let target = HSTRING::from(target);
    let result = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            &target,
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    // ShellExecute reports success as a value above 32.
    result.0 as isize > 32
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Run the user's automation called `name`. Err holds an i18n key.
pub fn run(name: &str) -> Result<(), String> {
    super::com::ensure_init();
    if let Some(lnk) = find_start_menu(name) {
        return if shell_open(&lnk.to_string_lossy()) {
            Ok(())
        } else {
            Err("hud.status.failed".into())
        };
    }
    if power_automate().is_some() {
        // Power Automate Desktop runs a flow by name from its URL scheme (and
        // says so itself when there's no such flow).
        let url = format!(
            "ms-powerautomate:/console/flow/run?workflowName={}",
            urlencode(name.trim())
        );
        return if shell_open(&url) {
            Ok(())
        } else {
            Err("hud.status.failed".into())
        };
    }
    Err("hud.status.automationNotFound".into())
}

/// Open an app by its Start menu name ("Spotify"), as the Start menu does.
pub fn open_app(name: &str) -> bool {
    super::com::ensure_init();
    find_start_menu(name).is_some_and(|lnk| shell_open(&lnk.to_string_lossy()))
}
