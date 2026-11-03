//! Reminders and calendar files on Windows and Linux, where there's no
//! shared reminders store like EventKit.
//!
//! - Windows: a scheduled toast notification (WinRT `ToastNotifier`), which
//!   Windows shows at the time even if Ambient isn't running. Undo removes it
//!   from the schedule.
//! - Linux: a `systemd-run --user --on-calendar` timer that runs
//!   `notify-send`. Undo stops the timer.
//! - Either, when that isn't possible: an `.ics` file with an alarm, opened in
//!   the default calendar app (or saved for the user to import), and the
//!   notice says which fallback was used and why.

#![cfg_attr(target_os = "macos", allow(dead_code))]

use chrono::NaiveDateTime;
#[allow(unused_imports)]
use chrono::{Local, TimeZone};

/// Ids remembered for Undo: what scheduled it, then its handle.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub const SYSTEMD_PREFIX: &str = "systemd:";
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub const TOAST_PREFIX: &str = "toast:";

/// Why the platform's own reminder couldn't be used (logged, and named in
/// the notice so the user knows which fallback they got).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // each platform uses some of these
pub enum Unavailable {
    /// Linux without a systemd user session or `notify-send`.
    NoScheduler,
    /// Windows notifications are off for the app (or for the system).
    NotificationsOff,
    /// The platform call failed.
    Failed,
}

// ── .ics ─────────────────────────────────────────────────────────────────

fn ics_stamp(local: &NaiveDateTime) -> String {
    local.format("%Y%m%dT%H%M00").to_string()
}

fn ics_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

/// A one-event calendar file. With `alarm`, the event alerts at its start
/// (a reminder); `end` defaults to an hour (15 minutes for a reminder).
pub fn ics(
    uid: &str,
    title: &str,
    start: &NaiveDateTime,
    end: Option<&NaiveDateTime>,
    location: &str,
    alarm: bool,
) -> String {
    let mut ev = format!(
        "BEGIN:VEVENT\r\nUID:{uid}\r\nDTSTAMP:{}\r\nDTSTART:{}\r\n",
        chrono::Utc::now().format("%Y%m%dT%H%M%SZ"),
        ics_stamp(start)
    );
    match end {
        Some(e) => ev.push_str(&format!("DTEND:{}\r\n", ics_stamp(e))),
        None if alarm => ev.push_str("DURATION:PT15M\r\n"),
        None => ev.push_str("DURATION:PT1H\r\n"),
    }
    ev.push_str(&format!("SUMMARY:{}\r\n", ics_escape(title)));
    if !location.is_empty() {
        ev.push_str(&format!("LOCATION:{}\r\n", ics_escape(location)));
    }
    if alarm {
        ev.push_str(&format!(
            "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0M\r\nDESCRIPTION:{}\r\nEND:VALARM\r\n",
            ics_escape(title)
        ));
    }
    ev.push_str("END:VEVENT\r\n");
    format!(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//{}//EN\r\n{ev}END:VCALENDAR\r\n",
        env!("BRAND_NAME")
    )
}

/// A file name from the title: letters, digits and dashes only.
pub fn ics_file_name(title: &str) -> String {
    let base: String = title
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .take(6)
        .collect::<Vec<_>>()
        .join("-");
    let base = if base.is_empty() {
        "event".to_string()
    } else {
        base
    };
    format!("{base}.ics")
}

// ── Linux ────────────────────────────────────────────────────────────────

/// `systemd-run` arguments for a user timer that runs `notify-send` at `due`.
#[cfg_attr(not(any(target_os = "linux", test)), allow(dead_code))]
pub fn systemd_args(
    unit: &str,
    due: &NaiveDateTime,
    title: &str,
    notify_send: &str,
) -> Vec<String> {
    vec![
        "--user".into(),
        format!("--unit={unit}"),
        format!("--on-calendar={}", due.format("%Y-%m-%d %H:%M:00")),
        "--timer-property=AccuracySec=1s".into(),
        "--quiet".into(),
        notify_send.into(),
        format!("--app-name={}", env!("BRAND_NAME")),
        "--urgency=critical".into(),
        "--icon=appointment-soon".into(),
        env!("BRAND_NAME").into(),
        title.into(),
    ]
}

