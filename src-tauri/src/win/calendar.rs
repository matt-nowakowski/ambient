//! Upcoming meetings from classic Outlook's calendar (its COM object model),
//! for meeting prep. Best effort and bounded: only when Outlook is already
//! running (it is never started), and any failure is an empty list. The new
//! Outlook has no object model, so it has no events here.

use serde_json::{json, Value};
use windows::Win32::System::Variant::VARIANT;

use super::com::{self, Dispatch};
use super::rules;

/// `olFolderCalendar`.
const CALENDAR_FOLDER: i32 = 9;
const MAX_EVENTS: usize = 3;
const MAX_SCANNED: usize = 20;

/// Events starting within `minutes`, as JSON objects with `id`, `title`,
/// `start`, `notes`, `location` and `attendees` (the macOS shape).
pub fn upcoming(minutes: i32) -> Vec<Value> {
    com::ensure_init();
    read(minutes).unwrap_or_default()
}

fn read(minutes: i32) -> Option<Vec<Value>> {
    let outlook = Dispatch::running("Outlook.Application").ok()?;
    let mapi = outlook.object("GetNamespace", &[VARIANT::from("MAPI")])?;
    let folder = mapi.object("GetDefaultFolder", &[VARIANT::from(CALENDAR_FOLDER)])?;
    let items = folder.object("Items", &[])?;
    // Recurring meetings appear as their occurrences, in start order.
    items.call("Sort", &[VARIANT::from("[Start]")]).ok()?;
    items.put("IncludeRecurrences", VARIANT::from(true)).ok()?;

    let now = chrono::Local::now().naive_local();
    let until = now + chrono::Duration::minutes(i64::from(minutes.max(1)));
    let window = restrict(&items, now, until)?;

    let mut out = Vec::new();
    let mut item = window.object("GetFirst", &[]);
    for _ in 0..MAX_SCANNED {
        let Some(event) = item else { break };
        if let Some(v) = event_json(&event, now, until) {
            out.push(v);
            if out.len() >= MAX_EVENTS {
                break;
            }
        }
        item = window.object("GetNext", &[]);
    }
    Some(out)
}

/// The items starting in the window. Outlook parses the filter's dates in
/// the user's locale; the ISO form works in most, the locale's own format
/// is the fallback. Results are checked again in `event_json`.
fn restrict(
    items: &Dispatch,
    from: chrono::NaiveDateTime,
    to: chrono::NaiveDateTime,
) -> Option<Dispatch> {
    let iso = rules::outlook_filter(from, to);
    if let Some(found) = items.object("Restrict", &[VARIANT::from(iso.as_str())]) {
        return Some(found);
    }
    let local = |t: chrono::NaiveDateTime| {
        use chrono::Timelike;
        let t = t.with_second(0)?.with_nanosecond(0)?;
        let base = chrono::NaiveDate::from_ymd_opt(1899, 12, 30)?.and_hms_opt(0, 0, 0)?;
        let days = (t - base).num_seconds() as f64 / 86_400.0;
        let text = com::as_text(&com::date(days));
        // Outlook rejects seconds in a filter date.
        Some(match text.rfind(":00") {
            Some(at) if text.matches(':').count() >= 2 => {
                format!("{}{}", &text[..at], &text[at + 3..])
            }
            _ => text,
        })
    };
    let filter = format!(
        "[Start] >= '{}' AND [Start] <= '{}'",
        local(from)?,
        local(to)?
    );
    items.object("Restrict", &[VARIANT::from(filter.as_str())])
}

fn event_json(
    event: &Dispatch,
    now: chrono::NaiveDateTime,
    until: chrono::NaiveDateTime,
) -> Option<Value> {
    let all_day = event
        .get("AllDayEvent")
        .ok()
        .and_then(|v| bool::try_from(&v).ok())
        .unwrap_or(false);
    if all_day {
        return None;
    }
    let start = rules::ole_to_naive(com::as_date(&event.get("Start").ok()?)?)?;
    if start <= now || start > until {
        return None;
    }
    let title = event.text("Subject");
    let entry = event.text("EntryID");
    let mut attendees = rules::split_attendees(&event.text("RequiredAttendees"));
    attendees.extend(rules::split_attendees(&event.text("OptionalAttendees")));
    let notes: String = event.text("Body").chars().take(2000).collect();
    let start_iso = start
        .and_local_timezone(chrono::Local)
        .single()
        .map(|t| t.to_rfc3339())
        .unwrap_or_default();
    Some(json!({
        // Occurrences of a recurring meeting share an EntryID.
        "id": format!("outlook:{entry}:{}", start.format("%Y%m%dT%H%M")),
        "title": title,
        "start": start_iso,
        "notes": notes,
        "location": event.text("Location"),
        "attendees": attendees,
    }))
}
