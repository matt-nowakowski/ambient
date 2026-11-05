#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
use crate::apple_intelligence;
use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::audio_toolkit::VadPolicy;
use crate::managers::audio::{recording_error_type, AudioRecordingManager};
use crate::managers::history::HistoryManager;
use crate::managers::model::ModelManager;
use crate::managers::transcription::policy::{live_decode, LiveDecode, ModelTraits};
use crate::managers::transcription::StreamWorkKind;
use crate::managers::transcription::{Transcription, TranscriptionManager};
use crate::settings::{
    get_settings, AppSettings, OverlayStyle, AMBIENT_AI_DEFAULT_MODEL_ID, AMBIENT_AI_PROVIDER_ID,
    APPLE_INTELLIGENCE_PROVIDER_ID,
};
use crate::shortcut;
use crate::tray::{set_tray_state, TrayIconState};
use crate::utils::{
    self, show_processing_overlay, show_recording_overlay, show_transcribing_overlay,
};
use crate::TranscriptionCoordinator;
use log::{debug, error, warn};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri::{AppHandle, Emitter};
use tauri_specta::Event;

/// How a dictation ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionOutcome {
    /// The text was typed.
    Typed,
    /// Nothing was heard, so nothing was typed.
    Empty,
    /// The microphone sent only digital silence (e.g. muted).
    Silent,
    /// Transcribing or pasting failed.
    Failed,
    /// Handled by the voice agent (an answer or action), nothing typed.
    Agent,
}

/// Emitted when a dictation finishes (not on cancel); onboarding uses it to measure speed.
#[derive(Clone, Debug, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct TranscriptionCompleteEvent {
    pub outcome: TranscriptionOutcome,
    pub audio_seconds: f64,
    pub wait_seconds: f64,
}

fn emit_transcription_complete(
    app: &AppHandle,
    outcome: TranscriptionOutcome,
    sample_count: usize,
    stop_time: Instant,
) {
    let event = TranscriptionCompleteEvent {
        outcome,
        audio_seconds: sample_count as f64
            / crate::audio_toolkit::constants::WHISPER_SAMPLE_RATE as f64,
        wait_seconds: stop_time.elapsed().as_secs_f64(),
    };
    if let Err(e) = event.emit(app) {
        warn!("Failed to emit transcription complete: {e}");
    }
}

/// Nothing to type: `Silent` if the microphone sent only zeros, else `Empty`.
fn empty_outcome(input_silent: bool) -> TranscriptionOutcome {
    if input_silent {
        TranscriptionOutcome::Silent
    } else {
        TranscriptionOutcome::Empty
    }
}

const CANCELLATION_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// Bumped per recording session, so a late paste from an earlier session
/// doesn't reset the tray or hide the overlay of a newer one.
static RECORDING_SESSION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, serde::Serialize)]
struct RecordingErrorEvent {
    error_type: String,
    detail: Option<String>,
}

/// Drop guard that finishes the transcription pipeline, including immediate
/// model unloading on early exits.
struct FinishGuard(AppHandle, Arc<TranscriptionManager>);
impl Drop for FinishGuard {
    fn drop(&mut self) {
        self.1.maybe_unload_immediately("transcription session");
        if let Some(c) = self.0.try_state::<TranscriptionCoordinator>() {
            c.notify_processing_finished();
        }
        // The names read for this dictation are no longer needed.
        crate::screen_names::clear();
        // The pipeline just freed its large transient buffers (captured PCM,
        // WAV copy, engine scratch); hand the cached pages back to the OS so
        // they don't sit in malloc arenas until they get swapped out (#1792).
        crate::memory::trim_freed_memory();
    }
}

// Shortcut Action Trait
pub trait ShortcutAction: Send + Sync {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

// Transcribe Action
struct TranscribeAction {
    post_process: bool,
    /// The Ask shortcut: the agent handles it (answer, act, recall); never typed.
    ask: bool,
}

/// Where a transcript came from, which decides whether the agent may take it.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum OutputMode {
    /// A file transcription: always just text.
    File,
    /// A normal dictation: routed automatically when it looks like a request.
    Dictation,
    /// The Ask shortcut: always the agent.
    Ask,
}

/// Field name for structured output JSON schema
const TRANSCRIPTION_FIELD: &str = "transcription";

/// Strip invisible Unicode characters that some LLMs may insert
fn strip_invisible_chars(s: &str) -> String {
    s.replace(['\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}'], "")
}

/// Strip leaked reasoning (`agent::reasoning`). Some endpoints can't disable
/// reasoning, and some local servers put the reasoning text into `content`
/// instead of a separate field — without this the user would get the model's
/// chain of thought pasted along with the cleaned transcription.
fn strip_think_block(s: &str) -> String {
    crate::agent::reasoning::strip(s)
}

/// Build a system prompt from the user's prompt template, inside the shared
/// skeleton and rules (`agent::prompt`). Removes `${output}` placeholder
/// since the transcription is sent as the user message.
fn build_system_prompt(prompt_template: &str) -> String {
    crate::agent::prompt::polish_system(prompt_template.replace("${output}", "").trim())
}

/// Bounds for one polish request. Cleaned-up text is about as long as the
/// transcript, so the output cap is generous (two tokens a character, plus
/// room) yet stops a runaway reply; past the deadline the raw transcript is
/// pasted rather than keeping the user waiting.
fn polish_limits(transcription: &str) -> crate::llm_client::RequestLimits {
    let chars = u32::try_from(transcription.chars().count()).unwrap_or(u32::MAX);
    crate::llm_client::RequestLimits {
        max_tokens: Some(chars.saturating_mul(2).saturating_add(256).min(2_048)),
        timeout: Some(POLISH_TIMEOUT),
    }
}

/// The hosted endpoint gives its model ~9 s (one retry included).
const POLISH_TIMEOUT: Duration = Duration::from_secs(10);

/// Warm the connection to the hosted AI while the user is still speaking, if
/// this dictation may need it (polish, an Ask, or Smart writing, which can
/// draft): DNS, TCP and TLS are then done before the request is (measured
/// 0.14–0.28 s of a cold request to our server). Sends no token and no
/// text.
fn warm_up_hosted_ai(app: &AppHandle, needs_ai: bool) {
    let settings = get_settings(app);
    // "No AI": nothing to warm, and no connection is opened.
    if !needs_ai || settings.agent.intelligence == crate::settings::Intelligence::None {
        return;
    }
    // Polish that runs on this computer needs no connection; the downloaded
    // model's server starts now, so the model is loaded by the time it's
    // asked.
    if crate::agent::llm::prefers_on_device(
        settings.agent.intelligence,
        settings.agent.on_device_when_possible,
    ) {
        if let Some(engine) = crate::agent::llm::engine() {
            if engine == crate::agent::llm::Engine::Local {
                crate::local_llm::warm_up();
            }
            return;
        }
    }
    if settings.agent.device_only() {
        return;
    }
    let Some(provider) = settings.active_post_process_provider() else {
        return;
    };
    if provider.id != AMBIENT_AI_PROVIDER_ID || !crate::llm_client::needs_warm_up(&provider) {
        return;
    }
    // The Privacy Center lists every request that leaves the Mac.
    let host = provider
        .base_url
        .split("://")
        .nth(1)
        .unwrap_or(&provider.base_url)
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();
    crate::recall::log_request(&host, "warmup", "");
    tauri::async_runtime::spawn(async move {
        crate::llm_client::warm_up(&provider).await;
    });
}

/// Returns `true` when a transcription has no meaningful content to
/// post-process (empty or whitespace-only). Used to skip the post-processing
/// LLM call when nothing was actually transcribed, which would otherwise make
/// the model reply with an error message such as "you need to provide the
/// transcription".
fn is_blank_transcription(transcription: &str) -> bool {
    transcription.trim().is_empty()
}

async fn complete_unless_cancelled<F, C>(operation: F, is_cancelled: C) -> Option<F::Output>
where
    F: Future,
    C: Fn() -> bool,
{
    tokio::pin!(operation);

    loop {
        if is_cancelled() {
            return None;
        }

        if let Ok(result) =
            tokio::time::timeout(CANCELLATION_POLL_INTERVAL, operation.as_mut()).await
        {
            return Some(result);
        }
    }
}

fn should_use_streaming_overlay(style: OverlayStyle, is_streaming: bool) -> bool {
    style == OverlayStyle::Live && is_streaming
}

