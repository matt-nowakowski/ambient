//! Plans, sign-in and the Pro token.
//!
//! Free has a weekly word allowance (`freeWordsPerWeek` in brand.config.json).
//! Pro and Team are unlimited, unlocked by a signed token the website issues
//! (see web/). The token is verified offline:
//!
//!   `<prefix>` + base64url(payload JSON) + "." + base64url(Ed25519 signature)
//!
//! The signature covers the base64url payload segment. `exp` is the end of the
//! paid period plus a grace window. The token is also the credential for our
//! hosted AI.
//!
//! People never see that token. Paid customers sign in with their email and a
//! 6-digit code (`/api/auth/code`, `/api/auth/verify`); the server answers
//! with a long-lived signed session and, while an Ambient subscription is
//! live, the signed token. The session is traded at `/api/auth/refresh` every
//! few hours and when the window gains focus, so renewals, cancellations and
//! refunds reach the app. Free and the trial never need an account; the trial
//! token comes from `/api/trial` on first launch.
//!
//! Gift and support codes (`red-grizzly-4320`) redeem once at
//! `/api/license/activate` for a token, which renews through
//! `/api/license/refresh` while its subscription stays active.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use chrono::{Datelike, Duration, Local, TimeZone, Utc};
use log::{info, warn};
use once_cell::sync::Lazy;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

pub(crate) const STORE_PATH: &str = "plan.json";
const LICENSE_KEY_FIELD: &str = "license_key";
/// Where the stored token came from: `"account"` (sign-in) or `"code"`.
/// Only an account token is removed when the account has no subscription.
const LICENSE_SOURCE_FIELD: &str = "license_source";
/// The signed sign-in session (server HMAC; opaque to the app).
const SESSION_FIELD: &str = "account_session";
const ACCOUNT_EMAIL_FIELD: &str = "account_email";
/// Prefix of sign-in errors the UI translates (`account.signIn.errors.*`).
const AUTH_ERROR_PREFIX: &str = "auth_error:";
/// The human code (`red-grizzly-4320`) the stored token was activated with.
const LICENSE_CODE_FIELD: &str = "license_code";
/// Prefix of code-redeem errors the UI translates (`account.card.errors.*`).
const ERROR_PREFIX: &str = "license_error:";
/// Set once the first-launch trial has been asked for (granted or not).
const TRIAL_REQUESTED_FIELD: &str = "trial_requested";
const USAGE_FIELD: &str = "usage";
/// The billing period the server sent with the stored token (servers from
/// 0.1.20 on), saved with that token's `exp` so it never outlives it.
const BILLING_FIELD: &str = "billing_period";
/// The server's grace after the paid period: a subscription's token expires
/// at period end + this (`GRACE_SECONDS` in web/lib/license.ts).
const GRACE_SECS: i64 = 7 * 24 * 3600;
/// Trade a redeemed code's token for a fresh one this long before it expires.
const REFRESH_BEFORE_SECS: i64 = 5 * 24 * 3600;
/// How often the background task checks whether a refresh is due.
const REFRESH_CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(6 * 3600);

/// Serializes read-modify-write of the usage counter across paste threads.
static USAGE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// The email and signed challenge of the code in flight. Memory only: a code
/// outlives neither its 10 minutes nor a restart.
static PENDING_SIGN_IN: Lazy<Mutex<Option<(String, String)>>> = Lazy::new(|| Mutex::new(None));
/// When the account was last checked, and when checkout was last opened.
static LAST_ACCOUNT_CHECK: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));
static CHECKOUT_OPENED: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum Plan {
    Free,
    Pro,
    Team,
    /// The no-card Pro trial issued on first launch.
    Trial,
}

#[derive(Deserialize, Clone, Debug)]
struct LicensePayload {
    #[allow(dead_code)]
    v: u32,
    #[allow(dead_code)]
    sub: String,
    email: String,
    plan: String,
    exp: i64,
}

