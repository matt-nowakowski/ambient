//! Opt-in anonymous product analytics: counts and timings only, never content.
//!
//! Off by default (`settings.telemetry`). While it's off nothing is queued and
//! nothing is sent. While it's on, events are counted in memory (identical
//! events are merged into one row with a count), and the batch is sent at most
//! every six hours and once, best-effort, on quit, to `/api/telemetry`.
//! Every upload is written to the Privacy Center's request ledger first, with
//! exactly the body that is sent.
//!
//! An event is `{name, props}` where every prop comes from a fixed allowlist:
//! enums, booleans and duration buckets, defined once in
//! `web/lib/agent/telemetry-schema.json` (the server validates against the
//! same file). Never text, titles, URLs, app names (only a coarse category),
//! file names or emails. The batch carries the app version, OS family, plan
//! and a random install id generated here that rotates every 30 days; never
//! the machine hash or the license subject.

use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Listener};
use tauri_plugin_store::StoreExt;

/// The allowlist, shared with the server.
const SCHEMA_JSON: &str = include_str!("../../web/lib/agent/telemetry-schema.json");
// Tuning works on daily totals, so a few uploads a day is plenty, and keeps
// serverless invocations per opted-in install to about four a day.
const SEND_EVERY: Duration = Duration::from_secs(6 * 3600);
const TICK: Duration = Duration::from_secs(60);
const QUIT_TIMEOUT: Duration = Duration::from_secs(2);
const SEND_TIMEOUT: Duration = Duration::from_secs(15);
/// Distinct rows kept in memory; past this, new kinds of rows are dropped.
const MAX_ROWS: usize = 400;
/// Matches the server's per-batch cap.
const MAX_EVENTS_PER_BATCH: usize = 200;
const MAX_COUNT: u32 = 1000;
const ROTATE_AFTER_SECS: i64 = 30 * 24 * 3600;
const STORE_PATH: &str = "telemetry.json";
/// 1 in 10 dictations is counted.
const DICTATION_SAMPLE: u64 = 10;

static ENABLED: AtomicBool = AtomicBool::new(false);
static QUEUE: Lazy<Mutex<BTreeMap<String, Row>>> = Lazy::new(|| Mutex::new(BTreeMap::new()));
static LAST_SENT: Lazy<Mutex<Instant>> = Lazy::new(|| Mutex::new(Instant::now()));
static SENDING: AtomicBool = AtomicBool::new(false);
static DICTATIONS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq)]
struct Row {
    name: String,
    props: BTreeMap<String, Value>,
    n: u32,
}

// ── schema ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RawSchema {
    buckets: BTreeMap<String, Vec<String>>,
    enums: BTreeMap<String, Vec<String>>,
    events: BTreeMap<String, BTreeMap<String, Value>>,
}

#[derive(Debug, Clone, PartialEq)]
enum Spec {
    OneOf(Vec<String>),
    Bool,
}

struct Schema {
    events: BTreeMap<String, BTreeMap<String, Spec>>,
    #[cfg_attr(not(test), allow(dead_code))]
    ms: Vec<String>,
    #[cfg_attr(not(test), allow(dead_code))]
    duration: Vec<String>,
}

static SCHEMA: Lazy<Schema> = Lazy::new(|| parse_schema(SCHEMA_JSON).expect("telemetry schema"));

fn parse_schema(text: &str) -> Result<Schema, String> {
    let raw: RawSchema = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let resolve = |v: &Value| -> Result<Spec, String> {
        match v {
            Value::Array(items) => Ok(Spec::OneOf(
                items
                    .iter()
                    .map(|i| i.as_str().map(str::to_string).ok_or("enum value"))
                    .collect::<Result<_, _>>()?,
            )),
            Value::String(s) if s == "bool" => Ok(Spec::Bool),
            Value::String(s) if s.starts_with('@') => raw
                .enums
                .get(&s[1..])
                .cloned()
                .map(Spec::OneOf)
                .ok_or_else(|| format!("unknown enum {s}")),
            Value::String(s) if s.starts_with('#') => raw
                .buckets
                .get(&s[1..])
                .cloned()
                .map(Spec::OneOf)
                .ok_or_else(|| format!("unknown bucket {s}")),
            other => Err(format!("bad prop spec {other}")),
        }
    };
    let mut events = BTreeMap::new();
    for (name, props) in &raw.events {
        let mut out = BTreeMap::new();
        for (k, v) in props {
            out.insert(k.clone(), resolve(v)?);
        }
        events.insert(name.clone(), out);
    }
    Ok(Schema {
        events,
        ms: raw.buckets.get("ms").cloned().unwrap_or_default(),
        duration: raw.buckets.get("duration").cloned().unwrap_or_default(),
    })
}

