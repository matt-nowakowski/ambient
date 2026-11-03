//! How often suggestions may interrupt: a budget, not a flat "3 an hour".
//!
//! The tester's log showed the old limit spent on repeats: "explain this
//! error" fired again and again on the same Safari window, a date and a
//! draft took the rest, and the one that mattered (summarise a 61-message
//! Gmail thread) was blocked by "rate limit (3 shown this hour)". Now:
//!
//! - the same kind is never offered twice for the same window or thread
//!   (and repeats are dropped before they count against anything);
//! - each app has a short cooldown after an offer (the offered kind's
//!   `cooldown_min` in the agent config, 3 minutes by default), longer after
//!   a dismissal there;
//! - the hourly cap is higher (the agent config's `hourly_budget`, 10 by
//!   default), and each dismissal in the last hour lowers it, so a user who
//!   keeps saying "not now" hears less;
//! - two dismissals of a kind back that kind off for a day.
//!
//! Pure: callers pass `Instant`s, so the rules are unit-tested.

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use super::proactive::Kind;

/// The hourly cap before back-off (the agent config's default).
pub const HOURLY_CAP: u32 = 10;
/// The cap never falls below this, however many dismissals.
const MIN_CAP: u32 = 3;
/// Each dismissal in the last hour lowers the cap by this much.
const CAP_PER_DISMISSAL: u32 = 2;
/// Between two offers in the same app (the default `cooldown_min`).
pub const APP_COOLDOWN: Duration = Duration::from_secs(3 * 60);
/// Added to an app's cooldown after a dismissal there.
const APP_COOLDOWN_AFTER_DISMISS: Duration = Duration::from_secs(15 * 60);
/// A window or thread offered a kind isn't offered it again for this long.
const SAME_WINDOW: Duration = Duration::from_secs(12 * 60 * 60);
/// Two dismissals of a kind back it off for this long.
const KIND_BACKOFF: Duration = Duration::from_secs(24 * 60 * 60);
const HOUR: Duration = Duration::from_secs(60 * 60);

/// Why an offer can't be shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Block {
    /// Already offered this kind for this window or thread (not counted).
    Repeat,
    /// The user dismissed this kind twice; resting for a day.
    KindBackedOff,
    /// Something was offered in this app a moment ago.
    AppCooldown { secs_left: u64 },
    /// The hour's budget is spent.
    Cap { shown: u32, cap: u32 },
}

impl Block {
    /// Blocks for everything in this app right now, whatever the kind (so
    /// not worth asking the judge).
    pub fn is_global(&self) -> bool {
        matches!(self, Block::AppCooldown { .. } | Block::Cap { .. })
    }

    pub fn describe(&self) -> String {
        match self {
            Block::Repeat => "already offered for this window".into(),
            Block::KindBackedOff => "backed off after dismissals".into(),
            Block::AppCooldown { secs_left } => format!("app cooldown ({secs_left}s left)"),
            Block::Cap { shown, cap } => {
                format!("hourly cap ({shown} shown, cap {cap} after back-off)")
            }
        }
    }
}

#[derive(Default)]
pub struct Budget {
    /// When each offer was shown.
    shown: VecDeque<Instant>,
    /// (kind, window key) → when offered.
    offered: HashMap<(Kind, String), Instant>,
    /// Bundle → when something was last offered there, and how long that
    /// kind keeps the app quiet.
    app_last: HashMap<String, (Instant, Duration)>,
    /// Bundle → when something was last dismissed there.
    app_dismissed: HashMap<String, Instant>,
    /// Recent dismissals (any kind).
    dismissals: VecDeque<Instant>,
    /// Per kind: dismissals in a row, and when it was backed off.
    kind_dismissed: HashMap<Kind, (u32, Option<Instant>)>,
}

impl Budget {
    fn prune(&mut self, now: Instant) {
        let fresh = |t: &Instant, d: Duration| now.saturating_duration_since(*t) < d;
        self.shown.retain(|t| fresh(t, HOUR));
        self.dismissals.retain(|t| fresh(t, HOUR));
        self.offered.retain(|_, t| fresh(t, SAME_WINDOW));
        self.app_last
            .retain(|_, (t, _)| fresh(t, HOUR.max(SAME_WINDOW)));
        self.app_dismissed.retain(|_, t| fresh(t, HOUR));
    }

