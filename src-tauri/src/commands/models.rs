use crate::managers::model::{
    ModelInfo, ModelManager, RetiredModel, LANGUAGE_DETECTOR_ID, ON_DEVICE_AI_ID,
};
use crate::managers::transcription::{ModelStateEvent, TranscriptionManager};
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use log::error;
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
#[specta::specta]
pub async fn get_available_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<ModelInfo>, String> {
    Ok(model_manager.get_available_models())
}

#[tauri::command]
#[specta::specta]
pub async fn get_model_info(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<Option<ModelInfo>, String> {
    Ok(model_manager.get_model_info(&model_id))
}

/// Re-scan local sources (custom models dir + shared HF cache) for models added
/// since launch
#[tauri::command]
#[specta::specta]
pub async fn rescan_local_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    let mm = model_manager.inner().clone();
    tokio::task::spawn_blocking(move || mm.rescan_local_models())
        .await
        .map_err(|e| format!("rescan task panicked: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn download_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    let result = model_manager
        .download_model(&model_id)
        .await
        .map_err(|e| e.to_string());

    if let Err(ref error) = result {
        // Log as well as emit: the toast is transient, and failed downloads have
        // historically been undiagnosable because logs showed nothing (#1579).
        error!("Model download failed for {}: {}", model_id, error);
        let _ = app_handle.emit(
            "model-download-failed",
            serde_json::json!({ "model_id": &model_id, "error": error }),
        );
    }

    result
}

/// Whether the language detector is on disk.
#[tauri::command]
#[specta::specta]
pub fn is_language_detector_downloaded(model_manager: State<'_, Arc<ModelManager>>) -> bool {
    model_manager.language_detector_path().is_some()
}

/// Download the language detector on its own. Progress, completion,
/// cancellation and failure use the model download events under
/// `LANGUAGE_DETECTOR_ID`.
#[tauri::command]
#[specta::specta]
pub async fn download_language_detector(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    let result = model_manager
        .download_language_detector()
        .await
        .map_err(|e| e.to_string());
    if let Err(ref error) = result {
        error!("Language detector download failed: {}", error);
        let _ = app_handle.emit(
            "model-download-failed",
            serde_json::json!({ "model_id": LANGUAGE_DETECTOR_ID, "error": error }),
        );
    }
    result
}

/// "Download on-device AI": what this computer can run and what's there.
#[derive(serde::Serialize, specta::Type)]
pub struct OnDeviceAiStatus {
    /// llama.cpp is built for this computer (every platform we ship).
    pub supported: bool,
    /// The runtime and the model are both on disk.
    pub downloaded: bool,
    /// The whole download (runtime + model), in MB.
    pub size_mb: u64,
    /// Apple Intelligence is usable here (a Mac that has it).
    pub apple_available: bool,
    /// What runs on-device tasks now: "apple", "downloaded", or None.
    pub engine: Option<String>,
}

/// One on-device reasoning model, for the picker in setup and in Settings.
#[derive(Serialize, Type)]
pub struct ReasoningModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Download size, in MB.
    pub size_mb: u64,
    pub accuracy: Option<f32>,
    pub speed: Option<f32>,
    pub recommended: bool,
    /// Small enough that answers and writing are noticeably weaker.
    pub basic: bool,
    /// What an install that never chose keeps using.
    pub is_default: bool,
    /// Already on this computer.
    pub downloaded: bool,
    /// The one this install runs now.
    pub selected: bool,
}

/// Every on-device reasoning model the catalog lists, with its scores and
/// whether it is already here. Drives the picker in setup and in the Privacy
/// Center; the scores come from the models' own published benchmarks, which is
/// what the picker says.
#[tauri::command]
#[specta::specta]
pub fn get_reasoning_models(
    app: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Vec<ReasoningModelInfo> {
    let selected = crate::settings::get_settings(&app).agent.on_device_model_id;
    let default_id = crate::catalog::default_reasoning_model().map(|m| m.id.clone());
    let chosen = crate::catalog::resolve_reasoning_model(selected.as_deref()).map(|m| m.id.clone());
    crate::catalog::REASONING_MODELS
        .iter()
        .map(|m| ReasoningModelInfo {
            id: m.id.clone(),
            name: m.name.clone(),
            description: m.description.clone(),
            size_mb: m.size_bytes / (1024 * 1024),
            accuracy: m.accuracy_score,
            speed: m.speed_score,
            recommended: m.recommended,
            basic: m.basic,
            is_default: default_id.as_deref() == Some(m.id.as_str()),
            downloaded: model_manager.reasoning_model_downloaded(&m.id)
                || chosen.as_deref() == Some(m.id.as_str()),
            selected: chosen.as_deref() == Some(m.id.as_str()),
        })
        .collect()
}

/// Remember which reasoning model runs on-device tasks. Passing nothing clears
/// the choice and falls back to the catalog's default. Downloads nothing: the
/// picker downloads the chosen model next, under the usual on-device events.
#[tauri::command]
#[specta::specta]
pub fn set_reasoning_model(app: AppHandle, model_id: Option<String>) -> Result<(), String> {
    if let Some(id) = model_id.as_deref() {
        if crate::catalog::reasoning_model(id).is_none() {
            return Err(format!("Unknown on-device model: {id}"));
        }
    }
    let mut settings = crate::settings::get_settings(&app);
    settings.agent.on_device_model_id = model_id;
    crate::settings::write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_on_device_ai_status() -> OnDeviceAiStatus {
    let runtime = crate::local_llm::runtime_asset();
    let model = crate::catalog::default_reasoning_model();
    let size = runtime.map_or(0, |r| r.size) + model.map_or(0, |m| m.size_bytes);
    OnDeviceAiStatus {
        supported: runtime.is_some() && model.is_some(),
        downloaded: crate::local_llm::ready(),
        size_mb: size / (1024 * 1024),
        apple_available: crate::agent::llm::apple_ready(),
        engine: crate::agent::llm::engine().map(|e| {
            match e {
                crate::agent::llm::Engine::Apple => "apple",
                crate::agent::llm::Engine::Local => "downloaded",
            }
            .to_string()
        }),
    }
}

/// Download on-device AI. Progress, completion, cancellation and failure use
/// the model download events under `ON_DEVICE_AI_ID`. Once it's there it
/// becomes the on-device model (on a Mac, instead of Apple Intelligence;
/// the user can switch back).
#[tauri::command]
#[specta::specta]
pub async fn download_on_device_ai(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    let result = model_manager
        .download_on_device_ai()
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(()) if crate::local_llm::ready() => {
            let mut settings = get_settings(&app_handle);
            settings.agent.on_device_model = crate::settings::OnDeviceModel::Downloaded;
            write_settings(&app_handle, settings);
        }
        Ok(()) => {}
        Err(error) => {
            error!("On-device AI download failed: {}", error);
            let _ = app_handle.emit(
                "model-download-failed",
                serde_json::json!({ "model_id": ON_DEVICE_AI_ID, "error": error }),
            );
        }
    }
    result
}

/// Delete on-device AI (runtime and model) and go back to Apple
/// Intelligence where there is one.
#[tauri::command]
#[specta::specta]
pub fn delete_on_device_ai(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    model_manager.delete_on_device_ai().map_err(|e| {
        error!("On-device AI delete failed: {}", e);
        e.to_string()
    })?;
    let mut settings = get_settings(&app_handle);
    settings.agent.on_device_model = crate::settings::OnDeviceModel::Apple;
    write_settings(&app_handle, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_retired_models(model_manager: State<'_, Arc<ModelManager>>) -> Vec<RetiredModel> {
    model_manager.get_retired_models()
}

#[tauri::command]
#[specta::specta]
pub async fn delete_retired_model(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    model_manager.delete_retired_model(&model_id).map_err(|e| {
        error!("Retired model delete failed for {}: {}", model_id, e);
        e.to_string()
    })
}

#[tauri::command]
#[specta::specta]
pub async fn delete_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    // If deleting the active model, unload it and clear the setting
    let settings = get_settings(&app_handle);
    if settings.selected_model == model_id {
        transcription_manager.ensure_model_unlocked()?;
        // Waits for the worker to exit (behind any transcription in progress)
        // before the file is deleted, so keep it off the async workers.
        let tm = Arc::clone(&transcription_manager);
        tauri::async_runtime::spawn_blocking(move || tm.unload_model())
            .await
            .map_err(|e| format!("Failed to unload model: {}", e))?
            .map_err(|e| format!("Failed to unload model: {}", e))?;

        let mut settings = get_settings(&app_handle);
        settings.selected_model = String::new();
        write_settings(&app_handle, settings);
    }

    model_manager.delete_model(&model_id).map_err(|e| {
        // The UI only shows a generic failure toast, so the cause has to be logged.
        error!("Model delete failed for {}: {}", model_id, e);
        e.to_string()
    })
}

/// Shared logic for switching the active model, used by both the Tauri command
/// and the tray menu handler.
///
/// Validates the model, updates the persisted setting, and loads the model
/// unless the unload timeout is set to "Immediately" (in which case the model
/// will be loaded on-demand during the next transcription).
pub fn switch_active_model(app: &AppHandle, model_id: &str) -> Result<(), String> {
    let model_manager = app.state::<Arc<ModelManager>>();
    let transcription_manager = app.state::<Arc<TranscriptionManager>>();
    transcription_manager.ensure_model_unlocked()?;

    // Atomically claim the loading slot — prevents concurrent model loads
    // from tray double-clicks or overlapping commands. The guard resets the
    // flag on drop (including early returns, errors, and panics).
    let _loading_guard = transcription_manager
        .try_start_loading()
        .ok_or_else(|| "Model load already in progress".to_string())?;

    // Check if model exists and is available
    let model_info = model_manager
        .get_model_info(model_id)
        .ok_or_else(|| format!("Model not found: {}", model_id))?;

    if !model_info.is_downloaded {
        return Err(format!("Model not downloaded: {}", model_id));
    }

    let settings = get_settings(app);
    let unload_timeout = settings.model_unload_timeout;
    let old_model = settings.selected_model.clone();

    // Persist the new selection early so the frontend sees the correct model
    // when it reacts to events emitted by load_model.
    let mut settings = settings;
    settings.selected_model = model_id.to_string();

    write_settings(app, settings);

    // Skip eager loading if unload is set to "Immediately" — the model
    // will be loaded on-demand during the next transcription.
    if unload_timeout == ModelUnloadTimeout::Immediately {
        // Notify frontend — load_model won't be called so no events
        // would otherwise be emitted.
        let _ = app.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "selection_changed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: Some(model_info.name.clone()),
                error: None,
            },
        );
        log::info!(
            "Model selection changed to {} (not loading — unload set to Immediately).",
            model_id
        );
        return Ok(());
    }

    // Load the model. On failure, revert the persisted selection.
    if let Err(e) = transcription_manager.load_model(model_id) {
        let mut settings = get_settings(app);
        settings.selected_model = old_model;
        write_settings(app, settings);
        return Err(e.to_string());
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_active_model(
    app_handle: AppHandle,
    _model_manager: State<'_, Arc<ModelManager>>,
    _transcription_manager: State<'_, Arc<TranscriptionManager>>,
    model_id: String,
) -> Result<(), String> {
    switch_active_model(&app_handle, &model_id)
}

#[tauri::command]
#[specta::specta]
pub async fn get_current_model(app_handle: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app_handle);
    Ok(settings.selected_model)
}

#[tauri::command]
#[specta::specta]
pub async fn get_transcription_model_status(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<Option<String>, String> {
    Ok(transcription_manager.get_current_model())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_loading(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<bool, String> {
    // Check if transcription manager has a loaded model
    let current_model = transcription_manager.get_current_model();
    Ok(current_model.is_none())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_download(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    model_manager
        .cancel_download(&model_id)
        .map_err(|e| e.to_string())
}