/// Whether `props` is exactly what the allowlist says for `name`: every prop
/// present, nothing extra, every value allowed.
fn valid(schema: &Schema, name: &str, props: &BTreeMap<String, Value>) -> bool {
    let Some(spec) = schema.events.get(name) else {
        return false;
    };
    if spec.len() != props.len() {
        return false;
    }
    spec.iter().all(|(k, s)| match (s, props.get(k)) {
        (Spec::Bool, Some(Value::Bool(_))) => true,
        (Spec::OneOf(allowed), Some(Value::String(v))) => allowed.iter().any(|a| a == v),
        _ => false,
    })
}

// ── buckets and categories ────────────────────────────────────────────────

/// The duration bucket for `ms` milliseconds.
pub fn ms_bucket(ms: u128) -> &'static str {
    match ms {
        0..250 => "lt250",
        250..500 => "lt500",
        500..1_000 => "lt1s",
        1_000..2_000 => "lt2s",
        2_000..5_000 => "lt5s",
        5_000..10_000 => "lt10s",
        10_000..30_000 => "lt30s",
        _ => "ge30s",
    }
}

/// The length bucket for a meeting of `secs` seconds.
pub fn duration_bucket(secs: i64) -> &'static str {
    match secs.max(0) {
        0..300 => "lt5m",
        300..900 => "lt15m",
        900..1_800 => "lt30m",
        1_800..3_600 => "lt60m",
        _ => "ge60m",
    }
}

/// A coarse category for an app (bundle id or process name). Never the name.
pub fn app_category(app: &str) -> &'static str {
    let a = app.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| a.contains(w));
    if has(&[
        "terminal",
        "iterm",
        "warp",
        "ghostty",
        "alacritty",
        "kitty",
        "wezterm",
        "konsole",
        "powershell",
        "cmd.exe",
        "windowsterminal",
        "tilix",
        "hyper",
    ]) {
        "terminal"
    } else if has(&[
        "mail",
        "outlook",
        "spark",
        "superhuman",
        "thunderbird",
        "mimestream",
        "airmail",
        "evolution",
        "geary",
    ]) {
        "mail"
    } else if has(&[
        "slack",
        "discord",
        "teams",
        "messages",
        "mobilesms",
        "whatsapp",
        "telegram",
        "signal",
        "messenger",
        "wechat",
        "skype",
        "element",
    ]) {
        "chat"
    } else if has(&[
        "safari", "chrome", "chromium", "firefox", "arc", "edge", "brave", "opera", "vivaldi",
        "browser", "orion", "zen",
    ]) {
        "browser"
    } else if has(&[
        "code",
        "xcode",
        "sublime",
        "zed",
        "cursor",
        "jetbrains",
        "intellij",
        "pycharm",
        "webstorm",
        "notion",
        "word",
        "pages",
        "obsidian",
        "textedit",
        "notes",
        "bear",
        "craft",
        "nvim",
        "vim",
        "emacs",
        "notepad",
        "gedit",
        "kate",
        "libreoffice",
        "excel",
        "numbers",
        "keynote",
    ]) {
        "editor"
    } else {
        "other"
    }
}

fn os_family() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// The plan as the schema knows it (Team counts as Pro).
fn plan_name(plan: crate::plan::Plan) -> &'static str {
    match plan {
        crate::plan::Plan::Free => "free",
        crate::plan::Plan::Trial => "trial",
        crate::plan::Plan::Pro | crate::plan::Plan::Team => "pro",
    }
}

// ── recording ─────────────────────────────────────────────────────────────

