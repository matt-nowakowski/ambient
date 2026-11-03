//! Free's limits. Free gets every agent feature; Pro (and Team, and the
//! trial) removes the limits.
//!
//! | Limit | Default | Enforced |
//! |---|---|---|
//! | AI uses a week (one pool) | `free.ai_per_week` = 25 | hosted: the server (`web/lib/ai.ts`); on-device: here (`plan::consume_local_ai`) |
//! | Suggestions a week | `free.suggestions_per_week` = 10 | here (`take_suggestion`) |
//! | Screen memory | `free.memory_hours` = 24 | here (`memory_cap_hours`, applied by `recall`) |
//! | Meetings a month | `free.meetings_per_month` = 2 | here (`meeting::start`) |
//!
//! Every number is a remote-config tunable (`remote_config::FreeLimits`).
//! Local counts live in the plan store (`plan.json`) next to the word count.
//! Weeks are local Monday to Monday (`plan::current_week`).
//!
//! Reaching a limit is never silent: the HUD says so kindly, with Upgrade
//! (`notice`), and `limit_hit` is counted once per period for the admin.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{Datelike, Local};
use once_cell::sync::Lazy;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::agent::notice::{offer, Notice};
use crate::remote_config::FreeLimits;

const SUGGESTIONS_FIELD: &str = "free_suggestions";
/// The period in which each limit was last reported (`{"ai": <week>, …}`).
const NOTIFIED_FIELD: &str = "free_limit_notified";
/// The week the AI pool ran out, and the limit then (a raised limit reopens it).
const AI_SPENT_FIELD: &str = "free_ai_spent";
/// "Always" notices for the same limit at most this often (a meeting's
/// several summary calls, a retried request).
const SHOW_AGAIN_AFTER: Duration = Duration::from_secs(30);

/// Serializes read-modify-write of the counters.
static LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
/// The server's count of hosted AI uses this week, from `/api/usage`.
static SERVER_USED: Lazy<Mutex<Option<(i64, u32)>>> = Lazy::new(|| Mutex::new(None));
static LAST_SHOWN: Lazy<Mutex<Vec<(Limit, Instant)>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Limit {
    Ai,
    Suggestions,
    Meetings,
}

impl Limit {
    pub fn name(self) -> &'static str {
        match self {
            Limit::Ai => "ai",
            Limit::Suggestions => "suggestions",
            Limit::Meetings => "meetings",
        }
    }

    /// The start of the period this limit counts in: the week, or the month.
    fn period(self) -> i64 {
        match self {
            Limit::Meetings => month_start(),
            _ => week_start(),
        }
    }

    fn value(self, f: &FreeLimits) -> u32 {
        match self {
            Limit::Ai => f.ai_per_week,
            Limit::Suggestions => f.suggestions_per_week,
            Limit::Meetings => f.meetings_per_month,
        }
    }

    fn notice_key(self) -> &'static str {
        match self {
            Limit::Ai => "hud.notice.limitAi",
            Limit::Suggestions => "hud.notice.limitSuggestions",
            Limit::Meetings => "hud.notice.limitMeetings",
        }
    }
}

/// When the HUD says a limit was reached.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Show {
    /// The user asked for this just now: always say why it didn't happen.
    Always,
    /// Background work (polish on every dictation, suggestions): once per
    /// period, then quietly.
    Once,
    /// Only counted; the caller says it its own way.
    Never,
}

/// Free's limits in effect (the server's tunables, clamped, or defaults).
pub fn free() -> FreeLimits {
    crate::remote_config::agent_config().free
}

pub fn week_start() -> i64 {
    crate::plan::current_week().0
}

