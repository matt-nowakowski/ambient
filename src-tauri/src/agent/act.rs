//! Doing things the user asked for (P1: the first two rungs of the acting
//! ladder: native actions and the user's own Shortcuts). Everything here is
//! reversible or harmless, so it runs straight away and the HUD offers Undo
//! where it applies. Multi-step computer use (P4) will add confirmation for
//! irreversible steps.
//!
//! Every outcome is a notice that says what was done ("Reminder set for 9:00
//! tomorrow: fix the vault"), or why it couldn't be and what can be done
//! instead ("No calendar app is connected on Windows. I saved a calendar
//! file for you."). Never a silent nothing.

use std::sync::Mutex;

use chrono::NaiveDateTime;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use super::notice::{offer, Notice};
use super::router::Action;
use super::when;

/// The last thing created, for the HUD's Undo: an EventKit id on macOS,
/// `systemd:<unit>` on Linux, `toast:<id>` on Windows.
static LAST_CREATED: Mutex<Option<String>> = Mutex::new(None);

#[derive(Deserialize)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
struct NativeResult {
    ok: bool,
    detail: String,
}

/// This computer's OS, for "… on Windows" (not translated: a name).
pub fn os_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else {
        "Linux"
    }
}

/// Text read to judge the window in front: enough for its words to speak.
const PRIVATE_CHECK_CHARS: usize = 4000;

/// The window in front is a private place, judged as the agent judges any
/// window (`context::snapshot`; its text, if read, stays in memory and is
/// dropped). With nothing allowed to watch the screen, only its metadata
/// (app, title, URL) is judged.
fn front_is_private(app: &AppHandle) -> bool {
    let agent = crate::settings::get_settings(app).agent;
    let watching =
        (agent.screen_context || agent.screen_memory || agent.proactive) && !agent.is_paused();
    let chars = if watching { PRIVATE_CHECK_CHARS } else { 0 };
    matches!(
        crate::context::snapshot(chars, &agent.never_watch),
        Err(crate::context::Skipped::Sensitive)
    )
}

pub async fn run(app: AppHandle, action: Action) {
    let kind = match &action {
        Action::Reminder { .. } => Some("reminder"),
        Action::CalendarEvent { .. } => Some("calendar"),
        Action::OpenApp { .. } => Some("open_app"),
        Action::Shortcut { .. } => Some("shortcut"),
        Action::Unsupported { .. } | Action::CloseWindow { .. } => Some("unsupported"),
        _ => None,
    };
    let notice = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || perform(&app, action)
    })
    .await
    .unwrap_or_else(|_| Notice::cant("hud.notice.failed"));
    crate::telemetry::act(kind, notice.outcome());
    notice.show(&app);
}