async fn post_process_transcription(
    app: &AppHandle,
    settings: &AppSettings,
    transcription: &str,
    style_note: Option<&str>,
) -> Option<String> {
    if is_blank_transcription(transcription) {
        debug!("Post-processing skipped because the transcription is empty");
        return None;
    }

    // "No AI": the words are typed as said, and nothing is sent.
    if settings.agent.intelligence == crate::settings::Intelligence::None {
        debug!("Post-processing skipped: AI is off");
        return None;
    }

    let mut provider = match settings.active_post_process_provider() {
        Some(provider) => provider,
        None => {
            debug!("Post-processing enabled but no provider is selected");
            return None;
        }
    };
    // Free: each polish is an AI use from the weekly pool. Once it's spent the
    // plain transcript is typed, and the HUD says so once that week.
    if !crate::limits::ai_available(app) {
        debug!("Post-processing skipped: Free's AI uses this week are spent");
        crate::limits::ai_spent(app, crate::limits::Show::Once);
        return None;
    }
    // Hosted Ambient AI polish runs on this computer instead whenever an
    // on-device model can do it: no cost, and the text never leaves.
    let mut took_local = false;
    if provider.id == AMBIENT_AI_PROVIDER_ID
        && crate::agent::llm::use_on_device(app, transcription.len() + 2_000)
        && crate::plan::consume_local_ai(app)
    {
        took_local = true;
        if let Some(engine) = crate::agent::llm::engine() {
            debug!("Polishing on device ({engine:?}) instead of hosted");
            provider = crate::agent::llm::device_provider(engine);
        }
    }

    // "On this computer only" covers polish too: without an on-device model
    // the plain transcript is typed instead of sending it anywhere.
    if settings.agent.device_only() && !crate::agent::llm::is_device_provider(&provider.id) {
        debug!("Post-processing skipped: Intelligence is set to on this computer only");
        return None;
    }

    // An on-device model chosen directly works on every plan; on Free it
    // takes an AI use from the same weekly pool as hosted polish (which the
    // server counts).
    if crate::agent::llm::is_device_provider(&provider.id)
        && !took_local
        && !crate::plan::consume_local_ai(app)
    {
        debug!("Post-processing skipped: Free's AI uses this week are spent");
        crate::limits::ai_spent(app, crate::limits::Show::Once);
        return None;
    }

    // The hosted endpoint picks the real model; Apple Intelligence has one.
    let model = AMBIENT_AI_DEFAULT_MODEL_ID;

    let prompt = match settings.active_post_process_prompt() {
        Some(prompt) => prompt.prompt.clone(),
        None => {
            debug!("Post-processing skipped because there is no prompt");
            return None;
        }
    };

    if prompt.trim().is_empty() {
        debug!("Post-processing skipped because the selected prompt is empty");
        return None;
    }
    // The user's style for this app or site (`agent::styles`).
    let prompt = match style_note {
        Some(note) => format!("{prompt}\n\n{note}"),
        None => prompt,
    };
    // Names read from the window for this dictation: a hint so the model
    // spells them the way the user's screen does. The transcript itself is
    // still the only thing that decides what is written.
    let prompt = match crate::screen_names::hint() {
        Some(hint) => format!("{prompt}\n\n{hint}"),
        None => prompt,
    };

    debug!(
        "Starting LLM post-processing with provider '{}' (model: {})",
        provider.id, model
    );

    // The hosted provider authenticates with the Pro token; the server
    // checks the plan and holds the model provider's key.
    let api_key = crate::agent::llm::server_token(app);

    // Ask the hosted model to skip reasoning/thinking — post-processing
    // rarely benefits from it and it adds seconds of latency. llm_client
    // retries without it if rejected.
    let disable_reasoning = provider.id == AMBIENT_AI_PROVIDER_ID;

    // The Privacy Center's ledger lists every request that leaves the Mac.
    if !crate::agent::llm::is_device_provider(&provider.id) {
        let host = provider
            .base_url
            .split("://")
            .nth(1)
            .unwrap_or(&provider.base_url)
            .split('/')
            .next()
            .unwrap_or("")
            .to_string();
        crate::recall::log_request(&host, "polish", transcription);
        if provider.id == AMBIENT_AI_PROVIDER_ID {
            crate::plan::record_hosted_use(app, "ai");
        }
    }

    let started = Instant::now();
    let polished: Option<String> = async {
    if provider.supports_structured_output {
        debug!("Using structured outputs for provider '{}'", provider.id);

        let system_prompt = build_system_prompt(&prompt);
        let user_content = transcription.to_string();

        // The downloaded model: plain text back from llama.cpp's server.
        if provider.id == crate::agent::llm::LOCAL_MODEL_PROVIDER_ID {
            let reply = crate::agent::llm::run_on(
                crate::agent::llm::Engine::Local,
                &system_prompt,
                &user_content,
                polish_limits(transcription),
            )
            .await;
            debug!(
                "On-device model post-processing {}",
                if reply.is_some() {
                    "succeeded"
                } else {
                    "failed"
                }
            );
            return reply.map(|r| strip_invisible_chars(&strip_think_block(&r)));
        }

        // Handle Apple Intelligence separately since it uses native Swift APIs
        if provider.id == APPLE_INTELLIGENCE_PROVIDER_ID {
            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            {
                if !apple_intelligence::check_apple_intelligence_availability() {
                    debug!(
                        "Apple Intelligence selected but not currently available on this device"
                    );
                    return None;
                }

                return match apple_intelligence::process_text_with_system_prompt(
                    &system_prompt,
                    &user_content,
                    0,
                ) {
                    Ok(result) => {
                        if result.trim().is_empty() {
                            debug!("Apple Intelligence returned an empty response");
                            None
                        } else {
                            let result = strip_invisible_chars(&strip_think_block(&result));
                            debug!(
                                "Apple Intelligence post-processing succeeded. Output length: {} chars",
                                result.len()
                            );
                            Some(result)
                        }
                    }
                    Err(err) => {
                        error!("Apple Intelligence post-processing failed: {}", err);
                        None
                    }
                };
            }

            #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
            {
                debug!("Apple Intelligence provider selected on unsupported platform");
                return None;
            }
        }

        // Define JSON schema for transcription output
        let json_schema = serde_json::json!({
            "type": "object",
            "properties": {
                (TRANSCRIPTION_FIELD): {
                    "type": "string",
                    "description": "The cleaned and processed transcription text"
                }
            },
            "required": [TRANSCRIPTION_FIELD],
            "additionalProperties": false
        });

        match crate::llm_client::send_chat_completion_with_schema(
            &provider,
            api_key.clone(),
            model,
            user_content,
            Some(system_prompt),
            Some(json_schema),
            disable_reasoning,
            polish_limits(transcription),
        )
        .await
        {
            Ok(Some(content)) => {
                // Parse the JSON response to extract the transcription field
                let content = strip_think_block(&content);
                let content = content.as_str();
                match serde_json::from_str::<serde_json::Value>(content) {
                    Ok(json) => {
                        if let Some(transcription_value) =
                            json.get(TRANSCRIPTION_FIELD).and_then(|t| t.as_str())
                        {
                            let result = strip_invisible_chars(transcription_value);
                            debug!(
                                "Structured output post-processing succeeded for provider '{}'. Output length: {} chars",
                                provider.id,
                                result.len()
                            );
                            return Some(result);
                        } else {
                            error!("Structured output response missing 'transcription' field");
                            return Some(strip_invisible_chars(content));
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to parse structured output JSON: {}. Returning raw content.",
                            e
                        );
                        return Some(strip_invisible_chars(content));
                    }
                }
            }
            Ok(None) => {
                error!("LLM API response has no content");
                return None;
            }
            Err(e) => {
                // Free's week is used: the legacy retry would be refused too.
                if crate::limits::check_model_error(app, &e, crate::limits::Show::Once) {
                    return None;
                }
                warn!(
                    "Structured output failed for provider '{}': {}. Falling back to legacy mode.",
                    provider.id, e
                );
                // Fall through to legacy mode below
            }
        }
    }

    // Legacy mode: Replace ${output} variable in the prompt with the actual
    // text. The user's prompt (with the transcript in it) is the message; the
    // shared skeleton and rules go with it as the system prompt.
    let processed_prompt = prompt.replace("${output}", transcription);
    debug!("Processed prompt length: {} chars", processed_prompt.len());

    match crate::llm_client::send_chat_completion_bounded(
        &provider,
        api_key,
        model,
        processed_prompt,
        crate::agent::prompt::polish_frame(),
        disable_reasoning,
        polish_limits(transcription),
    )
    .await
    {
        Ok(Some(content)) => {
            let content = strip_invisible_chars(&strip_think_block(&content));
            debug!(
                "LLM post-processing succeeded for provider '{}'. Output length: {} chars",
                provider.id,
                content.len()
            );
            Some(content)
        }
        Ok(None) => {
            error!("LLM API response has no content");
            None
        }
        Err(e) => {
            crate::limits::check_model_error(app, &e, crate::limits::Show::Once);
            error!(
                "LLM post-processing failed for provider '{}': {}. Falling back to original transcription.",
                provider.id,
                e
            );
            None
        }
    }
    }
    .await;
    // For History's details; the downloaded model notes itself (`llm::run_on`).
    if polished.is_some() && provider.id != crate::agent::llm::LOCAL_MODEL_PROVIDER_ID {
        crate::agent::llm::record(&provider.id, started);
    }
    polished
}

