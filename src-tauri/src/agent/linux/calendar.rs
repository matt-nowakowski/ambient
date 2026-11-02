//! Upcoming events from Evolution Data Server, the calendar store behind
//! GNOME Calendar, Evolution and GNOME Online Accounts. Best effort: read
//! over D-Bus only when EDS is already running (never started on our
//! account), bounded by time, and empty on any failure.

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};

/// An event about to start (the same fields macOS's EventKit gives).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Upcoming {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub location: String,
    pub attendees: Vec<String>,
}

/// When an iCalendar date-time is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    Utc(NaiveDateTime),
    /// Floating, or in a named zone (read as the user's local time: the
    /// common case, and no time zone database is bundled).
    Local(NaiveDateTime),
    /// All day.
    Date(NaiveDate),
}

#[derive(Debug, Clone, Default)]
pub struct IcsEvent {
    pub uid: String,
    pub summary: String,
    pub description: String,
    pub location: String,
    pub attendees: Vec<String>,
    pub start: Option<When>,
    pub recurring: bool,
    pub cancelled: bool,
}

/// Undo RFC 5545 line folding (a continuation line starts with a space or tab).
fn unfold(ics: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in ics.split('\n') {
        let raw = raw.trim_end_matches('\r');
        if let Some(cont) = raw.strip_prefix([' ', '\t']) {
            if let Some(last) = lines.last_mut() {
                last.push_str(cont);
                continue;
            }
        }
        lines.push(raw.to_string());
    }
    lines
}

fn unescape(v: &str) -> String {
    v.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

pub fn parse_when(params: &str, value: &str) -> Option<When> {
    let value = value.trim();
    if params.to_uppercase().contains("VALUE=DATE") && !value.contains('T') {
        return NaiveDate::parse_from_str(value, "%Y%m%d")
            .ok()
            .map(When::Date);
    }
    if let Some(v) = value.strip_suffix('Z') {
        return NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S")
            .ok()
            .map(When::Utc);
    }
    if let Ok(dt) = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S") {
        return Some(When::Local(dt));
    }
    NaiveDate::parse_from_str(value, "%Y%m%d")
        .ok()
        .map(When::Date)
}

/// The VEVENTs in an iCalendar text (EDS returns one component per string).
pub fn parse_ics(ics: &str) -> Vec<IcsEvent> {
    let mut out = Vec::new();
    let mut current: Option<IcsEvent> = None;
    // Nested components (VALARM) inside an event aren't the event's fields.
    let mut nested = 0;
    for line in unfold(ics) {
        let Some((head, value)) = line.split_once(':') else {
            continue;
        };
        let (name, params) = head.split_once(';').unwrap_or((head, ""));
        let name = name.to_ascii_uppercase();
        match (name.as_str(), value.trim()) {
            ("BEGIN", "VEVENT") => {
                current = Some(IcsEvent::default());
                nested = 0;
            }
            ("END", "VEVENT") => out.extend(current.take()),
            ("BEGIN", _) if current.is_some() => nested += 1,
            ("END", _) if current.is_some() => nested -= 1,
            _ => {}
        }
        let Some(ev) = current.as_mut().filter(|_| nested == 0) else {
            continue;
        };
        match name.as_str() {
            "UID" => ev.uid = value.trim().to_string(),
            "SUMMARY" => ev.summary = unescape(value),
            "DESCRIPTION" => ev.description = unescape(value),
            "LOCATION" => ev.location = unescape(value),
            "DTSTART" => ev.start = parse_when(params, value),
            "RRULE" | "RDATE" => ev.recurring = true,
            "STATUS" => ev.cancelled = value.trim().eq_ignore_ascii_case("CANCELLED"),
            "ATTENDEE" => {
                let cn = params.split(';').find_map(|p| {
                    let (k, v) = p.split_once('=')?;
                    k.eq_ignore_ascii_case("CN")
                        .then(|| v.trim_matches('"').to_string())
                });
                let who = cn.filter(|c| !c.is_empty()).unwrap_or_else(|| {
                    value
                        .trim()
                        .trim_start_matches("mailto:")
                        .trim_start_matches("MAILTO:")
                        .to_string()
                });
                if !who.is_empty() {
                    ev.attendees.push(who);
                }
            }
            _ => {}
        }
    }
    out
}

