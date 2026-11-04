//! Other dictation apps on this computer.
//!
//! Dictation apps tend to share the same handful of shortcuts (Fn, right
//! Option, Ctrl+Win, Option+Space), and when two of them are bound to the same
//! keys both start listening and both type. This module spots the common ones
//! (while running) and macOS's own Fn/Globe dictation, so the
//! UI can say so in plain words and offer the fix: keep the shortcut to
//! Ambient (`exclusive_shortcuts`), or change one of the shortcuts.
//!
//! It also keeps Ambient in front: when exclusive shortcuts are on and one of
//! these apps starts after Ambient, its keyboard hook lands in front of ours
//! (macOS event taps and Windows low-level hooks both run newest first), so we
//! recreate ours to go back in front and swallow the press before it gets there.

use std::collections::BTreeSet;
use std::sync::Mutex;
use std::time::Duration;

use log::{debug, info, warn};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager};

use crate::settings::{get_settings, KeyboardImplementation};

/// How often the running-app check repeats. Cheap (one process listing).
const POLL_INTERVAL: Duration = Duration::from_secs(30);

/// A dictation app we know how to recognize. Detection only: names are shown
/// to the user as-is, never ranked or judged.
struct KnownApp {
    /// Display name.
    name: &'static str,
    /// macOS app bundle names (as in /Applications).
    mac_bundles: &'static [&'static str],
    /// Executable names on Windows (without `.exe`) and Linux.
    executables: &'static [&'static str],
}

const KNOWN_APPS: &[KnownApp] = &[
    KnownApp {
        name: "Wispr Flow",
        mac_bundles: &["Wispr Flow.app"],
        executables: &["Wispr Flow", "WisprFlow"],
    },
    KnownApp {
        name: "Superwhisper",
        mac_bundles: &["superwhisper.app"],
        executables: &["superwhisper"],
    },
    KnownApp {
        name: "VoiceInk",
        mac_bundles: &["VoiceInk.app"],
        executables: &[],
    },
    KnownApp {
        name: "MacWhisper",
        mac_bundles: &["MacWhisper.app"],
        executables: &[],
    },
    KnownApp {
        name: "Aqua Voice",
        mac_bundles: &["Aqua Voice.app", "Aqua.app"],
        executables: &["Aqua Voice", "AquaVoice"],
    },
    KnownApp {
        name: "Willow Voice",
        mac_bundles: &["Willow Voice.app"],
        executables: &["Willow Voice"],
    },
    KnownApp {
        name: "Spokenly",
        mac_bundles: &["Spokenly.app"],
        executables: &["Spokenly"],
    },
    KnownApp {
        name: "Monologue",
        mac_bundles: &["Monologue.app"],
        executables: &[],
    },
    KnownApp {
        name: "Whispering",
        mac_bundles: &["Whispering.app"],
        executables: &["Whispering", "whispering"],
    },
    KnownApp {
        name: "Handy",
        mac_bundles: &["Handy.app"],
        executables: &["handy"],
    },
    KnownApp {
        name: "Dragon",
        mac_bundles: &[],
        executables: &["natspeak"],
    },
    KnownApp {
        name: "Speech Note",
        mac_bundles: &[],
        executables: &["dsnote"],
    },
];

/// The operating system's own dictation that can share Ambient's keys.
#[derive(Serialize, Type, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SystemDictation {
    /// An Ambient shortcut uses Fn, and macOS also acts on the Fn/Globe key
    /// (Dictation, emoji or input source). Event taps can't stop that.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    MacosFnKey,
    /// An Ambient shortcut is Win+H, Windows voice typing.
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    WindowsVoiceTyping,
}

/// What the UI needs to warn about a shortcut shared with another app.
#[derive(Serialize, Type, Clone, Debug, Default, PartialEq)]
pub struct DictationConflicts {
    /// Known dictation apps that are running.
    pub apps: Vec<String>,
    /// Built-in dictation that can share the keys, if any.
    pub system_dictation: Option<SystemDictation>,
    /// Whether this keyboard backend can keep shortcuts to Ambient.
    pub exclusive_supported: bool,
    /// Whether Ambient is keeping its shortcut presses from other apps now.
    pub exclusive_active: bool,
}

#[derive(Default)]
struct DictationAppsState {
    conflicts: Mutex<DictationConflicts>,
    /// Known apps seen running on the last check; None before the first.
    /// Apps already running when Ambient starts are behind it anyway.
    running: Mutex<Option<BTreeSet<&'static str>>>,
}

/// Lowercased name with any `.exe` suffix removed.
fn normalize_executable(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    lower
        .strip_suffix(".exe")
        .map(str::to_string)
        .unwrap_or(lower)
}

