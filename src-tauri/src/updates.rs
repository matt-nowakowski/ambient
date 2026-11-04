//! Periodic self-update.
//!
//! Ambient lives in the menu bar and people leave it running for weeks, so a
//! check that only happens at launch means most users never see a new version.
//! This module owns the whole background flow:
//!
//! - check at launch, every six hours after that (±30 min of jitter, so the
//!   install base does not fetch the feed at the same minute) and on
//!   main-window focus, throttled to at most one check an hour;
//! - download quietly as soon as a version is found, keeping the (signature
//!   verified) bytes, and say so once per version with a system notification;
//! - never interrupt: the tray and settings-window "Restart to update" paths
//!   refuse while recording, transcribing, in a meeting or running an agent
//!   task, and a version the user ignores installs on the quit path.
//!
//! Everything runs in Rust, next to the tray, so it works with the settings
//! window closed; the webview only reflects UpdateStatus through the
//! "update-status" event.
//!
//! Cost: an update check is one static latest.json fetch. It never touches
//! /api/* or the database, and it stays off whenever update_checks_enabled or
//! AMBIENT_DISABLE_UPDATER says so.

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_specta::Event;

use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;

/// How often a running app re-checks, before jitter.
pub const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// Jitter applied around CHECK_INTERVAL.
pub const JITTER: Duration = Duration::from_secs(30 * 60);
/// A non-manual check is skipped if another ran this recently: the focus
/// trigger and the timer both go through it.
pub const MIN_GAP: Duration = Duration::from_secs(60 * 60);
/// Let launch settle (and the first-run plan land) before the first check.
const FIRST_DELAY: Duration = Duration::from_secs(30);

/// Where the update flow is right now. Serialized camelCase for the webview.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum UpdatePhase {
    Idle,
    Checking,
    Downloading,
    /// Downloaded and verified; waiting for a restart.
    Ready,
    /// Found, but this install cannot self-replace (portable, .deb, .rpm).
    Available,
    UpToDate,
    Error,
}

/// What the webview shows in the footer, emitted on every change.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct UpdateStatus {
    pub phase: UpdatePhase,
    /// The version found, when there is one.
    pub version: Option<String>,
    /// True when the app can install this update itself.
    pub installable: bool,
    /// True when a person asked for this check, so the footer can report the
    /// outcome (up to date, or why it failed) instead of staying quiet.
    pub manual: bool,
    /// A translatable message key; set only with UpdatePhase::Error.
    pub error: Option<String>,
}

impl UpdateStatus {
    fn idle() -> Self {
        Self {
            phase: UpdatePhase::Idle,
            version: None,
            installable: false,
            manual: false,
            error: None,
        }
    }
}

/// A downloaded update: the verified bytes plus the handle needed to install
/// them. Held in memory until the user restarts or quits.
struct Downloaded {
    version: String,
    bytes: Vec<u8>,
    update: tauri_plugin_updater::Update,
}

struct Inner {
    status: UpdateStatus,
    downloaded: Option<Downloaded>,
    last_check: Option<Instant>,
    checking: bool,
}

/// Managed state for the update flow.
pub struct UpdateManager(Mutex<Inner>);

impl UpdateManager {
    pub fn new() -> Self {
        Self(Mutex::new(Inner {
            status: UpdateStatus::idle(),
            downloaded: None,
            last_check: None,
            checking: false,
        }))
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Default for UpdateManager {
    fn default() -> Self {
        Self::new()
    }
}

fn manager(app: &AppHandle) -> Option<tauri::State<'_, UpdateManager>> {
    app.try_state::<UpdateManager>()
}

/// The current status, for the webview's first paint.
pub fn status(app: &AppHandle) -> UpdateStatus {
    manager(app)
        .map(|m| m.lock().status.clone())
        .unwrap_or_else(UpdateStatus::idle)
}

/// The version waiting for a restart, if any. Read by the tray menu.
pub fn ready_version(app: &AppHandle) -> Option<String> {
    manager(app).and_then(|m| {
        let inner = m.lock();
        if inner.status.phase == UpdatePhase::Ready {
            inner.status.version.clone()
        } else {
            None
        }
    })
}

/// Starts the background schedule. Call once at startup, next to the tray.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_DELAY).await;
        loop {
            run_check(app.clone(), false).await;
            tokio::time::sleep(next_check_delay(random_unit())).await;
        }
    });
}

