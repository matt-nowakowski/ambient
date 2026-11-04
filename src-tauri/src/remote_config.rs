//! Remote agent tunables: lets the analytics tune the agent without an app
//! update. Fetched from `/api/agent/config` on launch and at most once a day
//! (the request carries only the app version), cached on disk, and applied
//! only within the hard-coded safe bounds below: out-of-range values are
//! clamped, unknown keys ignored, and when anything is missing or the fetch
//! fails the built-in defaults stand.
//!
//! Callers read [`agent_config()`]. Bounds and defaults mirror
//! `web/lib/agent/config-schema.json` (a test checks they agree).

use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use once_cell::sync::Lazy;
use serde_json::Value;
use tauri::AppHandle;

const CACHE_FILE: &str = "agent_config.json";
const FETCH_EVERY: Duration = Duration::from_secs(24 * 3600);
const FIRST_FETCH_DELAY: Duration = Duration::from_secs(20);
const SCHEMA: u64 = 1;

/// (min, max, default) for each tunable. Never widen these from the server.
pub mod bounds {
    pub const KIND_MIN_CONFIDENCE: (f64, f64, f64) = (0.5, 0.95, 0.55);
    /// After a kind is offered in an app, that app gets no other offer for
    /// this many minutes (`agent::budget`).
    pub const KIND_COOLDOWN_MIN: (f64, f64, f64) = (1.0, 1440.0, 2.0);
    pub const HOURLY_BUDGET: (f64, f64, f64) = (1.0, 20.0, 10.0);
    pub const JUDGE_TIMEOUT_MS: (f64, f64, f64) = (3000.0, 15000.0, 8000.0);
    pub const JUDGE_CLOUD_TIMEOUT_MS: (f64, f64, f64) = (3000.0, 12000.0, 7000.0);
    pub const JUDGE_MIN_CONFIDENCE: (f64, f64, f64) = (0.5, 0.95, 0.55);
    pub const ROUTER_DID_YOU_MEAN_BIAS: (f64, f64, f64) = (0.0, 1.0, 0.5);
    pub const ANSWER_FIRST_BYTE_TIMEOUT_MS: (f64, f64, f64) = (8000.0, 40000.0, 25000.0);
    pub const ANSWER_IDLE_TIMEOUT_MS: (f64, f64, f64) = (5000.0, 30000.0, 20000.0);
    pub const SEARCH_TIMEOUT_MS: (f64, f64, f64) = (2000.0, 15000.0, 6000.0);
    /// Smart writing (`agent::writing`): an instruction score at or above
    /// this is "Written for you" without a model call.
    pub const WRITING_WRITTEN_THRESHOLD: (f64, f64, f64) = (0.5, 0.95, 0.7);
    /// Scores from here up to the threshold are ambiguous: a model decides
    /// (below it, never written).
    pub const WRITING_AMBIGUOUS_FLOOR: (f64, f64, f64) = (0.2, 0.7, 0.45);
    /// Fillers, repeats and restarts per word at or above which speech is
    /// polished.
    pub const WRITING_POLISH_DISFLUENCY: (f64, f64, f64) = (0.02, 0.3, 0.06);
    /// Words without a sentence break that make a run-on (polished).
    pub const WRITING_RUN_ON_WORDS: (f64, f64, f64) = (15.0, 80.0, 35.0);
    /// Dictations of this many words or fewer are typed without AI polish
    /// (no model round trip for "sounds good"); 0 polishes everything. The
    /// polish shortcut always polishes.
    pub const WRITING_SKIP_POLISH_WORDS: (f64, f64, f64) = (0.0, 10.0, 3.0);
    /// Free's weekly pool of AI uses (hosted and on-device together). The
    /// server enforces the hosted side with the same tunable.
    pub const FREE_AI_PER_WEEK: (f64, f64, f64) = (5.0, 500.0, 25.0);
    /// Suggestions Free is offered a week (judged on device or by rules).
    pub const FREE_SUGGESTIONS_PER_WEEK: (f64, f64, f64) = (1.0, 200.0, 10.0);
    /// How long Free's screen memory keeps what it saw, in hours.
    pub const FREE_MEMORY_HOURS: (f64, f64, f64) = (1.0, 168.0, 24.0);
    /// Meetings Free can take notes in each calendar month.
    pub const FREE_MEETINGS_PER_MONTH: (f64, f64, f64) = (1.0, 30.0, 2.0);
}

/// Free's limits (`crate::limits`). Pro, Team and the trial have none
/// beyond fair use.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FreeLimits {
    pub ai_per_week: u32,
    pub suggestions_per_week: u32,
    pub memory_hours: u32,
    pub meetings_per_month: u32,
}

