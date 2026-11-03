//! "Remind me tomorrow morning to fix the vault": a reminder request read
//! without a model call, with the time resolved on this computer. "Morning"
//! is 9:00, "afternoon" 14:00, "evening" 18:00, "tonight" 20:00, and a day
//! with no time is 9:00 that day.
//!
//! English only, like the router's other cheap cues; anything it can't read
//! goes to the router as before.

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, Weekday};
use once_cell::sync::Lazy;
use regex::Regex;

use super::router::without_address;

/// A reminder the user asked for: what, and when (local time), if said.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderRequest {
    pub title: String,
    pub due: Option<NaiveDateTime>,
}

impl ReminderRequest {
    /// The router's format for a due time ("YYYY-MM-DDTHH:MM").
    pub fn due_string(&self) -> Option<String> {
        self.due.map(|d| format_due(&d))
    }
}

/// "YYYY-MM-DDTHH:MM", the form actions and the HUD use.
pub fn format_due(d: &NaiveDateTime) -> String {
    d.format("%Y-%m-%dT%H:%M").to_string()
}

pub fn parse_due(s: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%dT%H:%M:%S"))
        .ok()
}

/// Default times for parts of the day.
pub const MORNING: u32 = 9;
const AFTERNOON: u32 = 14;
const EVENING: u32 = 18;
const NIGHT: u32 = 20;

static LEAD: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(?:(?:please|ok(?:ay)?|hey|so|just|can\s+you|could\s+you|would\s+you|will\s+you|can\s+u|i\s+need\s+you\s+to|i'?d\s+like\s+you\s+to)[\s,]+)*")
        .expect("lead")
});

static HEAD: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^(?:remind\s+me|set\s+(?:me\s+)?(?:a\s+|an\s+)?reminder|add\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder|make\s+(?:a\s+)?reminder|new\s+reminder)\b[\s,:]*(.*)$",
    )
    .expect("reminder head")
});

const NUMBERS: &[(&str, u32)] = &[
    ("one", 1),
    ("two", 2),
    ("three", 3),
    ("four", 4),
    ("five", 5),
    ("six", 6),
    ("seven", 7),
    ("eight", 8),
    ("nine", 9),
    ("ten", 10),
    ("eleven", 11),
    ("twelve", 12),
    ("fifteen", 15),
    ("twenty", 20),
    ("thirty", 30),
    ("forty", 40),
    ("forty-five", 45),
    ("fifty", 50),
    ("a", 1),
    ("an", 1),
];

fn number(w: &str) -> Option<u32> {
    w.parse()
        .ok()
        .or_else(|| NUMBERS.iter().find(|(n, _)| *n == w).map(|(_, v)| *v))
}

const NUM: &str = r"\d{1,3}|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty-five|forty|fifty";