/// What happened, as the notice to show.
fn perform(app: &AppHandle, action: Action) -> Notice {
    // Test mode: nothing is opened or created; what would be is recorded.
    if crate::testing::active() {
        crate::testing::record(
            "act",
            serde_json::json!({ "action": serde_json::to_value(&action).unwrap_or_default() }),
        );
        match &action {
            Action::OpenUrl { url } => {
                crate::testing::record("open_url", serde_json::json!({ "url": url }));
                return Notice::done("hud.status.opened");
            }
            Action::WebSearch { query } => {
                let url = format!("https://www.google.com/search?q={}", urlencode(query));
                crate::testing::record("open_url", serde_json::json!({ "url": url }));
                return Notice::done("hud.status.searching");
            }
            Action::OpenApp { name } => {
                crate::testing::record("open_app", serde_json::json!({ "name": name }));
                return Notice::done("hud.notice.opened").var("name", name.clone());
            }
            Action::Reminder { title, due } => {
                let n = match due {
                    Some(d) => Notice::done("hud.notice.reminderSetAt").var("due", d.clone()),
                    None => Notice::done("hud.notice.reminderSet"),
                };
                return n.var("title", title.clone());
            }
            Action::CalendarEvent { title, start, .. } => {
                return Notice::done("hud.notice.eventAdded")
                    .var("title", title.clone())
                    .var("due", start.clone());
            }
            Action::Shortcut { name } => {
                return Notice::done("hud.notice.shortcutRan").var("name", name.clone());
            }
            // Saying it can't is already only words: as in the app.
            Action::CloseWindow { .. } | Action::Unsupported { .. } => {}
        }
    }
    match action {
        Action::OpenApp { name } => match open_app(&name) {
            Ok(()) => Notice::done("hud.notice.opened").var("name", name),
            Err(_) => Notice::cant("hud.notice.appNotFound")
                .var("name", name.clone())
                .offer_action(
                    "hud.offer.searchWeb",
                    &Action::WebSearch {
                        query: format!("{name} app"),
                    },
                ),
        },
        Action::OpenUrl { url } => {
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Notice::cant("hud.notice.badLink").offer(offer::COPY, "hud.copy", url);
            }
            match app.opener().open_url(&url, None::<&str>) {
                Ok(()) => Notice::done("hud.status.opened"),
                Err(_) => Notice::cant("hud.notice.noBrowser").offer(
                    offer::COPY,
                    "hud.offer.copyLink",
                    url,
                ),
            }
        }
        Action::WebSearch { query } => {
            let url = format!("https://www.google.com/search?q={}", urlencode(&query));
            match app.opener().open_url(&url, None::<&str>) {
                Ok(()) => Notice::done("hud.status.searching"),
                // No browser: answer it here instead.
                Err(_) => Notice::cant("hud.notice.noBrowser").offer(
                    offer::ANSWER,
                    "hud.offer.answerHere",
                    query,
                ),
            }
        }
        Action::Reminder { title, due } => {
            let due = due.as_deref().and_then(when::parse_due);
            reminder(&title, due)
        }
        Action::CalendarEvent {
            title,
            start,
            end,
            location,
        } => match when::parse_due(&start) {
            Some(s) => event(
                app,
                &title,
                &s,
                end.as_deref().and_then(when::parse_due).as_ref(),
                location.as_deref().unwrap_or(""),
            ),
            // No time we can read: say so, and keep what was asked.
            None => Notice::cant("hud.notice.eventNeedsTime")
                .var("title", title.clone())
                .offer(offer::COPY, "hud.copy", title),
        },
        Action::Shortcut { name } => match run_shortcut(&name) {
            Ok(()) => Notice::done("hud.notice.shortcutRan").var("name", name),
            Err(key) => Notice::cant(&key).var("name", name.clone()).offer(
                offer::ANSWER,
                "hud.offer.howTo",
                format!(
                    "How do I make an automation called \"{name}\" on {}?",
                    os_name()
                ),
            ),
        },
        // Ambient doesn't close other apps' windows on any OS (its own
        // cards close by voice: "close that"). Say so, with the keys.
        Action::CloseWindow { what } => {
            let (key, keys) = close_notice(&what, os_name());
            Notice::cant(key).var("keys", keys).var("name", what)
        }
        // On a private page (a bank, a checkout, a medical portal…) the
        // request was about the page: Ambient doesn't act there, as it
        // doesn't read there, and "I can't do that yet" would promise it
        // one day will.
        Action::Unsupported { .. } if front_is_private(app) => {
            Notice::cant("hud.notice.privateNoAct")
        }
        Action::Unsupported { description } => {
            let what = description.trim().to_string();
            Notice::cant(if what.is_empty() {
                "hud.notice.cantDoYetPlain"
            } else {
                "hud.notice.cantDoYet"
            })
            .var("what", what.clone())
            .offer(
                offer::ANSWER,
                "hud.offer.showMeHow",
                format!(
                    "I asked my assistant to: {what}. It can't do that on my computer yet. Tell me briefly how to do it myself on {}.",
                    os_name()
                ),
            )
        }
    }
}

