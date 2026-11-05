//! One place the agent calls a language model: the user's selected AI
//! provider (hosted Ambient AI) or an on-device model, the same choice that
//! powers polish. On this computer that's Apple Intelligence or the
//! downloaded model (`local_llm`), whichever the user prefers and is there.
//! Every call is written to the network ledger, except on-device ones, which
//! never leave the computer.

use tauri::AppHandle;

use crate::settings::{
    ai_provider, get_settings, AiProvider, Intelligence, OnDeviceModel,
    AMBIENT_AI_DEFAULT_MODEL_ID, AMBIENT_AI_PROVIDER_ID, APPLE_INTELLIGENCE_PROVIDER_ID,
};

/// The downloaded model as a provider id (never stored as the polish
/// provider; it stands for "on device" like Apple Intelligence does).
pub const LOCAL_MODEL_PROVIDER_ID: &str = "local_model";

/// What runs a task on this computer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    /// Apple Intelligence (Foundation Models), Apple silicon Macs.
    Apple,
    /// The downloaded model, run by llama.cpp (every platform).
    Local,
}

impl Engine {
    /// The most prompt text it takes (system + user).
    pub fn max_chars(self) -> usize {
        match self {
            Engine::Apple => ON_DEVICE_MAX_CHARS,
            Engine::Local => crate::local_llm::MAX_CHARS,
        }
    }

    fn provider_id(self) -> &'static str {
        match self {
            Engine::Apple => APPLE_INTELLIGENCE_PROVIDER_ID,
            Engine::Local => LOCAL_MODEL_PROVIDER_ID,
        }
    }
}

/// Which on-device engine runs tasks: the preferred one when it's there,
/// else whichever is. None without either.
pub fn pick_engine(prefer: OnDeviceModel, apple: bool, local: bool) -> Option<Engine> {
    match (prefer, apple, local) {
        (OnDeviceModel::Downloaded, _, true) => Some(Engine::Local),
        (OnDeviceModel::Apple, true, _) => Some(Engine::Apple),
        (_, true, _) => Some(Engine::Apple),
        (_, _, true) => Some(Engine::Local),
        _ => None,
    }
}

/// This computer's on-device engine right now, by the user's preference.
pub fn engine() -> Option<Engine> {
    let apple = apple_ready();
    let local = crate::local_llm::ready();
    if !apple && !local {
        return None;
    }
    let prefer = crate::local_llm::app()
        .map(|app| get_settings(app).agent.on_device_model)
        .unwrap_or_default();
    pick_engine(prefer, apple, local)
}

/// A provider id that means "on this computer".
pub fn is_device_provider(id: &str) -> bool {
    id == APPLE_INTELLIGENCE_PROVIDER_ID || id == LOCAL_MODEL_PROVIDER_ID
}

/// The provider standing for this computer's engine.
pub fn device_provider(engine: Engine) -> AiProvider {
    match engine {
        Engine::Apple => ai_provider(APPLE_INTELLIGENCE_PROVIDER_ID).unwrap_or(AiProvider {
            id: APPLE_INTELLIGENCE_PROVIDER_ID.to_string(),
            base_url: "apple-intelligence://local".to_string(),
            supports_structured_output: true,
        }),
        Engine::Local => AiProvider {
            id: Engine::Local.provider_id().to_string(),
            base_url: "local-model://local".to_string(),
            supports_structured_output: true,
        },
    }
}

pub struct Target {
    pub provider: AiProvider,
    pub model: String,
    pub api_key: String,
}

