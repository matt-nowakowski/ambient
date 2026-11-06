//! Times for reminders and calendar events: local now (the decision resolves
//! "tomorrow at 5" against it), and the "YYYY-MM-DDTHH:MM" form actions and
//! the HUD use.

use chrono::NaiveDateTime;

/// Local time now, for prompts (the test suite's scenario sets its own, so
/// a re-run asks the model the same thing).
pub fn local_now() -> NaiveDateTime {
    crate::testing::now().unwrap_or_else(|| chrono::Local::now().naive_local())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_times_round_trip() {
        let d = parse_due("2026-11-07T09:00").unwrap();
        assert_eq!(format_due(&d), "2026-11-07T09:00");
        assert_eq!(parse_due("2026-11-07T09:00:00"), Some(d));
        assert_eq!(parse_due("tomorrow"), None);
    }
}