/// When the paid period really ends and whether it renews, as the server
/// reports it next to a token. Both optional: older servers send neither.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
struct BillingPeriod {
    #[serde(default, rename = "periodEnd")]
    period_end: Option<i64>,
    #[serde(default, rename = "cancelAtPeriodEnd")]
    cancel_at_period_end: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct WeeklyUsage {
    /// Unix seconds of the local Monday 00:00 this count belongs to.
    week_start: i64,
    words: u64,
}

#[derive(Serialize, Clone, Debug, Type)]
pub struct PlanStatus {
    pub plan: Plan,
    /// Email in the active Pro token; `None` on Free.
    pub email: Option<String>,
    /// Unix seconds when the stored token stops working without a refresh.
    pub license_expires_at: Option<f64>,
    /// Unix seconds the paid period ends (Pro/Team only): the renewal date,
    /// or the last day when `cancel_at_period_end`. The token runs a 7-day
    /// grace past it.
    pub period_end: Option<f64>,
    /// The subscription is set to end at `period_end` rather than renew.
    pub cancel_at_period_end: bool,
    /// Why a stored token isn't granting a paid plan (expired, invalid).
    pub license_problem: Option<String>,
    /// The gift or support code (`red-grizzly-4320`) the active Pro/Team
    /// token was redeemed with; `None` on Free, the trial, or after sign-in.
    pub license_code: Option<String>,
    /// The email signed in on this device, on any plan; `None` when signed out.
    pub account_email: Option<String>,
    pub words_this_week: u32,
    /// `None` when unlimited.
    pub weekly_word_limit: Option<u32>,
    /// Unix seconds when the weekly count resets.
    pub week_resets_at: f64,
}

fn free_words_per_week() -> u64 {
    env!("BRAND_FREE_WORDS_PER_WEEK").parse().unwrap_or(2000)
}

/// `enforceFreeWordLimit` in brand.config.json. Off, Free is unlimited (the
/// app has no word limit) while usage is still counted.
fn free_limit_enforced() -> bool {
    env!("BRAND_ENFORCE_FREE_WORD_LIMIT") == "true"
}

/// Verifies a token's signature and parses its payload. Ignores `exp`, so an
/// expired token can still be refreshed; callers check expiry themselves.
/// Errors can reach the Account page (`license_problem`), so they speak of
/// the account, not the token.
fn verify_key(key: &str) -> Result<LicensePayload, String> {
    const DAMAGED: &str = "Your saved Pro access is damaged. Sign in again.";
    let body = key
        .trim()
        .strip_prefix(env!("BRAND_LICENSE_KEY_PREFIX"))
        .ok_or("Your saved Pro access isn't recognised. Sign in again.")?;
    let (payload_b64, sig_b64) = body.split_once('.').ok_or(DAMAGED)?;
    let sig = URL_SAFE_NO_PAD.decode(sig_b64).map_err(|_| DAMAGED)?;
    let public_key = STANDARD
        .decode(env!("BRAND_LICENSE_PUBLIC_KEY"))
        .map_err(|_| "This build can't check Pro access. Reinstall the app.")?;
    UnparsedPublicKey::new(&ED25519, public_key)
        .verify(payload_b64.as_bytes(), &sig)
        .map_err(|_| "Your saved Pro access isn't valid. Sign in again.")?;
    let payload = URL_SAFE_NO_PAD.decode(payload_b64).map_err(|_| DAMAGED)?;
    serde_json::from_slice(&payload).map_err(|_| DAMAGED.to_string())
}

fn plan_from_payload(payload: &LicensePayload) -> Plan {
    match payload.plan.as_str() {
        "team" => Plan::Team,
        "trial" => Plan::Trial,
        _ => Plan::Pro,
    }
}

fn now() -> i64 {
    Utc::now().timestamp()
}

/// Local Monday 00:00 of the current week, and the next one.
pub(crate) fn current_week() -> (i64, i64) {
    let today = Local::now().date_naive();
    let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let midnight = |date: chrono::NaiveDate| {
        Local
            .from_local_datetime(&date.and_hms_opt(0, 0, 0).expect("midnight is valid"))
            .earliest()
            .map(|d| d.timestamp())
    };
    let start = midnight(monday).unwrap_or_else(now);
    // Not start + 168h: a week spanning a DST change is an hour off.
    let end = midnight(monday + Duration::days(7)).unwrap_or(start + 7 * 24 * 3600);
    (start, end)
}

fn stored_key(app: &AppHandle) -> Option<String> {
    let store = app.store(crate::portable::store_path(STORE_PATH)).ok()?;
    store
        .get(LICENSE_KEY_FIELD)
        .and_then(|v| v.as_str().map(str::to_string))
}

fn save_key(app: &AppHandle, key: Option<&str>) -> Result<(), String> {
    let store = app
        .store(crate::portable::store_path(STORE_PATH))
        .map_err(|e| e.to_string())?;
    match key {
        Some(key) => store.set(LICENSE_KEY_FIELD, key),
        None => {
            store.delete(LICENSE_KEY_FIELD);
        }
    }
    store.save().map_err(|e| e.to_string())
}

fn stored_str(app: &AppHandle, field: &str) -> Option<String> {
    let store = app.store(crate::portable::store_path(STORE_PATH)).ok()?;
    store
        .get(field)
        .and_then(|v| v.as_str().map(str::to_string))
}

fn save_str(app: &AppHandle, field: &str, value: Option<&str>) -> Result<(), String> {
    let store = app
        .store(crate::portable::store_path(STORE_PATH))
        .map_err(|e| e.to_string())?;
    match value {
        Some(value) => store.set(field, value),
        None => {
            store.delete(field);
        }
    }
    store.save().map_err(|e| e.to_string())
}

fn stored_code(app: &AppHandle) -> Option<String> {
    stored_str(app, LICENSE_CODE_FIELD)
}

fn save_code(app: &AppHandle, code: Option<&str>) -> Result<(), String> {
    save_str(app, LICENSE_CODE_FIELD, code)
}

fn stored_session(app: &AppHandle) -> Option<String> {
    stored_str(app, SESSION_FIELD)
}

/// The signed sign-in session, for endpoints that act on the account (meeting
/// notes by email). None when signed out.
pub fn session_token(app: &AppHandle) -> Option<String> {
    stored_session(app)
}

/// The signed-in account's email, while signed in.
pub fn account_email(app: &AppHandle) -> Option<String> {
    if let Some(s) = crate::testing::scenario() {
        return s.me.email.clone();
    }
    stored_session(app).and(stored_str(app, ACCOUNT_EMAIL_FIELD))
}

fn license_from_account(app: &AppHandle) -> bool {
    stored_str(app, LICENSE_SOURCE_FIELD).as_deref() == Some("account")
}

/// Canonical human code (`red-grizzly-4320`) from what someone typed or
/// pasted, or `None` if it can't be one. Mirrors `normalizeCode` in
/// web/lib/license-code-core.ts (minus the word lists, which the server
/// checks): any case, spaces/underscores/dots/repeated hyphens between the
/// parts, and an optional `<slug>` prefix.
fn normalize_code(input: &str) -> Option<String> {
    if input.len() > 100 {
        return None;
    }
    let lower = input.trim().to_ascii_lowercase();
    let mut parts: Vec<&str> = lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() == 4 && parts[0] == env!("BRAND_SLUG") {
        parts.remove(0);
    }
    let [adj, noun, digits] = parts.as_slice() else {
        return None;
    };
    let word = |w: &str| (2..=9).contains(&w.len()) && w.bytes().all(|b| b.is_ascii_lowercase());
    let four_digits = digits.len() == 4 && digits.bytes().all(|b| b.is_ascii_digit());
    (word(adj) && word(noun) && four_digits).then(|| format!("{adj}-{noun}-{digits}"))
}

fn usage(app: &AppHandle) -> WeeklyUsage {
    let (week_start, _) = current_week();
    let stored = app
        .store(crate::portable::store_path(STORE_PATH))
        .ok()
        .and_then(|s| s.get(USAGE_FIELD))
        .and_then(|v| serde_json::from_value::<WeeklyUsage>(v).ok())
        .unwrap_or_default();
    if stored.week_start == week_start {
        stored
    } else {
        WeeklyUsage {
            week_start,
            words: 0,
        }
    }
}

/// The active paid token, if the stored one is valid and unexpired.
fn active_license(app: &AppHandle) -> (Option<LicensePayload>, Option<String>) {
    let Some(key) = stored_key(app) else {
        return (None, None);
    };
    match verify_key(&key) {
        Ok(payload) if payload.exp > now() => (Some(payload), None),
        Ok(_) => (
            None,
            Some("Your subscription has ended. Renew to keep unlimited dictation.".into()),
        ),
        Err(e) => (None, Some(e)),
    }
}

/// Saves the billing period that came with a token, or clears it when the
/// server sent none (an older server), so a stale one is never shown.
fn save_billing(app: &AppHandle, key: &str, billing: BillingPeriod) -> Result<(), String> {
    let store = app
        .store(crate::portable::store_path(STORE_PATH))
        .map_err(|e| e.to_string())?;
    match (verify_key(key), billing.period_end) {
        (Ok(payload), Some(_)) => store.set(
            BILLING_FIELD,
            serde_json::json!({ "exp": payload.exp, "billing": billing }),
        ),
        _ => {
            store.delete(BILLING_FIELD);
        }
    }
    store.save().map_err(|e| e.to_string())
}

/// The saved billing period and the token `exp` it belongs to.
fn stored_billing(app: &AppHandle) -> Option<(i64, BillingPeriod)> {
    let store = app.store(crate::portable::store_path(STORE_PATH)).ok()?;
    let v = store.get(BILLING_FIELD)?;
    let exp = v.get("exp")?.as_i64()?;
    let billing = serde_json::from_value(v.get("billing")?.clone()).ok()?;
    Some((exp, billing))
}

/// Period end and whether it's cancelled, for a paid token. Uses what the
/// server sent with this exact token; otherwise (an older server, or a token
/// from before 0.1.20) the token's expiry less the grace, assumed to renew.
fn period_for(
    plan: Plan,
    token_exp: i64,
    saved: Option<(i64, BillingPeriod)>,
) -> (Option<f64>, bool) {
    if !matches!(plan, Plan::Pro | Plan::Team) {
        return (None, false);
    }
    match saved {
        Some((
            exp,
            BillingPeriod {
                period_end: Some(end),
                cancel_at_period_end,
            },
        )) if exp == token_exp => (Some(end as f64), cancel_at_period_end.unwrap_or(false)),
        _ => (Some((token_exp - GRACE_SECS) as f64), false),
    }
}

pub fn status(app: &AppHandle) -> PlanStatus {
    let (license, license_problem) = active_license(app);
    let (_, week_end) = current_week();
    let words = usage(app).words.min(u32::MAX as u64) as u32;
    let stored_exp = stored_key(app)
        .and_then(|k| verify_key(&k).ok())
        .map(|p| p.exp as f64);
    let account_email = account_email(app);
    match license {
        Some(payload) => {
            let plan = plan_from_payload(&payload);
            let (period_end, cancel_at_period_end) =
                period_for(plan, payload.exp, stored_billing(app));
            PlanStatus {
                plan,
                license_code: matches!(plan_from_payload(&payload), Plan::Pro | Plan::Team)
                    .then(|| stored_code(app))
                    .flatten(),
                email: Some(payload.email),
                license_expires_at: stored_exp,
                period_end,
                cancel_at_period_end,
                license_problem: None,
                account_email,
                words_this_week: words,
                weekly_word_limit: None,
                week_resets_at: week_end as f64,
            }
        }
        None => PlanStatus {
            plan: Plan::Free,
            email: None,
            license_expires_at: stored_exp,
            period_end: None,
            cancel_at_period_end: false,
            license_problem,
            license_code: None,
            account_email,
            words_this_week: words,
            weekly_word_limit: free_limit_enforced().then(|| free_words_per_week() as u32),
            week_resets_at: week_end as f64,
        },
    }
}

/// Whether a new dictation may start. Free users at their weekly allowance are
/// stopped before the mic opens, so they never lose a recording to the cap.
pub fn can_dictate(app: &AppHandle) -> bool {
    if !free_limit_enforced() {
        return true;
    }
    if active_license(app).0.is_some() {
        return true;
    }
    usage(app).words < free_words_per_week()
}

/// Whether a paid plan (Pro, Team or the trial) is active. Free has every
/// feature within weekly limits (`crate::limits`); this lifts them. The cloud
/// suggestion judge is the one Pro-only feature.
pub fn is_paid(app: &AppHandle) -> bool {
    if crate::testing::active() {
        return crate::testing::is_paid();
    }
    active_license(app).0.is_some()
}

/// The stored Pro token (from sign-in, a redeemed code or the trial): the
/// credential for the hosted AI endpoint.
pub fn license_key(app: &AppHandle) -> Option<String> {
    stored_key(app)
}

/// AI polish cleans up every dictation, not only the separate post-process
/// shortcut, when our hosted model or Apple Intelligence is selected and
/// enabled. On Free each polish is an AI use from the weekly pool (hosted
/// ones counted by the server, on-device ones by `consume_local_ai`).
pub fn polish_every_dictation(app: &AppHandle) -> bool {
    let settings = crate::settings::get_settings(app);
    if !settings.post_process_enabled {
        return false;
    }
    match settings
        .active_post_process_provider()
        .map(|p| p.id)
        .as_deref()
    {
        Some(id) => crate::settings::is_pro_post_process_provider(id),
        None => false,
    }
}

/// SHA-256 (hex) of this machine's hardware UUID, salted with the brand.
/// The UUID survives reinstalls, so a trial can't be restarted by
/// reinstalling; only the hash ever leaves the device.
pub fn machine_hash() -> Option<String> {
    static HASH: Lazy<Option<String>> = Lazy::new(|| {
        let id = hardware_uuid()?;
        let digest = ring::digest::digest(
            &ring::digest::SHA256,
            format!("{}:{}", env!("BRAND_SLUG"), id.trim()).as_bytes(),
        );
        Some(digest.as_ref().iter().map(|b| format!("{b:02x}")).collect())
    });
    HASH.clone()
}

// Each platform branch returns early; the trailing None covers the rest.
#[allow(unreachable_code)]
fn hardware_uuid() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        let line = text.lines().find(|l| l.contains("IOPlatformUUID"))?;
        return line.split('"').nth(3).map(str::to_string);
    }
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        return text
            .lines()
            .find(|l| l.contains("MachineGuid"))
            .and_then(|l| l.split_whitespace().last())
            .map(str::to_string);
    }
    #[cfg(target_os = "linux")]
    {
        return std::fs::read_to_string("/etc/machine-id")
            .or_else(|_| std::fs::read_to_string("/var/lib/dbus/machine-id"))
            .ok()
            .filter(|s| !s.trim().is_empty());
    }
    None
}