/// Known apps among running executables (Windows/Linux names) and macOS app
/// bundle names. Exact, case-insensitive matches only, so "handyman" is not
/// Handy.
fn match_known<'a>(
    executables: impl IntoIterator<Item = &'a str>,
    mac_bundles: impl IntoIterator<Item = &'a str>,
) -> BTreeSet<&'static str> {
    let executables: BTreeSet<String> = executables.into_iter().map(normalize_executable).collect();
    let bundles: BTreeSet<String> = mac_bundles
        .into_iter()
        .map(|b| b.trim().to_lowercase())
        .collect();
    KNOWN_APPS
        .iter()
        .filter(|app| {
            app.executables
                .iter()
                .any(|e| executables.contains(&normalize_executable(e)))
                || app
                    .mac_bundles
                    .iter()
                    .any(|b| bundles.contains(&b.to_lowercase()))
        })
        .map(|app| app.name)
        .collect()
}

/// The outermost `.app` bundle in an executable path:
/// "/Applications/Wispr Flow.app/Contents/MacOS/Wispr Flow" → "Wispr Flow.app".
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn outer_bundle(path: &str) -> Option<&str> {
    path.split('/').find(|part| part.ends_with(".app"))
}

/// Whether any binding uses the Fn key.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn uses_fn(bindings: &[String]) -> bool {
    bindings
        .iter()
        .any(|b| b.split('+').any(|p| matches!(p.trim(), "fn" | "function")))
}

/// Whether any binding is Win+H (Windows voice typing).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn uses_win_h(bindings: &[String]) -> bool {
    bindings.iter().any(|b| {
        let mut parts: Vec<String> = b.split('+').map(|p| p.trim().to_lowercase()).collect();
        parts.sort();
        parts.len() == 2
            && parts[0] == "h"
            && matches!(
                parts[1].as_str(),
                "super" | "win" | "windows" | "meta" | "cmd"
            )
    })
}

/// macOS acts on the Fn/Globe key unless "Press 🌐 key to" is "Do Nothing"
/// (AppleFnUsageType 0; unset means the system default, which does
/// something) and Dictation is off (its shortcut can be Fn pressed twice).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_fn_conflict(uses_fn: bool, fn_usage_type: Option<i64>, dictation_enabled: bool) -> bool {
    uses_fn && (fn_usage_type != Some(0) || dictation_enabled)
}

#[cfg(target_os = "macos")]
fn read_default_int(domain: &str, key: &str) -> Option<i64> {
    let out = std::process::Command::new("defaults")
        .args(["read", domain, key])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).trim().parse().ok()
}

fn system_dictation(bindings: &[String]) -> Option<SystemDictation> {
    #[cfg(target_os = "macos")]
    {
        let fn_used = uses_fn(bindings);
        if fn_used {
            let usage = read_default_int("com.apple.HIToolbox", "AppleFnUsageType");
            let dictation = read_default_int("com.apple.assistant.support", "Dictation Enabled")
                .is_some_and(|v| v != 0);
            if macos_fn_conflict(fn_used, usage, dictation) {
                return Some(SystemDictation::MacosFnKey);
            }
        }
        None
    }
    #[cfg(target_os = "windows")]
    {
        uses_win_h(bindings).then_some(SystemDictation::WindowsVoiceTyping)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = bindings;
        None
    }
}

/// Known apps running now.
fn running_apps() -> BTreeSet<&'static str> {
    #[cfg(target_os = "macos")]
    {
        let Ok(out) = std::process::Command::new("ps")
            .args(["-axo", "comm="])
            .output()
        else {
            return BTreeSet::new();
        };
        let text = String::from_utf8_lossy(&out.stdout);
        match_known(std::iter::empty(), text.lines().filter_map(outer_bundle))
    }
    #[cfg(target_os = "linux")]
    {
        let mut names = Vec::new();
        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.flatten() {
                if let Ok(comm) = std::fs::read_to_string(entry.path().join("comm")) {
                    names.push(comm.trim().to_string());
                }
            }
        }
        match_known(names.iter().map(String::as_str), std::iter::empty())
    }
    #[cfg(target_os = "windows")]
    {
        let names = windows_process_names();
        match_known(names.iter().map(String::as_str), std::iter::empty())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        BTreeSet::new()
    }
}

#[cfg(target_os = "windows")]
fn windows_process_names() -> Vec<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut names = Vec::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return names;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                names.push(String::from_utf16_lossy(&entry.szExeFile[..len]));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    names
}

