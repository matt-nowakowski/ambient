//! One place the agent calls a language model: the user's selected AI
//! provider (hosted Ambient AI or Apple Intelligence), the same choice that
//! powers polish. Every call is written to the network
//! ledger, except on-device ones, which never leave the Mac.

use tauri::AppHandle;

use crate::settings::{
    ai_provider, get_settings, AiProvider, AMBIENT_AI_DEFAULT_MODEL_ID, AMBIENT_AI_PROVIDER_ID,
    APPLE_INTELLIGENCE_PROVIDER_ID,
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

/// The provider to use. On-device-only mode forces Apple Intelligence.
pub fn target(app: &AppHandle) -> Option<Target> {
    let settings = get_settings(app);
    let provider = if settings.agent.on_device_only {
        ai_provider(APPLE_INTELLIGENCE_PROVIDER_ID)?
    } else {
        settings.active_post_process_provider()?
    };
    if provider.id == APPLE_INTELLIGENCE_PROVIDER_ID && !crate::plan::is_paid(app) {
        return None;
    }
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

/// Whether this task should run on the Mac: the user prefers it (default),
/// Apple Intelligence is ready, and the text fits its window.
pub fn use_on_device(app: &AppHandle, chars: usize) -> bool {
    let agent = get_settings(app).agent;
    (agent.on_device_only || agent.on_device_when_possible)
        && chars <= ON_DEVICE_MAX_CHARS
        && on_device_ready()
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

/// Skip the on-device attempt (used where the Mac's model already had its
/// say, like routing). Still on-device in on-device-only mode.
pub async fn complete_hosted(
    app: &AppHandle,
    purpose: &str,
    system: &str,
    user: &str,
) -> Option<String> {
    if get_settings(app).agent.on_device_only {
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
    if local_first
        && use_on_device(app, system.len() + user.len())
        && crate::plan::consume_local_ai(app)
    {
        let (s, u) = (system.to_string(), user.to_string());
        let out = tauri::async_runtime::spawn_blocking(move || on_device(&s, &u))
            .await
            .ok()
            .flatten();
        if out.is_some() || get_settings(app).agent.on_device_only {
            return out;
        }
    }
    let t = target(app)?;
    if t.is_on_device() {
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
            None
        }
    }
}