pub(crate) struct ProcessedTranscription {
    pub final_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
    /// Set when the router decided this was a request for the agent (answer,
    /// act, recall) rather than text to type. Nothing is pasted then.
    pub agent_route: Option<crate::agent::router::Route>,
    /// It sounded like a question but the router said "write": after the
    /// paste, offer "Search this instead?" with this text.
    pub offer_search: Option<String>,
    /// Smart writing polished it (or noted why it couldn't): after the
    /// paste, the chip with "Use my words".
    pub writing: Option<crate::agent::writing::Typed>,
    /// Smart writing: write for the user from this instruction instead of
    /// typing the words (nothing is pasted here).
    pub written: Option<crate::agent::writing::WriteRequest>,
}

impl ProcessedTranscription {
    /// How it was written, for History's details: `written`, `polished` or
    /// `as_said`; `None` when nothing is typed (the agent took it).
    fn write_decision(&self) -> Option<&'static str> {
        if self.written.is_some() {
            Some("written")
        } else if self.agent_route.is_some() || !crate::clipboard::is_pasteable(&self.final_text) {
            None
        } else if self.post_processed_text.is_some() {
            Some("polished")
        } else {
            Some("as_said")
        }
    }
}

/// Add the model calls a dictation made to its details: the engine (and
/// model) of the last one, which wrote the text, and their time together.
pub(crate) fn note_ai(
    details: &mut crate::managers::history::EntryDetails,
    uses: &[crate::agent::llm::AiUse],
) {
    let Some(last) = uses.last() else {
        return;
    };
    details.ai_engine = Some(last.engine.clone());
    details.ai_model = last.model.clone();
    let ms: u64 = uses.iter().map(|u| u.ms).sum();
    details.ai_ms = Some(details.ai_ms.unwrap_or(0) + ms as i64);
}

/// The polish prompt's id (never its text), when the text was polished.
pub(crate) fn polish_prompt_id(app: &AppHandle, polished: bool) -> Option<String> {
    polished
        .then(|| {
            get_settings(app)
                .active_post_process_prompt()
                .map(|p| p.id.clone())
        })
        .flatten()
}

/// The polish prompt in use: the selected one, else the built-in default.
fn selected_polish_prompt(settings: &AppSettings) -> Option<String> {
    settings
        .active_post_process_prompt()
        .map(|p| p.prompt.clone())
}