/// Ask for a check now. Used by the tray item and the footer's button.
pub fn trigger(app: &AppHandle, manual: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        run_check(app, manual).await;
    });
}

/// The main window came forward: check, but at most once an hour.
pub fn on_main_window_focus(app: &AppHandle) {
    if let Some(m) = manager(app) {
        let inner = m.lock();
        if !check_due_on_focus(inner.last_check, Instant::now()) {
            return;
        }
    }
    trigger(app, false);
}

async fn run_check(app: AppHandle, manual: bool) {
    if !enabled(&app) {
        return;
    }

    let Some(state) = manager(&app) else {
        return;
    };
    {
        let mut inner = state.lock();
        if inner.checking {
            return;
        }
        // Already downloaded: nothing to do until the user restarts.
        if inner.downloaded.is_some() {
            return;
        }
        if !manual && !check_due_on_focus(inner.last_check, Instant::now()) {
            return;
        }
        inner.checking = true;
        inner.last_check = Some(Instant::now());
    }

    set_status(&app, UpdatePhase::Checking, None, false, manual, None);

    let checked = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => {
            warn!("updater unavailable: {e}");
            finish(&app, manual, None);
            return;
        }
    };

    match checked {
        Ok(Some(update)) => on_found(&app, update, manual).await,
        Ok(None) => {
            debug!("no update available");
            finish(&app, manual, None);
        }
        Err(e) => {
            // Background failures are just the log; a check the user asked for
            // says why.
            if manual {
                warn!("update check failed: {e}");
            } else {
                debug!("update check failed: {e}");
            }
            finish(&app, manual, Some("updates.checkFailed"));
        }
    }
}

/// Clears the in-flight flag and publishes the result of a check that found
/// nothing (or failed).
fn finish(app: &AppHandle, manual: bool, error_key: Option<&str>) {
    if let Some(state) = manager(app) {
        state.lock().checking = false;
    }
    let (phase, error) = match error_key {
        Some(key) if manual => (UpdatePhase::Error, Some(key.to_string())),
        // A background failure leaves the footer as it was.
        Some(_) => (UpdatePhase::Idle, None),
        None => (UpdatePhase::UpToDate, None),
    };
    set_status(app, phase, None, false, manual, error);
}

async fn on_found(app: &AppHandle, update: tauri_plugin_updater::Update, manual: bool) {
    let version = update.version.clone();
    debug!("update available: {version}");

    // Portable installs have no installer to run, and .deb/.rpm are owned by
    // the package manager: both are told, never replaced.
    if install_mode(crate::portable::is_portable(), bundle_type()) == InstallMode::NotifyOnly {
        notify_once(app, &version);
        if let Some(state) = manager(app) {
            state.lock().checking = false;
        }
        set_status(
            app,
            UpdatePhase::Available,
            Some(version),
            false,
            manual,
            None,
        );
        return;
    }

    set_status(
        app,
        UpdatePhase::Downloading,
        Some(version.clone()),
        false,
        manual,
        None,
    );

    // download() verifies the signature against the updater pubkey and only
    // then hands back the bytes.
    let downloaded = update.download(|_, _| {}, || {}).await;

    if let Some(state) = manager(app) {
        state.lock().checking = false;
    }

    match downloaded {
        Ok(bytes) => {
            info!("update {version} downloaded and verified");
            if let Some(state) = manager(app) {
                state.lock().downloaded = Some(Downloaded {
                    version: version.clone(),
                    bytes,
                    update,
                });
            }
            // One notification per version, and a "Restart to update" item.
            notify_once(app, &version);
            set_status(app, UpdatePhase::Ready, Some(version), true, manual, None);
            crate::tray::update_tray_menu(app);
        }
        Err(e) => {
            warn!("failed to download update {version}: {e}");
            let error = manual.then(|| "updates.downloadFailed".to_string());
            set_status(
                app,
                if manual {
                    UpdatePhase::Error
                } else {
                    UpdatePhase::Idle
                },
                Some(version),
                false,
                manual,
                error,
            );
        }
    }
}