#[cfg(target_os = "linux")]
fn which(name: &str) -> Option<String> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|p| p.join(name))
            .find(|p| p.is_file())
            .map(|p| p.display().to_string())
    })
}

/// Schedule a desktop notification at `due`. Ok(undo id).
#[cfg(target_os = "linux")]
pub fn schedule(title: &str, due: &NaiveDateTime) -> Result<String, Unavailable> {
    let (Some(run), Some(notify)) = (which("systemd-run"), which("notify-send")) else {
        log::debug!("reminder: no systemd-run or notify-send on this system");
        return Err(Unavailable::NoScheduler);
    };
    if Local.from_local_datetime(due).single().is_none() {
        return Err(Unavailable::Failed);
    }
    let unit = format!(
        "{}-reminder-{}",
        env!("BRAND_SLUG"),
        chrono::Utc::now().timestamp_millis()
    );
    let out = std::process::Command::new(run)
        .args(systemd_args(&unit, due, title, &notify))
        .output();
    match out {
        Ok(o) if o.status.success() => Ok(format!("{SYSTEMD_PREFIX}{unit}")),
        Ok(o) => {
            log::debug!(
                "reminder: systemd-run failed ({}): {}",
                o.status,
                String::from_utf8_lossy(&o.stderr)
                    .chars()
                    .take(200)
                    .collect::<String>()
            );
            // No user manager (containers, some WSL setups): a scheduler problem.
            Err(Unavailable::NoScheduler)
        }
        Err(e) => {
            log::debug!("reminder: couldn't run systemd-run: {e}");
            Err(Unavailable::NoScheduler)
        }
    }
}

#[cfg(target_os = "linux")]
pub fn cancel(id: &str) -> bool {
    let Some(unit) = id.strip_prefix(SYSTEMD_PREFIX) else {
        return false;
    };
    std::process::Command::new("systemctl")
        .args(["--user", "stop", &format!("{unit}.timer")])
        .status()
        .is_ok_and(|s| s.success())
}

// ── Windows ──────────────────────────────────────────────────────────────

/// A toast's XML body, escaped.
#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
pub fn toast_xml(title: &str) -> String {
    let esc = |s: &str| {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    };
    format!(
        "<toast scenario=\"reminder\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual><actions><action content=\"OK\" arguments=\"dismiss\" activationType=\"system\"/></actions></toast>",
        esc(env!("BRAND_NAME")),
        esc(title)
    )
}

/// Windows FILETIME ticks (100 ns since 1601) for a local time.
#[cfg_attr(not(any(target_os = "windows", test)), allow(dead_code))]
pub fn filetime_ticks(due: &NaiveDateTime) -> Option<i64> {
    let unix = Local.from_local_datetime(due).single()?.timestamp();
    Some((unix + 11_644_473_600) * 10_000_000)
}

#[cfg(target_os = "windows")]
fn notifier() -> windows::core::Result<windows::UI::Notifications::ToastNotifier> {
    use windows::core::HSTRING;
    use windows::UI::Notifications::ToastNotificationManager;
    // WinRT on this thread (a blocking worker); "already initialised" is fine.
    unsafe {
        let _ = windows::Win32::System::WinRT::RoInitialize(
            windows::Win32::System::WinRT::RO_INIT_MULTITHREADED,
        );
    }
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(env!("BRAND_IDENTIFIER")))
}