    /// The cap after back-off: `per_hour`, less two for each dismissal in
    /// the last hour (never below 3, or `per_hour` if that's lower).
    pub fn cap(&self, per_hour: u32) -> u32 {
        per_hour
            .saturating_sub(CAP_PER_DISMISSAL * self.dismissals.len() as u32)
            .max(MIN_CAP.min(per_hour))
    }

    pub fn shown_this_hour(&self) -> u32 {
        self.shown.len() as u32
    }

    /// Can `kind` be offered for window `key` in `bundle` now? Kind-specific
    /// reasons first (they don't count), then the app's and the hour's.
    pub fn check(
        &mut self,
        kind: Kind,
        bundle: &str,
        key: &str,
        per_hour: u32,
        now: Instant,
    ) -> Result<(), Block> {
        self.prune(now);
        if self.offered.contains_key(&(kind, key.to_string())) {
            return Err(Block::Repeat);
        }
        if let Some((_, Some(at))) = self.kind_dismissed.get(&kind) {
            if now.saturating_duration_since(*at) < KIND_BACKOFF {
                return Err(Block::KindBackedOff);
            }
        }
        self.check_app(bundle, per_hour, now)
    }

    /// The app's cooldown and the hourly cap, for any kind.
    pub fn check_app(&mut self, bundle: &str, per_hour: u32, now: Instant) -> Result<(), Block> {
        self.prune(now);
        if !bundle.is_empty() {
            let since = |t: &Instant| now.saturating_duration_since(*t);
            // After an offer: that kind's cooldown. After a dismissal: the
            // default plus the extra rest.
            let waits = self
                .app_last
                .get(bundle)
                .map(|(t, cooldown)| (since(t), *cooldown))
                .into_iter()
                .chain(
                    self.app_dismissed
                        .get(bundle)
                        .map(|t| (since(t), APP_COOLDOWN + APP_COOLDOWN_AFTER_DISMISS)),
                );
            if let Some(left) = waits.filter(|(s, c)| s < c).map(|(s, c)| c - s).max() {
                return Err(Block::AppCooldown {
                    secs_left: left.as_secs(),
                });
            }
        }
        let cap = self.cap(per_hour);
        if self.shown_this_hour() >= cap {
            return Err(Block::Cap {
                shown: self.shown_this_hour(),
                cap,
            });
        }
        Ok(())
    }

    /// An offer was shown; its app stays quiet for `cooldown`.
    pub fn record_shown(
        &mut self,
        kind: Kind,
        bundle: &str,
        key: &str,
        cooldown: Duration,
        now: Instant,
    ) {
        self.shown.push_back(now);
        self.offered.insert((kind, key.to_string()), now);
        if !bundle.is_empty() {
            self.app_last.insert(bundle.to_string(), (now, cooldown));
        }
    }

    /// Remember a window as handled for `kind` without showing anything
    /// (the one-time cloud offer took its place).
    pub fn mark_offered(&mut self, kind: Kind, key: &str, now: Instant) {
        self.offered.insert((kind, key.to_string()), now);
    }

    /// The user said "not now" (or ✕).
    pub fn record_dismissed(&mut self, kind: Kind, bundle: &str, now: Instant) {
        self.dismissals.push_back(now);
        if !bundle.is_empty() {
            self.app_dismissed.insert(bundle.to_string(), now);
        }
        let entry = self.kind_dismissed.entry(kind).or_insert((0, None));
        entry.0 += 1;
        if entry.0 >= 2 {
            *entry = (0, Some(now));
        }
    }