/// The credential Free users send to the hosted polish endpoint.
pub fn free_polish_token() -> Option<String> {
    machine_hash().map(|h| format!("free_{h}"))
}

#[derive(Deserialize)]
struct TrialResponse {
    key: String,
}

/// On first launch, asks for the no-card Pro trial (once per machine).
async fn start_trial_if_new(app: &AppHandle) {
    let Ok(store) = app.store(crate::portable::store_path(STORE_PATH)) else {
        return;
    };
    if stored_key(app).is_some() || store.get(TRIAL_REQUESTED_FIELD).is_some() {
        return;
    }
    let Some(machine) = machine_hash() else {
        return;
    };
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "trial",
        &format!("Device hash: {machine}"),
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/trial"))
        .json(&serde_json::json!({ "machine": machine }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await;
    let response = match response {
        Ok(r) => r,
        // Offline: try again on the next launch.
        Err(e) => return warn!("Trial request failed: {}", e),
    };
    match response.status().as_u16() {
        200 => match response.json::<TrialResponse>().await {
            Ok(body) if verify_key(&body.key).is_ok() => {
                if save_key(app, Some(&body.key)).is_ok() {
                    info!("Pro trial started");
                    let _ = app.emit("plan-changed", status(app));
                }
            }
            _ => return warn!("Trial response was invalid"),
        },
        // This machine already had its trial.
        409 => info!("Trial already used on this machine"),
        code => return warn!("Trial request returned {}", code),
    }
    store.set(TRIAL_REQUESTED_FIELD, true);
    let _ = store.save();
}

#[derive(Serialize, Deserialize, Clone, Debug, Type)]
pub struct PolishUsage {
    pub used: u32,
    pub limit: u32,
    /// Unix seconds when the weekly allowance resets.
    #[serde(alias = "resetsAt")]
    pub resets_at: f64,
}

/// Free's AI uses this week: the server's hosted count plus on-device uses
/// (one pool), against the server's limit (`free.ai_per_week`).
#[tauri::command]
#[specta::specta]
pub async fn get_polish_usage(app: AppHandle) -> Result<PolishUsage, String> {
    let local = local_ai_used(&app);
    let mut usage = server_polish_usage().await?;
    crate::limits::note_server_usage(usage.used);
    usage.used = usage.used.saturating_add(local);
    Ok(usage)
}

async fn server_polish_usage() -> Result<PolishUsage, String> {
    let machine = machine_hash().ok_or("Could not identify this device.")?;
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        &format!("Device hash: {machine}, to read this week's Free AI uses."),
    );
    let response = reqwest::Client::new()
        .get(api_url("/api/usage"))
        .query(&[("machine", machine)])
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the server: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Server returned {}.", response.status()));
    }
    response.json().await.map_err(|e| e.to_string())
}