impl Default for FreeLimits {
    fn default() -> Self {
        Self {
            ai_per_week: bounds::FREE_AI_PER_WEEK.2 as u32,
            suggestions_per_week: bounds::FREE_SUGGESTIONS_PER_WEEK.2 as u32,
            memory_hours: bounds::FREE_MEMORY_HOURS.2 as u32,
            meetings_per_month: bounds::FREE_MEETINGS_PER_MONTH.2 as u32,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct KindConfig {
    pub enabled: bool,
    pub min_confidence: f32,
    pub cooldown: Duration,
}

impl Default for KindConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            min_confidence: bounds::KIND_MIN_CONFIDENCE.2 as f32,
            cooldown: Duration::from_secs((bounds::KIND_COOLDOWN_MIN.2 * 60.0) as u64),
        }
    }
}

/// The tunables in effect.
#[derive(Clone, Debug, PartialEq)]
pub struct AgentConfig {
    /// Suggestions per hour at most (the user's own setting can only lower it).
    pub hourly_budget: u32,
    pub judge_timeout: Duration,
    pub judge_cloud_timeout: Duration,
    pub judge_min_confidence: f32,
    /// How eagerly speech with no text field focused is doubted as
    /// dictation and sent to the agent instead of "Did you mean to type
    /// this?" (`router::decide`): low = only clear commands go to the agent,
    /// 0.5 = any request or question does (prose is the router's call),
    /// high = everything does. The tuner raises it when too many requests
    /// end on that card.
    pub did_you_mean_bias: f32,
    pub answer_first_byte_timeout: Duration,
    pub answer_idle_timeout: Duration,
    /// Used by the server's search; served for completeness.
    pub search_timeout: Duration,
    /// Smart writing's thresholds (see `bounds::WRITING_*`).
    pub writing: WritingConfig,
    pub free: FreeLimits,
    kinds: BTreeMap<String, KindConfig>,
}

/// Smart writing's tunables. The tuner raises `written_threshold` when
/// "Written for you" is reverted too often.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WritingConfig {
    pub written_threshold: f32,
    /// Always below `written_threshold`.
    pub ambiguous_floor: f32,
    pub polish_disfluency: f32,
    pub run_on_words: u32,
    pub skip_polish_words: u32,
}

impl Default for WritingConfig {
    fn default() -> Self {
        Self {
            written_threshold: bounds::WRITING_WRITTEN_THRESHOLD.2 as f32,
            ambiguous_floor: bounds::WRITING_AMBIGUOUS_FLOOR.2 as f32,
            polish_disfluency: bounds::WRITING_POLISH_DISFLUENCY.2 as f32,
            run_on_words: bounds::WRITING_RUN_ON_WORDS.2 as u32,
            skip_polish_words: bounds::WRITING_SKIP_POLISH_WORDS.2 as u32,
        }
    }
}

impl Default for AgentConfig {
    fn default() -> Self {
        let ms = |b: (f64, f64, f64)| Duration::from_millis(b.2 as u64);
        Self {
            hourly_budget: bounds::HOURLY_BUDGET.2 as u32,
            judge_timeout: ms(bounds::JUDGE_TIMEOUT_MS),
            judge_cloud_timeout: ms(bounds::JUDGE_CLOUD_TIMEOUT_MS),
            judge_min_confidence: bounds::JUDGE_MIN_CONFIDENCE.2 as f32,
            did_you_mean_bias: bounds::ROUTER_DID_YOU_MEAN_BIAS.2 as f32,
            answer_first_byte_timeout: ms(bounds::ANSWER_FIRST_BYTE_TIMEOUT_MS),
            answer_idle_timeout: ms(bounds::ANSWER_IDLE_TIMEOUT_MS),
            search_timeout: ms(bounds::SEARCH_TIMEOUT_MS),
            writing: WritingConfig::default(),
            free: FreeLimits::default(),
            kinds: BTreeMap::new(),
        }
    }
}

impl AgentConfig {
    /// A suggestion kind's settings (defaults for kinds the server didn't name).
    pub fn kind(&self, name: &str) -> KindConfig {
        self.kinds.get(name).cloned().unwrap_or_default()
    }

    /// The confidence a judge verdict of this kind needs: the kind's own
    /// threshold when the server tuned it, else the judge's.
    pub fn min_confidence_for(&self, judge_kind: &str) -> f32 {
        let name = if judge_kind == "other" {
            "help_here"
        } else {
            judge_kind
        };
        self.kinds
            .get(name)
            .map_or(self.judge_min_confidence, |k| k.min_confidence)
    }
}