/// AI polish may "fix" a custom word's spelling back ("payro" → "Pairo"):
/// the same conservative custom-word pass runs over its output too.
fn keep_custom_spellings(settings: &AppSettings, polished: String) -> String {
    let polished = crate::corrections::apply(&polished, &settings.word_replacements);
    // The user's custom words, plus any names read from the window for this
    // dictation.
    let words = crate::screen_names::merged_words(&settings.custom_words);
    if words.is_empty() {
        return polished;
    }
    // Line by line: the matcher re-joins words with single spaces, and the
    // polished text's line breaks must survive.
    polished
        .split('\n')
        .map(|line| {
            if line.trim().is_empty() {
                line.to_string()
            } else {
                crate::audio_toolkit::apply_custom_words(
                    line,
                    &words,
                    settings.word_correction_threshold,
                )
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) async fn process_transcription_output(
    app: &AppHandle,
    transcription: &str,
    post_process: bool,
    mode: OutputMode,
) -> ProcessedTranscription {
    process_dictation_output(
        app,
        transcription,
        crate::agent::writing::WritePlan::fixed(post_process),
        mode,
        None,
    )
    .await
}

/// What smart writing knows by the time it decides.
struct SmartInputs {
    plan: crate::agent::writing::WritePlan,
    ctx: crate::agent::writing::Ctx,
    bundle: String,
    /// The router (a model) read the words and didn't say "compose".
    router_ran: bool,
    /// The router's polished text, when it polished.
    router_text: Option<String>,
    /// Long enough to be worth polishing (`WritePlan::polish_worth_it`).
    polish_worth_it: bool,
    /// The user's style for this app or site.
    style: Option<crate::settings::WritingStyle>,
    started: Instant,
}

/// Smart writing's decision for a dictation into a text field: as said (no
/// model call, as fast as plain dictation), polished, or written for the
/// user. "As said" whenever unsure or when AI isn't available.
async fn smart_write(
    app: &AppHandle,
    settings: &AppSettings,
    transcription: &str,
    i: SmartInputs,
    working: &impl Fn(),
    written: &impl Fn(String, crate::agent::writing::Source) -> ProcessedTranscription,
) -> ProcessedTranscription {
    use crate::agent::writing::{self, Decision, Source, Typed, Verdict};
    let tunables = writing::tunables_for(settings, &i.bundle);
    let (mut decision, source) = match writing::classify(transcription, &i.ctx, &tunables) {
        Verdict::Decided(d) => (d, Source::Rules),
        // The router already asked a model, which didn't say "compose".
        Verdict::Ambiguous { fallback } if i.router_ran => (fallback, Source::Model),
        Verdict::Ambiguous { fallback } => {
            working();
            match writing::model_decide(app, transcription, &i.ctx).await {
                Some(d) => (d, Source::Model),
                None => (fallback, Source::Rules),
            }
        }
    };
    // Polishing needs AI polish turned on (and more than a few words);
    // writing for the user doesn't: it's an agent action, and needs only a
    // model it may use ("On this computer only" without one never sends
    // anything).
    // The user's style here: "as said" types their words unless polish
    // was asked for or Ambient was addressed; "polished" polishes clean
    // speech too.
    use crate::settings::WritingStyle;
    match i.style {
        Some(WritingStyle::AsSaid) if !i.plan.explicit => {
            if decision == Decision::Polished || (decision == Decision::Written && !i.ctx.addressed)
            {
                decision = Decision::AsSaid;
            }
        }
        Some(WritingStyle::Polished) if decision == Decision::AsSaid => {
            decision = Decision::Polished;
        }
        _ => {}
    }
    if (decision == Decision::Polished && !(i.plan.polish_on && i.polish_worth_it))
        || (decision == Decision::Written && crate::agent::llm::needs_cloud(app))
    {
        decision = Decision::AsSaid;
    }
    // Free's weekly AI uses are spent (polish and writing share the pool):
    // as said, and `limits` says so gently, once that week.
    if decision != Decision::AsSaid && !crate::limits::ai_available(app) {
        crate::limits::ai_spent(app, crate::limits::Show::Once);
        decision = Decision::AsSaid;
    }
    crate::telemetry::write_mode(decision.name(), source.name(), &i.bundle);
    debug!(
        "writing: {} by {} after {:?} (fresh {:?}, replying {}, selection {})",
        decision.name(),
        source.name(),
        i.started.elapsed(),
        i.ctx.scene.fresh,
        i.ctx.scene.replying,
        i.ctx.has_selection
    );
    let as_said = || ProcessedTranscription {
        final_text: crate::agent::styles::finish(i.style, transcription),
        post_processed_text: None,
        post_process_prompt: None,
        agent_route: None,
        offer_search: None,
        writing: None,
        written: None,
    };
    match decision {
        Decision::Written => written(
            crate::agent::router::without_address(transcription)
                .trim()
                .to_string(),
            source,
        ),
        Decision::AsSaid => {
            crate::telemetry::dictation(false, i.started.elapsed());
            as_said()
        }
        Decision::Polished => {
            let polished = match i.router_text {
                Some(t) => Some(t),
                None => {
                    working();
                    post_process_transcription(
                        app,
                        settings,
                        transcription,
                        crate::agent::styles::note(i.style),
                    )
                    .await
                    .map(|t| keep_custom_spellings(settings, t))
                }
            };
            debug!(
                "writing: polish ready {:?} after the transcript",
                i.started.elapsed()
            );
            crate::telemetry::dictation(polished.is_some(), i.started.elapsed());
            match polished {
                // Polish changed something: say so, and offer their words.
                Some(text) if !text.trim().is_empty() && text.trim() != transcription.trim() => {
                    let text = crate::agent::styles::finish(i.style, &text);
                    ProcessedTranscription {
                        final_text: text.clone(),
                        post_processed_text: Some(text),
                        post_process_prompt: selected_polish_prompt(settings),
                        agent_route: None,
                        offer_search: None,
                        writing: Some(Typed {
                            decision: Decision::Polished,
                            raw: transcription.to_string(),
                            note: None,
                            rewrite: false,
                        }),
                        written: None,
                    }
                }
                // Nothing to clean up after all.
                Some(_) => as_said(),
                None => {
                    crate::telemetry::error("polish", "failed");
                    // A spent pool was said by `limits` (post_process_transcription).
                    as_said()
                }
            }
        }
    }
}

/// Called when a slow path starts (polishing, writing, a model deciding), to
/// show the "Polishing" state that "as said" never needs.
pub(crate) type OnWorking = Box<dyn Fn() + Send + Sync>;

/// Turn a transcript into what's typed, or a request for the agent. For a
/// dictation, `plan` says how it may be written (smart writing: as said,
/// polished, or written for the user; see `agent::writing`).
pub(crate) async fn process_dictation_output(
    app: &AppHandle,
    transcription: &str,
    plan: crate::agent::writing::WritePlan,
    mode: OutputMode,
    on_working: Option<OnWorking>,
) -> ProcessedTranscription {
    use crate::agent::writing;
    let started = Instant::now();
    let settings = get_settings(app);
    // Polish may happen: always (the polish shortcut, "Always polish"), or
    // when smart writing decides so; never for a few words ("sounds good"),
    // which can't gain enough to wait for a model.
    let polish_worth_it = plan.polish_worth_it(
        transcription,
        crate::remote_config::agent_config()
            .writing
            .skip_polish_words,
    );
    let post_process = (plan.force_polish || (plan.smart() && plan.polish_on)) && polish_worth_it;
    let working = || {
        if let Some(f) = &on_working {
            f();
        }
    };
    let mut final_text = transcription.to_string();
    let mut post_processed_text: Option<String> = None;
    let mut post_process_prompt: Option<String> = None;

    // Voice agent routing: only phrases that look like a request pay for the
    // router call, and its "write" result doubles as the polish.
    let ask = mode == OutputMode::Ask;
    use crate::agent::router::{self, Action, Route};
    let handled = || ProcessedTranscription {
        final_text: String::new(),
        post_processed_text: None,
        post_process_prompt: None,
        agent_route: Some(Route::Handled),
        offer_search: None,
        writing: None,
        written: None,
    };
    if mode != OutputMode::File {
        // A report card is up: "send it", "cancel", or (after Edit) the new
        // message.
        if crate::agent::report::handle_voice(app, transcription) {
            return handled();
        }
        // Right after smart writing typed something: "use my words" takes
        // it back; after Edit, what's said is how to change it.
        if mode == OutputMode::Dictation && writing::handle_voice(app, transcription) {
            return handled();
        }
        // Saying "yes", "not now" or "don't show me these" while a
        // suggestion is up answers the suggestion instead of typing.
        if crate::agent::proactive::handle_voice_feedback(app, transcription).await {
            return handled();
        }
        // "Close that", "never mind" with one of Ambient's cards up: close
        // it (every OS). The smart-writing chip fades by itself, and words
        // said beside it are dictation.
        let card_up = crate::hud::is_visible()
            && !matches!(
                crate::hud::current(),
                None | Some(crate::hud::HudContent::Writing { .. })
            );
        if card_up && router::dismiss_request(transcription) {
            debug!("agent: card dismissed by voice");
            crate::hud::hide(app);
            return handled();
        }
    }
    // A spoken marker ("reply that…", "remind me…", "note: …") decides
    // routing before any model (`router::decide`). "Note: …" is typed as
    // said, without the marker, however much it sounds like a request.
    let marked = if mode == OutputMode::Dictation {
        crate::agent::markers::detect(transcription)
    } else {
        None
    };
    let note = marked
        .as_ref()
        .is_some_and(|m| m.kind == crate::agent::markers::Kind::Note);
    let transcription: &str = match &marked {
        Some(m) if note => {
            debug!("marker: note (typed as said, marker removed)");
            m.body.as_str()
        }
        Some(m) => {
            debug!(
                "marker: {:?} ({})",
                m.kind,
                if m.trailing { "trailing" } else { "leading" }
            );
            transcription
        }
        None => transcription,
    };
    let cues = router::cues_cover(&settings.spoken_languages);
    // An answer card is up: what's said next may be a follow-up to it.
    let follow_up = mode == OutputMode::Dictation && crate::hud::showing_answer();
    let help = router::is_help_request(transcription);
    let compose_first = crate::agent::compose::compose_intent(transcription);
    let compose_maybe = compose_first == crate::agent::compose::ComposeIntent::Maybe;
    let compose_yes = !compose_maybe && compose_first != crate::agent::compose::ComposeIntent::No;
    if compose_yes || compose_maybe {
        debug!(
            "compose first pass: {}",
            if compose_yes {
                "yes"
            } else {
                "maybe (router decides)"
            }
        );
    }
    let reminder =
        crate::agent::when::reminder_request(transcription, chrono::Local::now().naive_local());
    let report = crate::agent::report::report_intent(transcription);
    let agent_on = mode == OutputMode::Dictation && settings.agent.routing;
    let cued = ask
        || (agent_on
            && (router::looks_like_request(transcription)
                || help
                || compose_yes
                || compose_maybe
                || reminder.is_some()
                || report.is_some()
                || (marked.is_some() && !note)
                || follow_up
                // Languages the cues don't cover: in "Always polish" the
                // router doubles as the polish, so routing every dictation
                // costs nothing extra. In Smart it would put a model round
                // trip in front of every dictation, even clean ones typed
                // as said; there the cues (multilingual for drafting) decide.
                || (!cues && post_process && !plan.smart())));
    // Smart writing decides per dictation, with a text field to write in.
    let smart_wanted =
        mode == OutputMode::Dictation && plan.smart() && !is_blank_transcription(transcription);
    // Where the user is: needed to route, and to know whether there's a
    // text field at all (with none, speech is for the agent by default).
    // A style set for some app or site needs to know where this goes.
    let styled = mode == OutputMode::Dictation && !settings.app_styles.is_empty();
    let place = if cued || agent_on || smart_wanted || styled {
        // This dictation is going to the router: let an app or site the lists
        // do not know be judged by its screen (see router::place_for).
        let agent = settings.agent.clone();
        tauri::async_runtime::spawn_blocking(move || router::place_for(cued, &agent))
            .await
            .unwrap_or_default()
    } else {
        Default::default()
    };
    let no_field = place.no_field;
    crate::agent::styles::note_place(&place);
    let style = if mode == OutputMode::Dictation {
        crate::agent::styles::for_place(&settings, &place)
    } else {
        None
    };
    let style_note = crate::agent::styles::note(style);
    // "As said" here: no polish unless asked for (the polish shortcut).
    let post_process =
        post_process && (plan.explicit || style != Some(crate::settings::WritingStyle::AsSaid));
    // Typing a prompt into ChatGPT/Claude is writing, however it sounds.
    let routable = (cued || (agent_on && no_field))
        && !note
        && (ask || !router::always_write_here(&place, transcription));
    let sounds = router::sounds_like_request(transcription);
    let strong = router::strong_request(transcription);
    if agent_on || ask {
        debug!(
            "route inputs: no_field={no_field} editable={} messaging={} sounds_like_request={sounds} strong={strong} reminder={} report={} follow_up={follow_up}",
            place.editable,
            place.is_messaging(),
            reminder.is_some(),
            report.as_ref().map_or("none", |r| if r.explicit { "explicit" } else { "vague" }),
        );
    }
    let smart_here = smart_wanted && !no_field && !ask;
    let addressed = router::addresses_ambient(transcription);
    // Written for the user without naming Ambient only in Smart; in "Always
    // as I said" and "Always polish" an instruction is typed like any words.
    let may_write = mode != OutputMode::Dictation
        || ask
        || addressed
        || (plan.writes_unasked() && style != Some(crate::settings::WritingStyle::AsSaid));
    // A selection to rewrite, and the field around the caret (a fresh
    // message, a reply): read here, never sent.
    let (has_selection, scene) = if smart_here {
        let a = app.clone();
        let (app_name, title) = (place.app.clone(), place.title.clone());
        tauri::async_runtime::spawn_blocking(move || writing::read_field(&a, &app_name, &title))
            .await
            .unwrap_or_default()
    } else {
        Default::default()
    };
    let written = |instruction: String, source: writing::Source| {
        crate::telemetry::write_mode("written", source.name(), &place.bundle_id);
        crate::telemetry::route("compose", ask, place.editable);
        debug!(
            "writing: written for you ({}), selection={has_selection}",
            source.name()
        );
        ProcessedTranscription {
            final_text: String::new(),
            post_processed_text: None,
            post_process_prompt: None,
            agent_route: None,
            offer_search: None,
            writing: None,
            written: Some(writing::WriteRequest {
                instruction,
                raw: transcription.to_string(),
                has_selection,
                context: None,
                replaces: None,
                style,
            }),
        }
    };
    // "Make this more formal" with text selected: a rewrite of it, decided
    // before any router call.
    if smart_here && has_selection && writing::is_rewrite_command(transcription) {
        return written(
            router::without_address(transcription).trim().to_string(),
            writing::Source::Rules,
        );
    }
    let agent_route = |route: Route| {
        crate::telemetry::route(router::route_name(Some(&route)), ask, place.editable);
        ProcessedTranscription {
            final_text: String::new(),
            post_processed_text: None,
            post_process_prompt: None,
            agent_route: Some(route),
            offer_search: None,
            writing: None,
            written: None,
        }
    };
    let decision = router::decide(
        transcription,
        &router::Situation {
            no_field,
            editable: place.editable,
            messaging: place.is_messaging(),
            ai_chat: place.is_ai_chat(),
            ask,
            follow_up,
            did_you_mean_bias: crate::remote_config::agent_config().did_you_mean_bias,
        },
        chrono::Local::now().naive_local(),
    );
    let decision = if mode == OutputMode::Dictation
        && !no_field
        && !may_write
        && matches!(decision.route, Some(Route::Compose(_)))
    {
        router::Decision {
            route: None,
            to_agent: false,
        }
    } else {
        decision
    };
    if routable && !is_blank_transcription(transcription) {
        // Right after an answer, "that's wrong": offer to report it.
        if (follow_up || no_field || ask)
            && crate::agent::report::offer_after_answer(app, transcription)
        {
            return handled();
        }
        // Decided here, with no model call: "what can I say?", "reply here
        // saying …" (drafted, never typed word for word), "remind me
        // tomorrow morning to …", "report a bug: …".
        // "Reply saying Thursday works" with a field focused: written for
        // them, typed in place with "Use my words".
        if let Some(Route::Compose(instruction)) = &decision.route {
            if mode == OutputMode::Dictation && !no_field {
                return written(instruction.clone(), writing::Source::Rules);
            }
        }
        if let Some(route) = decision.route {
            return agent_route(route);
        }
    }
    let to_agent = decision.to_agent;
    if routable && to_agent && !is_blank_transcription(transcription) {
        // Show it was heard straight away, and read the screen while the
        // router decides.
        crate::hud::show(
            app,
            crate::hud::HudContent::Listening {
                heard: transcription.trim().to_string(),
            },
        );
        crate::agent::answer::prefetch_screen(app);
        if crate::agent::llm::target(app).is_none() {
            // No model to route with: answer it (the server says why if it can't).
            return agent_route(Route::Answer {
                query: transcription.to_string(),
                needs_web: false,
                about_screen: false,
            });
        }
    }
    // What the router made of it, for smart writing: it ran (a model read
    // the words and didn't say "compose"), and its polished text.
    let mut router_ran = false;
    let mut router_text: Option<String> = None;
    if routable
        && !is_blank_transcription(transcription)
        && crate::agent::llm::target(app).is_some()
    {
        let rules = if post_process {
            let prompt = selected_polish_prompt(&settings).unwrap_or_default();
            match style_note {
                Some(note) => format!("{prompt}\n\n{note}"),
                None => prompt,
            }
        } else {
            String::new()
        };
        let previous = (ask || follow_up || sounds)
            .then(crate::agent::answer::last_turn)
            .flatten();
        let routed = router::route(app, transcription, &rules, &place, to_agent, previous).await;
        // Never typed when it's for the agent: if the router still said
        // "write" (or couldn't say), answer it instead.
        let routed = match routed {
            Some(Route::Write(_)) | None if to_agent => Some(Route::Answer {
                query: transcription.to_string(),
                needs_web: false,
                about_screen: false,
            }),
            // The router's reminder without a time: the words may have one.
            Some(Route::Act(Action::Reminder { title, due: None })) => {
                Some(Route::Act(Action::Reminder {
                    title,
                    due: reminder.as_ref().and_then(|r| r.due_string()),
                }))
            }
            other => other,
        };
        match routed {
            // The router says it's an instruction to write.
            Some(Route::Compose(instruction))
                if mode == OutputMode::Dictation && !no_field && may_write =>
            {
                return written(instruction, writing::Source::Model);
            }
            // ...but in "Always as I said" or "Always polish" it's typed.
            Some(Route::Compose(_)) if mode == OutputMode::Dictation && !no_field => {
                router_ran = true;
                crate::telemetry::route("write", ask, place.editable);
            }
            Some(Route::Write(text)) if smart_here => {
                router_ran = true;
                if post_process {
                    router_text = Some(keep_custom_spellings(&settings, text));
                }
                crate::telemetry::route("write", ask, place.editable);
            }
            Some(Route::Write(text)) => {
                if post_process {
                    let text = keep_custom_spellings(&settings, text);
                    post_processed_text = Some(text.clone());
                    post_process_prompt = Some(rules);
                    final_text = text;
                }
                let final_text = crate::agent::styles::finish(style, &final_text);
                // Only where a search is plausible: not when writing to people
                // (messaging, email, docs) or prompting an AI assistant, and
                // not with no field (that card offers "Ask instead").
                let question = transcription.trim_end().ends_with('?')
                    || router::starts_like_question(transcription);
                let offer_search = (!to_agent
                    && !no_field
                    && question
                    && !place.is_messaging()
                    && !place.is_ai_chat())
                .then(|| transcription.trim().to_string());
                crate::telemetry::route("write", ask, place.editable);
                crate::telemetry::dictation(post_processed_text.is_some(), started.elapsed());
                return ProcessedTranscription {
                    final_text,
                    post_processed_text,
                    post_process_prompt,
                    agent_route: None,
                    offer_search,
                    writing: None,
                    written: None,
                };
            }
            Some(route) => return agent_route(route),
            // Router unavailable or unsure: fall through to plain dictation.
            None => crate::telemetry::route("none", ask, place.editable),
        }
    }

    if smart_here {
        return smart_write(
            app,
            &settings,
            transcription,
            SmartInputs {
                plan,
                ctx: writing::Ctx {
                    has_selection,
                    category: crate::telemetry::app_category(&place.bundle_id),
                    ai_chat: place.is_ai_chat(),
                    addressed,
                    scene,
                },
                bundle: place.bundle_id.clone(),
                router_ran,
                router_text,
                polish_worth_it,
                style,
                started,
            },
            &working,
            &written,
        )
        .await;
    }

    if post_process {
        working();
        if let Some(processed_text) =
            post_process_transcription(app, &settings, &final_text, style_note).await
        {
            let processed_text = keep_custom_spellings(&settings, processed_text);
            post_processed_text = Some(processed_text.clone());
            final_text = processed_text;

            post_process_prompt = selected_polish_prompt(&settings);
        } else {
            crate::telemetry::error("polish", "failed");
        }
    }
    if mode == OutputMode::Dictation {
        crate::telemetry::dictation(post_processed_text.is_some(), started.elapsed());
        final_text = crate::agent::styles::finish(style, &final_text);
    }

    ProcessedTranscription {
        final_text,
        post_processed_text,
        post_process_prompt,
        agent_route: None,
        offer_search: None,
        writing: None,
        written: None,
    }
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // Load model in the background
        let tm = app.state::<Arc<TranscriptionManager>>();
        let rm = app.state::<Arc<AudioRecordingManager>>();

        // Load ASR model and VAD model in parallel
        let kickoff_started = Instant::now();
        tm.initiate_model_load();
        let rm_clone = Arc::clone(&rm);
        std::thread::spawn(move || {
            if let Err(e) = rm_clone.preload_vad() {
                debug!("VAD pre-load failed: {}", e);
            }
        });
        let kickoff_elapsed = kickoff_started.elapsed();

        // Don't open the mic if nothing can transcribe the recording; the load
        // kicked off above fails and reports why.
        if !tm.is_model_loaded() {
            let selected_model = get_settings(app).selected_model;
            if let Err(e) = app
                .state::<Arc<ModelManager>>()
                .get_model_path(&selected_model)
            {
                warn!("Not starting recording: no model can transcribe it ({})", e);
                return;
            }
        }

        // Free plan: refuse before the mic opens once the weekly allowance is used.
        if !crate::plan::can_dictate(app) {
            crate::plan::notify_limit_reached(app);
            return;
        }

        // Read the names in the window beside the recording, so a dictation
        // spells them the way the screen does. Never blocks the paste (see
        // `screen_names`).
        crate::screen_names::begin(app);

        let binding_id = binding_id.to_string();
        RECORDING_SESSION.fetch_add(1, Ordering::SeqCst);
        let tray_started = Instant::now();
        set_tray_state(app, TrayIconState::Recording);
        let tray_elapsed = tray_started.elapsed();

        // Get the microphone mode to determine audio feedback timing
        let plan_started = Instant::now();
        let settings = get_settings(app);
        let is_always_on = settings.always_on_microphone;

        let selected_model_info = app
            .state::<Arc<ModelManager>>()
            .get_model_info(&settings.selected_model);

        // Use the app-facing model capability as the single pre-recording source
        // for live streaming decisions. Unknown support is represented as false
        // until the model registry is updated by discovery or runtime load.
        let model_supports_streaming = selected_model_info
            .as_ref()
            .map(|m| m.supports_streaming)
            .unwrap_or(false);
        let vad_policy = if !settings.vad_enabled {
            VadPolicy::Disabled
        } else if model_supports_streaming {
            VadPolicy::Streaming
        } else {
            VadPolicy::Offline
        };
        // Before the model loads, whether it keeps its accuracy on long audio
        // is unknown, so assume not: the worker decides again with the loaded
        // model, and a wrong guess costs only an idle worker.
        let expected_model = ModelTraits {
            streaming: model_supports_streaming,
            long_form: false,
        };
        if live_decode(expected_model, settings.long_form_chunking) != LiveDecode::None {
            tm.start_stream();
        }
        let plan_elapsed = plan_started.elapsed();

        // Sizing the overlay follows the same advertised capability. A model that
        // doesn't stream (or whose capability is not known yet) gets the compact
        // pill instead of an oversized transparent live window.
        let overlay_started = Instant::now();
        match settings.overlay_style {
            OverlayStyle::Live if model_supports_streaming => utils::show_streaming_overlay(app),
            OverlayStyle::Live | OverlayStyle::Minimal => show_recording_overlay(app),
            OverlayStyle::None => {} // show_overlay_state no-ops on None anyway
        }
        // Everything above runs before capture can begin, so each span here is
        // added keypress->capture latency.
        debug!(
            "start-path pre-recording steps: model_kickoff={:?} tray={:?} settings+stream_plan={:?} overlay={:?}",
            kickoff_elapsed,
            tray_elapsed,
            plan_elapsed,
            overlay_started.elapsed()
        );
        debug!("Microphone mode - always_on: {}", is_always_on);

        let mut recording_error: Option<anyhow::Error> = None;
        let recording_start_time = Instant::now();
        match rm.try_start_recording(&binding_id, vad_policy) {
            Ok(readiness) => {
                debug!(
                    "Recording request accepted in {:?}; waiting for first microphone samples",
                    recording_start_time.elapsed()
                );
                let generation = readiness.generation();
                let app_clone = app.clone();
                let rm_clone = Arc::clone(&rm);
                std::thread::spawn(move || {
                    if !readiness.wait() {
                        debug!("Microphone readiness wait ended without receiving samples");
                        return;
                    }

                    // Development-only preview hook for evaluating the brief
                    // arming animation on hardware that normally starts too fast
                    // to make it visible.
                    #[cfg(debug_assertions)]
                    if let Ok(delay_ms) = std::env::var("AMBIENT_DEBUG_MIC_READY_DELAY_MS")
                        .unwrap_or_default()
                        .parse::<u64>()
                    {
                        let delay_ms = delay_ms.min(10_000);
                        if delay_ms > 0 {
                            debug!("Delaying microphone-ready cue by {delay_ms}ms for UI preview");
                            std::thread::sleep(Duration::from_millis(delay_ms));
                        }
                    }

                    if !rm_clone.is_recording_readiness_current(generation) {
                        debug!("Microphone became ready for an inactive recording");
                        return;
                    }

                    debug!("Microphone is receiving samples; recording is ready");
                    utils::emit_recording_ready(&app_clone);

                    // The start chime is a readiness cue, so it must follow the
                    // first real input callback rather than Stream::play() or a
                    // fixed delay. The helper returns immediately when feedback
                    // is disabled; mute still follows the same readiness point.
                    if rm_clone.is_recording_readiness_current(generation) {
                        play_feedback_sound_blocking(&app_clone, SoundType::Start);
                    }
                    if rm_clone.is_recording_readiness_current(generation) {
                        rm_clone.apply_mute();
                    }
                });
            }
            Err(e) => {
                debug!("Failed to start recording: {}", e);
                recording_error = Some(e);
            }
        }

        if recording_error.is_none() {
            // Dynamically register the cancel shortcut in a separate task to avoid deadlock
            shortcut::register_cancel_shortcut(app);
            // Off the capture path: the connection opens while they speak.
            // Smart writing may draft from an instruction even with polish
            // off: drafts and answers share the pooled connection.
            let polish = self.post_process || crate::plan::polish_every_dictation(app);
            let smart = get_settings(app).writing_mode == crate::settings::WritingMode::Smart;
            warm_up_hosted_ai(app, polish || smart || self.ask);
        } else {
            // Starting failed (for example due to blocked microphone permissions).
            // Revert UI state so we don't stay stuck in the recording overlay.
            tm.cancel_stream();
            utils::hide_recording_overlay(app);
            set_tray_state(app, TrayIconState::Idle);
            if let Some(err) = recording_error {
                let _ = app.emit(
                    "recording-error",
                    RecordingErrorEvent {
                        error_type: recording_error_type(&err).to_string(),
                        detail: Some(format!("{err:#}")),
                    },
                );
            }
        }

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // Prevent a slow microphone from emitting a ready event or start chime
        // after the user has already requested stop.
        app.state::<Arc<AudioRecordingManager>>()
            .invalidate_recording_readiness();

        // Unregister the cancel shortcut when transcription stops
        shortcut::unregister_cancel_shortcut(app);

        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);

        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());

        set_tray_state(app, TrayIconState::Transcribing);
        // Stop should give immediate visual feedback. Live streaming can keep
        // the larger panel, but it still switches from listening to a working
        // spinner while the stream finalizes. Non-streaming paths use the
        // compact transcribing pill (None no-ops in show_*).
        let style = get_settings(app).overlay_style;
        // Capture this before finalizing the stream so every later working state
        // targets the same overlay that was shown for this transcription.
        let use_streaming_overlay = should_use_streaming_overlay(style, tm.is_streaming());
        if use_streaming_overlay {
            tm.emit_stream_working(StreamWorkKind::Transcribing);
        } else {
            show_transcribing_overlay(app);
        }

        // Unmute before playing audio feedback so the stop sound is audible
        rm.remove_mute();

        // Play audio feedback for recording stop
        play_feedback_sound(app, SoundType::Stop);

        let binding_id = binding_id.to_string(); // Clone binding_id for the async task

        // How this dictation may be written: the Writing setting (Smart
        // decides per utterance), AI polish, and the polish shortcut.
        let plan = crate::agent::writing::WritePlan::for_dictation(app, self.post_process);
        // Polishing may happen (for history); shown up front only when certain.
        let post_process = plan.force_polish || (plan.smart() && plan.polish_on);
        // In the agent tour's Try it, either shortcut asks the agent.
        let output_mode = if self.ask || crate::agent::trying_from_tour() {
            OutputMode::Ask
        } else {
            OutputMode::Dictation
        };
        let cancel_generation = rm.cancel_generation();

        tauri::async_runtime::spawn(async move {
            let _guard = FinishGuard(ah.clone(), Arc::clone(&tm));
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            let stop_recording_time = Instant::now();
            if let Some(samples) = rm.stop_recording(&binding_id, cancel_generation) {
                // Read now: by the time transcribing ends, another take may
                // have replaced it.
                let input_silent = rm.last_input_silent();
                debug!(
                    "Recording stopped and samples retrieved in {:?}, sample count: {}",
                    stop_recording_time.elapsed(),
                    samples.len()
                );

                if rm.was_cancelled_since(cancel_generation) {
                    debug!("Transcription operation cancelled after recording stop");
                    tm.cancel_stream();
                    utils::hide_recording_overlay(&ah);
                    set_tray_state(&ah, TrayIconState::Idle);
                    return;
                }

                if samples.is_empty() {
                    debug!("Recording produced no audio samples; skipping persistence");
                    // Tear down any streaming worker so its channel doesn't leak
                    // and block the next start_stream.
                    tm.cancel_stream();
                    utils::hide_recording_overlay(&ah);
                    set_tray_state(&ah, TrayIconState::Idle);
                    emit_transcription_complete(&ah, empty_outcome(input_silent), 0, stop_time);
                } else {
                    // Save WAV concurrently with transcription
                    let sample_count = samples.len();
                    let file_name = format!(
                        "{}-{}.wav",
                        env!("BRAND_SLUG"),
                        chrono::Utc::now().timestamp()
                    );
                    let wav_path = hm.recordings_dir().join(&file_name);
                    let wav_path_for_verify = wav_path.clone();
                    let samples_for_wav = samples.clone();
                    let wav_handle = tauri::async_runtime::spawn_blocking(move || {
                        crate::audio_toolkit::save_wav_file(&wav_path, &samples_for_wav)
                    });

                    // Transcribe concurrently with WAV save: the live decode's
                    // result when it has one (all audio was already fed to it),
                    // otherwise a batch run of the samples. A cancel is surfaced
                    // as an error, so it never starts a batch run.
                    let transcription_time = Instant::now();
                    let transcription_result = tm.transcribe_recording(samples);
                    // What ran and how long, for History's details: ids and
                    // durations only, never the prompt or the screen text.
                    let mut details = crate::managers::history::EntryDetails {
                        speech_model: tm.current_model_id(),
                        recording_ms: Some((sample_count as f64 / 16_000.0 * 1000.0) as i64),
                        transcription_ms: Some(transcription_time.elapsed().as_millis() as i64),
                        ..Default::default()
                    };

                    // Await WAV save and verify
                    let wav_saved = match wav_handle.await {
                        Ok(Ok(())) => {
                            match crate::audio_toolkit::verify_wav_file(
                                &wav_path_for_verify,
                                sample_count,
                            ) {
                                Ok(()) => true,
                                Err(e) => {
                                    error!("WAV verification failed: {}", e);
                                    false
                                }
                            }
                        }
                        Ok(Err(e)) => {
                            error!("Failed to save WAV file: {}", e);
                            false
                        }
                        Err(e) => {
                            error!("WAV save task panicked: {}", e);
                            false
                        }
                    };

                    if rm.was_cancelled_since(cancel_generation) {
                        debug!("Transcription operation cancelled before output handling");
                        utils::hide_recording_overlay(&ah);
                        set_tray_state(&ah, TrayIconState::Idle);
                        return;
                    }

                    match transcription_result {
                        Ok(Transcription {
                            text: transcription,
                            language,
                        }) => {
                            debug!(
                                "Transcription completed in {:?}: '{}'",
                                transcription_time.elapsed(),
                                utils::redact_text(&transcription)
                            );

                            let show_working = {
                                let (ah, tm) = (ah.clone(), Arc::clone(&tm));
                                move || {
                                    if use_streaming_overlay {
                                        tm.emit_stream_working(StreamWorkKind::Polishing);
                                    } else {
                                        show_processing_overlay(&ah);
                                    }
                                }
                            };
                            if plan.force_polish {
                                show_working();
                            }
                            let Some((processed, ai_uses)) = complete_unless_cancelled(
                                crate::agent::llm::traced(process_dictation_output(
                                    &ah,
                                    &transcription,
                                    plan,
                                    output_mode,
                                    Some(Box::new(show_working)),
                                )),
                                || rm.was_cancelled_since(cancel_generation),
                            )
                            .await
                            else {
                                debug!("Transcription operation cancelled during output handling");
                                utils::hide_recording_overlay(&ah);
                                set_tray_state(&ah, TrayIconState::Idle);
                                return;
                            };

                            if rm.was_cancelled_since(cancel_generation) {
                                debug!("Transcription operation cancelled before paste");
                                utils::hide_recording_overlay(&ah);
                                set_tray_state(&ah, TrayIconState::Idle);
                                return;
                            }

                            details.write_decision = processed.write_decision().map(str::to_string);
                            details.prompt_id =
                                polish_prompt_id(&ah, processed.post_processed_text.is_some());
                            note_ai(&mut details, &ai_uses);

                            // Save to history if WAV was saved
                            let entry_id = if wav_saved {
                                match hm.save_entry(
                                    file_name,
                                    transcription,
                                    post_process,
                                    processed.post_processed_text.clone(),
                                    processed.post_process_prompt.clone(),
                                    language,
                                    details.clone(),
                                ) {
                                    Ok(entry) => Some(entry.id),
                                    Err(err) => {
                                        error!("Failed to save history entry: {}", err);
                                        None
                                    }
                                }
                            } else {
                                None
                            };
                            // The total (key-up to the text being in) once
                            // it is: after the paste, or the draft.
                            let finish_details = {
                                let hm = Arc::clone(&hm);
                                move |mut details: crate::managers::history::EntryDetails,
                                      uses: &[crate::agent::llm::AiUse]| {
                                    let Some(id) = entry_id else {
                                        return;
                                    };
                                    note_ai(&mut details, uses);
                                    details.total_ms =
                                        Some(stop_time.elapsed().as_millis() as i64);
                                    if let Err(err) = hm.update_details(id, &details) {
                                        error!("Failed to update history details: {}", err);
                                    }
                                }
                            };

                            if let Some(request) = processed.written {
                                // Written for them: drafted, then typed with
                                // "Use my words" (agent::writing).
                                utils::hide_recording_overlay(&ah);
                                set_tray_state(&ah, TrayIconState::Idle);
                                let app = ah.clone();
                                tauri::async_runtime::spawn(async move {
                                    let ((), uses) = crate::agent::llm::traced(
                                        crate::agent::writing::write_now(app, request),
                                    )
                                    .await;
                                    if !uses.is_empty() {
                                        finish_details(details, &uses);
                                    }
                                });
                                emit_transcription_complete(
                                    &ah,
                                    TranscriptionOutcome::Agent,
                                    sample_count,
                                    stop_time,
                                );
                            } else if let Some(route) = processed.agent_route {
                                utils::hide_recording_overlay(&ah);
                                set_tray_state(&ah, TrayIconState::Idle);
                                crate::agent::handle(&ah, route);
                                emit_transcription_complete(
                                    &ah,
                                    TranscriptionOutcome::Agent,
                                    sample_count,
                                    stop_time,
                                );
                            } else if !crate::clipboard::is_pasteable(&processed.final_text) {
                                utils::hide_recording_overlay(&ah);
                                set_tray_state(&ah, TrayIconState::Idle);
                                emit_transcription_complete(
                                    &ah,
                                    empty_outcome(input_silent),
                                    sample_count,
                                    stop_time,
                                );
                            } else {
                                let ah_clone = ah.clone();
                                let paste_time = Instant::now();
                                let final_text = processed.final_text;
                                let offer_search = processed.offer_search;
                                let typed_how = processed.writing;
                                let dictated_words = crate::plan::count_words(&final_text);
                                let rm_for_paste = Arc::clone(&rm);
                                // Taken before the paste thread exists, and so
                                // before the next session can start.
                                let session = RECORDING_SESSION.load(Ordering::SeqCst);
                                // Off the main thread: paste sleeps between steps, and a
                                // paste into Ambient's own windows needs the main thread free.
                                std::thread::Builder::new()
                                    .name("paste".into())
                                    .spawn(move || {
                                        if rm_for_paste.was_cancelled_since(cancel_generation) {
                                            debug!(
                                                "Transcription operation cancelled before paste"
                                            );
                                            utils::hide_recording_overlay(&ah_clone);
                                            set_tray_state(&ah_clone, TrayIconState::Idle);
                                            return;
                                        }

                                        // No text field to type into: offer the
                                        // text instead of typing into nothing.
                                        if crate::agent::draft_instead_of_paste(
                                            &ah_clone,
                                            &final_text,
                                        ) {
                                            if RECORDING_SESSION.load(Ordering::SeqCst) == session {
                                                utils::hide_recording_overlay(&ah_clone);
                                                set_tray_state(&ah_clone, TrayIconState::Idle);
                                            }
                                            emit_transcription_complete(
                                                &ah_clone,
                                                TranscriptionOutcome::Agent,
                                                sample_count,
                                                stop_time,
                                            );
                                            return;
                                        }
                                        let typed_text = final_text.clone();
                                        let outcome =
                                            match utils::paste(final_text, ah_clone.clone()) {
                                                Ok(()) => {
                                                    debug!(
                                                        "Text pasted successfully in {:?}",
                                                        paste_time.elapsed()
                                                    );
                                                    finish_details(details, &[]);
                                                    crate::plan::record_words(
                                                        &ah_clone,
                                                        dictated_words,
                                                    );
                                                    // Watch for word fixes to learn.
                                                    crate::corrections::watch(
                                                        &ah_clone,
                                                        &typed_text,
                                                    );
                                                    // Polished: the chip with
                                                    // "Use my words" (a note
                                                    // when it couldn't).
                                                    if let Some(how) = typed_how {
                                                        crate::agent::writing::after_insert(
                                                            &ah_clone,
                                                            how,
                                                            &typed_text,
                                                        );
                                                    } else if let Some(q) = &offer_search {
                                                        crate::agent::offer_search_instead(
                                                            &ah_clone, q,
                                                        );
                                                    }
                                                    TranscriptionOutcome::Typed
                                                }
                                                Err(e) => {
                                                    error!("Failed to paste transcription: {}", e);
                                                    let _ = ah_clone.emit("paste-error", ());
                                                    TranscriptionOutcome::Failed
                                                }
                                            };
                                        // A new session may have started while
                                        // this paste ran; the UI is now its.
                                        if RECORDING_SESSION.load(Ordering::SeqCst) == session {
                                            utils::hide_recording_overlay(&ah_clone);
                                            set_tray_state(&ah_clone, TrayIconState::Idle);
                                        }
                                        emit_transcription_complete(
                                            &ah_clone,
                                            outcome,
                                            sample_count,
                                            stop_time,
                                        );
                                    })
                                    .map(|_| ())
                                    .unwrap_or_else(|e| {
                                        error!("Failed to start the paste thread: {:?}", e);
                                        utils::hide_recording_overlay(&ah);
                                        set_tray_state(&ah, TrayIconState::Idle);
                                        emit_transcription_complete(
                                            &ah,
                                            TranscriptionOutcome::Failed,
                                            sample_count,
                                            stop_time,
                                        );
                                    });
                            }
                        }
                        Err(err) => {
                            if rm.was_cancelled_since(cancel_generation) {
                                debug!(
                                    "Transcription operation cancelled after transcription error"
                                );
                                utils::hide_recording_overlay(&ah);
                                set_tray_state(&ah, TrayIconState::Idle);
                                return;
                            }

                            error!("Transcription failed: {}", err);
                            // Surface the failure to the UI (toast). The full
                            // message is also in ambient.log via the line above.
                            let _ = ah.emit("transcription-error", err.to_string());
                            // Save entry with empty text so user can retry
                            if wav_saved {
                                if let Err(save_err) = hm.save_entry(
                                    file_name,
                                    String::new(),
                                    post_process,
                                    None,
                                    None,
                                    None,
                                    details,
                                ) {
                                    error!("Failed to save failed history entry: {}", save_err);
                                }
                            }
                            utils::hide_recording_overlay(&ah);
                            set_tray_state(&ah, TrayIconState::Idle);
                            emit_transcription_complete(
                                &ah,
                                TranscriptionOutcome::Failed,
                                sample_count,
                                stop_time,
                            );
                        }
                    }
                }
            } else {
                debug!("No samples retrieved from recording stop");
                // Tear down any streaming worker so its channel doesn't leak.
                tm.cancel_stream();
                utils::hide_recording_overlay(&ah);
                set_tray_state(&ah, TrayIconState::Idle);
                if !rm.was_cancelled_since(cancel_generation) {
                    emit_transcription_complete(&ah, TranscriptionOutcome::Empty, 0, stop_time);
                }
            }
        });

        debug!(
            "TranscribeAction::stop completed in {:?}",
            stop_time.elapsed()
        );
    }
}