const LOCAL_AI_FIELD: &str = "local_ai_uses";
const TODAY_FIELD: &str = "usage_today";

/// Daily fair-use limits on paid plans (mirrors FAIR_USE in web/lib/ai.ts).
pub const FAIR_USE_AI_PER_DAY: u32 = 1_500;
pub const FAIR_USE_SEARCH_PER_DAY: u32 = 100;

/// What the user has used, for the usage shown in the app.
#[derive(Serialize, Clone, Debug, Type)]
pub struct UsageToday {
    /// Requests to our hosted AI today (this Mac).
    pub ai: u32,
    /// Web searches today (this Mac).
    pub search: u32,
    pub ai_limit: u32,
    pub search_limit: u32,
    /// Meetings started this month, and Free's monthly limit (None when unlimited).
    pub meetings: u32,
    pub meetings_limit: Option<u32>,
    /// Suggestions offered this week, and Free's weekly limit (None when unlimited).
    pub suggestions: u32,
    pub suggestions_limit: Option<u32>,
    /// How long Free's screen memory keeps things, in hours (None on paid plans).
    pub memory_hours_limit: Option<u32>,
}

fn today_key() -> String {
    Local::now().date_naive().to_string()
}

/// Count one hosted request ("ai" or "search") made from this Mac today.
pub fn record_hosted_use(app: &AppHandle, kind: &str) {
    let Ok(store) = app.store(crate::portable::store_path(STORE_PATH)) else {
        return;
    };
    let day = today_key();
    let mut v = store
        .get(TODAY_FIELD)
        .filter(|v| v.get("day").and_then(|d| d.as_str()) == Some(day.as_str()))
        .unwrap_or_else(|| serde_json::json!({ "day": day, "ai": 0, "search": 0 }));
    let n = v.get(kind).and_then(|n| n.as_u64()).unwrap_or(0) + 1;
    v[kind] = serde_json::json!(n);
    store.set(TODAY_FIELD, v);
}

#[tauri::command]
#[specta::specta]
pub fn get_usage_today(app: AppHandle) -> UsageToday {
    let day = today_key();
    let today = app
        .store(crate::portable::store_path(STORE_PATH))
        .ok()
        .and_then(|s| s.get(TODAY_FIELD))
        .filter(|v| v.get("day").and_then(|d| d.as_str()) == Some(day.as_str()));
    let count = |k: &str| {
        today
            .as_ref()
            .and_then(|v| v.get(k))
            .and_then(|n| n.as_u64())
            .unwrap_or(0) as u32
    };
    let meetings = crate::recall::get_if_open()
        .and_then(|r| r.meetings_since(crate::limits::month_start()).ok())
        .unwrap_or(0) as u32;
    let free = !is_paid(&app);
    UsageToday {
        ai: count("ai"),
        search: count("search"),
        ai_limit: FAIR_USE_AI_PER_DAY,
        search_limit: FAIR_USE_SEARCH_PER_DAY,
        meetings,
        meetings_limit: crate::limits::meetings_limit(&app),
        suggestions: crate::limits::suggestions_used(&app),
        suggestions_limit: free.then(|| crate::limits::free().suggestions_per_week),
        memory_hours_limit: crate::limits::memory_cap_hours(&app),
    }
}