/// A prop value: an allowlisted word or a boolean.
#[derive(Clone, Copy, Debug)]
pub enum P {
    S(&'static str),
    B(bool),
}

/// Whether analytics are on (cheap; no settings read).
pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Count one event. Dropped unless it matches the allowlist exactly. A no-op while analytics are off.
pub fn record(name: &str, props: &[(&str, P)]) {
    if !enabled() {
        return;
    }
    push(&SCHEMA, name, props);
}

fn push(schema: &Schema, name: &str, props: &[(&str, P)]) -> bool {
    let props: BTreeMap<String, Value> = props
        .iter()
        .map(|(k, v)| {
            (
                (*k).to_string(),
                match v {
                    P::S(s) => Value::String((*s).to_string()),
                    P::B(b) => Value::Bool(*b),
                },
            )
        })
        .collect();
    if !valid(schema, name, &props) {
        log::debug!("telemetry: dropped an event outside the allowlist ({name})");
        return false;
    }
    let key = format!(
        "{name}|{}",
        Value::Object(props.clone().into_iter().collect())
    );
    let mut q = QUEUE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(row) = q.get_mut(&key) {
        row.n = (row.n + 1).min(MAX_COUNT);
        return true;
    }
    if q.len() >= MAX_ROWS {
        return false;
    }
    q.insert(
        key,
        Row {
            name: name.to_string(),
            props,
            n: 1,
        },
    );
    true
}

// Typed helpers for the call sites, so they stay one line each.

/// The judge that produced the next offer ("device" or "cloud"); taken by
/// [`suggestion_offered`]. Anything offered without one came from rules.
static NEXT_JUDGE: Mutex<Option<(&'static str, Instant)>> = Mutex::new(None);
/// The next suggestion answer came by voice; `Some("muted")` when the user
/// said "don't show me these".
static VOICE_REPLY: Mutex<Option<&'static str>> = Mutex::new(None);
/// Where the next routed request came from, when it wasn't a key.
static NEXT_SOURCE: Mutex<Option<&'static str>> = Mutex::new(None);
/// The "Did you mean to type this?" card on screen, by HUD id.
static DID_YOU_MEAN: Mutex<Option<String>> = Mutex::new(None);
/// Recent cards by HUD id → (card, kind), for 👍/👎 (memory only).
static CARDS: Lazy<Mutex<HashMap<String, (&'static str, String)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn take<T: Copy>(m: &Mutex<Option<T>>) -> Option<T> {
    m.lock().ok().and_then(|mut g| g.take())
}

fn set<T>(m: &Mutex<Option<T>>, v: T) {
    if let Ok(mut g) = m.lock() {
        *g = Some(v);
    }
}

/// Remember what a HUD card was, so a 👍/👎 on it can be counted by kind.
pub fn note_card(id: &str, card: &'static str, kind: &str) {
    if let Ok(mut g) = CARDS.lock() {
        if g.len() > 50 {
            g.clear();
        }
        g.insert(id.to_string(), (card, kind.to_string()));
    }
}

/// What a HUD card was: ("answer" | "suggestion", kind).
pub fn card(id: &str) -> Option<(&'static str, String)> {
    CARDS.lock().ok().and_then(|g| g.get(id).cloned())
}

/// The judge (on this device or in the cloud) said to offer what's next.
pub fn next_offer_judge(engine: &'static str) {
    set(&NEXT_JUDGE, (engine, Instant::now()));
}

/// A suggestion was put on screen.
pub fn suggestion_offered(id: &str, kind: &str, bundle: &str) {
    // Only a verdict from moments ago; anything older was never offered.
    let judge = take(&NEXT_JUDGE)
        .filter(|(_, at)| at.elapsed() < Duration::from_secs(5))
        .map_or("rules", |(engine, _)| engine);
    note_card(id, "suggestion", kind);
    if let Some(kind) = known(kind) {
        record(
            "suggestion_offered",
            &[
                ("kind", P::S(kind)),
                ("judge", P::S(judge)),
                ("app_category", P::S(app_category(bundle))),
            ],
        );
    }
}

/// The next suggestion answer is spoken; `muted` when it was "don't show me".
pub fn reply_by_voice(muted: bool) {
    set(&VOICE_REPLY, if muted { "muted" } else { "voice" });
}

/// The user answered (or ignored) a suggestion: `action` is the HUD action
/// (`accept`, `dismiss`, `expire`).
pub fn suggestion_result(kind: &str, action: &str) {
    let voice = take(&VOICE_REPLY);
    let (outcome, by) = match (action, voice) {
        (_, Some("muted")) => ("muted", "voice"),
        ("accept", v) => ("accepted", if v.is_some() { "voice" } else { "click" }),
        ("dismiss", v) => ("dismissed", if v.is_some() { "voice" } else { "click" }),
        _ => ("ignored", "timeout"),
    };
    if let Some(kind) = known(kind) {
        record(
            "suggestion_result",
            &[
                ("kind", P::S(kind)),
                ("outcome", P::S(outcome)),
                ("by", P::S(by)),
            ],
        );
    }
}

/// One run of the suggestion judge. `outcome`: ok, unparsable, timeout, error.
pub fn judge_run(engine: &'static str, outcome: &'static str, elapsed: Duration) {
    record(
        "judge_run",
        &[
            ("engine", P::S(engine)),
            ("outcome", P::S(outcome)),
            ("ms_bucket", P::S(ms_bucket(elapsed.as_millis()))),
        ],
    );
}

/// The judge gave no verdict. Not counted when there's no judge here at all.
pub fn judge_failed(engine: &'static str, e: crate::agent::judge::JudgeError, elapsed: Duration) {
    use crate::agent::judge::JudgeError;
    let (outcome, kind) = match e {
        JudgeError::Unavailable => return,
        JudgeError::Unparsable => ("unparsable", "unparsable"),
        JudgeError::TimedOut => ("timeout", "timeout"),
        JudgeError::Limited => ("error", "limited"),
        JudgeError::Offline => ("error", "offline"),
        _ => ("error", "failed"),
    };
    judge_run(engine, outcome, elapsed);
    error("judge", kind);
}

/// The type of an answer, for 👍/👎 by answer type.
pub fn answer_kind(
    web: bool,
    about_screen: bool,
    given_context: bool,
    write: bool,
) -> &'static str {
    if write {
        "write"
    } else if web {
        "web"
    } else if about_screen {
        "about_screen"
    } else if given_context {
        "recall"
    } else {
        "answer"
    }
}

/// The next routed request was heard by the wake phrase, not a key.
pub fn next_route_from_wake() {
    set(&NEXT_SOURCE, "wake");
}

/// Where a request went. `route` is `router::route_name`.
pub fn route(route: &'static str, ask_key: bool, had_focus_field: bool) {
    let source = take(&NEXT_SOURCE).unwrap_or(if ask_key { "ask_key" } else { "dictation_key" });
    // Asking the agent while "Did you mean to type this?" is up answers it.
    if source != "dictation_key"
        && DID_YOU_MEAN
            .lock()
            .ok()
            .and_then(|mut g| g.take())
            .is_some()
    {
        did_you_mean_result("asked");
    }
    record(
        "route",
        &[
            ("route", P::S(route)),
            ("source", P::S(source)),
            ("had_focus_field", P::B(had_focus_field)),
        ],
    );
}

/// "Did you mean to type this?" was shown (HUD id `id`).
pub fn did_you_mean_shown(id: &str) {
    set(&DID_YOU_MEAN, id.to_string());
    record("did_you_mean_shown", &[]);
}

/// What happened to it: typed, asked or dismissed.
pub fn did_you_mean_result(result: &'static str) {
    record("did_you_mean_result", &[("result", P::S(result))]);
}

/// Watches HUD actions for the "Did you mean" card's outcome.
fn on_hud_action(id: &str, action: &str) {
    let mine = DID_YOU_MEAN
        .lock()
        .ok()
        .is_some_and(|g| g.as_deref() == Some(id));
    if !mine {
        return;
    }
    let result = match action {
        "insert" | "copy" => "typed",
        // "Ask Ambient instead".
        "ask" => "asked",
        "dismiss" | "expire" => "dismissed",
        _ => return,
    };
    if let Ok(mut g) = DID_YOU_MEAN.lock() {
        *g = None;
    }
    did_you_mean_result(result);
}

/// An answer card finished: time to its first words and to the end.
pub fn answer_latency(first: Option<Duration>, total: Duration, web: bool) {
    record(
        "answer_latency",
        &[
            (
                "first_card_ms_bucket",
                P::S(ms_bucket(first.unwrap_or(total).as_millis())),
            ),
            ("total_ms_bucket", P::S(ms_bucket(total.as_millis()))),
            ("web", P::B(web)),
        ],
    );
}

/// An action the agent took. `kind`: reminder, calendar, open_app, shortcut,
/// unsupported. `outcome`: ok, fallback (done another way, or an
/// alternative offered: an .ics instead of a reminder), failed.
pub fn act(kind: Option<&'static str>, outcome: &'static str) {
    let Some(kind) = kind else {
        return;
    };
    record(
        "act",
        &[
            ("kind", P::S(kind)),
            ("outcome", P::S(outcome)),
            ("platform", P::S(os_family())),
        ],
    );
    if outcome == "failed" {
        error("act", "failed");
    }
}

/// A failure, by area and kind (see the schema's lists).
pub fn error(area: &'static str, kind: &'static str) {
    record("error", &[("area", P::S(area)), ("kind", P::S(kind))]);
}

/// A failure toast the UI showed (`src/lib/errors.ts` `showError`): its
/// context and friendly kind, mapped onto the schema's `error` event. Only
/// these fixed names are counted; anything else is ignored.
#[tauri::command]
#[specta::specta]
pub fn record_ui_error(context: String, kind: String) {
    let area = match context.as_str() {
        "download" => "download",
        "model" => "model",
        "transcription" | "file" => "transcription",
        "recording" => "audio",
        "signIn" | "billing" => "account",
        "update" => "update",
        "meeting" => "meeting",
        _ => "other",
    };
    let kind = match kind.as_str() {
        "offline" => "offline",
        "timeout" => "timeout",
        "notFound" => "not_found",
        "diskFull" => "disk_full",
        "checksum" => "checksum",
        "permission" => "permission",
        "server" => "server",
        _ => "failed",
    };
    error(area, kind);
}

/// The error kind behind an i18n status key or error message, coarsely.
pub fn error_kind(message: &str) -> &'static str {
    let m = message.to_lowercase();
    if m.contains("offline") || m.contains("connect") || m.contains("dns") || m.contains("reach") {
        "offline"
    } else if m.contains("timeout") || m.contains("timed") || m.contains("slow") {
        "timeout"
    } else if m.contains("limit") || m.contains("fairuse") || m.contains("fair_use") {
        "limited"
    } else if m.contains("permission") || m.contains("access") {
        "permission"
    } else if m.contains("server") || m.contains("upstream") {
        "server"
    } else {
        "failed"
    }
}