fn local(dt: NaiveDateTime) -> Option<DateTime<Local>> {
    Local.from_local_datetime(&dt).earliest()
}

/// When the event (or, for a recurring one, its next occurrence near `now`)
/// starts. All-day events have no start time and are skipped.
pub fn next_start(ev: &IcsEvent, now: DateTime<Local>) -> Option<DateTime<Local>> {
    let start = match ev.start? {
        When::Utc(dt) => Utc.from_utc_datetime(&dt).with_timezone(&Local),
        When::Local(dt) => local(dt)?,
        When::Date(_) => return None,
    };
    if start > now || !ev.recurring {
        return Some(start);
    }
    // A recurring event's master keeps its first DTSTART. EDS only returns it
    // if an occurrence falls in the window asked for, so the occurrence is at
    // the same time of day, today or tomorrow.
    let time: NaiveTime = start.time();
    [now.date_naive(), now.date_naive().succ_opt()?]
        .into_iter()
        .filter_map(|d| local(d.and_time(time)))
        .find(|t| *t > now)
}

/// The events starting within `minutes` after `now`, soonest first, at most three.
pub fn upcoming_from(ics: &[String], now: DateTime<Local>, minutes: i64) -> Vec<Upcoming> {
    let until = now + chrono::Duration::minutes(minutes);
    let mut found: Vec<(DateTime<Local>, Upcoming)> = ics
        .iter()
        .flat_map(|s| parse_ics(s))
        .filter(|e| !e.cancelled)
        .filter_map(|e| {
            let start = next_start(&e, now).filter(|s| *s > now && *s <= until)?;
            let id = format!("{}@{}", e.uid, start.timestamp());
            Some((
                start,
                Upcoming {
                    id,
                    title: e.summary,
                    notes: e.description.chars().take(2000).collect(),
                    location: e.location,
                    attendees: e.attendees,
                },
            ))
        })
        .collect();
    found.sort_by_key(|(s, _)| *s);
    found.dedup_by(|a, b| a.1.id == b.1.id);
    found.into_iter().take(3).map(|(_, u)| u).collect()
}

/// The EDS query for events occurring in [from, to].
pub fn time_range_sexp(from: DateTime<Utc>, to: DateTime<Utc>) -> String {
    let f = |t: DateTime<Utc>| t.format("%Y%m%dT%H%M%SZ").to_string();
    format!(
        "(occur-in-time-range? (make-time \"{}\") (make-time \"{}\"))",
        f(from),
        f(to)
    )
}

/// An EDS source key file that is an enabled calendar.
pub fn is_enabled_calendar(data: &str) -> bool {
    let mut group = "";
    let mut has_calendar = false;
    let mut enabled = true;
    for line in data.lines() {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            group = line;
            has_calendar |= line == "[Calendar]";
            continue;
        }
        if group == "[Data Source]" {
            if let Some(v) = line.strip_prefix("Enabled=") {
                enabled = v.trim() != "false";
            }
        }
    }
    has_calendar && enabled
}

#[cfg(target_os = "linux")]
pub use eds::upcoming;

#[cfg(target_os = "linux")]
mod eds {
    use std::collections::HashMap;
    use std::time::{Duration, Instant};

    use zbus::blocking::{connection, Connection};
    use zbus::zvariant::{OwnedObjectPath, OwnedValue};

    use super::{is_enabled_calendar, time_range_sexp, upcoming_from, Upcoming};

    const PREFIX: &str = "org.gnome.evolution.dataserver.";

    type Managed = HashMap<OwnedObjectPath, HashMap<String, HashMap<String, OwnedValue>>>;