/// Every time phrase the parser understands; each match is read on its own
/// and then removed from the title.
static WHEN: Lazy<Regex> = Lazy::new(|| {
    let p = format!(
        r"(?ix)
        (?P<dat>\b(?:the\s+)?day\s+after\s+tomorrow\b)
      | (?P<tom>\btomorrow\b)
      | (?P<today>\btoday\b)
      | (?P<tonight>\btonight\b)
      | (?P<nextweek>\bnext\s+week\b)
      | (?:\b(?:on\s+|next\s+|this\s+|coming\s+)?(?P<wd>monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)
      | (?:\b(?:at\s+|around\s+|by\s+)?(?P<noon>noon|midday|midnight|lunchtime|lunch\s+time)\b)
      | (?:\b(?:this\s+|in\s+the\s+|tomorrow\s+)?(?P<part>morning|afternoon|evening|night)\b)
      | (?P<eod>\b(?:by\s+|at\s+)?(?:the\s+)?end\s+of\s+(?:the\s+)?day\b)
      | (?:\bin\s+(?P<halfhour>half\s+an\s+hour)\b)
      | (?:\bin\s+(?P<n>{NUM})\s+(?P<unit>minutes?|mins?|hours?|hrs?|days?|weeks?)\b)
      | (?:\b(?:at|around|by|for)\s+(?P<h>\d{{1,2}}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(?P<m>\d{{2}})|\s+(?P<mw>thirty|fifteen|forty-five|o'clock))?\s*(?P<ap>a\.?m\.?|p\.?m\.?)?(?:\W|$))
      | (?:\b(?P<h2>\d{{1,2}})(?::(?P<m2>\d{{2}}))?\s*(?P<ap2>a\.?m\.?|p\.?m\.?)(?:\W|$))
      | (?:\b(?P<h3>\d{{1,2}}):(?P<m3>\d{{2}})\b)
    "
    );
    Regex::new(&p).expect("when")
});

#[derive(Default, Debug)]
struct Parts {
    day_offset: Option<i64>,
    weekday: Option<Weekday>,
    next_week: bool,
    hour: Option<(u32, u32, Option<bool>)>, // h, m, pm?
    part: Option<u32>,
    relative: Option<Duration>,
}

fn weekday(name: &str) -> Option<Weekday> {
    Some(match name.to_lowercase().as_str() {
        "monday" => Weekday::Mon,
        "tuesday" => Weekday::Tue,
        "wednesday" => Weekday::Wed,
        "thursday" => Weekday::Thu,
        "friday" => Weekday::Fri,
        "saturday" => Weekday::Sat,
        "sunday" => Weekday::Sun,
        _ => return None,
    })
}

fn ampm(s: Option<regex::Match>) -> Option<bool> {
    s.map(|m| m.as_str().to_lowercase().starts_with('p'))
}

fn read(caps: &regex::Captures, p: &mut Parts) {
    if caps.name("dat").is_some() {
        p.day_offset = Some(2);
    } else if caps.name("tom").is_some() {
        p.day_offset = Some(1);
    } else if caps.name("today").is_some() {
        p.day_offset = Some(0);
    } else if caps.name("tonight").is_some() {
        p.day_offset.get_or_insert(0);
        p.part = Some(NIGHT);
    } else if caps.name("nextweek").is_some() {
        p.next_week = true;
    } else if let Some(w) = caps.name("wd") {
        p.weekday = weekday(w.as_str());
    } else if let Some(n) = caps.name("noon") {
        let h = if n.as_str().eq_ignore_ascii_case("midnight") {
            0
        } else {
            12
        };
        p.hour = Some((h, 0, None));
    } else if let Some(part) = caps.name("part") {
        p.part = Some(match part.as_str().to_lowercase().as_str() {
            "morning" => MORNING,
            "afternoon" => AFTERNOON,
            "evening" => EVENING,
            _ => NIGHT,
        });
    } else if caps.name("eod").is_some() {
        p.hour = Some((17, 0, None));
    } else if caps.name("halfhour").is_some() {
        p.relative = Some(Duration::minutes(30));
    } else if let (Some(n), Some(unit)) = (caps.name("n"), caps.name("unit")) {
        if let Some(n) = number(&n.as_str().to_lowercase()) {
            let n = i64::from(n);
            let u = unit.as_str().to_lowercase();
            p.relative = Some(if u.starts_with('m') {
                Duration::minutes(n)
            } else if u.starts_with('h') {
                Duration::hours(n)
            } else if u.starts_with('d') {
                Duration::days(n)
            } else {
                Duration::weeks(n)
            });
        }
    } else if let Some(h) = caps.name("h") {
        if let Some(h) = number(&h.as_str().to_lowercase()).filter(|h| *h <= 23) {
            let m = caps
                .name("m")
                .and_then(|m| m.as_str().parse().ok())
                .or_else(|| {
                    caps.name("mw")
                        .and_then(|m| match m.as_str().to_lowercase().as_str() {
                            "o'clock" => Some(0),
                            w => number(w),
                        })
                })
                .unwrap_or(0);
            p.hour = Some((h, m.min(59), ampm(caps.name("ap"))));
        }
    } else if let Some(h) = caps.name("h2") {
        if let Ok(h) = h.as_str().parse::<u32>() {
            let m = caps
                .name("m2")
                .and_then(|m| m.as_str().parse().ok())
                .unwrap_or(0);
            p.hour = Some((h.min(23), m.min(59), ampm(caps.name("ap2"))));
        }
    } else if let (Some(h), Some(m)) = (caps.name("h3"), caps.name("m3")) {
        if let (Ok(h), Ok(m)) = (h.as_str().parse::<u32>(), m.as_str().parse::<u32>()) {
            if h <= 23 && m <= 59 {
                p.hour = Some((h, m, None));
            }
        }
    }
}

/// The hour on a 24-hour clock: an explicit am/pm wins, then the part of
/// the day said with it ("7 in the evening"); a bare 1–7 is afternoon or
/// evening (nobody sets a reminder for 5 a.m. without saying so).
fn hour24(h: u32, pm: Option<bool>, part: Option<u32>) -> u32 {
    match pm {
        Some(true) if h < 12 => h + 12,
        Some(false) if h == 12 => 0,
        Some(_) => h,
        None if h >= 12 => h,
        None => match part {
            Some(p) if p >= AFTERNOON => h + 12,
            Some(_) => h,
            None if (1..=7).contains(&h) => h + 12,
            None => h,
        },
    }
}

fn resolve(p: &Parts, now: NaiveDateTime) -> Option<NaiveDateTime> {
    if let Some(d) = p.relative {
        return Some(now + d);
    }
    let said_day = p.day_offset.is_some() || p.weekday.is_some() || p.next_week;
    let time = match (p.hour, p.part) {
        (Some((h, m, pm)), part) => Some((hour24(h, pm, part), m)),
        (None, Some(part)) => Some((part, 0)),
        (None, None) if said_day => Some((MORNING, 0)),
        (None, None) => None,
    }?;
    let t = NaiveTime::from_hms_opt(time.0, time.1, 0)?;
    let today = now.date();
    let date: NaiveDate = if let Some(off) = p.day_offset {
        today + Duration::days(off)
    } else if let Some(wd) = p.weekday {
        let ahead = (7 + wd.num_days_from_monday() as i64
            - today.weekday().num_days_from_monday() as i64)
            % 7;
        let ahead = if ahead == 0 && (p.next_week || today.and_time(t) <= now) {
            7
        } else {
            ahead
        };
        today + Duration::days(ahead)
    } else if p.next_week {
        // Monday of next week.
        let to_monday = 7 - today.weekday().num_days_from_monday() as i64;
        today + Duration::days(to_monday)
    } else {
        // Just a time: today if it's still ahead. A bare "at eleven" that
        // has passed means the evening one, if that's still ahead.
        let bare = matches!(p.hour, Some((8..=11, _, None))) && p.part.is_none();
        let evening = NaiveTime::from_hms_opt(time.0 + 12, time.1, 0);
        if today.and_time(t) > now {
            today
        } else if let Some(e) = evening.filter(|e| bare && today.and_time(*e) > now) {
            return Some(today.and_time(e));
        } else {
            today + Duration::days(1)
        }
    };
    Some(date.and_time(t))
}

/// Read "remind me … to …" / "set a reminder …". None when it isn't a
/// reminder request or says nothing to be reminded of.
pub fn reminder_request(transcript: &str, now: NaiveDateTime) -> Option<ReminderRequest> {
    let spoken = without_address(transcript).trim();
    let lead = LEAD.find(spoken).map_or(0, |m| m.end());
    let caps = HEAD.captures(&spoken[lead..])?;
    let rest = caps.get(1).map_or("", |m| m.as_str());

    let mut parts = Parts::default();
    let mut title = String::with_capacity(rest.len());
    let mut last = 0;
    for c in WHEN.captures_iter(rest) {
        let Some(m) = c.get(0) else { continue };
        read(&c, &mut parts);
        title.push_str(&rest[last..m.start()]);
        title.push(' ');
        // The match may have eaten the separator after it ("at 5, …").
        last = m.end();
        if rest[..m.end()].ends_with(|ch: char| !ch.is_alphanumeric() && ch != '.') {
            last = m.end() - 1;
        }
    }
    title.push_str(&rest[last..]);
    let due = resolve(&parts, now);
    Some(ReminderRequest {
        title: clean_title(&title)?,
        due,
    })
}

static LEAD_IN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(?:(?:me|for|to|about|that|of|i\s+(?:need|have|should|must)\s+to|i\s+gotta|we\s+(?:need|have)\s+to|and|then)\b[\s,:]*)+")
        .expect("lead in")
});
static TRAIL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)[\s,;:.!?]*(?:\b(?:please|thanks|thank\s+you|on|at|in|by)\b[\s,;:.!?]*)*$")
        .expect("trail")
});