/// A meeting ended. `outcome`: notes, empty or failed.
pub fn meeting(outcome: &'static str, secs: i64) {
    record(
        "meeting",
        &[
            ("outcome", P::S(outcome)),
            ("duration_bucket", P::S(duration_bucket(secs))),
        ],
    );
}

/// A dictation was processed (1 in 10 is counted).
pub fn dictation(polish: bool, elapsed: Duration) {
    if !enabled() {
        return;
    }
    if !DICTATIONS
        .fetch_add(1, Ordering::Relaxed)
        .is_multiple_of(DICTATION_SAMPLE)
    {
        return;
    }
    record(
        "dictation",
        &[
            ("polish", P::B(polish)),
            ("ms_bucket", P::S(ms_bucket(elapsed.as_millis()))),
        ],
    );
}

/// Smart writing's decision for one dictation: `as_said`, `polished` or
/// `written`, by `rules` or a `model`, in a coarse app category.
pub fn write_mode(decision: &'static str, source: &'static str, app: &str) {
    record(
        "write_mode",
        &[
            ("decision", P::S(decision)),
            ("source", P::S(source)),
            ("app_category", P::S(app_category(app))),
        ],
    );
}

/// "Use my words" took back a `polished` or `written` insertion, by a
/// `click` on the chip or by `voice`.
pub fn write_revert(decision: &'static str, by: &'static str) {
    record(
        "write_revert",
        &[("decision", P::S(decision)), ("by", P::S(by))],
    );
}