/// "Close that window" / "quit Slack": the notice key and the keys that do
/// it on `os` (names of keys, not translated).
fn close_notice(what: &str, os: &str) -> (&'static str, &'static str) {
    let mac = os == "macOS";
    match what {
        "tab" => ("hud.notice.cantCloseTab", if mac { "⌘W" } else { "Ctrl+W" }),
        "window" => (
            "hud.notice.cantCloseWindow",
            if mac { "⌘W" } else { "Alt+F4" },
        ),
        "app" => ("hud.notice.cantQuitApp", quit_keys(os)),
        _ => ("hud.notice.cantQuitNamed", quit_keys(os)),
    }
}

fn quit_keys(os: &str) -> &'static str {
    match os {
        "macOS" => "⌘Q",
        "Windows" => "Alt+F4",
        _ => "Ctrl+Q",
    }
}

/// A reminder: done, with the time it'll fire, or the fallback and why.
fn reminder(title: &str, due: Option<NaiveDateTime>) -> Notice {
    let set = |id: String| {
        remember(id);
        let n = match &due {
            Some(d) => Notice::done("hud.notice.reminderSetAt").var("due", when::format_due(d)),
            None => Notice::done("hud.notice.reminderSet"),
        };
        n.var("title", title).undo(true)
    };
    let as_event = |d: &NaiveDateTime| Action::CalendarEvent {
        title: title.to_string(),
        start: when::format_due(d),
        end: None,
        location: None,
    };

    #[cfg(target_os = "macos")]
    {
        let due_s = due.as_ref().map(when::format_due).unwrap_or_default();
        match native::reminder(title, &due_s) {
            Ok(id) => set(id),
            Err(native::Fail::NoPermission) => Notice::cant("hud.notice.remindersPermission")
                .var("title", title)
                .offer(offer::SETTINGS, "hud.offer.openSettings", "reminders")
                .offer(offer::COPY, "hud.copy", title),
            Err(native::Fail::Other) => {
                let n = Notice::cant("hud.notice.reminderFailed").var("title", title);
                let n = match &due {
                    Some(d) => n.offer_action("hud.offer.addToCalendar", &as_event(d)),
                    None => n,
                };
                n.offer(offer::COPY, "hud.copy", title)
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Without a time there's nothing to schedule: ask for one.
        let Some(d) = due else {
            return Notice::cant("hud.notice.reminderNeedsTime")
                .var("title", title)
                .var("os", os_name())
                .offer(offer::COPY, "hud.copy", title);
        };
        match super::reminders::schedule(title, &d) {
            Ok(id) => set(id),
            Err(why) => {
                log::debug!("reminder: falling back from the OS scheduler ({why:?})");
                let key = match why {
                    super::reminders::Unavailable::NotificationsOff => {
                        "hud.notice.reminderNotificationsOff"
                    }
                    _ if cfg!(target_os = "linux") => "hud.notice.reminderLinux",
                    _ => "hud.notice.reminderWindows",
                };
                // "Can't here; add it to your calendar instead, or copy it?"
                Notice::cant(key)
                    .var("title", title)
                    .var("due", when::format_due(&d))
                    .offer_action("hud.offer.addToCalendar", &as_event(&d))
                    .offer(offer::COPY, "hud.copy", title)
            }
        }
    }
}

/// A calendar event: in Calendar on macOS; elsewhere an .ics file opened in
/// the default calendar app, or saved when there is none.
fn event(
    app: &AppHandle,
    title: &str,
    start: &NaiveDateTime,
    end: Option<&NaiveDateTime>,
    location: &str,
) -> Notice {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let fmt = |d: &NaiveDateTime| when::format_due(d);
        match native::event(
            title,
            &fmt(start),
            &end.map(fmt).unwrap_or_default(),
            location,
        ) {
            Ok(id) => {
                remember(id);
                Notice::done("hud.notice.eventAdded")
                    .var("title", title)
                    .var("due", fmt(start))
                    .undo(true)
            }
            Err(native::Fail::NoPermission) => Notice::cant("hud.notice.calendarsPermission")
                .offer(offer::SETTINGS, "hud.offer.openSettings", "calendars")
                .offer(offer::COPY, "hud.copy", title),
            Err(native::Fail::Other) => Notice::cant("hud.notice.eventFailed")
                .var("title", title)
                .offer(offer::COPY, "hud.copy", title),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let uid = format!(
            "{}-{}",
            env!("BRAND_SLUG"),
            chrono::Utc::now().timestamp_millis()
        );
        let body = super::reminders::ics(&uid, title, start, end, location, false);
        let Some(path) = save_ics(app, title, &body) else {
            return Notice::cant("hud.notice.eventFailed")
                .var("title", title)
                .offer(offer::COPY, "hud.copy", title);
        };
        match app
            .opener()
            .open_path(path.display().to_string(), None::<&str>)
        {
            Ok(()) => Notice::done("hud.notice.eventIcsOpened")
                .var("title", title)
                .var("due", when::format_due(start)),
            // Nothing handles .ics: say so, and where the file is.
            Err(e) => {
                log::debug!("calendar: no app opened the .ics: {e}");
                let folder = path
                    .parent()
                    .map(|p| p.display().to_string())
                    .unwrap_or_default();
                Notice::cant("hud.notice.noCalendarApp")
                    .var("os", os_name())
                    .var(
                        "file",
                        path.file_name()
                            .map(|f| f.to_string_lossy().to_string())
                            .unwrap_or_default(),
                    )
                    .offer(offer::OPEN_FILE, "hud.offer.showFile", folder)
                    .offer(offer::COPY, "hud.copy", title)
            }
        }
    }
}

/// Save an .ics where the user can find it again (Downloads), else temp.
#[cfg(not(target_os = "macos"))]
fn save_ics(app: &AppHandle, title: &str, body: &str) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    let dir = app
        .path()
        .download_dir()
        .ok()
        .filter(|d| d.is_dir())
        .unwrap_or_else(std::env::temp_dir);
    let path = dir.join(super::reminders::ics_file_name(title));
    match std::fs::write(&path, body) {
        Ok(()) => Some(path),
        Err(e) => {
            log::warn!("calendar: couldn't save the .ics: {e}");
            None
        }
    }
}

fn remember(id: String) {
    if let Ok(mut g) = LAST_CREATED.lock() {
        *g = Some(id);
    }
}

/// Undo the last reminder or event Ambient created.
pub fn undo_last() -> bool {
    let Some(id) = LAST_CREATED.lock().ok().and_then(|mut g| g.take()) else {
        return false;
    };
    #[cfg(target_os = "macos")]
    {
        native::delete(&id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        super::reminders::cancel(&id)
    }
}

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

#[cfg(target_os = "macos")]
fn open_app(name: &str) -> Result<(), String> {
    let ok = std::process::Command::new("/usr/bin/open")
        .args(["-a", name])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err("hud.status.appNotFound".into())
    }
}

#[cfg(target_os = "macos")]
fn run_shortcut(name: &str) -> Result<(), String> {
    let ok = std::process::Command::new("/usr/bin/shortcuts")
        .args(["run", name])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err("hud.notice.shortcutNotFound".into())
    }
}

