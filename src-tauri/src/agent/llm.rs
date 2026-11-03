//! One place the agent calls a language model: the user's selected AI
//! provider (hosted Ambient AI or Apple Intelligence), the same choice that
//! powers polish. Every call is written to the network
//! ledger, except on-device ones, which never leave the Mac.

use tauri::AppHandle;

use crate::settings::{
    ai_provider, get_settings, AiProvider, Intelligence, AMBIENT_AI_DEFAULT_MODEL_ID,
    AMBIENT_AI_PROVIDER_ID, APPLE_INTELLIGENCE_PROVIDER_ID,
};

pub struct Target {
    pub provider: AiProvider,
    pub model: String,
    pub api_key: String,
}

impl Target {
    pub fn is_on_device(&self) -> bool {
        self.provider.id == APPLE_INTELLIGENCE_PROVIDER_ID
    }
    pub fn is_hosted(&self) -> bool {
        self.provider.id == AMBIENT_AI_PROVIDER_ID
    }
}

/// The bearer token for our own server: the signed Pro token on Pro/trial, the
/// hashed-device token on Free.
pub fn server_token(app: &AppHandle) -> String {
    if crate::plan::is_paid(app) {
        crate::plan::license_key(app).unwrap_or_default()
    } else {
        crate::plan::free_polish_token().unwrap_or_default()
    }
}

/// The provider to use, by the Intelligence setting: "On this computer only"
/// forces Apple Intelligence, "Cloud" our hosted model, and Automatic follows
/// the polish provider (as before the setting existed).
pub fn target(app: &AppHandle) -> Option<Target> {
    let settings = get_settings(app);
    let provider = match settings.agent.intelligence {
        Intelligence::Device => ai_provider(APPLE_INTELLIGENCE_PROVIDER_ID)?,
        Intelligence::Cloud => ai_provider(AMBIENT_AI_PROVIDER_ID)?,
        Intelligence::Auto => settings.active_post_process_provider()?,
    };
    // Apple Intelligence is on every plan; on Free each call is an AI use
    // from the weekly pool (`complete_inner` takes it).
    // The hosted endpoint picks the real model; Apple Intelligence has one.
    let model = AMBIENT_AI_DEFAULT_MODEL_ID.to_string();
    let api_key = server_token(app);
    Some(Target {
        provider,
        model,
        api_key,
    })
}

fn host_of(url: &str) -> String {
    url.split("://")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("")
        .to_string()
}

/// Apple's on-device model has a ~4k-token window (prompt and reply share
/// it); keep the prompt well inside it.
pub const ON_DEVICE_MAX_CHARS: usize = 9_000;

/// Apple Intelligence is usable on this Mac right now.
pub fn on_device_ready() -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        crate::apple_intelligence::check_apple_intelligence_availability()
    }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        false
    }
}

/// Whether the Intelligence setting wants this task on this computer:
/// always in "On this computer only", never in "Cloud", and in Automatic when
/// the user prefers Apple Intelligence for answers and polish.
pub fn prefers_on_device(intelligence: Intelligence, on_device_when_possible: bool) -> bool {
    match intelligence {
        Intelligence::Device => true,
        Intelligence::Cloud => false,
        Intelligence::Auto => on_device_when_possible,
    }
}

/// Whether this task should run on this computer: the setting wants it,
/// Apple Intelligence is ready, and the text fits its window.
pub fn use_on_device(app: &AppHandle, chars: usize) -> bool {
    let agent = get_settings(app).agent;
    prefers_on_device(agent.intelligence, agent.on_device_when_possible)
        && chars <= ON_DEVICE_MAX_CHARS
        && on_device_ready()
}