/// 👍/👎 on a card.
pub fn card_rating(card: &'static str, kind: &str, up: bool) {
    let Some(kind) = rating_kind(kind) else {
        return;
    };
    record(
        "card_rating",
        &[
            ("card", P::S(card)),
            ("kind", P::S(kind)),
            ("rating", P::S(if up { "up" } else { "down" })),
        ],
    );
}

/// Meeting notes were emailed (or failed to be).
pub fn meeting_email(always: bool, sent: bool) {
    record(
        "meeting_email",
        &[
            ("mode", P::S(if always { "always" } else { "ask" })),
            ("outcome", P::S(if sent { "sent" } else { "failed" })),
        ],
    );
}

/// Free reached one of its limits (`ai`, `suggestions` or `meetings`).
/// Counted once per period (week, or month for meetings) per install.
pub fn limit_hit(kind: &'static str) {
    record("limit_hit", &[("kind", P::S(kind))]);
}

/// A suggestion kind's name as a `'static` from the allowlist, if it is one.
fn known(kind: &str) -> Option<&'static str> {
    static KINDS: Lazy<Vec<&'static str>> = Lazy::new(|| {
        let raw: Value = serde_json::from_str(SCHEMA_JSON).unwrap_or_default();
        raw["enums"]["suggestion_kind"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| &*Box::leak(s.to_string().into_boxed_str()))
                    .collect()
            })
            .unwrap_or_default()
    });
    KINDS.iter().copied().find(|k| *k == kind)
}