    /// The user said yes: that kind is welcome again.
    pub fn record_accepted(&mut self, kind: Kind) {
        self.kind_dismissed.remove(&kind);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ARC: &str = "company.thebrowser.Browser";
    const SAFARI: &str = "com.apple.Safari";

    /// The tester's hour, replayed: the 61-message Gmail thread in Arc is
    /// offered even after the error, the date and the draft.
    #[test]
    fn the_long_thread_isnt_starved_by_repeats() {
        let mut b = Budget::default();
        let t0 = Instant::now();
        let at = |m: u64| t0 + Duration::from_secs(m * 60);
        let safari = "com.apple.Safari|Build log";
        // 03:48 explain_error in Safari: shown.
        assert!(b
            .check(Kind::ExplainError, SAFARI, safari, HOURLY_CAP, at(0))
            .is_ok());
        b.record_shown(Kind::ExplainError, SAFARI, safari, APP_COOLDOWN, at(0));
        // 03:50 add_to_calendar in Arc: shown.
        assert!(b
            .check(Kind::AddToCalendar, ARC, "arc|Lunch", HOURLY_CAP, at(2))
            .is_ok());
        b.record_shown(Kind::AddToCalendar, ARC, "arc|Lunch", APP_COOLDOWN, at(2));
        // The same error, the same window, again and again: dropped, never counted.
        for m in [3, 5, 7, 8, 9, 13] {
            assert_eq!(
                b.check(Kind::ExplainError, SAFARI, safari, HOURLY_CAP, at(m)),
                Err(Block::Repeat)
            );
        }
        // 03:52 draft_reply in Arc, after the app cooldown: shown.
        assert!(b
            .check(Kind::DraftReply, ARC, "arc|Re: Q4", HOURLY_CAP, at(5))
            .is_ok());
        b.record_shown(Kind::DraftReply, ARC, "arc|Re: Q4", APP_COOLDOWN, at(5));
        // 03:56 summarise_thread on the 61-message thread: still offered
        // (three shown is well under the new cap).
        assert_eq!(b.shown_this_hour(), 3);
        assert!(b
            .check(
                Kind::SummariseThread,
                ARC,
                "arc|Re: Launch",
                HOURLY_CAP,
                at(9)
            )
            .is_ok());
    }

    #[test]
    fn one_app_cant_fire_back_to_back() {
        let mut b = Budget::default();
        let t0 = Instant::now();
        b.record_shown(Kind::DraftReply, ARC, "a", APP_COOLDOWN, t0);
        assert!(matches!(
            b.check(
                Kind::SummariseThread,
                ARC,
                "b",
                10,
                t0 + Duration::from_secs(30)
            ),
            Err(Block::AppCooldown { .. })
        ));
        // Another app is fine.
        assert!(b
            .check(
                Kind::ExplainError,
                SAFARI,
                "c",
                10,
                t0 + Duration::from_secs(30)
            )
            .is_ok());
        // After the cooldown, the same app is fine too.
        assert!(b
            .check(Kind::SummariseThread, ARC, "b", 10, t0 + APP_COOLDOWN)
            .is_ok());
    }

    #[test]
    fn dismissals_lower_the_cap_and_back_off_the_kind() {
        let mut b = Budget::default();
        let t0 = Instant::now();
        assert_eq!(b.cap(HOURLY_CAP), HOURLY_CAP);
        b.record_dismissed(Kind::DraftReply, ARC, t0);
        assert_eq!(b.cap(HOURLY_CAP), HOURLY_CAP - 2);
        // The dismissed app rests longer.
        assert!(matches!(
            b.check(
                Kind::SummariseThread,
                ARC,
                "x",
                HOURLY_CAP,
                t0 + APP_COOLDOWN
            ),
            Err(Block::AppCooldown { .. })
        ));
        b.record_dismissed(Kind::DraftReply, SAFARI, t0);
        assert_eq!(
            b.check(Kind::DraftReply, "com.apple.mail", "y", HOURLY_CAP, t0),
            Err(Block::KindBackedOff)
        );
        for _ in 0..10 {
            b.record_dismissed(Kind::ExplainError, "", t0);
        }
        assert_eq!(b.cap(HOURLY_CAP), 3, "never below the floor");
        b.record_accepted(Kind::DraftReply);
        assert!(b
            .check(Kind::DraftReply, "com.apple.mail", "y", HOURLY_CAP, t0)
            .is_ok());
    }

    #[test]
    fn the_cap_holds() {
        let mut b = Budget::default();
        let t0 = Instant::now();
        for i in 0..HOURLY_CAP {
            let bundle = format!("app{i}");
            assert!(b
                .check(Kind::SummarisePage, &bundle, &bundle, HOURLY_CAP, t0)
                .is_ok());
            b.record_shown(Kind::SummarisePage, &bundle, &bundle, APP_COOLDOWN, t0);
        }
        assert!(matches!(
            b.check(Kind::SummarisePage, "other", "other", HOURLY_CAP, t0),
            Err(Block::Cap { .. })
        ));
        // An hour later the budget is back.
        assert!(b
            .check(Kind::SummarisePage, "other", "other", HOURLY_CAP, t0 + HOUR)
            .is_ok());
    }
}