/// Free's weekly AI allowance also covers work done by Apple Intelligence on
/// this Mac (it costs us nothing, but the allowance is what Pro lifts). Those
/// uses are counted here; hosted ones are counted by the server.
pub fn local_ai_used(app: &AppHandle) -> u32 {
    let (week, _) = current_week();
    let Ok(store) = app.store(crate::portable::store_path(STORE_PATH)) else {
        return 0;
    };
    store
        .get(LOCAL_AI_FIELD)
        .filter(|v| v.get("week").and_then(|w| w.as_i64()) == Some(week))
        .and_then(|v| v.get("count").and_then(|c| c.as_u64()))
        .unwrap_or(0) as u32
}

/// Take one on-device use. Always true on a paid plan or the trial. On
/// Free, false once the week's shared pool (`free.ai_per_week`, on-device
/// and hosted together) is used; callers then say so (`limits::ai_spent`).
pub fn consume_local_ai(app: &AppHandle) -> bool {
    if is_paid(app) {
        return true;
    }
    let _guard = USAGE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if !crate::limits::ai_available(app) {
        return false;
    }
    let used = local_ai_used(app);
    if let Ok(store) = app.store(crate::portable::store_path(STORE_PATH)) {
        let (week, _) = current_week();
        store.set(
            LOCAL_AI_FIELD,
            serde_json::json!({ "week": week, "count": used + 1 }),
        );
    }
    true
}

/// Called when a dictation is refused for the weekly cap.
pub fn notify_limit_reached(app: &AppHandle) {
    info!("Weekly free word allowance reached; dictation blocked until reset or upgrade");
    crate::show_main_window(app);
    let _ = app.emit("plan-limit-reached", status(app));
}

/// Words in dictated text. Space-separated scripts count words; CJK and other
/// unspaced scripts count characters, which is how they're typically measured.
pub fn count_words(text: &str) -> u64 {
    let mut count = 0u64;
    let mut in_word = false;
    for c in text.chars() {
        let unspaced = matches!(c as u32,
            0x3040..=0x30FF | 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xAC00..=0xD7AF
            | 0x0E00..=0x0E7F | 0xF900..=0xFAFF);
        if unspaced {
            count += 1;
            in_word = false;
        } else if c.is_alphanumeric() {
            if !in_word {
                count += 1;
                in_word = true;
            }
        } else if c.is_whitespace() {
            in_word = false;
        }
    }
    count
}

/// Adds dictated words to this week's count and tells the UI.
pub fn record_words(app: &AppHandle, words: u64) {
    if words == 0 {
        return;
    }
    {
        let _guard = USAGE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut current = usage(app);
        current.words += words;
        match app.store(crate::portable::store_path(STORE_PATH)) {
            Ok(store) => {
                store.set(
                    USAGE_FIELD,
                    serde_json::to_value(&current).unwrap_or_default(),
                );
                if let Err(e) = store.save() {
                    warn!("Failed to save word usage: {}", e);
                }
            }
            Err(e) => warn!("Failed to open plan store: {}", e),
        }
    }
    let _ = app.emit("plan-changed", status(app));
}

fn api_url(path: &str) -> String {
    format!(
        "{}{}",
        env!("BRAND_API_BASE_URL").trim_end_matches('/'),
        path
    )
}

#[derive(Deserialize)]
struct RefreshResponse {
    key: String,
    #[serde(flatten)]
    billing: BillingPeriod,
}

/// Trades a redeemed code's token for a fresh one shortly before it expires,
/// if the subscription is still active. Leaves the token alone on network
/// errors (it keeps working until `exp`).
async fn refresh(app: &AppHandle) -> Result<(), String> {
    let Some(key) = stored_key(app) else {
        return Ok(());
    };
    let payload = verify_key(&key)?;
    // A trial ends on its date; only a subscription renews.
    if payload.plan == "trial" {
        return Ok(());
    }
    // A signed-in account's token is renewed by the account check instead.
    if stored_session(app).is_some() && license_from_account(app) {
        return Ok(());
    }
    if payload.exp - now() > REFRESH_BEFORE_SECS {
        return Ok(());
    }
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        "Your Pro access from a redeemed code (a signed token with your email, plan and expiry), to renew it.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/license/refresh"))
        .json(&serde_json::json!({ "key": key }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the account server: {e}"))?;
    match response.status().as_u16() {
        200 => {
            let body: RefreshResponse = response.json().await.map_err(|e| e.to_string())?;
            verify_key(&body.key)?;
            save_key(app, Some(&body.key))?;
            save_billing(app, &body.key, body.billing)?;
            info!("Pro token refreshed");
            let _ = app.emit("plan-changed", status(app));
            Ok(())
        }
        402 => Err("No active subscription for this code.".into()),
        code => Err(format!("Account server returned {code}.")),
    }
}

/// Keeps the account and a redeemed code's token fresh in the background.
pub fn spawn_refresh_task(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        start_trial_if_new(&app).await;
        loop {
            if stored_session(&app).is_some() {
                if let Err(e) = refresh_account_now(&app).await {
                    warn!("Account check: {}", e);
                }
            }
            if let Err(e) = refresh(&app).await {
                warn!("Token refresh: {}", e);
            }
            tokio::time::sleep(REFRESH_CHECK_EVERY).await;
        }
    });
}

#[tauri::command]
#[specta::specta]
pub fn get_plan_status(app: AppHandle) -> PlanStatus {
    status(&app)
}

#[derive(Deserialize)]
struct ActivateResponse {
    key: String,
    code: String,
    #[serde(flatten)]
    billing: BillingPeriod,
}