/// Install the waiting update and restart. Refuses while the app is in the
/// middle of something the user cares about.
pub fn install_from_ui(app: &AppHandle) -> Result<(), String> {
    if busy(app) {
        return Err("updates.busy".to_string());
    }
    let Some(downloaded) = take_downloaded(app) else {
        return Err("updates.notReady".to_string());
    };
    info!("installing update {} and restarting", downloaded.version);
    if let Err(e) = downloaded.update.install(&downloaded.bytes) {
        error!("failed to install update {}: {e}", downloaded.version);
        return Err("updates.installFailed".to_string());
    }
    app.restart()
}

/// Install a waiting update as the app quits, so the next launch is already on
/// the new version. Never blocks quitting: the install is only attempted when
/// the bundle is somewhere we can write next to it.
pub fn install_on_quit(app: &AppHandle) {
    let Some(state) = manager(app) else {
        return;
    };
    let Some(downloaded) = state.lock().downloaded.take() else {
        return;
    };
    if !can_install_in_place() {
        warn!(
            "not installing update {} on quit: the app directory is not writable",
            downloaded.version
        );
        return;
    }
    info!("installing update {} on quit", downloaded.version);
    if let Err(e) = downloaded.update.install(&downloaded.bytes) {
        warn!("failed to install update on quit: {e}");
    }
}

fn take_downloaded(app: &AppHandle) -> Option<Downloaded> {
    manager(app).and_then(|state| state.lock().downloaded.take())
}

fn enabled(app: &AppHandle) -> bool {
    crate::settings::update_checks_effectively_enabled(&crate::settings::get_settings(app))
}

/// Publishes a status to the footer. The value is also kept for the snapshot
/// the webview asks for on mount.
fn set_status(
    app: &AppHandle,
    phase: UpdatePhase,
    version: Option<String>,
    installable: bool,
    manual: bool,
    error: Option<String>,
) {
    let status = UpdateStatus {
        phase,
        version,
        installable,
        manual,
        error,
    };
    if let Some(state) = manager(app) {
        state.lock().status = status.clone();
    }
    if let Err(e) = status.emit(app) {
        debug!("failed to emit update status: {e}");
    }
}

/// Tell the user once per version, and remember it so it never repeats.
fn notify_once(app: &AppHandle, version: &str) {
    let mut settings = crate::settings::get_settings(app);
    if !should_notify(&settings.notified_update_version, version) {
        debug!("already notified about {version}");
        return;
    }
    let locale = settings.app_language.clone();
    settings.notified_update_version = version.to_string();
    crate::settings::write_settings(app, settings);

    let strings = crate::tray_i18n::get_tray_translations(Some(locale));
    let title = strings
        .update_notification_title
        .replace("{{version}}", version);
    let body = strings.update_notification_body;
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        warn!("failed to show update notification: {e}");
    }
}

/// True when the app is doing something a restart would interrupt: recording,
/// transcribing, a meeting, or an agent task.
fn busy(app: &AppHandle) -> bool {
    let recording = app
        .try_state::<Arc<AudioRecordingManager>>()
        .is_some_and(|m| m.is_recording());
    let transcribing = app
        .try_state::<Arc<TranscriptionManager>>()
        .is_some_and(|m| m.job_active());
    recording
        || transcribing
        || crate::meeting::is_active()
        || crate::agent::proactive::busy()
        || crate::hud::is_visible()
}

/// Whether an install replaces the app in place or is left to the user.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstallMode {
    SelfInstall,
    NotifyOnly,
}

/// Portable builds and package-managed Linux installs cannot self-replace.
pub fn install_mode(
    portable: bool,
    bundle: Option<tauri::utils::config::BundleType>,
) -> InstallMode {
    if portable {
        return InstallMode::NotifyOnly;
    }
    match bundle {
        Some(tauri::utils::config::BundleType::Deb)
        | Some(tauri::utils::config::BundleType::Rpm) => InstallMode::NotifyOnly,
        _ => InstallMode::SelfInstall,
    }
}

fn bundle_type() -> Option<tauri::utils::config::BundleType> {
    tauri::utils::platform::bundle_type()
}