static CURRENT: Lazy<RwLock<Arc<AgentConfig>>> =
    Lazy::new(|| RwLock::new(Arc::new(AgentConfig::default())));

/// The tunables in effect: the server's, clamped, or the built-in defaults.
pub fn agent_config() -> Arc<AgentConfig> {
    CURRENT
        .read()
        .map(|g| Arc::clone(&g))
        .unwrap_or_else(|_| Arc::new(AgentConfig::default()))
}

fn clamp(v: Option<&Value>, b: (f64, f64, f64)) -> f64 {
    v.and_then(Value::as_f64)
        .filter(|x| x.is_finite())
        .map_or(b.2, |x| x.clamp(b.0, b.1))
}

fn whole(v: Option<&Value>, b: (f64, f64, f64)) -> u32 {
    clamp(v, b).round() as u32
}

/// The server's JSON, applied within bounds. None for another schema version
/// or something that isn't an object (the defaults then stay).
pub fn parse(text: &str) -> Option<AgentConfig> {
    let v: Value = serde_json::from_str(text).ok()?;
    if v.get("schema").and_then(Value::as_u64) != Some(SCHEMA) {
        return None;
    }
    let ms = |x: f64| Duration::from_millis(x as u64);
    let mut c = AgentConfig {
        hourly_budget: clamp(v.get("hourly_budget"), bounds::HOURLY_BUDGET).round() as u32,
        judge_timeout: ms(clamp(
            v.pointer("/judge/timeout_ms"),
            bounds::JUDGE_TIMEOUT_MS,
        )),
        judge_cloud_timeout: ms(clamp(
            v.pointer("/judge/cloud_timeout_ms"),
            bounds::JUDGE_CLOUD_TIMEOUT_MS,
        )),
        judge_min_confidence: clamp(
            v.pointer("/judge/min_confidence"),
            bounds::JUDGE_MIN_CONFIDENCE,
        ) as f32,
        did_you_mean_bias: clamp(
            v.pointer("/router/did_you_mean_bias"),
            bounds::ROUTER_DID_YOU_MEAN_BIAS,
        ) as f32,
        answer_first_byte_timeout: ms(clamp(
            v.pointer("/answer/first_byte_timeout_ms"),
            bounds::ANSWER_FIRST_BYTE_TIMEOUT_MS,
        )),
        answer_idle_timeout: ms(clamp(
            v.pointer("/answer/idle_timeout_ms"),
            bounds::ANSWER_IDLE_TIMEOUT_MS,
        )),
        search_timeout: ms(clamp(
            v.pointer("/search/timeout_ms"),
            bounds::SEARCH_TIMEOUT_MS,
        )),
        writing: {
            let threshold = clamp(
                v.pointer("/writing/written_threshold"),
                bounds::WRITING_WRITTEN_THRESHOLD,
            ) as f32;
            let floor = clamp(
                v.pointer("/writing/ambiguous_floor"),
                bounds::WRITING_AMBIGUOUS_FLOOR,
            ) as f32;
            WritingConfig {
                written_threshold: threshold,
                // The ambiguous band never reaches past the threshold.
                ambiguous_floor: floor.min(threshold - 0.05),
                polish_disfluency: clamp(
                    v.pointer("/writing/polish_disfluency"),
                    bounds::WRITING_POLISH_DISFLUENCY,
                ) as f32,
                run_on_words: clamp(
                    v.pointer("/writing/run_on_words"),
                    bounds::WRITING_RUN_ON_WORDS,
                )
                .round() as u32,
                skip_polish_words: clamp(
                    v.pointer("/writing/skip_polish_words"),
                    bounds::WRITING_SKIP_POLISH_WORDS,
                )
                .round() as u32,
            }
        },
        free: FreeLimits {
            ai_per_week: whole(v.pointer("/free/ai_per_week"), bounds::FREE_AI_PER_WEEK),
            suggestions_per_week: whole(
                v.pointer("/free/suggestions_per_week"),
                bounds::FREE_SUGGESTIONS_PER_WEEK,
            ),
            memory_hours: whole(v.pointer("/free/memory_hours"), bounds::FREE_MEMORY_HOURS),
            meetings_per_month: whole(
                v.pointer("/free/meetings_per_month"),
                bounds::FREE_MEETINGS_PER_MONTH,
            ),
        },
        kinds: BTreeMap::new(),
    };
    if let Some(kinds) = v.get("kinds").and_then(Value::as_object) {
        for (name, k) in kinds {
            // Only kinds this build knows; the rest are ignored.
            if !known_kind(name) {
                continue;
            }
            c.kinds.insert(
                name.clone(),
                KindConfig {
                    enabled: k.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                    min_confidence: clamp(k.get("min_confidence"), bounds::KIND_MIN_CONFIDENCE)
                        as f32,
                    cooldown: Duration::from_secs(
                        (clamp(k.get("cooldown_min"), bounds::KIND_COOLDOWN_MIN) * 60.0) as u64,
                    ),
                },
            );
        }
    }
    Some(c)
}

