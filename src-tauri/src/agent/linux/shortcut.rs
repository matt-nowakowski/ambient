//! "Run my … shortcut" on Linux, where there is no Shortcuts app. In order:
//!
//! 1. The user's own script `~/.local/share/<slug>/actions/<name>.sh`
//!    (`<name>` lowercased, spaces as dashes: "Focus mode" → `focus-mode.sh`),
//!    run with `sh`.
//! 2. An installed application (`.desktop` entry) whose name matches, launched
//!    with `gtk-launch` (or `gio launch`).
//!
//! Otherwise the agent says it can't do that yet.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// The script file name for a shortcut name ("Focus mode" → "focus-mode").
/// Only letters, digits, dashes and underscores survive, so a name can never
/// reach outside the actions folder.
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars() {
        if c.is_alphanumeric() || c == '_' {
            out.extend(c.to_lowercase());
        } else if (c.is_whitespace() || c == '-') && !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

/// The folder that holds the user's action scripts.
pub fn actions_dir() -> Option<PathBuf> {
    super::data_home().map(|d| d.join(env!("BRAND_SLUG")).join("actions"))
}

/// What a `.desktop` file says about itself.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct DesktopEntry {
    pub name: String,
    pub generic_name: String,
    pub launchable: bool,
}

/// The `[Desktop Entry]` group of a `.desktop` file.
pub fn parse_desktop(contents: &str) -> DesktopEntry {
    let mut in_entry = false;
    let mut e = DesktopEntry {
        launchable: true,
        ..Default::default()
    };
    let mut is_app = false;
    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        match k.trim() {
            "Name" => e.name = v.trim().to_string(),
            "GenericName" => e.generic_name = v.trim().to_string(),
            "Type" => is_app = v.trim() == "Application",
            "NoDisplay" | "Hidden" if v.trim() == "true" => e.launchable = false,
            _ => {}
        }
    }
    e.launchable &= is_app;
    e
}

/// Whether a desktop entry (with file stem `id`) is the one asked for.
pub fn entry_matches(id: &str, entry: &DesktopEntry, wanted: &str) -> bool {
    // Compare without separators: "deja dup" is "DejaDup".
    let compact = |s: &str| slug(s).replace(['-', '_'], "");
    let wanted = compact(wanted);
    if wanted.is_empty() || !entry.launchable {
        return false;
    }
    let stem_last = id.rsplit('.').next().unwrap_or(id);
    compact(&entry.name) == wanted || compact(id) == wanted || compact(stem_last) == wanted
}

/// Directories holding `.desktop` files, most specific first.
fn application_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = super::data_home().into_iter().collect();
    let system = std::env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
    dirs.extend(
        system
            .split(':')
            .filter(|d| d.starts_with('/'))
            .map(PathBuf::from),
    );
    for extra in ["/var/lib/flatpak/exports/share", "/var/lib/snapd/desktop"] {
        let p = PathBuf::from(extra);
        if !dirs.contains(&p) {
            dirs.push(p);
        }
    }
    dirs.into_iter().map(|d| d.join("applications")).collect()
}

fn find_desktop(name: &str) -> Option<(String, PathBuf)> {
    for dir in application_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten().take(2000) {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let Some(id) = path.file_stem().map(|s| s.to_string_lossy().into_owned()) else {
                continue;
            };
            let Ok(contents) = std::fs::read_to_string(&path) else {
                continue;
            };
            if entry_matches(&id, &parse_desktop(&contents), name) {
                return Some((id, path));
            }
        }
    }
    None
}

fn spawn(cmd: &mut Command) -> bool {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}

fn run_script(path: &Path) -> bool {
    path.is_file() && spawn(Command::new("sh").arg(path))
}

/// Ok, or Err(i18n key of the HUD's error line).
pub fn run(name: &str) -> Result<(), String> {
    let s = slug(name);
    if !s.is_empty() {
        if let Some(dir) = actions_dir() {
            let script = dir.join(format!("{s}.sh"));
            if script.is_file() {
                return if run_script(&script) {
                    Ok(())
                } else {
                    Err("hud.status.failed".into())
                };
            }
        }
    }
    if let Some((id, path)) = find_desktop(name) {
        return if launch(&id, &path) {
            Ok(())
        } else {
            Err("hud.status.failed".into())
        };
    }
    Err("hud.status.cantDoYet".into())
}

/// Open an installed app by the name people call it ("Visual Studio
/// Code" is `code.desktop`), with gio where gtk-launch isn't installed.
pub fn open_app(name: &str) -> bool {
    find_desktop(name).is_some_and(|(id, path)| launch(&id, &path))
}

fn launch(id: &str, path: &Path) -> bool {
    Command::new("gtk-launch")
        .arg(id)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
        || spawn(Command::new("gio").arg("launch").arg(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_names_safely() {
        assert_eq!(slug("Focus mode"), "focus-mode");
        assert_eq!(slug("  Start   work day! "), "start-work-day");
        assert_eq!(slug("../../etc/passwd"), "etcpasswd");
        assert_eq!(slug("back_up-now"), "back_up-now");
        assert_eq!(slug("..."), "");
    }

    #[test]
    fn reads_desktop_entries() {
        let e = parse_desktop(
            "[Desktop Entry]\nType=Application\nName=Firefox Web Browser\nGenericName=Web Browser\n\n[Desktop Action new]\nName=New Window\n",
        );
        assert_eq!(e.name, "Firefox Web Browser");
        assert!(e.launchable);
        assert!(
            !parse_desktop("[Desktop Entry]\nType=Application\nName=X\nNoDisplay=true\n")
                .launchable
        );
        assert!(!parse_desktop("[Desktop Entry]\nType=Link\nName=X\n").launchable);
    }

    #[test]
    fn matches_entries_by_name_or_id() {
        let e = DesktopEntry {
            name: "Backup".into(),
            generic_name: String::new(),
            launchable: true,
        };
        assert!(entry_matches("org.gnome.DejaDup", &e, "backup"));
        assert!(entry_matches("org.gnome.DejaDup", &e, "deja dup"));
        assert!(!entry_matches("org.gnome.DejaDup", &e, "photos"));
    }
}