/// Schedule a toast at `due`. Ok(undo id).
#[cfg(target_os = "windows")]
pub fn schedule(title: &str, due: &NaiveDateTime) -> Result<String, Unavailable> {
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::DateTime;
    use windows::UI::Notifications::{NotificationSetting, ScheduledToastNotification};

    let ticks = filetime_ticks(due).ok_or(Unavailable::Failed)?;
    let notifier = notifier().map_err(|e| {
        log::debug!("reminder: no toast notifier: {e}");
        Unavailable::Failed
    })?;
    match notifier.Setting() {
        Ok(NotificationSetting::Enabled) => {}
        Ok(other) => {
            log::debug!("reminder: notifications are off ({other:?})");
            return Err(Unavailable::NotificationsOff);
        }
        Err(e) => {
            // Unregistered app id (a portable copy): toasts wouldn't show.
            log::debug!("reminder: notification setting unreadable: {e}");
            return Err(Unavailable::Failed);
        }
    }
    let scheduled = (|| -> windows::core::Result<String> {
        let xml = XmlDocument::new()?;
        xml.LoadXml(&HSTRING::from(toast_xml(title)))?;
        let toast = ScheduledToastNotification::CreateScheduledToastNotification(
            &xml,
            DateTime {
                UniversalTime: ticks,
            },
        )?;
        // Ids are at most 16 characters.
        let id = format!("{:x}", chrono::Utc::now().timestamp_millis());
        toast.SetId(&HSTRING::from(id.as_str()))?;
        notifier.AddToSchedule(&toast)?;
        Ok(id)
    })();
    scheduled
        .map(|id| format!("{TOAST_PREFIX}{id}"))
        .map_err(|e| {
            log::debug!("reminder: scheduling the toast failed: {e}");
            Unavailable::Failed
        })
}

#[cfg(target_os = "windows")]
pub fn cancel(id: &str) -> bool {
    use windows::core::HSTRING;
    let Some(id) = id.strip_prefix(TOAST_PREFIX) else {
        return false;
    };
    let Ok(notifier) = notifier() else {
        return false;
    };
    let Ok(list) = notifier.GetScheduledToastNotifications() else {
        return false;
    };
    let want = HSTRING::from(id);
    for toast in list {
        if toast.Id().is_ok_and(|i| i == want) {
            return notifier.RemoveFromSchedule(&toast).is_ok();
        }
    }
    false
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
#[allow(dead_code)]
pub fn schedule(_title: &str, _due: &NaiveDateTime) -> Result<String, Unavailable> {
    Err(Unavailable::NoScheduler)
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
#[allow(dead_code)]
pub fn cancel(_id: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn due() -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 11, 3)
            .unwrap()
            .and_hms_opt(9, 0, 0)
            .unwrap()
    }

    #[test]
    fn ics_has_an_alarm_for_reminders() {
        let body = ics("u1", "fix the vault, now", &due(), None, "", true);
        assert!(body.contains("DTSTART:20261103T090000"));
        assert!(body.contains("SUMMARY:fix the vault\\, now"));
        assert!(body.contains("BEGIN:VALARM"));
        assert!(body.contains("DURATION:PT15M"));
        let ev = ics("u2", "Sync", &due(), None, "Room 4", false);
        assert!(!ev.contains("VALARM"));
        assert!(ev.contains("LOCATION:Room 4"));
        assert_eq!(ics_file_name("Fix the vault!"), "Fix-the-vault.ics");
        assert_eq!(ics_file_name("!!"), "event.ics");
    }

    #[test]
    fn systemd_timer_runs_notify_send_at_the_time() {
        let args = systemd_args(
            "ambient-reminder-1",
            &due(),
            "fix the vault",
            "/usr/bin/notify-send",
        );
        assert!(args.contains(&"--user".to_string()));
        assert!(args.contains(&"--on-calendar=2026-11-03 09:00:00".to_string()));
        assert_eq!(args.last().map(String::as_str), Some("fix the vault"));
        assert!(args.contains(&"/usr/bin/notify-send".to_string()));
    }

    #[test]
    fn toast_xml_is_escaped() {
        let x = toast_xml("pay <Ana> & Co");
        assert!(x.contains("pay &lt;Ana&gt; &amp; Co"));
        assert!(filetime_ticks(&due()).is_some_and(|t| t > 0));
    }
}