fn known_kind(name: &str) -> bool {
    name == "meeting_nudge"
        || crate::agent::proactive::Kind::ALL
            .iter()
            .any(|k| k.name() == name)
}

// ── fetching ──────────────────────────────────────────────────────────────

fn cache_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::portable::app_data_dir(app)
        .ok()
        .map(|d| d.join(CACHE_FILE))
}

fn apply(text: &str) -> bool {
    match parse(text) {
        Some(c) => {
            if let Ok(mut g) = CURRENT.write() {
                *g = Arc::new(c);
            }
            true
        }
        None => false,
    }
}

async fn fetch(app: &AppHandle) {
    let url = format!(
        "{}/api/agent/config?v={}",
        crate::agent::answer::api_base(),
        env!("CARGO_PKG_VERSION")
    );
    crate::recall::log_request_if_open(&crate::telemetry::host_of(&url), "config", "");
    let res = reqwest::Client::new()
        .get(&url)
        .timeout(Duration::from_secs(15))
        .send()
        .await;
    let text = match res {
        Ok(r) if r.status().is_success() => r.text().await.ok(),
        Ok(r) => {
            log::debug!("agent config: server returned {}", r.status());
            None
        }
        Err(e) => {
            log::debug!("agent config: fetch failed ({})", e.is_timeout());
            None
        }
    };
    let Some(text) = text else {
        return;
    };
    if apply(&text) {
        log::info!("agent config: applied the server's tunables");
        if let Some(path) = cache_path(app) {
            let _ = std::fs::write(path, text);
        }
    } else {
        log::debug!("agent config: unusable reply; keeping what we have");
    }
}