/// "On this computer only" on a machine without an on-device model: model
/// tasks can't run at all, and callers say so instead of failing quietly.
pub fn needs_cloud(app: &AppHandle) -> bool {
    get_settings(app).agent.device_only() && !on_device_ready()
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn on_device(system: &str, user: &str) -> Option<String> {
    crate::apple_intelligence::process_text_with_system_prompt(system, user, 0)
        .ok()
        .filter(|s| !s.trim().is_empty())
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn on_device(_system: &str, _user: &str) -> Option<String> {
    None
}

/// Apple Intelligence on this Mac, whatever the provider setting (callers
/// check the plan and the Intelligence setting first). None elsewhere or on
/// failure. Never leaves the Mac.
pub async fn complete_on_device(system: &str, user: &str) -> Option<String> {
    if !on_device_ready() || system.len() + user.len() > ON_DEVICE_MAX_CHARS {
        return None;
    }
    let (s, u) = (system.to_string(), user.to_string());
    tauri::async_runtime::spawn_blocking(move || on_device(&s, &u))
        .await
        .ok()
        .flatten()
}

/// Skip the on-device attempt (used where the Mac's model already had its
/// say, like routing). Still on-device in on-device-only mode.
pub async fn complete_hosted(
    app: &AppHandle,
    purpose: &str,
    system: &str,
    user: &str,
) -> Option<String> {
    if get_settings(app).agent.device_only() {
        return complete(app, purpose, system, user).await;
    }
    complete_inner(app, purpose, system, user, false).await
}

/// System + user prompt → the model's text, or None on any failure.
///
/// On-device first: anything that fits Apple Intelligence runs on this Mac,
/// which keeps screen text off our servers and costs nothing. Our hosted
/// model is the fallback for long text and Macs without Apple Intelligence
/// (never in on-device-only mode).
pub async fn complete(app: &AppHandle, purpose: &str, system: &str, user: &str) -> Option<String> {
    complete_inner(app, purpose, system, user, true).await
}

async fn complete_inner(
    app: &AppHandle,
    purpose: &str,
    system: &str,
    user: &str,
    local_first: bool,
) -> Option<String> {
    // Free's weekly AI pool is used: say so (for what the user asked for)
    // instead of sending a request the server would refuse.
    if !crate::limits::ai_available(app) {
        crate::limits::ai_spent(app, limit_show(purpose));
        return None;
    }
    let mut took_local = false;
    if local_first && use_on_device(app, system.len() + user.len()) {
        if !crate::plan::consume_local_ai(app) {
            crate::limits::ai_spent(app, limit_show(purpose));
            return None;
        }
        took_local = true;
        let (s, u) = (system.to_string(), user.to_string());
        let out = tauri::async_runtime::spawn_blocking(move || on_device(&s, &u))
            .await
            .ok()
            .flatten();
        if out.is_some() || get_settings(app).agent.device_only() {
            return out;
        }
    }
    let t = target(app)?;
    if t.is_on_device() {
        if !took_local && !crate::plan::consume_local_ai(app) {
            crate::limits::ai_spent(app, limit_show(purpose));
            return None;
        }
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            if !crate::apple_intelligence::check_apple_intelligence_availability() {
                return None;
            }
            return crate::apple_intelligence::process_text_with_system_prompt(system, user, 0)
                .ok()
                .filter(|s| !s.trim().is_empty());
        }
        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        return None;
    }

    crate::recall::log_request(&host_of(&t.provider.base_url), purpose, user);
    if t.is_hosted() {
        crate::plan::record_hosted_use(app, "ai");
    }
    let disable_reasoning = t.is_hosted();
    match crate::llm_client::send_chat_completion_with_schema(
        &t.provider,
        t.api_key,
        &t.model,
        user.to_string(),
        Some(system.to_string()),
        None,
        disable_reasoning,
    )
    .await
    {
        Ok(Some(text)) => Some(text),
        Ok(None) => None,
        Err(e) => {
            log::warn!("agent {purpose} call failed: {e}");
            crate::limits::check_model_error(app, &e, limit_show(purpose));
            None
        }
    }
}

/// When a Free limit stops a model call: said for what the user asked for
/// (answers, meeting summaries, drafts), counted only for background work
/// (routing, judging, nudges), where the caller has its own fallback.
fn limit_show(purpose: &str) -> crate::limits::Show {
    match purpose {
        "answer" | "summary" | "draft" | "onboarding_reply" => crate::limits::Show::Always,
        _ => crate::limits::Show::Never,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_follow_the_intelligence_setting() {
        // On this computer only: always on device, whatever the old switch says.
        assert!(prefers_on_device(Intelligence::Device, false));
        // Cloud: always hosted.
        assert!(!prefers_on_device(Intelligence::Cloud, true));
        // Automatic: as before the setting existed.
        assert!(prefers_on_device(Intelligence::Auto, true));
        assert!(!prefers_on_device(Intelligence::Auto, false));
    }
}