    fn running(conn: &Connection, prefix: &str) -> Option<String> {
        let names: Vec<String> = conn
            .call_method(
                Some("org.freedesktop.DBus"),
                "/org/freedesktop/DBus",
                Some("org.freedesktop.DBus"),
                "ListNames",
                &(),
            )
            .ok()?
            .body()
            .deserialize()
            .ok()?;
        // Versioned names: Sources5, Calendar8…; take the newest.
        names
            .into_iter()
            .filter(|n| {
                n.strip_prefix(prefix)
                    .is_some_and(|v| v.chars().all(|c| c.is_ascii_digit()) && !v.is_empty())
            })
            .max_by_key(|n| n[prefix.len()..].parse::<u32>().unwrap_or(0))
    }

    fn calendar_uids(conn: &Connection, sources: &str) -> Vec<String> {
        let Ok(reply) = conn.call_method(
            Some(sources),
            "/org/gnome/evolution/dataserver/SourceManager",
            Some("org.freedesktop.DBus.ObjectManager"),
            "GetManagedObjects",
            &(),
        ) else {
            return Vec::new();
        };
        let Ok(objects) = reply.body().deserialize::<Managed>() else {
            return Vec::new();
        };
        let mut uids: Vec<String> = objects
            .into_values()
            .filter_map(|ifaces| {
                let props = ifaces.get("org.gnome.evolution.dataserver.Source")?;
                let uid = String::try_from(props.get("UID")?.try_clone().ok()?).ok()?;
                let data = String::try_from(props.get("Data")?.try_clone().ok()?).ok()?;
                is_enabled_calendar(&data).then_some(uid)
            })
            .collect();
        uids.sort();
        uids.truncate(8);
        uids
    }

    fn events_in(conn: &Connection, factory: &str, uid: &str, sexp: &str) -> Vec<String> {
        let Ok(reply) = conn.call_method(
            Some(factory),
            "/org/gnome/evolution/dataserver/CalendarFactory",
            Some("org.gnome.evolution.dataserver.CalendarFactory"),
            "OpenCalendar",
            &(uid,),
        ) else {
            return Vec::new();
        };
        let Ok((path, bus)) = reply.body().deserialize::<(String, String)>() else {
            return Vec::new();
        };
        const CAL: &str = "org.gnome.evolution.dataserver.Calendar";
        let (bus, path) = (bus.as_str(), path.as_str());
        let _ = conn.call_method(Some(bus), path, Some(CAL), "Open", &());
        let objects: Vec<String> = conn
            .call_method(Some(bus), path, Some(CAL), "GetObjectList", &(sexp,))
            .ok()
            .and_then(|m| m.body().deserialize().ok())
            .unwrap_or_default();
        let _ = conn.call_method(Some(bus), path, Some(CAL), "Close", &());
        objects
    }

    /// Events starting within `minutes`, from every enabled calendar.
    pub fn upcoming(minutes: i32) -> Vec<Upcoming> {
        let Some(conn) = connection::Builder::session()
            .ok()
            .map(|b| b.method_timeout(Duration::from_secs(2)))
            .and_then(|b| b.build().ok())
        else {
            return Vec::new();
        };
        let (Some(sources), Some(factory)) = (
            running(&conn, &format!("{PREFIX}Sources")),
            running(&conn, &format!("{PREFIX}Calendar")),
        ) else {
            return Vec::new();
        };
        let now = chrono::Utc::now();
        let sexp = time_range_sexp(now, now + chrono::Duration::minutes(i64::from(minutes)));
        let deadline = Instant::now() + Duration::from_secs(4);
        let mut ics = Vec::new();
        for uid in calendar_uids(&conn, &sources) {
            if Instant::now() > deadline {
                break;
            }
            ics.extend(events_in(&conn, &factory, &uid, &sexp));
        }
        upcoming_from(&ics, chrono::Local::now(), i64::from(minutes))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EVENT: &str = "BEGIN:VEVENT\r\nUID:abc\r\nSUMMARY:Design review\\, Q3\r\nDTSTART:20261102T100500Z\r\n\
DESCRIPTION:Agenda:\\n- numbers\r\nLOCATION:https://meet.google.com/x\r\n\
ATTENDEE;CN=\"Ana Ruiz\";ROLE=REQ-PARTICIPANT:mailto:ana@example.com\r\n\
ATTENDEE:mailto:bo@example.com\r\nBEGIN:VALARM\r\nDESCRIPTION:alarm text\r\nEND:VALARM\r\nEND:VEVENT\r\n";

    #[test]
    fn parses_events() {
        let events = parse_ics(EVENT);
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.uid, "abc");
        assert_eq!(e.summary, "Design review, Q3");
        assert_eq!(e.description, "Agenda:\n- numbers");
        assert_eq!(e.attendees, vec!["Ana Ruiz", "bo@example.com"]);
        assert!(matches!(e.start, Some(When::Utc(_))));
        assert!(!e.recurring);
    }