impl Target {
    pub fn is_on_device(&self) -> bool {
        is_device_provider(&self.provider.id)
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
/// forces the on-device engine (None without one), "Cloud" our hosted model,
/// and Automatic follows the polish provider (as before the setting existed).
pub fn target(app: &AppHandle) -> Option<Target> {
    let settings = get_settings(app);
    let provider = match settings.agent.intelligence {
        Intelligence::Device => device_provider(engine()?),
        Intelligence::Cloud => ai_provider(AMBIENT_AI_PROVIDER_ID)?,
        Intelligence::Auto => settings.active_post_process_provider()?,
        // No AI at all: callers see "nothing to run" and leave the words alone.
        Intelligence::None => return None,
    };
    // On-device models are on every plan; on Free each call is an AI use
    // from the weekly pool (`complete_inner` takes it).
    // The hosted endpoint picks the real model; on-device ones have one.
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
pub fn apple_ready() -> bool {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        crate::apple_intelligence::check_apple_intelligence_availability()
    }
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        false
    }
}

/// An on-device model (Apple Intelligence or the downloaded one) is usable
/// on this computer right now.
pub fn on_device_ready() -> bool {
    engine().is_some()
}

/// Whether the Intelligence setting wants this task on this computer:
/// always in "On this computer only", never in "Cloud", and in Automatic when
/// the user prefers the on-device model for answers and polish.
pub fn prefers_on_device(intelligence: Intelligence, on_device_when_possible: bool) -> bool {
    match intelligence {
        Intelligence::Device => true,
        Intelligence::Cloud => false,
        Intelligence::Auto => on_device_when_possible,
        Intelligence::None => false,
    }
}

/// Whether this task should run on this computer: the setting wants it, an
/// on-device model is ready, and the text fits its window.
pub fn use_on_device(app: &AppHandle, chars: usize) -> bool {
    let agent = get_settings(app).agent;
    prefers_on_device(agent.intelligence, agent.on_device_when_possible)
        && engine().is_some_and(|e| chars <= e.max_chars())
}

/// "On this computer only" on a machine without an on-device model: model
/// tasks can't run at all, and callers say so instead of failing quietly.
pub fn needs_cloud(app: &AppHandle) -> bool {
    get_settings(app).agent.device_only() && !on_device_ready()
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn apple(system: &str, user: &str) -> Option<String> {
    crate::apple_intelligence::process_text_with_system_prompt(system, user, 0)
        .ok()
        .filter(|s| !s.trim().is_empty())
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn apple(_system: &str, _user: &str) -> Option<String> {
    None
}

/// Run a prompt on `engine`, within `limits` (the downloaded model honours
/// both; Apple's has its own). None on failure. Never leaves the computer.
pub async fn run_on(
    engine: Engine,
    system: &str,
    user: &str,
    limits: crate::llm_client::RequestLimits,
) -> Option<String> {
    if system.len() + user.len() > engine.max_chars() {
        return None;
    }
    match engine {
        Engine::Apple => {
            if !apple_ready() {
                return None;
            }
            let (s, u) = (system.to_string(), user.to_string());
            tauri::async_runtime::spawn_blocking(move || apple(&s, &u))
                .await
                .ok()
                .flatten()
        }
        Engine::Local => crate::local_llm::complete(system, user, limits).await,
    }
}

/// The on-device model, whatever the provider setting (callers check the
/// plan and the Intelligence setting first). None without one or on failure.
pub async fn complete_on_device(system: &str, user: &str) -> Option<String> {
    run_on(engine()?, system, user, Default::default()).await
}

/// Skip the on-device attempt (used where the on-device model already had
/// its say, like routing), within `limits` (an output cap, a deadline).
/// Still on-device in on-device-only mode.
pub async fn complete_hosted_limited(
    app: &AppHandle,
    purpose: &str,
    system: &str,
    user: &str,
    limits: crate::llm_client::RequestLimits,
) -> Option<String> {
    if get_settings(app).agent.device_only() {
        return complete_inner(app, purpose, system, user, true, limits).await;
    }
    complete_inner(app, purpose, system, user, false, limits).await
}

/// System + user prompt → the model's text, or None on any failure.
///
/// On-device first: anything that fits the on-device model runs on this
/// computer, which keeps screen text off our servers and costs nothing. Our
/// hosted model is the fallback for long text and computers without one
/// (never in on-device-only mode).
pub async fn complete(app: &AppHandle, purpose: &str, system: &str, user: &str) -> Option<String> {
    complete_inner(app, purpose, system, user, true, Default::default()).await
}

async fn complete_inner(
    app: &AppHandle,
    purpose: &str,
    system: &str,
    user: &str,
    local_first: bool,
    limits: crate::llm_client::RequestLimits,
) -> Option<String> {
    // Free's weekly AI pool is used: say so (for what the user asked for)
    // instead of sending a request the server would refuse.
    if !crate::limits::ai_available(app) {
        crate::limits::ai_spent(app, limit_show(purpose));
        return None;
    }
    let mut took_local = false;
    if local_first && use_on_device(app, system.len() + user.len()) {
        if !take_local_use(app, purpose) {
            crate::limits::ai_spent(app, limit_show(purpose));
            return None;
        }
        took_local = true;
        let out = match engine() {
            Some(e) => run_on(e, system, user, limits).await,
            None => None,
        };
        if out.is_some() || get_settings(app).agent.device_only() {
            return out;
        }
    }
    let t = target(app)?;
    if t.is_on_device() {
        if !took_local && !take_local_use(app, purpose) {
            crate::limits::ai_spent(app, limit_show(purpose));
            return None;
        }
        let engine = if t.provider.id == LOCAL_MODEL_PROVIDER_ID {
            Engine::Local
        } else {
            Engine::Apple
        };
        // Already tried this engine above and it failed: don't run it twice.
        if took_local && Some(engine) == self::engine() {
            return None;
        }
        return run_on(engine, system, user, limits).await;
    }

    crate::recall::log_request(&host_of(&t.provider.base_url), purpose, user);
    if t.is_hosted() {
        crate::plan::record_hosted_use(app, "ai");
    }
    let disable_reasoning = t.is_hosted();
    match crate::llm_client::send_chat_completion_bounded(
        &t.provider,
        t.api_key,
        &t.model,
        user.to_string(),
        system.to_string(),
        disable_reasoning,
        limits,
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

/// Background decisions (routing, how to type a dictation) never spend a
/// Free AI use, on device or hosted (the server doesn't count them either).
pub fn counts_as_ai_use(purpose: &str) -> bool {
    !matches!(purpose, "route" | "write_mode")
}

/// One on-device use from Free's weekly pool, unless `purpose` is background
/// work. False when the pool is spent.
fn take_local_use(app: &AppHandle, purpose: &str) -> bool {
    !counts_as_ai_use(purpose) || crate::plan::consume_local_ai(app)
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

    #[test]
    fn picks_the_preferred_on_device_engine_when_it_is_there() {
        use OnDeviceModel::{Apple, Downloaded};
        // Nothing on this computer (Windows/Linux before the download).
        assert_eq!(pick_engine(Apple, false, false), None);
        assert_eq!(pick_engine(Downloaded, false, false), None);
        // Windows/Linux after the download: the downloaded model, whatever
        // the (Mac-only) preference says.
        assert_eq!(pick_engine(Apple, false, true), Some(Engine::Local));
        assert_eq!(pick_engine(Downloaded, false, true), Some(Engine::Local));
        // A Mac with Apple Intelligence and nothing downloaded.
        assert_eq!(pick_engine(Apple, true, false), Some(Engine::Apple));
        assert_eq!(pick_engine(Downloaded, true, false), Some(Engine::Apple));
        // A Mac with both: the user's choice.
        assert_eq!(pick_engine(Apple, true, true), Some(Engine::Apple));
        assert_eq!(pick_engine(Downloaded, true, true), Some(Engine::Local));
    }

    #[test]
    fn engines_have_their_own_windows() {
        assert_eq!(Engine::Apple.max_chars(), ON_DEVICE_MAX_CHARS);
        assert!(Engine::Local.max_chars() > ON_DEVICE_MAX_CHARS);
        assert!(is_device_provider(Engine::Apple.provider_id()));
        assert!(is_device_provider(Engine::Local.provider_id()));
        assert!(!is_device_provider(AMBIENT_AI_PROVIDER_ID));
        assert!(device_provider(Engine::Local).supports_structured_output);
    }

    #[test]
    fn background_decisions_never_spend_free_uses() {
        assert!(!counts_as_ai_use("route"));
        assert!(!counts_as_ai_use("write_mode"));
        for purpose in ["answer", "polish", "draft", "suggestion", "summary"] {
            assert!(counts_as_ai_use(purpose), "{purpose}");
        }
    }
}