/// Trades a human code for the signed token at `/api/license/activate`.
/// Errors are `license_error:<kind>` for the UI to translate.
async fn activate_code(code: &str) -> Result<ActivateResponse, String> {
    let err = |kind: &str| format!("{ERROR_PREFIX}{kind}");
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        "The gift or support code you typed and an anonymous device hash, to redeem it on this device.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/license/activate"))
        .json(&serde_json::json!({ "code": code, "machine": machine_hash() }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| {
            warn!("Code redeem request failed: {}", e);
            err("network")
        })?;
    match response.status().as_u16() {
        200 => {
            let body: ActivateResponse = response.json().await.map_err(|_| err("server"))?;
            verify_key(&body.key).map_err(|_| err("server"))?;
            Ok(body)
        }
        400 => Err(err("invalid_code")),
        402 => Err(err("inactive")),
        429 => Err(err("rate_limited")),
        code => {
            warn!("Code redeem returned {}", code);
            Err(err("server"))
        }
    }
}

/// Redeems a gift or support code (online, once) for a Pro token.
/// Errors are `license_error:<kind>`; anything that isn't a code shape is
/// `invalid_code`.
#[tauri::command]
#[specta::specta]
pub async fn activate_license(app: AppHandle, key: String) -> Result<PlanStatus, String> {
    let code = normalize_code(&key).ok_or_else(|| format!("{ERROR_PREFIX}invalid_code"))?;
    let activated = activate_code(&code).await?;
    save_key(&app, Some(&activated.key))?;
    save_billing(&app, &activated.key, activated.billing)?;
    save_code(&app, Some(&activated.code))?;
    save_str(&app, LICENSE_SOURCE_FIELD, Some("code"))?;
    info!("Pro redeemed from a code");
    let status = status(&app);
    let _ = app.emit("plan-changed", status.clone());
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub fn deactivate_license(app: AppHandle) -> Result<PlanStatus, String> {
    save_key(&app, None)?;
    save_code(&app, None)?;
    save_str(&app, LICENSE_SOURCE_FIELD, None)?;
    let status = status(&app);
    let _ = app.emit("plan-changed", status.clone());
    Ok(status)
}

#[derive(Deserialize)]
struct PortalResponse {
    url: String,
}

/// A Polar customer-portal link for the stored token's customer.
#[tauri::command]
#[specta::specta]
pub async fn billing_portal_url(app: AppHandle) -> Result<String, String> {
    let key = stored_key(&app).ok_or("Sign in to manage billing.")?;
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        "Your Pro access (a signed token with your email, plan and expiry), for a billing link.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/billing/portal"))
        .json(&serde_json::json!({ "key": key }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the billing server: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Billing server returned {}.", response.status()));
    }
    let body: PortalResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(body.url)
}

/* ------------------------------------------------------------------ */
/* Email sign-in                                                       */
/* ------------------------------------------------------------------ */

/// Account checks at most this often on focus, by plan; the background loop
/// checks every `REFRESH_CHECK_EVERY` regardless.
const FOCUS_CHECK_FREE: std::time::Duration = std::time::Duration::from_secs(15 * 60);
const FOCUS_CHECK_PAID: std::time::Duration = std::time::Duration::from_secs(60 * 60);
/// Within an hour of opening checkout, check on every focus (30 s apart), so a
/// purchase shows up as soon as the person comes back.
const CHECKOUT_WINDOW: std::time::Duration = std::time::Duration::from_secs(60 * 60);
const FOCUS_CHECK_AFTER_CHECKOUT: std::time::Duration = std::time::Duration::from_secs(30);

fn auth_err(kind: &str) -> String {
    format!("{AUTH_ERROR_PREFIX}{kind}")
}

/// The server's error code from a JSON body (`{"error": "..."}`).
async fn error_kind(response: reqwest::Response) -> Option<String> {
    let body: serde_json::Value = response.json().await.ok()?;
    body.get("error")?.as_str().map(str::to_string)
}

#[derive(Deserialize)]
struct CodeResponse {
    challenge: String,
}

/// What `/api/auth/verify` and `/api/auth/refresh` answer.
#[derive(Deserialize)]
struct AccountResponse {
    session: String,
    email: String,
    /// The signed token while a subscription is live; `None` on Free.
    key: Option<String>,
    #[serde(flatten)]
    billing: BillingPeriod,
}

/// Stores a verified or refreshed account: the session always, the token
/// when there is one. With no subscription, a token that came from the
/// account (cancelled, refunded) is removed; a trial or a redeemed code is
/// left alone.
fn apply_account(app: &AppHandle, account: &AccountResponse) -> Result<(), String> {
    save_str(app, SESSION_FIELD, Some(&account.session))?;
    save_str(app, ACCOUNT_EMAIL_FIELD, Some(&account.email))?;
    match &account.key {
        Some(key) => {
            verify_key(key)?;
            save_key(app, Some(key))?;
            save_billing(app, key, account.billing)?;
            save_code(app, None)?;
            save_str(app, LICENSE_SOURCE_FIELD, Some("account"))?;
        }
        None if license_from_account(app) => {
            info!("Account has no active subscription; removing its Pro token");
            save_key(app, None)?;
            save_str(app, LICENSE_SOURCE_FIELD, None)?;
        }
        None => {}
    }
    Ok(())
}

/// The app's optional "Email me tips" (setup, or Account while signed out):
/// the address, the anonymous device hash, the app language and whether this
/// is Free or the trial, nothing else. The website emails a confirmation link
/// and stores the address only once it's clicked; no IP address is stored.
/// The answer is the same whether or not the address was already on the list.
#[tauri::command]
#[specta::specta]
pub async fn subscribe_tips(app: AppHandle, email: String) -> Result<(), String> {
    let email = email.trim().to_lowercase();
    if email.len() > 254 || !email.contains('@') {
        return Err(auth_err("invalid_email"));
    }
    let Some(machine) = machine_hash() else {
        return Err(auth_err("server"));
    };
    let language: String = crate::settings::get_settings(&app)
        .app_language
        .chars()
        .take(35)
        .collect();
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "tips",
        "Your email address, the app language, Free or trial, and an anonymous device hash, to send you tips.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/subscribe"))
        .json(&serde_json::json!({
            "email": email,
            "machine": machine,
            "language": language,
            // Asked during setup, most people are on their trial.
            "plan": if matches!(status(&app).plan, Plan::Trial) { "trial" } else { "free" },
        }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| {
            warn!("Tips signup failed: {}", e);
            auth_err("network")
        })?;
    match response.status().as_u16() {
        200 => Ok(()),
        400 => Err(auth_err("invalid_email")),
        429 => Err(auth_err("rate_limited")),
        code => {
            warn!("Tips signup returned {}", code);
            Err(auth_err("server"))
        }
    }
}