/// Check now, update the cache, tell the UI if anything changed, and go
/// back in front of a dictation app that just started.
fn check(app: &AppHandle) {
    let Some(state) = app.try_state::<DictationAppsState>() else {
        return;
    };
    let settings = get_settings(app);
    let ambient_keys = settings.keyboard_implementation == KeyboardImplementation::AmbientKeys;

    let running = running_apps();
    let newly_running: Vec<&str> = {
        let mut last = state.running.lock().unwrap_or_else(|e| e.into_inner());
        let new = match last.as_ref() {
            Some(last) => running.difference(last).copied().collect(),
            None => Vec::new(),
        };
        *last = Some(running.clone());
        new
    };

    // Rebuilding the listener on Linux re-grabs every keyboard; there the
    // grab is exclusive anyway, so order doesn't matter.
    if cfg!(not(target_os = "linux"))
        && ambient_keys
        && settings.exclusive_shortcuts
        && !newly_running.is_empty()
    {
        info!(
            "{} started; putting Ambient's shortcut listener back in front",
            newly_running.join(", ")
        );
        if let Err(e) = crate::shortcut::ambient_keys::rebuild_listener(app, true) {
            warn!("Couldn't recreate the shortcut listener: {}", e);
        }
    }

    // Only running apps: one kept installed for other jobs (say, transcribing
    // files) isn't listening to the keyboard, so it shouldn't nag.
    let apps: BTreeSet<&str> = running;
    let bindings: Vec<String> = settings
        .bindings
        .values()
        .filter(|b| b.id != "cancel")
        .map(|b| b.current_binding.to_lowercase())
        .collect();

    let conflicts = DictationConflicts {
        apps: apps.into_iter().map(str::to_string).collect(),
        system_dictation: system_dictation(&bindings),
        exclusive_supported: ambient_keys,
        exclusive_active: ambient_keys && crate::shortcut::ambient_keys::blocking_active(),
    };

    let changed = {
        let mut cached = state.conflicts.lock().unwrap_or_else(|e| e.into_inner());
        let changed = *cached != conflicts;
        *cached = conflicts.clone();
        changed
    };
    if changed {
        debug!("Dictation conflicts: {:?}", conflicts);
        let _ = app.emit("dictation-conflicts-changed", &conflicts);
    }
}

/// Start watching for other dictation apps.
pub fn init(app: &AppHandle) {
    app.manage(DictationAppsState::default());
    let app = app.clone();
    std::thread::spawn(move || loop {
        check(&app);
        std::thread::sleep(POLL_INTERVAL);
    });
}

/// Re-check soon (after a setting changed), off the calling thread.
pub fn refresh(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        // Let a listener rebuild settle so `exclusive_active` is current.
        std::thread::sleep(Duration::from_millis(300));
        check(&app);
    });
}

/// Other dictation apps that may answer the same shortcut, as of the last check.
#[tauri::command]
#[specta::specta]
pub fn get_dictation_conflicts(app: AppHandle) -> DictationConflicts {
    app.try_state::<DictationAppsState>()
        .map(|s| {
            s.conflicts
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_executables_case_insensitively_and_strips_exe() {
        let found = match_known(["WISPR FLOW.EXE", "explorer.exe", "natspeak.exe"], []);
        assert_eq!(found, BTreeSet::from(["Dragon", "Wispr Flow"]));
    }

    #[test]
    fn exact_names_only() {
        assert!(match_known(["handyman", "superwhisperer"], ["MacWhisper Helper.app"]).is_empty());
        assert_eq!(match_known(["handy"], []), BTreeSet::from(["Handy"]));
    }

    #[test]
    fn matches_mac_bundles() {
        let found = match_known([], ["superwhisper.app", "Safari.app", "VoiceInk.app"]);
        assert_eq!(found, BTreeSet::from(["Superwhisper", "VoiceInk"]));
    }

    #[test]
    fn never_matches_ambient_itself() {
        let brand = env!("BRAND_NAME");
        assert!(match_known([brand], [format!("{brand}.app").as_str()]).is_empty());
    }

    #[test]
    fn outer_bundle_takes_the_app_not_its_helpers() {
        assert_eq!(
            outer_bundle("/Applications/Wispr Flow.app/Contents/Frameworks/Wispr Flow Helper.app/Contents/MacOS/Wispr Flow Helper"),
            Some("Wispr Flow.app")
        );
        assert_eq!(outer_bundle("/usr/sbin/cfprefsd"), None);
    }

    #[test]
    fn detects_fn_bindings() {
        assert!(uses_fn(&["fn".into()]));
        assert!(uses_fn(&["option+space".into(), "fn+ctrl".into()]));
        assert!(!uses_fn(&["option+space".into(), "f5".into()]));
    }

    #[test]
    fn detects_win_h() {
        assert!(uses_win_h(&["super+h".into()]));
        assert!(uses_win_h(&["h+win".into()]));
        assert!(!uses_win_h(&["super+shift+h".into(), "ctrl+h".into()]));
    }

    #[test]
    fn macos_fn_conflict_rules() {
        // Not using Fn: never a conflict.
        assert!(!macos_fn_conflict(false, None, true));
        // "Do Nothing" and Dictation off: clear.
        assert!(!macos_fn_conflict(true, Some(0), false));
        // System default (unset) or any action: conflict.
        assert!(macos_fn_conflict(true, None, false));
        assert!(macos_fn_conflict(true, Some(3), false));
        // Dictation on can still be Fn pressed twice.
        assert!(macos_fn_conflict(true, Some(0), true));
    }
}
