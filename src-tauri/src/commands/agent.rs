//! Commands behind the Privacy Center and the agent's settings.

use std::time::Duration;

use serde::Serialize;
use specta::Type;
use tauri::AppHandle;

use crate::context::{self, redact::redact, ContextSnapshot, Skipped};
use crate::recall::{self, LedgerEntry, RecallStats, ScreenEntry};
use crate::settings::{self, AgentSettings};

#[derive(Serialize, Type)]
pub struct AgentStatus {
    pub settings: AgentSettings,
    /// Accessibility permission (needed to read any window).
    pub accessibility: bool,
    pub paused: bool,
    /// Built-in never-watch list (the user's additions are in settings).
    pub never_watch_defaults: Vec<String>,
    /// None until the local store has opened.
    pub stats: Option<RecallStats>,
    /// Apple Intelligence can run tasks on this Mac.
    pub on_device_ready: bool,
    /// Suggestion types, in display order (keys of `suggestion_prefs`).
    pub suggestion_kinds: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub fn get_agent_status(app: AppHandle) -> AgentStatus {
    let s = settings::get_settings(&app).agent;
    AgentStatus {
        paused: s.is_paused(),
        settings: s,
        accessibility: context::accessibility_trusted(),
        never_watch_defaults: context::DEFAULT_NEVER_WATCH
            .iter()
            .map(|s| s.to_string())
            .collect(),
        stats: recall::get_if_open().and_then(|r| r.stats().ok()),
        on_device_ready: crate::agent::llm::on_device_ready(),
        suggestion_kinds: crate::agent::proactive::Kind::ALL
            .iter()
            .map(|k| k.name().to_string())
            .chain(std::iter::once("meeting_nudge".to_string()))
            .collect(),
    }
}

#[tauri::command]
#[specta::specta]
pub fn set_agent_settings(app: AppHandle, agent: AgentSettings) -> Result<(), String> {
    let mut s = settings::get_settings(&app);
    let memory_turned_off = s.agent.screen_memory && !agent.screen_memory;
    s.agent = AgentSettings {
        retention_days: agent.retention_days.clamp(1, 90),
        suggestions_per_hour: agent.suggestions_per_hour.min(20),
        ..agent
    };
    if let Some(r) = recall::get() {
        r.set_retention_days(i64::from(s.agent.retention_days));
        let _ = r.purge_expired();
        // Turning memory off also forgets what it kept.
        if memory_turned_off {
            r.delete_all().map_err(|e| e.to_string())?;
        }
    }
    if !s.agent.screen_context && !s.agent.screen_memory {
        crate::agent::forget_recent();
    }
    settings::write_settings(&app, s);
    Ok(())
}

/// Pause all watching for `minutes`, or resume when None.
#[tauri::command]
#[specta::specta]
pub fn pause_agent(app: AppHandle, minutes: Option<u32>) {
    let mut s = settings::get_settings(&app);
    s.agent.paused_until = minutes.map(|m| chrono::Utc::now().timestamp() + i64::from(m) * 60);
    if minutes.is_some() {
        crate::agent::forget_recent();
    }
    settings::write_settings(&app, s);
}

#[tauri::command]
#[specta::specta]
pub fn get_network_ledger(limit: u32) -> Result<Vec<LedgerEntry>, String> {
    let Some(r) = recall::get_if_open() else {
        return Ok(Vec::new());
    };
    r.ledger(limit.min(500) as usize).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn search_screen_memory(query: String, limit: u32) -> Result<Vec<ScreenEntry>, String> {
    let r = recall::get().ok_or("memory store not open")?;
    r.search_screen(&query, None, limit.min(200) as usize)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn delete_screen_memory_app(bundle_id: String) -> Result<u32, String> {
    let r = recall::get().ok_or("memory store not open")?;
    r.delete_app(&bundle_id)
        .map(|n| n as u32)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn delete_all_agent_data() -> Result<(), String> {
    crate::agent::forget_recent();
    let r = recall::get().ok_or("memory store not open")?;
    r.delete_all().map_err(|e| e.to_string())
}

/// "What Ambient sees": after `delay_ms` (time to switch to another window),
/// read the frontmost window exactly as the agent would, redaction applied.
#[tauri::command]
#[specta::specta]
pub async fn preview_context(app: AppHandle, delay_ms: u32) -> Result<ContextSnapshot, Skipped> {
    tokio::time::sleep(Duration::from_millis(u64::from(delay_ms.min(10_000)))).await;
    let never_watch = settings::get_settings(&app).agent.never_watch;
    let mut snap =
        tauri::async_runtime::spawn_blocking(move || context::snapshot(4000, &never_watch))
            .await
            .map_err(|_| Skipped::Unavailable)??;
    snap.text = snap.text.map(|t| redact(&t).0);
    snap.selection = snap.selection.map(|t| redact(&t).0);
    snap.focused_text = snap.focused_text.map(|t| redact(&t).0);
    Ok(snap)
}