/// Emails a 6-digit code. The answer is the same whether or not the email has
/// bought anything.
#[tauri::command]
#[specta::specta]
pub async fn request_sign_in_code(email: String) -> Result<(), String> {
    let email = email.trim().to_lowercase();
    if email.len() > 254 || !email.contains('@') {
        return Err(auth_err("invalid_email"));
    }
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        "Your email address, to send you a sign-in code.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/auth/code"))
        .json(&serde_json::json!({ "email": email }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| {
            warn!("Sign-in code request failed: {}", e);
            auth_err("network")
        })?;
    match response.status().as_u16() {
        200 => {
            let body: CodeResponse = response.json().await.map_err(|_| auth_err("server"))?;
            *PENDING_SIGN_IN.lock().unwrap_or_else(|e| e.into_inner()) =
                Some((email, body.challenge));
            Ok(())
        }
        400 => Err(auth_err("invalid_email")),
        429 => Err(auth_err("rate_limited")),
        code => {
            warn!("Sign-in code request returned {}", code);
            Err(auth_err("server"))
        }
    }
}

/// Checks the code for the email the last code went to, then stores the
/// session (and the token, if the email has a live subscription).
#[tauri::command]
#[specta::specta]
pub async fn verify_sign_in_code(app: AppHandle, code: String) -> Result<PlanStatus, String> {
    let (email, challenge) = PENDING_SIGN_IN
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| auth_err("expired"))?;
    let code: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
    if code.len() != 6 {
        return Err(auth_err("invalid_code"));
    }
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        "Your email address and the sign-in code you typed, to sign you in.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/auth/verify"))
        .json(&serde_json::json!({ "email": email, "code": code, "challenge": challenge }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            warn!("Sign-in verify failed: {}", e);
            auth_err("network")
        })?;
    let status_code = response.status().as_u16();
    if status_code == 200 {
        let account: AccountResponse = response.json().await.map_err(|_| auth_err("server"))?;
        apply_account(&app, &account).map_err(|e| {
            warn!("Couldn't store the account: {}", e);
            auth_err("server")
        })?;
        *PENDING_SIGN_IN.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *LAST_ACCOUNT_CHECK.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
        info!("Signed in");
        let status = status(&app);
        let _ = app.emit("plan-changed", status.clone());
        return Ok(status);
    }
    let kind = error_kind(response).await;
    Err(match (status_code, kind.as_deref()) {
        (400, Some("invalid_code")) => auth_err("invalid_code"),
        (400, Some("expired" | "invalid_challenge")) => auth_err("expired"),
        (429, Some("too_many_attempts")) => auth_err("too_many_attempts"),
        (429, _) => auth_err("rate_limited"),
        _ => {
            warn!("Sign-in verify returned {}", status_code);
            auth_err("server")
        }
    })
}

/// Asks the server what the signed-in account has now. Network errors leave
/// everything as it is (the token keeps working until it expires).
async fn refresh_account_now(app: &AppHandle) -> Result<(), String> {
    let Some(session) = stored_session(app) else {
        return Ok(());
    };
    *LAST_ACCOUNT_CHECK.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    crate::recall::log_request(
        env!("BRAND_DOMAIN"),
        "license",
        "Your sign-in session (a signed token with your email), to check your plan.",
    );
    let response = reqwest::Client::new()
        .post(api_url("/api/auth/refresh"))
        .json(&serde_json::json!({ "session": session }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the account server: {e}"))?;
    match response.status().as_u16() {
        200 => {
            let account: AccountResponse = response.json().await.map_err(|e| e.to_string())?;
            let before = status(app);
            apply_account(app, &account)?;
            let after = status(app);
            if before.plan != after.plan || before.license_expires_at != after.license_expires_at {
                info!("Account plan is now {:?}", after.plan);
            }
            let _ = app.emit("plan-changed", after);
            Ok(())
        }
        401 => {
            // Session expired or the server's secret rotated: signed out here.
            // The token, if any, keeps working until it expires.
            save_str(app, SESSION_FIELD, None)?;
            save_str(app, ACCOUNT_EMAIL_FIELD, None)?;
            let _ = app.emit("plan-changed", status(app));
            Err("Session is no longer valid; signed out.".into())
        }
        code => Err(format!("Account server returned {code}.")),
    }
}

/// Whether a focus-triggered check is due.
fn account_check_due(app: &AppHandle) -> bool {
    let after_checkout = CHECKOUT_OPENED
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_some_and(|t| t.elapsed() < CHECKOUT_WINDOW);
    let gap = if after_checkout {
        FOCUS_CHECK_AFTER_CHECKOUT
    } else if is_paid(app) {
        FOCUS_CHECK_PAID
    } else {
        FOCUS_CHECK_FREE
    };
    LAST_ACCOUNT_CHECK
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_none_or(|t| t.elapsed() >= gap)
}

/// Called when the main window gains focus: picks up a purchase, renewal or
/// cancellation without waiting for the background loop.
pub fn on_main_window_focus(app: &AppHandle) {
    if stored_session(app).is_none() || !account_check_due(app) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = refresh_account_now(&app).await {
            warn!("Account check on focus: {}", e);
        }
    });
}

/// Checks the account now (the Account page's "check again").
#[tauri::command]
#[specta::specta]
pub async fn refresh_account(app: AppHandle) -> Result<PlanStatus, String> {
    refresh_account_now(&app).await?;
    Ok(status(&app))
}

/// Signs out on this device: forgets the session and the token it brought.
/// A trial or a redeemed code stays.
#[tauri::command]
#[specta::specta]
pub fn sign_out(app: AppHandle) -> Result<PlanStatus, String> {
    save_str(&app, SESSION_FIELD, None)?;
    save_str(&app, ACCOUNT_EMAIL_FIELD, None)?;
    if license_from_account(&app) {
        save_key(&app, None)?;
        save_str(&app, LICENSE_SOURCE_FIELD, None)?;
    }
    *PENDING_SIGN_IN.lock().unwrap_or_else(|e| e.into_inner()) = None;
    info!("Signed out");
    let status = status(&app);
    let _ = app.emit("plan-changed", status.clone());
    Ok(status)
}