/// Load the cached config, then fetch shortly after launch and once a day.
pub fn start(app: &AppHandle) {
    if let Some(text) = cache_path(app).and_then(|p| std::fs::read_to_string(p).ok()) {
        apply(&text);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_FETCH_DELAY).await;
        loop {
            fetch(&app).await;
            tokio::time::sleep(FETCH_EVERY).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_stand_without_a_config() {
        let c = agent_config();
        assert_eq!(c.hourly_budget, 10);
        assert_eq!(c.judge_timeout, Duration::from_secs(8));
        assert_eq!(c.judge_cloud_timeout, Duration::from_secs(7));
        assert_eq!(c.answer_first_byte_timeout, Duration::from_secs(25));
        assert_eq!(c.answer_idle_timeout, Duration::from_secs(20));
        assert!((c.min_confidence_for("draft_reply") - 0.55).abs() < 1e-6);
        assert!(c.kind("summarise_thread").enabled);
        assert_eq!(c.kind("draft_reply").cooldown, Duration::from_secs(120));
        assert_eq!(
            c.free,
            FreeLimits {
                ai_per_week: 25,
                suggestions_per_week: 10,
                memory_hours: 24,
                meetings_per_month: 2,
            }
        );
    }

    #[test]
    fn free_limits_are_clamped() {
        let c = parse(
            r#"{"schema":1,"free":{"ai_per_week":100000,"suggestions_per_week":0,"memory_hours":"x","meetings_per_month":3.6}}"#,
        )
        .unwrap();
        assert_eq!(c.free.ai_per_week, 500);
        assert_eq!(c.free.suggestions_per_week, 1);
        assert_eq!(c.free.memory_hours, 24); // not a number → default
        assert_eq!(c.free.meetings_per_month, 4);
    }

    #[test]
    fn out_of_range_values_are_clamped_and_unknown_keys_ignored() {
        let c = parse(
            r#"{"schema":1,"hourly_budget":500,"judge":{"timeout_ms":1,"cloud_timeout_ms":"x","min_confidence":0.2},
            "router":{"did_you_mean_bias":7},"answer":{"first_byte_timeout_ms":1e12,"idle_timeout_ms":-3},
            "kinds":{"summarise_thread":{"enabled":false,"min_confidence":2,"cooldown_min":1},
                     "launch_missiles":{"enabled":true}},
            "surprise":{"x":1}}"#,
        )
        .unwrap();
        assert_eq!(c.hourly_budget, 20);
        assert_eq!(c.judge_timeout, Duration::from_millis(3000));
        assert_eq!(c.judge_cloud_timeout, Duration::from_millis(7000)); // not a number → default
        assert!((c.judge_min_confidence - 0.5).abs() < 1e-6);
        assert!((c.did_you_mean_bias - 1.0).abs() < 1e-6);
        assert_eq!(c.answer_first_byte_timeout, Duration::from_millis(40000));
        assert_eq!(c.answer_idle_timeout, Duration::from_millis(5000));
        let k = c.kind("summarise_thread");
        assert!(!k.enabled);
        assert!((k.min_confidence - 0.95).abs() < 1e-6);
        assert_eq!(k.cooldown, Duration::from_secs(60));
        assert!(!c.kinds.contains_key("launch_missiles"));
        // The judge's "other" is the help_here kind.
        assert!((c.min_confidence_for("draft_reply") - 0.5).abs() < 1e-6);
    }

    #[test]
    fn writing_tunables_are_clamped_and_the_band_stays_below_the_threshold() {
        let c = parse(
            r#"{"schema":1,"writing":{"written_threshold":0.55,"ambiguous_floor":0.69,"polish_disfluency":9,"run_on_words":2,"skip_polish_words":99}}"#,
        )
        .unwrap();
        assert!((c.writing.written_threshold - 0.55).abs() < 1e-6);
        assert!((c.writing.ambiguous_floor - 0.5).abs() < 1e-6);
        assert!((c.writing.polish_disfluency - 0.3).abs() < 1e-6);
        assert_eq!(c.writing.run_on_words, 15);
        assert_eq!(c.writing.skip_polish_words, 10);
        assert_eq!(AgentConfig::default().writing, WritingConfig::default());
    }

    #[test]
    fn another_schema_or_garbage_keeps_defaults() {
        assert!(parse(r#"{"schema":2,"hourly_budget":5}"#).is_none());
        assert!(parse("not json").is_none());
        assert!(parse("[]").is_none());
        let empty = parse(r#"{"schema":1}"#).unwrap();
        assert_eq!(empty, AgentConfig::default());
    }

    #[test]
    fn bounds_match_the_server_schema() {
        let text = include_str!("../../web/lib/agent/config-schema.json");
        let v: Value = serde_json::from_str(text).unwrap();
        assert_eq!(v["schema"].as_u64(), Some(SCHEMA));
        let check = |key: &str, b: (f64, f64, f64)| {
            let s = &v["bounds"][key];
            assert_eq!(s["min"].as_f64(), Some(b.0), "{key} min");
            assert_eq!(s["max"].as_f64(), Some(b.1), "{key} max");
            assert_eq!(s["default"].as_f64(), Some(b.2), "{key} default");
        };
        check("kind.min_confidence", bounds::KIND_MIN_CONFIDENCE);
        check("kind.cooldown_min", bounds::KIND_COOLDOWN_MIN);
        check("hourly_budget", bounds::HOURLY_BUDGET);
        check("judge.timeout_ms", bounds::JUDGE_TIMEOUT_MS);
        check("judge.cloud_timeout_ms", bounds::JUDGE_CLOUD_TIMEOUT_MS);
        check("judge.min_confidence", bounds::JUDGE_MIN_CONFIDENCE);
        check("router.did_you_mean_bias", bounds::ROUTER_DID_YOU_MEAN_BIAS);
        check(
            "answer.first_byte_timeout_ms",
            bounds::ANSWER_FIRST_BYTE_TIMEOUT_MS,
        );
        check("answer.idle_timeout_ms", bounds::ANSWER_IDLE_TIMEOUT_MS);
        check("search.timeout_ms", bounds::SEARCH_TIMEOUT_MS);
        check(
            "writing.written_threshold",
            bounds::WRITING_WRITTEN_THRESHOLD,
        );
        check("writing.ambiguous_floor", bounds::WRITING_AMBIGUOUS_FLOOR);
        check(
            "writing.polish_disfluency",
            bounds::WRITING_POLISH_DISFLUENCY,
        );
        check("writing.run_on_words", bounds::WRITING_RUN_ON_WORDS);
        check(
            "writing.skip_polish_words",
            bounds::WRITING_SKIP_POLISH_WORDS,
        );
        check("free.ai_per_week", bounds::FREE_AI_PER_WEEK);
        check(
            "free.suggestions_per_week",
            bounds::FREE_SUGGESTIONS_PER_WEEK,
        );
        check("free.memory_hours", bounds::FREE_MEMORY_HOURS);
        check("free.meetings_per_month", bounds::FREE_MEETINGS_PER_MONTH);
        for k in v["kinds"].as_array().unwrap() {
            assert!(known_kind(k.as_str().unwrap()), "{k}");
        }
    }
}
