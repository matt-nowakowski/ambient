//! Doing things the user asked for (P1: the first two rungs of the acting
//! ladder: native actions and the user's own Shortcuts). Everything here is
//! reversible or harmless, so it runs straight away and the HUD offers Undo
//! where it applies. Multi-step computer use (P4) will add confirmation for
//! irreversible steps.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use super::router::Action;
use crate::hud::{self, HudContent, HudTone};

/// Marks a created item that is an .ics file to open (Windows/Linux).
const ICS_PREFIX: &str = "ics:";

/// Open an .ics file in the default calendar app, or remember a native id for Undo.
fn created(app: &AppHandle, id: String) -> Result<(), String> {
    match id.strip_prefix(ICS_PREFIX) {
        Some(path) => app
            .opener()
            .open_path(path, None::<&str>)
            .map_err(|_| "hud.status.failed".to_string()),
        None => {
            remember(id);
            Ok(())
        }
    }
}

/// The last thing created, for the HUD's Undo.
static LAST_CREATED: Mutex<Option<String>> = Mutex::new(None);

#[derive(Deserialize)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
struct NativeResult {
    ok: bool,
    detail: String,
}

fn status(app: &AppHandle, key: &str, tone: HudTone, undo: bool) {
    hud::show(
        app,
        HudContent::Status {
            text: key.to_string(),
            tone,
            undo,
        },
    );
}

pub async fn run(app: AppHandle, action: Action) {
    let outcome = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || perform(&app, action)
    })
    .await
    .unwrap_or_else(|_| Err("hud.status.failed".into()));
    match outcome {
        Ok(key) => {
            let undo = cfg!(target_os = "macos")
                && matches!(
                    key.as_str(),
                    "hud.status.reminderAdded" | "hud.status.eventAdded"
                );
            status(&app, &key, HudTone::Success, undo)
        }
        Err(key) => status(&app, &key, HudTone::Error, false),
    }
}

/// Ok(i18n key of the success line) or Err(i18n key of the error line).
fn perform(app: &AppHandle, action: Action) -> Result<String, String> {
    match action {
        Action::OpenApp { name } => open_app(&name).map(|_| "hud.status.opened".into()),
        Action::OpenUrl { url } => {
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Err("hud.status.failed".into());
            }
            app.opener()
                .open_url(&url, None::<&str>)
                .map(|_| "hud.status.opened".into())
                .map_err(|_| "hud.status.failed".into())
        }
        Action::WebSearch { query } => {
            let url = format!("https://www.google.com/search?q={}", urlencode(&query));
            app.opener()
                .open_url(&url, None::<&str>)
                .map(|_| "hud.status.searching".into())
                .map_err(|_| "hud.status.failed".into())
        }
        Action::Reminder { title, due } => native::reminder(&title, due.as_deref().unwrap_or(""))
            .and_then(|id| created(app, id))
            .map(|_| "hud.status.reminderAdded".into()),
        Action::CalendarEvent {
            title,
            start,
            end,
            location,
        } => native::event(
            &title,
            &start,
            end.as_deref().unwrap_or(""),
            location.as_deref().unwrap_or(""),
        )
        .and_then(|id| created(app, id))
        .map(|_| "hud.status.eventAdded".into()),
        Action::Shortcut { name } => run_shortcut(&name).map(|_| "hud.status.shortcutRan".into()),
        Action::Unsupported { .. } => Err("hud.status.cantDoYet".into()),
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
    native::delete(&id)
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
        Err("hud.status.shortcutNotFound".into())
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
    if ok {
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

    fn c(s: &str) -> CString {
        CString::new(s.replace('\0', "")).unwrap_or_default()
    }

    fn take(ptr: *mut c_char) -> Result<String, String> {
        if ptr.is_null() {
            return Err("hud.status.failed".into());
        }
        // SAFETY: strdup'd by Swift, freed here.
        let parsed: Option<NativeResult> = unsafe { CStr::from_ptr(ptr) }
            .to_str()
            .ok()
            .and_then(|s| serde_json::from_str(s).ok());
        unsafe { ambient_free(ptr) };
        match parsed {
            Some(r) if r.ok => Ok(r.detail),
            Some(r) if r.detail == "no_permission" => Err("hud.status.calendarPermission".into()),
            _ => Err("hud.status.failed".into()),
        }
    }

    pub fn reminder(title: &str, due: &str) -> Result<String, String> {
        let (t, d) = (c(title), c(due));
        take(unsafe { ambient_create_reminder(t.as_ptr(), d.as_ptr()) })
    }

    pub fn event(title: &str, start: &str, end: &str, location: &str) -> Result<String, String> {
        let (t, s, e, l) = (c(title), c(start), c(end), c(location));
        take(unsafe { ambient_create_event(t.as_ptr(), s.as_ptr(), e.as_ptr(), l.as_ptr()) })
    }

    pub fn delete(id: &str) -> bool {
        let i = c(id);
        unsafe { ambient_delete_item(i.as_ptr()) }
    }
}

/// Windows and Linux: no shared calendar API, so write a standard .ics file
/// and open it; the default calendar app (Outlook, Calendar, Thunderbird,
/// GNOME Calendar…) imports it. Undo isn't possible after that.
#[cfg(not(target_os = "macos"))]
mod native {
    use super::ICS_PREFIX;

    fn stamp(local: &str) -> Option<String> {
        let dt = chrono::NaiveDateTime::parse_from_str(local, "%Y-%m-%dT%H:%M").ok()?;
        Some(dt.format("%Y%m%dT%H%M00").to_string())
    }

    fn escape(s: &str) -> String {
        s.replace('\\', "\\\\")
            .replace(';', "\\;")
            .replace(',', "\\,")
            .replace('\n', "\\n")
    }

    fn open_ics(body: String) -> Result<String, String> {
        let uid = format!("ambient-{}", chrono::Utc::now().timestamp_millis());
        let ics = format!(
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Ambient//EN\r\n{body}END:VCALENDAR\r\n"
        )
        .replace("UID:", &format!("UID:{uid}"));
        let path = std::env::temp_dir().join(format!("{uid}.ics"));
        std::fs::write(&path, ics).map_err(|_| "hud.status.failed".to_string())?;
        // The caller opens it with the default calendar app.
        Ok(format!("{ICS_PREFIX}{}", path.display()))
    }

    pub fn reminder(title: &str, due: &str) -> Result<String, String> {
        let start = stamp(due).ok_or("hud.status.failed")?;
        open_ics(format!(
            "BEGIN:VEVENT\r\nUID:\r\nDTSTART:{start}\r\nDURATION:PT15M\r\nSUMMARY:{}\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0M\r\nDESCRIPTION:{}\r\nEND:VALARM\r\nEND:VEVENT\r\n",
            escape(title),
            escape(title)
        ))
    }

    pub fn event(title: &str, start: &str, end: &str, location: &str) -> Result<String, String> {
        let s = stamp(start).ok_or("hud.status.failed")?;
        let e = stamp(end)
            .map(|e| format!("DTEND:{e}\r\n"))
            .unwrap_or_else(|| "DURATION:PT1H\r\n".into());
        let loc = if location.is_empty() {
            String::new()
        } else {
            format!("LOCATION:{}\r\n", escape(location))
        };
        open_ics(format!(
            "BEGIN:VEVENT\r\nUID:\r\nDTSTART:{s}\r\n{e}SUMMARY:{}\r\n{loc}END:VEVENT\r\n",
            escape(title)
        ))
    }

    pub fn delete(_: &str) -> bool {
        false
    }
}