/// The pricing page to open for an upgrade, with the signed-in email so
/// checkout is prefilled. Also starts the after-checkout focus window.
#[tauri::command]
#[specta::specta]
pub fn upgrade_url(app: AppHandle) -> String {
    *CHECKOUT_OPENED.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    let base = format!("https://{}/pricing", env!("BRAND_DOMAIN"));
    match account_email(&app) {
        Some(email) => {
            let encoded: String = email
                .bytes()
                .map(|b| match b {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                        (b as char).to_string()
                    }
                    _ => format!("%{b:02X}"),
                })
                .collect();
            format!("{base}?email={encoded}")
        }
        None => base,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minted by the website's signing key (stored without the brand prefix);
    /// expired in 2001, so it can never unlock anything, but it's genuine.
    fn expired_genuine_key() -> String {
        format!(
            "{}{}",
            env!("BRAND_LICENSE_KEY_PREFIX"),
            include_str!("../tests/fixtures/expired-license.txt").trim()
        )
    }

    #[test]
    fn genuine_key_verifies_and_reports_expiry() {
        let payload = verify_key(&expired_genuine_key()).expect("signature should verify");
        assert_eq!(payload.plan, "pro");
        assert!(payload.exp < now());
    }

    #[test]
    fn tampered_key_is_rejected() {
        let key = expired_genuine_key();
        let (head, sig) = key.split_once('.').unwrap();
        // Re-encode the payload with a different plan, keep the old signature.
        let prefix = env!("BRAND_LICENSE_KEY_PREFIX");
        let mut json: serde_json::Value = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(head.strip_prefix(prefix).unwrap())
                .unwrap(),
        )
        .unwrap();
        json["exp"] = serde_json::json!(4_102_444_800i64);
        let forged = format!(
            "{prefix}{}.{sig}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&json).unwrap())
        );
        assert!(verify_key(&forged).is_err());
    }

    #[test]
    fn non_keys_are_rejected() {
        assert!(verify_key("").is_err());
        assert!(verify_key("hello").is_err());
        assert!(verify_key(&format!("{}abc", env!("BRAND_LICENSE_KEY_PREFIX"))).is_err());
    }

    #[test]
    fn tokens_are_not_codes() {
        assert_eq!(normalize_code(&expired_genuine_key()), None);
    }

    #[test]
    fn codes_normalize() {
        let slug = env!("BRAND_SLUG");
        for input in [
            "red-grizzly-4320".to_string(),
            "  RED-Grizzly-4320 ".to_string(),
            "red grizzly 4320".to_string(),
            "red_grizzly_4320".to_string(),
            "red--grizzly---4320".to_string(),
            "red.grizzly.4320".to_string(),
            format!("{slug}-red-grizzly-4320"),
            format!("{slug} Red Grizzly 4320"),
            format!("{}red-grizzly-4320", env!("BRAND_LICENSE_KEY_PREFIX")),
            // Non-breaking hyphen and space, as email clients sometimes paste.
            "red\u{2011}grizzly\u{a0}4320".to_string(),
        ] {
            assert_eq!(
                normalize_code(&input).as_deref(),
                Some("red-grizzly-4320"),
                "{input}"
            );
        }
        for input in [
            "",
            "hello",
            "red-grizzly",
            "red-grizzly-432",
            "red-grizzly-43200",
            "red-grizzly-4320-extra",
            "red-gr1zzly-4320",
            "red-extraordinarily-4320",
        ] {
            assert_eq!(normalize_code(input), None, "{input}");
        }
        assert_eq!(normalize_code(&"x".repeat(200)), None);
    }

    #[test]
    fn counts_words_across_scripts() {
        assert_eq!(count_words("Hello, world! It's 2pm."), 4);
        assert_eq!(count_words("  "), 0);
        assert_eq!(count_words("你好世界"), 4);
        assert_eq!(count_words("Meet 東京 tomorrow"), 4);
    }

    #[test]
    fn week_spans_seven_days() {
        let (start, end) = current_week();
        assert!(start <= now() && now() < end);
        let hours = (end - start) / 3600;
        assert!((167..=169).contains(&hours), "{hours}");
    }

    #[test]
    fn account_response_reads_old_and_new_servers() {
        let old: AccountResponse = serde_json::from_str(
            r#"{"session":"s","email":"a@b.c","plan":"pro","key":"k","exp":10}"#,
        )
        .unwrap();
        assert_eq!(old.billing, BillingPeriod::default());
        let new: AccountResponse = serde_json::from_str(
            r#"{"session":"s","email":"a@b.c","plan":"pro","key":"k","exp":10,"periodEnd":5,"cancelAtPeriodEnd":true}"#,
        )
        .unwrap();
        assert_eq!(new.billing.period_end, Some(5));
        assert_eq!(new.billing.cancel_at_period_end, Some(true));
        let free: AccountResponse = serde_json::from_str(
            r#"{"session":"s","email":"a@b.c","plan":"free","key":null,"exp":null,"periodEnd":null,"cancelAtPeriodEnd":false}"#,
        )
        .unwrap();
        assert!(free.key.is_none() && free.billing.period_end.is_none());
    }

    #[test]
    fn period_end_comes_from_the_server_or_the_token() {
        let exp = 2_000_000_000;
        let cancelled = BillingPeriod {
            period_end: Some(exp - GRACE_SECS),
            cancel_at_period_end: Some(true),
        };
        // What the server sent with this token.
        assert_eq!(
            period_for(Plan::Pro, exp, Some((exp, cancelled))),
            (Some((exp - GRACE_SECS) as f64), true)
        );
        // Saved for an older token, or nothing saved (older server): the
        // token's expiry less the grace, assumed to renew.
        assert_eq!(
            period_for(Plan::Pro, exp, Some((exp - 1, cancelled))),
            (Some((exp - GRACE_SECS) as f64), false)
        );
        assert_eq!(
            period_for(Plan::Team, exp, None),
            (Some((exp - GRACE_SECS) as f64), false)
        );
        // A trial ends on its own date; no renewal line.
        assert_eq!(period_for(Plan::Trial, exp, None), (None, false));
    }
}