fn clean_title(raw: &str) -> Option<String> {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let collapsed = collapsed.replace(" ,", ",");
    let t = LEAD_IN.replace(
        collapsed.trim_matches(|c: char| c == ',' || c.is_whitespace()),
        "",
    );
    let t = TRAIL.replace(&t, "");
    let t = t.trim_matches(|c: char| c == ',' || c == '.' || c.is_whitespace());
    if t.is_empty() {
        return None;
    }
    Some(t.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Monday 2 Nov 2026, 15:20.
    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 11, 2)
            .unwrap()
            .and_hms_opt(15, 20, 0)
            .unwrap()
    }

    fn at(day: u32, h: u32, m: u32) -> Option<NaiveDateTime> {
        NaiveDate::from_ymd_opt(2026, 11, day)
            .unwrap()
            .and_hms_opt(h, m, 0)
    }

    fn r(s: &str) -> ReminderRequest {
        reminder_request(s, now()).unwrap_or_else(|| panic!("no reminder in {s:?}"))
    }

    #[test]
    fn the_testers_phrase() {
        let x = r("remind me tomorrow morning to fix the vault");
        assert_eq!(x.title, "fix the vault");
        assert_eq!(x.due, at(3, 9, 0));
        assert_eq!(x.due_string().as_deref(), Some("2026-11-03T09:00"));
    }

    #[test]
    fn times_and_days() {
        let cases = [
            ("Remind me to call Sam at 5", "call Sam", at(2, 17, 0)),
            (
                "remind me at 9am to send the deck",
                "send the deck",
                at(3, 9, 0),
            ),
            (
                "remind me to stretch in 20 minutes",
                "stretch",
                Some(now() + Duration::minutes(20)),
            ),
            (
                "remind me in an hour to check the build",
                "check the build",
                Some(now() + Duration::hours(1)),
            ),
            (
                "remind me tonight to take the bins out",
                "take the bins out",
                at(2, 20, 0),
            ),
            ("remind me on Friday to pay rent", "pay rent", at(6, 9, 0)),
            (
                "remind me Friday afternoon to book flights",
                "book flights",
                at(6, 14, 0),
            ),
            (
                "remind me tomorrow at 7:30 pm to call mum",
                "call mum",
                at(3, 19, 30),
            ),
            (
                "Hey Ambient, remind me this evening about the invoice",
                "the invoice",
                at(2, 18, 0),
            ),
            (
                "please remind me tomorrow to water the plants",
                "water the plants",
                at(3, 9, 0),
            ),
            (
                "can you remind me to email Ana at noon",
                "email Ana",
                at(3, 12, 0),
            ),
            (
                "set a reminder for tomorrow at 10 to renew the domain",
                "renew the domain",
                at(3, 10, 0),
            ),
            (
                "remind me to fix the vault tomorrow morning",
                "fix the vault",
                at(3, 9, 0),
            ),
            (
                "remind me next Monday to file expenses",
                "file expenses",
                at(9, 9, 0),
            ),
            (
                "remind me at 4 in the afternoon to leave",
                "leave",
                at(2, 16, 0),
            ),
            ("remind me at eleven to ship it", "ship it", at(2, 23, 0)),
        ];
        for (s, title, due) in cases {
            let x = r(s);
            assert_eq!(x.title, title, "{s}");
            assert_eq!(x.due, due, "{s}");
        }
    }

    #[test]
    fn no_time_said() {
        let x = r("remind me to buy milk");
        assert_eq!(x.title, "buy milk");
        assert_eq!(x.due, None);
    }

    #[test]
    fn not_a_reminder() {
        for s in [
            "Thanks for the reminder, I'll send it tomorrow",
            "can you remind them about the invoice",
            "remind me tomorrow",
            "the reminder is set",
        ] {
            assert_eq!(reminder_request(s, now()), None, "{s}");
        }
    }
}