// Cancel Action
struct CancelAction;

impl ShortcutAction for CancelAction {
    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        utils::cancel_current_operation(app);
    }

    fn stop(&self, _app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        // Nothing to do on stop for cancel
    }
}

// Test Action
struct TestAction;

impl ShortcutAction for TestAction {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Started - {} (App: {})", // Changed "Pressed" to "Started" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Stopped - {} (App: {})", // Changed "Released" to "Stopped" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }
}

// Static Action Map
pub static ACTION_MAP: Lazy<HashMap<String, Arc<dyn ShortcutAction>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction {
            post_process: false,
            ask: false,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "transcribe_with_post_process".to_string(),
        Arc::new(TranscribeAction {
            post_process: true,
            ask: false,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "ask_agent".to_string(),
        Arc::new(TranscribeAction {
            post_process: true,
            ask: true,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "cancel".to_string(),
        Arc::new(CancelAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "test".to_string(),
        Arc::new(TestAction) as Arc<dyn ShortcutAction>,
    );
    map
});

#[cfg(test)]
mod tests {
    use super::{
        complete_unless_cancelled, is_blank_transcription, should_use_streaming_overlay,
        strip_think_block,
    };
    use crate::settings::OverlayStyle;
    use std::future;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn blank_transcription_is_detected() {
        assert!(is_blank_transcription(""));
        assert!(is_blank_transcription("   "));
        assert!(is_blank_transcription("\t\n  \r\n"));
    }

    #[test]
    fn non_blank_transcription_is_kept() {
        assert!(!is_blank_transcription("hello"));
        assert!(!is_blank_transcription("  hello  "));
    }

    #[test]
    fn completed_operation_returns_its_output() {
        let result = tauri::async_runtime::block_on(complete_unless_cancelled(
            future::ready("done"),
            || false,
        ));

        assert_eq!(result, Some("done"));
    }

    #[test]
    fn pending_operation_stops_after_cancellation() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancelled_for_thread = Arc::clone(&cancelled);
        let cancel_thread = thread::spawn(move || {
            thread::sleep(Duration::from_millis(10));
            cancelled_for_thread.store(true, Ordering::Release);
        });

        let result = tauri::async_runtime::block_on(complete_unless_cancelled(
            future::pending::<()>(),
            || cancelled.load(Ordering::Acquire),
        ));

        cancel_thread.join().unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn leading_think_block_is_stripped() {
        assert_eq!(
            strip_think_block("<think>pondering...</think>Cleaned text."),
            "Cleaned text."
        );
        assert_eq!(
            strip_think_block("  \n<think>multi\nline</think>\n  Cleaned text."),
            "Cleaned text."
        );
    }

    #[test]
    fn content_without_think_block_is_unchanged() {
        assert_eq!(strip_think_block("Cleaned text."), "Cleaned text.");
        // An unclosed block is reasoning cut off mid-thought: never typed.
        assert_eq!(strip_think_block("<think>never closed"), "");
        assert_eq!(
            strip_think_block("Cleaned text. <think>and maybe"),
            "Cleaned text."
        );
    }

    #[test]
    fn live_overlay_uses_streaming_states_only_for_streaming_models() {
        assert!(should_use_streaming_overlay(OverlayStyle::Live, true));
        assert!(!should_use_streaming_overlay(OverlayStyle::Live, false));
        assert!(!should_use_streaming_overlay(OverlayStyle::Minimal, true));
        assert!(!should_use_streaming_overlay(OverlayStyle::None, true));
    }
}