#[cfg(target_os = "windows")]
fn open_app(name: &str) -> Result<(), String> {
    // The Start menu's own shortcut first ("Spotify", "Visual Studio Code").
    if crate::win::shortcuts::open_app(name) {
        return Ok(());
    }
    // `start` resolves registered apps (App Paths) and Store aliases by name.
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let ok = std::process::Command::new("cmd")
        .args(["/C", "start", "", name])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err("hud.status.appNotFound".into())
    }
}

#[cfg(target_os = "linux")]
fn open_app(name: &str) -> Result<(), String> {
    // Desktop entries are usually the lowercase app name.
    let id = name.to_lowercase().replace(' ', "-");
    let ok = std::process::Command::new("gtk-launch")
        .arg(&id)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    // Otherwise by its desktop entry's name ("Visual Studio Code").
    if ok || super::linux::shortcut::open_app(name) {
        Ok(())
    } else {
        Err("hud.status.appNotFound".into())
    }
}

/// Windows: a Start menu shortcut by that name, or a Power Automate Desktop
/// flow.
#[cfg(target_os = "windows")]
fn run_shortcut(name: &str) -> Result<(), String> {
    crate::win::shortcuts::run(name)
}

/// Linux: the user's script in `~/.local/share/<slug>/actions/`, or an
/// installed app of that name.
#[cfg(target_os = "linux")]
fn run_shortcut(name: &str) -> Result<(), String> {
    super::linux::shortcut::run(name)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn run_shortcut(_name: &str) -> Result<(), String> {
    Err("hud.status.cantDoYet".into())
}

#[cfg(target_os = "macos")]
mod native {
    use std::ffi::{c_char, CStr, CString};

    use super::NativeResult;

    extern "C" {
        fn ambient_free(ptr: *mut c_char);
        fn ambient_create_reminder(title: *const c_char, due: *const c_char) -> *mut c_char;
        fn ambient_create_event(
            title: *const c_char,
            start: *const c_char,
            end: *const c_char,
            location: *const c_char,
        ) -> *mut c_char;
        fn ambient_delete_item(id: *const c_char) -> bool;
    }

    /// Why EventKit said no.
    pub enum Fail {
        NoPermission,
        Other,
    }

    fn c(s: &str) -> CString {
        CString::new(s.replace('\0', "")).unwrap_or_default()
    }

    fn take(ptr: *mut c_char) -> Result<String, Fail> {
        if ptr.is_null() {
            return Err(Fail::Other);
        }
        // SAFETY: strdup'd by Swift, freed here.
        let parsed: Option<NativeResult> = unsafe { CStr::from_ptr(ptr) }
            .to_str()
            .ok()
            .and_then(|s| serde_json::from_str(s).ok());
        unsafe { ambient_free(ptr) };
        match parsed {
            Some(r) if r.ok => Ok(r.detail),
            Some(r) if r.detail == "no_permission" => Err(Fail::NoPermission),
            Some(r) => {
                log::debug!("eventkit: {}", r.detail);
                Err(Fail::Other)
            }
            None => Err(Fail::Other),
        }
    }

    pub fn reminder(title: &str, due: &str) -> Result<String, Fail> {
        let (t, d) = (c(title), c(due));
        take(unsafe { ambient_create_reminder(t.as_ptr(), d.as_ptr()) })
    }

    pub fn event(title: &str, start: &str, end: &str, location: &str) -> Result<String, Fail> {
        let (t, s, e, l) = (c(title), c(start), c(end), c(location));
        take(unsafe { ambient_create_event(t.as_ptr(), s.as_ptr(), e.as_ptr(), l.as_ptr()) })
    }

    pub fn delete(id: &str) -> bool {
        let i = c(id);
        unsafe { ambient_delete_item(i.as_ptr()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_notices_name_the_keys_for_each_os() {
        assert_eq!(
            close_notice("window", "Windows"),
            ("hud.notice.cantCloseWindow", "Alt+F4")
        );
        assert_eq!(close_notice("window", "macOS").1, "⌘W");
        assert_eq!(
            close_notice("tab", "Linux"),
            ("hud.notice.cantCloseTab", "Ctrl+W")
        );
        assert_eq!(close_notice("app", "Windows").1, "Alt+F4");
        assert_eq!(
            close_notice("Slack", "Linux"),
            ("hud.notice.cantQuitNamed", "Ctrl+Q")
        );
    }
}