fn rating_kind(kind: &str) -> Option<&'static str> {
    known(kind).or(match kind {
        "answer" => Some("answer"),
        "web" => Some("web"),
        "recall" => Some("recall"),
        "write" => Some("write"),
        "about_screen" => Some("about_screen"),
        _ => None,
    })
}

// ── install id ────────────────────────────────────────────────────────────

/// A random id for this install, made here, replaced every 30 days. Not tied
/// to the machine, the account or the license.
pub fn install_id(app: &AppHandle) -> Option<String> {
    let store = app.store(crate::portable::store_path(STORE_PATH)).ok()?;
    let now = chrono::Utc::now().timestamp();
    let id = store
        .get("install_id")
        .and_then(|v| v.as_str().map(str::to_string));
    let made = store
        .get("install_id_created")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if let Some(id) = id.filter(|i| i.len() == 32 && now - made < ROTATE_AFTER_SECS) {
        return Some(id);
    }
    let id = random_id()?;
    store.set("install_id", id.clone());
    store.set("install_id_created", now);
    let _ = store.save();
    Some(id)
}

fn random_id() -> Option<String> {
    use ring::rand::SecureRandom;
    let mut bytes = [0u8; 16];
    ring::rand::SystemRandom::new().fill(&mut bytes).ok()?;
    Some(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

// ── sending ───────────────────────────────────────────────────────────────

fn batch_body(app: &AppHandle, rows: &[Row]) -> Option<String> {
    let install = install_id(app)?;
    let events: Vec<Value> = rows
        .iter()
        .map(|r| json!({ "name": r.name, "props": r.props, "n": r.n }))
        .collect();
    Some(
        json!({
            "v": 1,
            "install": install,
            "version": env!("CARGO_PKG_VERSION"),
            "os": os_family(),
            "plan": plan_name(crate::plan::status(app).plan),
            "events": events,
        })
        .to_string(),
    )
}

/// Send what's queued. Rows are put back when the server can't be reached,
/// and dropped when it refuses them (4xx: retrying won't help).
fn send(app: &AppHandle, timeout: Duration) {
    if !enabled() || SENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let rows: Vec<Row> = {
        let mut q = QUEUE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let keys: Vec<String> = q.keys().take(MAX_EVENTS_PER_BATCH).cloned().collect();
        keys.into_iter().filter_map(|k| q.remove(&k)).collect()
    };
    if rows.is_empty() {
        SENDING.store(false, Ordering::SeqCst);
        return;
    }
    *LAST_SENT
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Instant::now();
    let ok = match batch_body(app, &rows) {
        // Exactly what leaves, before it leaves. No ledger, no upload.
        Some(body) if crate::recall::get().is_some() => {
            let url = format!("{}/api/telemetry", crate::agent::answer::api_base());
            crate::recall::log_request(&host_of(&url), "telemetry", &body);
            post(&url, body, timeout)
        }
        _ => Some(false),
    };
    if ok == Some(false) {
        // Couldn't send: keep the counts for the next try.
        let mut q = QUEUE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for r in rows {
            let key = format!(
                "{}|{}",
                r.name,
                Value::Object(r.props.clone().into_iter().collect())
            );
            if q.len() < MAX_ROWS || q.contains_key(&key) {
                let e = q.entry(key).or_insert(Row { n: 0, ..r.clone() });
                e.n = (e.n + r.n).min(MAX_COUNT);
            }
        }
    }
    SENDING.store(false, Ordering::SeqCst);
}

/// Some(true) sent, Some(false) not reached (keep the rows), None refused.
fn post(url: &str, body: String, timeout: Duration) -> Option<bool> {
    let url = url.to_string();
    let run = async move {
        let res = reqwest::Client::new()
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body)
            .timeout(timeout)
            .send()
            .await;
        match res {
            Ok(r) if r.status().is_success() => Some(true),
            Ok(r) if r.status().is_client_error() && r.status().as_u16() != 429 => {
                log::warn!("telemetry: the server refused the batch ({})", r.status());
                None
            }
            Ok(_) | Err(_) => Some(false),
        }
    };
    std::thread::scope(|s| {
        s.spawn(|| tauri::async_runtime::block_on(run))
            .join()
            .unwrap_or(Some(false))
    })
}

pub(crate) fn host_of(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("")
        .to_string()
}

/// Read the setting and start the sender. Call once at startup.
pub fn init(app: &AppHandle) {
    ENABLED.store(
        crate::settings::get_settings(app).telemetry,
        Ordering::Relaxed,
    );
    *LAST_SENT
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Instant::now();
    app.listen("hud-action", |event| {
        if let Ok(a) = serde_json::from_str::<crate::hud::HudActionEvent>(event.payload()) {
            on_hud_action(&a.id, &a.action);
        }
    });
    let handle = app.clone();
    let spawned = std::thread::Builder::new()
        .name("telemetry".into())
        .spawn(move || loop {
            std::thread::sleep(TICK);
            let due = LAST_SENT
                .lock()
                .map(|t| t.elapsed() >= SEND_EVERY)
                .unwrap_or(false);
            if due && enabled() {
                send(&handle, SEND_TIMEOUT);
            }
        });
    if let Err(e) = spawned {
        log::warn!("telemetry: couldn't start the sender: {e}");
    }
}

/// Quitting: one quick, best-effort send of what's left.
pub fn flush_on_quit(app: &AppHandle) {
    if enabled() {
        send(app, QUIT_TIMEOUT);
    }
}

/// Turn anonymous usage counts on or off. Off clears anything queued.
#[tauri::command]
#[specta::specta]
pub fn change_telemetry_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mut s = crate::settings::get_settings(&app);
    s.telemetry = enabled;
    crate::settings::write_settings(&app, s);
    ENABLED.store(enabled, Ordering::Relaxed);
    if !enabled {
        QUEUE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    } else {
        // The first batch waits a full interval after opting in.
        *LAST_SENT
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Instant::now();
    }
    log::info!("telemetry: {}", if enabled { "on" } else { "off" });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn props(p: &[(&str, P)]) -> BTreeMap<String, Value> {
        p.iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    match v {
                        P::S(s) => json!(s),
                        P::B(b) => json!(b),
                    },
                )
            })
            .collect()
    }

    #[test]
    fn schema_parses_and_lists_every_event() {
        let s = parse_schema(SCHEMA_JSON).unwrap();
        for name in [
            "suggestion_offered",
            "suggestion_result",
            "judge_run",
            "route",
            "did_you_mean_shown",
            "did_you_mean_result",
            "answer_latency",
            "act",
            "error",
            "meeting",
            "dictation",
            "card_rating",
            "meeting_email",
            "write_mode",
            "write_revert",
            "limit_hit",
        ] {
            assert!(s.events.contains_key(name), "{name}");
        }
        assert_eq!(s.ms.len(), 8);
        assert_eq!(s.duration.len(), 5);
    }

    #[test]
    fn allowlist_accepts_exact_props_only() {
        let s = parse_schema(SCHEMA_JSON).unwrap();
        let ok = props(&[
            ("engine", P::S("device")),
            ("outcome", P::S("timeout")),
            ("ms_bucket", P::S("lt5s")),
        ]);
        assert!(valid(&s, "judge_run", &ok));
        // A value outside the list.
        let mut bad = ok.clone();
        bad.insert("engine".into(), json!("gpt"));
        assert!(!valid(&s, "judge_run", &bad));
        // An extra prop (e.g. a title) is never allowed.
        let mut extra = ok.clone();
        extra.insert("title".into(), json!("Inbox"));
        assert!(!valid(&s, "judge_run", &extra));
        // A missing prop.
        let mut missing = ok.clone();
        missing.remove("ms_bucket");
        assert!(!valid(&s, "judge_run", &missing));
        // Free text where a bucket is expected.
        let mut text = ok;
        text.insert("ms_bucket".into(), json!("1234"));
        assert!(!valid(&s, "judge_run", &text));
        // Unknown events.
        assert!(!valid(&s, "keystrokes", &BTreeMap::new()));
        // Booleans must be booleans.
        assert!(valid(
            &s,
            "route",
            &props(&[
                ("route", P::S("answer")),
                ("source", P::S("wake")),
                ("had_focus_field", P::B(false))
            ])
        ));
        assert!(!valid(
            &s,
            "route",
            &props(&[
                ("route", P::S("answer")),
                ("source", P::S("wake")),
                ("had_focus_field", P::S("false"))
            ])
        ));
        assert!(valid(&s, "did_you_mean_shown", &BTreeMap::new()));
        // Smart writing: a decision and a revert, never the text.
        assert!(valid(
            &s,
            "write_mode",
            &props(&[
                ("decision", P::S("written")),
                ("source", P::S("rules")),
                (
                    "app_category",
                    P::S(app_category("com.tinyspeck.slackmacgap"))
                )
            ])
        ));
        assert!(valid(
            &s,
            "write_revert",
            &props(&[("decision", P::S("polished")), ("by", P::S("voice"))])
        ));
        assert!(!valid(
            &s,
            "write_revert",
            &props(&[("decision", P::S("as_said")), ("by", P::S("click"))])
        ));
    }

    #[test]
    fn invalid_events_are_never_queued() {
        let s = parse_schema(SCHEMA_JSON).unwrap();
        assert!(!push(&s, "test_invalid_event", &[("text", P::S("hello"))]));
    }

    #[test]
    fn identical_events_merge_into_one_row() {
        let s = parse_schema(SCHEMA_JSON).unwrap();
        QUEUE.lock().unwrap().clear();
        for _ in 0..3 {
            assert!(push(
                &s,
                "did_you_mean_result",
                &[("result", P::S("typed"))]
            ));
        }
        let q = QUEUE.lock().unwrap();
        let row = q
            .values()
            .find(|r| r.name == "did_you_mean_result")
            .unwrap();
        assert_eq!(row.n, 3);
    }

    #[test]
    fn every_helper_value_is_in_the_allowlist() {
        let s = parse_schema(SCHEMA_JSON).unwrap();
        let Spec::OneOf(ms) = &s.events["judge_run"]["ms_bucket"] else {
            panic!()
        };
        for v in [
            0, 249, 250, 999, 1_000, 4_999, 9_999, 29_999, 30_000, 10_000_000,
        ] {
            assert!(ms.contains(&ms_bucket(v).to_string()), "{v}");
        }
        let Spec::OneOf(dur) = &s.events["meeting"]["duration_bucket"] else {
            panic!()
        };
        for v in [-5, 0, 299, 300, 899, 1_799, 3_599, 3_600, 99_999] {
            assert!(dur.contains(&duration_bucket(v).to_string()), "{v}");
        }
        let Spec::OneOf(cats) = &s.events["suggestion_offered"]["app_category"] else {
            panic!()
        };
        for app in [
            "com.apple.Safari",
            "com.apple.mail",
            "com.tinyspeck.slackmacgap",
            "com.microsoft.VSCode",
            "com.googlecode.iterm2",
            "com.spotify.client",
        ] {
            assert!(cats.contains(&app_category(app).to_string()), "{app}");
        }
        for k in crate::agent::proactive::Kind::ALL {
            assert!(known(k.name()).is_some(), "{}", k.name());
        }
        assert!(known("meeting_nudge").is_some());
    }

    #[test]
    fn buckets_and_categories() {
        assert_eq!(ms_bucket(120), "lt250");
        assert_eq!(ms_bucket(1_500), "lt2s");
        assert_eq!(ms_bucket(45_000), "ge30s");
        assert_eq!(duration_bucket(20 * 60), "lt30m");
        assert_eq!(app_category("com.apple.Safari"), "browser");
        assert_eq!(app_category("com.apple.mail"), "mail");
        assert_eq!(app_category("com.apple.Terminal"), "terminal");
        assert_eq!(app_category("com.tinyspeck.slackmacgap"), "chat");
        assert_eq!(app_category("com.microsoft.VSCode"), "editor");
        assert_eq!(app_category("com.spotify.client"), "other");
    }

    #[test]
    fn rating_kinds() {
        assert_eq!(rating_kind("summarise_thread"), Some("summarise_thread"));
        assert_eq!(rating_kind("web"), Some("web"));
        assert_eq!(rating_kind("Inbox — Gmail"), None);
    }
}