/// Local midnight on the 1st of this month.
pub fn month_start() -> i64 {
    Local::now()
        .date_naive()
        .with_day(1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .and_then(|d| d.and_local_timezone(Local).single())
        .map(|d| d.timestamp())
        .unwrap_or(0)
}

/// A count that belongs to one period (week or month) and starts over in
/// the next.
#[derive(Serialize, Deserialize, Default, Clone, Copy, Debug, PartialEq, Eq)]
struct Counter {
    period: i64,
    count: u32,
}

impl Counter {
    fn in_period(self, period: i64) -> u32 {
        if self.period == period {
            self.count
        } else {
            0
        }
    }

    fn bumped(self, period: i64) -> Self {
        Self {
            period,
            count: self.in_period(period).saturating_add(1),
        }
    }
}

/// One more may be taken: `Some(new counter)`, or `None` at the limit.
fn take(c: Counter, period: i64, limit: u32) -> Option<Counter> {
    (c.in_period(period) < limit).then(|| c.bumped(period))
}

/// Whether a limit's report in `period` would be its first.
fn first_in_period(last: Option<i64>, period: i64) -> bool {
    last != Some(period)
}

#[derive(Serialize, Deserialize, Default, Clone, Copy, Debug, PartialEq, Eq)]
struct Spent {
    week: i64,
    limit: u32,
}

/// The pool ran out this week at `spent.limit`, and the limit is no higher now.
fn still_spent(spent: Spent, week: i64, limit: u32) -> bool {
    spent.week == week && limit <= spent.limit
}

// ── store ─────────────────────────────────────────────────────────────────

fn read<T: DeserializeOwned + Default>(app: &AppHandle, field: &str) -> T {
    app.store(crate::portable::store_path(crate::plan::STORE_PATH))
        .ok()
        .and_then(|s| s.get(field))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn write<T: Serialize>(app: &AppHandle, field: &str, value: &T) {
    let Ok(store) = app.store(crate::portable::store_path(crate::plan::STORE_PATH)) else {
        return;
    };
    store.set(field, serde_json::to_value(value).unwrap_or_default());
    if let Err(e) = store.save() {
        log::warn!("limits: couldn't save {field}: {e}");
    }
}

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

// ── suggestions ───────────────────────────────────────────────────────────

/// Suggestions offered this week (counted on every plan; limited on Free).
pub fn suggestions_used(app: &AppHandle) -> u32 {
    read::<Counter>(app, SUGGESTIONS_FIELD).in_period(week_start())
}

/// Take one of this week's suggestions before offering it. At Free's
/// limit: false, and the first time this week the HUD says so, once.
pub fn take_suggestion(app: &AppHandle) -> bool {
    if crate::plan::is_paid(app) {
        return true;
    }
    let taken = {
        let _g = lock();
        let c: Counter = read(app, SUGGESTIONS_FIELD);
        match take(c, week_start(), free().suggestions_per_week) {
            Some(next) => {
                write(app, SUGGESTIONS_FIELD, &next);
                true
            }
            None => false,
        }
    };
    if !taken {
        log::debug!("limits: this week's free suggestions are used");
        hit(app, Limit::Suggestions, Show::Once);
    }
    taken
}

/// Free's suggestions are used up and the user has been told: the agent
/// stops judging windows until the week resets (nothing could be offered).
pub fn suggestions_done(app: &AppHandle) -> bool {
    !crate::plan::is_paid(app)
        && suggestions_used(app) >= free().suggestions_per_week
        && !first_in_period(notified(app, Limit::Suggestions), week_start())
}

// ── AI uses ───────────────────────────────────────────────────────────────

/// What the server last said Free used this week (hosted uses).
pub fn note_server_usage(used: u32) {
    *SERVER_USED.lock().unwrap_or_else(|e| e.into_inner()) = Some((week_start(), used));
}

fn server_used() -> u32 {
    SERVER_USED
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .filter(|(week, _)| *week == week_start())
        .map_or(0, |(_, used)| used)
}

/// Free's AI uses this week as far as this computer knows: on-device ones,
/// plus the hosted ones the server last reported.
pub fn ai_used(app: &AppHandle) -> u32 {
    crate::plan::local_ai_used(app).saturating_add(server_used())
}

/// Whether one more AI use may be tried. Always on a paid plan. On Free,
/// false once the week's pool is used (on-device and hosted together), so
/// nothing is sent only to be refused.
pub fn ai_available(app: &AppHandle) -> bool {
    if crate::plan::is_paid(app) {
        return true;
    }
    let limit = free().ai_per_week;
    !still_spent(read(app, AI_SPENT_FIELD), week_start(), limit) && ai_used(app) < limit
}

/// The week's AI pool is used: remembered until the week resets (or the
/// limit is raised), counted, and said as `show` asks.
pub fn ai_spent(app: &AppHandle, show: Show) {
    if crate::plan::is_paid(app) {
        return;
    }
    write(
        app,
        AI_SPENT_FIELD,
        &Spent {
            week: week_start(),
            limit: free().ai_per_week,
        },
    );
    hit(app, Limit::Ai, show);
}

/// A model call failed: if the server said Free's week is used
/// (`weekly_limit`), treat the pool as spent.
pub fn check_model_error(app: &AppHandle, error: &str, show: Show) -> bool {
    let spent = error.contains("weekly_limit");
    if spent {
        ai_spent(app, show);
    }
    spent
}

// ── memory and meetings ───────────────────────────────────────────────────

/// How long screen memory may keep anything, in hours: Free's cap, or
/// `None` on a paid plan (the user's own retention, 1–90 days).
pub fn memory_cap_hours(app: &AppHandle) -> Option<u32> {
    (!crate::plan::is_paid(app)).then(|| free().memory_hours)
}

/// Free's meetings a month; `None` on a paid plan.
pub fn meetings_limit(app: &AppHandle) -> Option<u32> {
    (!crate::plan::is_paid(app)).then(|| free().meetings_per_month)
}

// ── reporting ─────────────────────────────────────────────────────────────

fn notified(app: &AppHandle, limit: Limit) -> Option<i64> {
    read::<serde_json::Value>(app, NOTIFIED_FIELD)
        .get(limit.name())
        .and_then(serde_json::Value::as_i64)
}

/// A Free limit was reached: counted once per period (`limit_hit`), and
/// said in the HUD as `show` asks.
pub fn hit(app: &AppHandle, limit: Limit, show: Show) {
    let period = limit.period();
    let first = {
        let _g = lock();
        let first = first_in_period(notified(app, limit), period);
        if first {
            let mut all: serde_json::Value = read(app, NOTIFIED_FIELD);
            if !all.is_object() {
                all = serde_json::json!({});
            }
            all[limit.name()] = serde_json::json!(period);
            write(app, NOTIFIED_FIELD, &all);
        }
        first
    };
    if first {
        log::info!("limits: Free reached its {} limit", limit.name());
        crate::telemetry::limit_hit(limit.name());
    }
    let say = match show {
        Show::Always => !shown_recently(limit),
        Show::Once => first,
        Show::Never => false,
    };
    if say {
        notice(limit).show(app);
    }
}

fn shown_recently(limit: Limit) -> bool {
    let mut shown = LAST_SHOWN.lock().unwrap_or_else(|e| e.into_inner());
    shown.retain(|(_, at)| at.elapsed() < SHOW_AGAIN_AFTER);
    if shown.iter().any(|(l, _)| *l == limit) {
        return true;
    }
    shown.push((limit, Instant::now()));
    false
}

/// "That's this week's 25 AI uses. They reset Monday." with Upgrade.
fn notice(limit: Limit) -> Notice {
    Notice::cant(limit.notice_key())
        .var("limit", limit.value(&free()).to_string())
        .offer(offer::UPGRADE, "hud.offer.upgrade", "")
}

/// Say a limit in the HUD now (the caller already knows it was reached).
pub fn show(app: &AppHandle, limit: Limit) {
    hit(app, limit, Show::Always);
}

#[cfg(test)]
mod tests {
    use super::*;

    const MON: i64 = 1_793_000_000;
    const NEXT_MON: i64 = MON + 7 * 86_400;

    #[test]
    fn counters_take_up_to_the_limit() {
        let mut c = Counter::default();
        for n in 1..=10 {
            c = take(c, MON, 10).expect("under the limit");
            assert_eq!(c.in_period(MON), n);
        }
        assert_eq!(take(c, MON, 10), None);
        // A raised limit gives more at once.
        assert!(take(c, MON, 11).is_some());
    }

    #[test]
    fn counters_start_over_each_week() {
        let c = Counter {
            period: MON,
            count: 10,
        };
        assert_eq!(take(c, MON, 10), None);
        assert_eq!(c.in_period(NEXT_MON), 0);
        assert_eq!(
            take(c, NEXT_MON, 10),
            Some(Counter {
                period: NEXT_MON,
                count: 1
            })
        );
    }

    #[test]
    fn a_limit_is_reported_once_per_period() {
        assert!(first_in_period(None, MON));
        assert!(!first_in_period(Some(MON), MON));
        assert!(first_in_period(Some(MON), NEXT_MON));
    }

    #[test]
    fn a_spent_pool_reopens_next_week_or_when_raised() {
        let spent = Spent {
            week: MON,
            limit: 25,
        };
        assert!(still_spent(spent, MON, 25));
        assert!(still_spent(spent, MON, 20));
        assert!(!still_spent(spent, MON, 30));
        assert!(!still_spent(spent, NEXT_MON, 25));
        assert!(!still_spent(Spent::default(), MON, 25));
    }

    #[test]
    fn this_week_and_month_are_now() {
        let now = chrono::Utc::now().timestamp();
        assert!(week_start() <= now && month_start() <= now);
        assert!(now - month_start() < 32 * 86_400);
    }

    #[test]
    fn brand_defaults_match_the_remote_defaults() {
        let f = FreeLimits::default();
        assert_eq!(
            env!("BRAND_FREE_POLISH_PER_WEEK").parse::<u32>().ok(),
            Some(f.ai_per_week)
        );
        let brand: serde_json::Value =
            serde_json::from_str(include_str!("../../brand.config.json")).unwrap();
        assert_eq!(
            brand["freeSuggestionsPerWeek"].as_u64(),
            Some(u64::from(f.suggestions_per_week))
        );
        assert_eq!(
            brand["freeMeetingsPerMonth"].as_u64(),
            Some(u64::from(f.meetings_per_month))
        );
    }
}
