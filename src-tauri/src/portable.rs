//! Portable mode support for Ambient, and where downloaded models live.
//!
//! When a file named `portable` exists next to the executable, all user data
//! (settings, models, recordings, database, logs) is stored in a `Data/`
//! directory alongside the executable instead of `%APPDATA%`.
//!
//! Either way, Hugging Face downloads go into Ambient's own folder rather than
//! the cache other tools share (`~/.cache/huggingface`), so uninstalling
//! Ambient removes them and other tools' clean-ups can't.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

/// Contents of the `portable` marker file; the NSIS installer writes the same string.
const PORTABLE_MARKER: &str = concat!(env!("BRAND_NAME"), " Portable Mode");

static PORTABLE_DATA_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
static PREVIOUS_HF_HOME: OnceLock<Option<PathBuf>> = OnceLock::new();

/// The Hugging Face organisation every catalog model is published under. Its
/// repos are Ambient's own, so they're moved out of the shared cache.
pub(crate) const MODEL_ORG: &str = "tryambientai";

/// Detect portable mode by looking for a `portable` marker file next to the exe.
/// Must be called once at startup before Tauri initializes.
pub fn init() {
    let previous_hf_home = std::env::var_os("HF_HOME").map(PathBuf::from);
    let _ = PREVIOUS_HF_HOME.set(previous_hf_home);

    PORTABLE_DATA_DIR.get_or_init(|| {
        let exe_path = std::env::current_exe().ok()?;
        let exe_dir = exe_path.parent()?;

        let marker_path = exe_dir.join("portable");
        let data_dir = exe_dir.join("Data");

        let is_portable = if is_valid_portable_marker(&marker_path) {
            true
        } else if marker_path.exists() && data_dir.exists() {
            // Migration: v0.8.0 created an empty marker file. If we find an
            // empty/invalid marker alongside an existing Data/ dir, this is a
            // real portable install — upgrade the marker in place.
            eprintln!("[portable] upgrading legacy empty marker to magic string");
            let _ = std::fs::write(&marker_path, PORTABLE_MARKER);
            true
        } else {
            false
        };

        if is_portable {
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).ok()?;
            }
            eprintln!("[portable] data dir: {}", data_dir.display());
            Some(data_dir)
        } else {
            None
        }
    });

    match data_dir() {
        Some(dir) => {
            let hf_home = hugging_face_home(dir);
            std::env::set_var("HF_HOME", &hf_home);
            eprintln!("[portable] Hugging Face home: {}", hf_home.display());
        }
        None => {
            let Some(dir) = installed_model_dir() else {
                return;
            };
            let hf_home = hugging_face_home(&dir);
            std::env::set_var("HF_HOME", &hf_home);
            adopt_shared_models(shared_hf_cache().path(), &hf_home.join("hub"));
        }
    }
}

/// Where an installed (not portable) Ambient keeps model downloads: the
/// per-user local data folder (`~/Library/Application Support/<id>` on macOS,
/// `%LOCALAPPDATA%\<id>` on Windows, `~/.local/share/<id>` on Linux). Local,
/// not roaming, because models are gigabytes.
fn installed_model_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join(env!("BRAND_IDENTIFIER")))
}

/// The Hugging Face cache other tools share: `HF_HOME` as it was before
/// Ambient started, or hf-hub's default (`~/.cache/huggingface/hub`).
/// Models already there are still found, so nothing is downloaded twice.
pub fn shared_hf_cache() -> hf_hub::Cache {
    previous_hf_home()
        .map(|home| hf_hub::Cache::new(home.join("hub")))
        .unwrap_or_default()
}

/// Move Ambient's own model repos from the shared cache into ours. On the
/// same disk a move is an instant rename; anything that can't move (another
/// disk, a file in use) stays put and is still found there. Other tools'
/// models are never touched.
fn adopt_shared_models(shared_hub: &Path, own_hub: &Path) {
    if shared_hub == own_hub {
        return;
    }
    let Ok(entries) = std::fs::read_dir(shared_hub) else {
        return;
    };
    let prefix = format!("models--{MODEL_ORG}--");
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str().filter(|name| name.starts_with(&prefix)) else {
            continue;
        };
        let target = own_hub.join(name);
        if target.exists() || std::fs::create_dir_all(own_hub).is_err() {
            continue;
        }
        match std::fs::rename(entry.path(), &target) {
            Ok(()) => {
                eprintln!("[models] moved {name} into {}", own_hub.display());
                // hf-hub's lock folder for the repo; harmless, but it's ours.
                let _ = std::fs::remove_dir_all(shared_hub.join(".locks").join(name));
            }
            Err(e) => eprintln!("[models] left {name} in the shared cache: {e}"),
        }
    }
}