/// The delay until the next timer check: CHECK_INTERVAL plus or minus JITTER,
/// driven by a roll in [0, 1). The spread keeps a fleet of installs from
/// hitting the feed at the same minute.
pub fn next_check_delay(roll: f64) -> Duration {
    let jitter = 2.0 * roll.clamp(0.0, 1.0) - 1.0;
    let secs = CHECK_INTERVAL.as_secs_f64() + jitter * JITTER.as_secs_f64();
    Duration::from_secs_f64(secs.max(1.0))
}

/// Whether a check is due given the last one, for the once-an-hour throttle.
pub fn check_due_on_focus(last: Option<Instant>, now: Instant) -> bool {
    last.is_none_or(|last| now.duration_since(last) >= MIN_GAP)
}

/// One notification per version, remembered across runs.
pub fn should_notify(last_notified: &str, version: &str) -> bool {
    last_notified != version
}

/// A cheap [0, 1) roll for jitter. Not cryptographic: the clock, the process id
/// and a stack address, so runs and processes do not line up.
fn random_unit() -> f64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    now.as_nanos().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    (&now as *const Duration).hash(&mut hasher);
    (hasher.finish() >> 11) as f64 / (1u64 << 53) as f64
}

/// macOS installs by moving the new bundle over the running one and, when that
/// fails with a permission error, falls back to an admin AppleScript prompt —
/// which would deadlock the quit path. Only install on quit when a probe file
/// can be written next to the app.
fn can_install_in_place() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let Ok(extract_path) = tauri_plugin_updater::extract_path_from_executable(&exe) else {
        return false;
    };
    extract_path.parent().is_some_and(writable_dir)
}

fn writable_dir(dir: &Path) -> bool {
    let probe = dir.join(format!(".ambient-update-probe-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jitter_stays_within_half_an_hour() {
        let low = next_check_delay(0.0);
        let mid = next_check_delay(0.5);
        let high = next_check_delay(1.0);
        assert_eq!(mid, CHECK_INTERVAL);
        assert_eq!(low, CHECK_INTERVAL - JITTER);
        assert_eq!(high, CHECK_INTERVAL + JITTER);
        for roll in [0.0, 0.17, 0.5, 0.83, 1.0] {
            let secs = next_check_delay(roll).as_secs_f64();
            assert!(
                (5.5 * 3600.0..=6.5 * 3600.0).contains(&secs),
                "roll {roll} gave {secs}s"
            );
        }
    }

    #[test]
    fn out_of_range_rolls_are_clamped() {
        assert_eq!(next_check_delay(-3.0), CHECK_INTERVAL - JITTER);
        assert_eq!(next_check_delay(9.0), CHECK_INTERVAL + JITTER);
    }

    #[test]
    fn focus_check_is_throttled_to_an_hour() {
        let now = Instant::now();
        assert!(check_due_on_focus(None, now));
        assert!(!check_due_on_focus(
            Some(now - Duration::from_secs(59 * 60)),
            now
        ));
        assert!(check_due_on_focus(
            Some(now - Duration::from_secs(61 * 60)),
            now
        ));
    }

    #[test]
    fn a_version_is_notified_only_once() {
        assert!(should_notify("", "0.1.9"));
        assert!(!should_notify("0.1.9", "0.1.9"));
        assert!(should_notify("0.1.9", "0.1.10"));
    }

    #[test]
    fn portable_and_package_installs_are_notify_only() {
        use tauri::utils::config::BundleType;
        assert_eq!(
            install_mode(true, Some(BundleType::Nsis)),
            InstallMode::NotifyOnly
        );
        assert_eq!(
            install_mode(false, Some(BundleType::Deb)),
            InstallMode::NotifyOnly
        );
        assert_eq!(
            install_mode(false, Some(BundleType::Rpm)),
            InstallMode::NotifyOnly
        );
        assert_eq!(
            install_mode(false, Some(BundleType::App)),
            InstallMode::SelfInstall
        );
        assert_eq!(
            install_mode(false, Some(BundleType::AppImage)),
            InstallMode::SelfInstall
        );
        assert_eq!(
            install_mode(false, Some(BundleType::Nsis)),
            InstallMode::SelfInstall
        );
        assert_eq!(install_mode(false, None), InstallMode::SelfInstall);
    }
}
