//! The anonymous daily check-in, so every install is counted, including Free
//! users who only dictate on this computer and never call anything else.
//!
//! Once a day (UTC, matching the server's days), and at launch if today's
//! hasn't gone yet, the app posts `/api/ping` with exactly: the machine hash
//! the trial and Free allowance already use (`plan::machine_hash`, a salted
//! SHA-256, never the hardware id itself), the app version, the OS and CPU
//! architecture, and the plan. No content, no usage, nothing else.
//!
//! It's on whatever the usage-counts setting says (that one is opt-in and
//! separate; see `telemetry.rs`), and it's written to the Privacy Center's
//! request ledger like every other request. Offline, it waits for the next
//! hourly look; one request at most per hour, never on the UI thread.

use std::time::Duration;

use log::{debug, warn};
use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "checkin.json";
const LAST_DAY_FIELD: &str = "last_day";
/// Let launch settle (and the first-launch trial land, so the plan is right).
const FIRST_DELAY: Duration = Duration::from_secs(30);
/// How often to look whether today's check-in is still due.
const LOOK_EVERY: Duration = Duration::from_secs(3600);
const TIMEOUT: Duration = Duration::from_secs(15);

fn os() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

fn arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "aarch64",
        "x86_64" => "x86_64",
        _ => "other",
    }
}

fn plan_name(plan: crate::plan::Plan) -> &'static str {
    match plan {
        crate::plan::Plan::Free => "free",
        crate::plan::Plan::Trial => "trial",
        crate::plan::Plan::Pro => "pro",
        crate::plan::Plan::Team => "team",
    }
}

/// Exactly what is sent.
fn body(machine: &str, plan: crate::plan::Plan) -> String {
    json!({
        "machine": machine,
        "version": env!("CARGO_PKG_VERSION"),
        "os": os(),
        "arch": arch(),
        "plan": plan_name(plan),
    })
    .to_string()
}

fn today() -> String {
    chrono::Utc::now().date_naive().to_string()
}

fn last_day(app: &AppHandle) -> Option<String> {
    let store = app.store(crate::portable::store_path(STORE_PATH)).ok()?;
    store
        .get(LAST_DAY_FIELD)
        .and_then(|v| v.as_str().map(str::to_string))
}

fn mark_sent(app: &AppHandle, day: &str) {
    if let Ok(store) = app.store(crate::portable::store_path(STORE_PATH)) {
        store.set(LAST_DAY_FIELD, day);
        let _ = store.save();
    }
}

/// Sends today's check-in if it hasn't gone. True when nothing is left to do
/// today (sent now or earlier, or this device can't be identified).
async fn check_in(app: &AppHandle) -> bool {
    let day = today();
    if last_day(app).as_deref() == Some(day.as_str()) {
        return true;
    }
    let Some(machine) = crate::plan::machine_hash() else {
        return true;
    };
    let body = body(&machine, crate::plan::status(app).plan);
    let url = format!("{}/api/ping", crate::agent::answer::api_base());
    crate::recall::log_request_if_open(&crate::telemetry::host_of(&url), "checkin", &body);
    let sent = reqwest::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body)
        .timeout(TIMEOUT)
        .send()
        .await;
    match sent {
        Ok(r) if r.status().is_success() => {
            mark_sent(app, &day);
            true
        }
        // Refused (an old app the server no longer understands): don't ask again today.
        Ok(r) if r.status().is_client_error() && r.status().as_u16() != 429 => {
            warn!("check-in refused ({})", r.status());
            mark_sent(app, &day);
            true
        }
        Ok(r) => {
            debug!("check-in: server returned {}", r.status());
            false
        }
        Err(e) => {
            debug!("check-in: offline ({e})");
            false
        }
    }
}

/// Starts the daily check-in in the background. Call once at startup.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_DELAY).await;
        loop {
            check_in(&app).await;
            tokio::time::sleep(LOOK_EVERY).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_carries_only_the_five_fields() {
        let hash = "a".repeat(64);
        let v: serde_json::Value =
            serde_json::from_str(&body(&hash, crate::plan::Plan::Free)).unwrap();
        let obj = v.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["arch", "machine", "os", "plan", "version"]);
        assert_eq!(obj["machine"], hash.as_str());
        assert_eq!(obj["plan"], "free");
        assert!(["macos", "windows", "linux"].contains(&obj["os"].as_str().unwrap()));
        assert!(["aarch64", "x86_64", "other"].contains(&obj["arch"].as_str().unwrap()));
    }

    #[test]
    fn version_matches_the_servers_pattern() {
        // web/app/api/ping/route.ts accepts plain x.y.z only.
        let v = env!("CARGO_PKG_VERSION");
        let parts: Vec<&str> = v.split('.').collect();
        assert_eq!(parts.len(), 3, "{v}");
        assert!(parts
            .iter()
            .all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit())));
    }

    #[test]
    fn plan_names_match_the_server() {
        use crate::plan::Plan;
        let names: Vec<&str> = [Plan::Free, Plan::Trial, Plan::Pro, Plan::Team]
            .into_iter()
            .map(plan_name)
            .collect();
        assert_eq!(names, ["free", "trial", "pro", "team"]);
    }
}
