//! Naming Linux apps. There are no bundle ids, so the agent's `bundle_id`
//! here is a stable app id read from the process: its Flatpak id, its Snap
//! name, or its executable's name, lowercased ("com.slack.slack", "slack",
//! "google-chrome"). Pure functions, so they're tested on every platform.

/// The app id of a process, from its executable path and (for a Flatpak) the
/// contents of `/proc/<pid>/root/.flatpak-info`.
pub fn app_id(exe: &str, flatpak_info: Option<&str>) -> String {
    if let Some(id) = flatpak_info.and_then(flatpak_id) {
        return id.to_lowercase();
    }
    let exe = exe.trim().trim_end_matches(" (deleted)");
    if let Some(rest) = exe.strip_prefix("/snap/") {
        if let Some(name) = rest.split('/').next().filter(|n| !n.is_empty()) {
            return name.to_lowercase();
        }
    }
    let lower = exe.to_lowercase();
    // Chromium-family browsers all name their binary after the engine.
    for (marker, id) in [
        ("/google/chrome", "google-chrome"),
        ("/chromium", "chromium"),
        ("/microsoft/msedge", "microsoft-edge"),
        ("/brave.com/", "brave"),
        ("/vivaldi", "vivaldi"),
    ] {
        if lower.contains(marker) {
            return id.to_string();
        }
    }
    let base = lower.rsplit('/').next().unwrap_or_default();
    base.strip_suffix("-bin").unwrap_or(base).to_string()
}

/// `name=` in the `[Application]` group of a `.flatpak-info` key file.
pub fn flatpak_id(info: &str) -> Option<String> {
    let mut in_app = false;
    for line in info.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_app = line == "[Application]";
            continue;
        }
        if in_app {
            if let Some(v) = line.strip_prefix("name=") {
                let v = v.trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// `WM_CLASS` is two NUL-terminated strings: (instance, class).
pub fn parse_wm_class(raw: &[u8]) -> (String, String) {
    let mut parts = raw
        .split(|b| *b == 0)
        .map(|p| String::from_utf8_lossy(p).trim().to_string());
    let instance = parts.next().unwrap_or_default();
    let class = parts.next().unwrap_or_default();
    (instance, class)
}

/// A display name when nothing better is known ("google-chrome" → "Google Chrome").
pub fn display_name(id: &str) -> String {
    let last = id.rsplit('.').next().unwrap_or(id);
    last.split(['-', '_'])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().chain(c).collect::<String>(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Ids (lowercased) of apps that mean a call when they're in front while
/// another app holds the mic: native clients and their Flatpaks.
pub const CALL_APPS: &[&str] = &[
    "zoom",
    "us.zoom.zoom",
    "teams",
    "teams-for-linux",
    "com.github.ismaelmartinez.teams_for_linux",
    "slack",
    "com.slack.slack",
    "discord",
    "com.discordapp.discord",
    "webex",
    "skypeforlinux",
    "com.skype.client",
];

/// Browsers (lowercased ids): a call in one is told by its page's URL/title.
pub const BROWSERS: &[&str] = &[
    "firefox",
    "firefox-esr",
    "org.mozilla.firefox",
    "google-chrome",
    "com.google.chrome",
    "chromium",
    "chromium-browser",
    "org.chromium.chromium",
    "microsoft-edge",
    "com.microsoft.edge",
    "brave",
    "com.brave.browser",
    "vivaldi",
    "com.vivaldi.vivaldi",
    "librewolf",
    "io.gitlab.librewolf-community",
    "epiphany",
    "org.gnome.epiphany",
];

/// Never read on Linux, beside the shared list: password managers and
/// keyrings and system settings (native and Flatpak ids).
pub const NEVER_WATCH: &[&str] = &[
    "1password",
    "bitwarden",
    "keepassxc",
    "org.keepassxc.keepassxc",
    "com.bitwarden.desktop",
    "seahorse",
    "org.gnome.seahorse.application",
    "kwalletmanager5",
    "kwalletmanager",
    "gnome-control-center",
    "org.gnome.settings",
    "systemsettings",
];

pub fn is_call_app(id: &str) -> bool {
    let id = id.to_lowercase();
    CALL_APPS.contains(&id.as_str())
}

pub fn is_browser(id: &str) -> bool {
    let id = id.to_lowercase();
    BROWSERS.contains(&id.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_apps_from_their_process() {
        assert_eq!(app_id("/usr/bin/firefox-bin", None), "firefox");
        assert_eq!(app_id("/opt/google/chrome/chrome", None), "google-chrome");
        assert_eq!(app_id("/usr/lib/chromium/chromium", None), "chromium");
        assert_eq!(app_id("/snap/slack/123/usr/lib/slack/slack", None), "slack");
        assert_eq!(app_id("/opt/zoom/zoom (deleted)", None), "zoom");
        let info = "[Application]\nname=com.slack.Slack\nruntime=x\n\n[Instance]\nname=nope\n";
        assert_eq!(app_id("/app/bin/slack", Some(info)), "com.slack.slack");
        assert_eq!(flatpak_id("[Instance]\nname=x\n"), None);
    }

    #[test]
    fn reads_wm_class() {
        assert_eq!(
            parse_wm_class(b"Navigator\0firefox\0"),
            ("Navigator".into(), "firefox".into())
        );
        assert_eq!(parse_wm_class(b""), (String::new(), String::new()));
    }

    #[test]
    fn display_names() {
        assert_eq!(display_name("google-chrome"), "Google Chrome");
        assert_eq!(display_name("org.gnome.nautilus"), "Nautilus");
    }

    #[test]
    fn knows_call_apps_and_browsers() {
        assert!(is_call_app("us.zoom.Zoom"));
        assert!(is_call_app("discord"));
        assert!(!is_call_app("firefox"));
        assert!(is_browser("org.mozilla.firefox"));
        assert!(!is_browser("slack"));
    }
}