    #[test]
    fn unfolds_long_lines() {
        let e = &parse_ics("BEGIN:VEVENT\nSUMMARY:Long ti\n tle\nEND:VEVENT\n")[0];
        assert_eq!(e.summary, "Long title");
    }

    #[test]
    fn finds_events_about_to_start() {
        let now = Utc
            .with_ymd_and_hms(2026, 11, 2, 10, 0, 0)
            .unwrap()
            .with_timezone(&Local);
        let soon = upcoming_from(&[EVENT.to_string()], now, 10);
        assert_eq!(soon.len(), 1);
        assert_eq!(soon[0].title, "Design review, Q3");
        assert!(upcoming_from(&[EVENT.to_string()], now, 3).is_empty());
    }

    #[test]
    fn projects_recurring_events_to_today() {
        let first = (Local::now() - chrono::Duration::days(14)).date_naive();
        let now = Local::now();
        let at = (now + chrono::Duration::minutes(5)).time();
        let start = first.and_time(at).format("%Y%m%dT%H%M%S");
        let ics = format!("BEGIN:VEVENT\nUID:r\nSUMMARY:Standup\nDTSTART;TZID=Europe/Berlin:{start}\nRRULE:FREQ=DAILY\nEND:VEVENT\n");
        let soon = upcoming_from(&[ics], now, 10);
        assert_eq!(soon.len(), 1, "{soon:?}");
        assert_eq!(soon[0].title, "Standup");
    }

    #[test]
    fn skips_all_day_and_cancelled() {
        let now = Local::now();
        let day = now.format("%Y%m%d");
        let all_day =
            format!("BEGIN:VEVENT\nUID:a\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:{day}\nEND:VEVENT\n");
        let at = (now + chrono::Duration::minutes(5)).format("%Y%m%dT%H%M%S");
        let cancelled = format!(
            "BEGIN:VEVENT\nUID:c\nSUMMARY:Gone\nSTATUS:CANCELLED\nDTSTART:{at}\nEND:VEVENT\n"
        );
        assert!(upcoming_from(&[all_day, cancelled], now, 10).is_empty());
    }

    #[test]
    fn builds_queries_and_reads_sources() {
        let from = Utc.with_ymd_and_hms(2026, 11, 2, 10, 0, 0).unwrap();
        assert_eq!(
            time_range_sexp(from, from + chrono::Duration::minutes(10)),
            "(occur-in-time-range? (make-time \"20261102T100000Z\") (make-time \"20261102T101000Z\"))"
        );
        assert!(is_enabled_calendar(
            "[Data Source]\nDisplayName=Work\nEnabled=true\n\n[Calendar]\nBackendName=caldav\n"
        ));
        assert!(!is_enabled_calendar(
            "[Data Source]\nEnabled=false\n[Calendar]\n"
        ));
        assert!(!is_enabled_calendar("[Data Source]\n[Address Book]\n"));
    }
}