/// Keep all data in `dir` for this run (the test suite's temporary folder),
/// whatever marker is next to the executable. Call before `init`.
pub fn use_dir(dir: PathBuf) {
    let _ = PORTABLE_DATA_DIR.set(Some(dir));
}

/// Return the Hugging Face home configured before Ambient redirected it.
///
/// Releases before 0.1.16 (and portable ones before v0.9.6) downloaded models
/// to this location (or to hf-hub's default cache when it is `None`). Keeping
/// it lets the model manager recognize those downloads without copying
/// multi-gigabyte files. New downloads never go here, but deleting a model
/// removes its copies here too, even though the cache may be shared with other
/// applications.
pub fn previous_hf_home() -> Option<&'static PathBuf> {
    PREVIOUS_HF_HOME.get().and_then(|path| path.as_ref())
}

/// Keep hf-hub downloads inside the portable data directory. hf-hub appends
/// its own `hub` component to `HF_HOME` for model snapshots and blobs.
fn hugging_face_home(data_dir: &Path) -> PathBuf {
    data_dir.join("huggingface")
}

/// Returns `true` if running in portable mode.
pub fn is_portable() -> bool {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref()).is_some()
}

/// Get the portable data dir (if active). Does not require an AppHandle.
/// Returns `None` when not in portable mode.
pub fn data_dir() -> Option<&'static PathBuf> {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref())
}

/// Portable-aware replacement for `app.path().app_data_dir()`.
pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.clone())
    } else {
        app.path().app_data_dir()
    }
}

/// Portable-aware replacement for `app.path().app_log_dir()`.
pub fn app_log_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.join("logs"))
    } else {
        app.path().app_log_dir()
    }
}

/// Resolve a relative path against the app data directory (portable-aware).
/// Replaces `app.path().resolve(path, BaseDirectory::AppData)`.
pub fn resolve_app_data(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, tauri::Error> {
    Ok(app_data_dir(app)?.join(relative))
}

/// Get the path to use with `tauri-plugin-store`.
/// Returns an absolute path in portable mode (so the store plugin writes to
/// the portable Data dir) or the original relative path otherwise.
pub fn store_path(relative: &str) -> PathBuf {
    if let Some(dir) = data_dir() {
        dir.join(relative)
    } else {
        PathBuf::from(relative)
    }
}

/// Check if a marker file path contains the portable magic string.
/// Extracted for testability.
fn is_valid_portable_marker(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path)
        .map(|s| s.trim().starts_with(PORTABLE_MARKER))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_valid_magic_string_enables_portable() {
        let dir = std::env::temp_dir().join("ambient_test_valid");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "{PORTABLE_MARKER}").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_empty_file_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("ambient_test_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_wrong_content_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("ambient_test_wrong");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "some other content").unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_missing_file_does_not_enable_portable() {
        let path = std::path::Path::new("/nonexistent/portable");
        assert!(!is_valid_portable_marker(path));
    }

    #[test]
    fn test_legacy_empty_marker_without_data_dir_does_not_enable_portable() {
        // Empty marker alone (scoop scenario) — no Data/ dir → not portable
        let dir = std::env::temp_dir().join("ambient_test_legacy_no_data");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_magic_string_with_whitespace_enables_portable() {
        let dir = std::env::temp_dir().join("ambient_test_ws");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "  {PORTABLE_MARKER}\n").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn adopting_moves_only_our_models() {
        let root = std::env::temp_dir().join(format!("ambient_adopt_{}", std::process::id()));
        let shared = root.join("shared").join("hub");
        let own = root.join("own").join("hub");
        let ours = format!("models--{MODEL_ORG}--parakeet-gguf");
        let theirs = "models--Systran--faster-whisper-small.en";
        for repo in [ours.as_str(), theirs] {
            std::fs::create_dir_all(shared.join(repo).join("blobs")).unwrap();
            std::fs::write(shared.join(repo).join("blobs").join("abc"), b"x").unwrap();
        }
        std::fs::create_dir_all(shared.join(".locks").join(&ours)).unwrap();

        adopt_shared_models(&shared, &own);

        assert!(own.join(&ours).join("blobs").join("abc").is_file());
        assert!(!shared.join(&ours).exists());
        assert!(!shared.join(".locks").join(&ours).exists());
        assert!(shared.join(theirs).join("blobs").join("abc").is_file());
        assert!(!own.join(theirs).exists());

        // A second run, or a copy we already have, leaves both alone.
        std::fs::create_dir_all(shared.join(&ours)).unwrap();
        adopt_shared_models(&shared, &own);
        assert!(shared.join(&ours).exists());
        assert!(own.join(&ours).join("blobs").join("abc").is_file());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn test_hugging_face_home_is_inside_portable_data() {
        let data_dir = Path::new("portable-root").join("Data");

        assert_eq!(hugging_face_home(&data_dir), data_dir.join("huggingface"));
    }
}
