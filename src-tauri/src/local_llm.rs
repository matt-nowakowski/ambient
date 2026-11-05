//! On-device AI that isn't Apple Intelligence: a small instruction model (the
//! catalog's `reasoningModel`) run by llama.cpp's `llama-server` on localhost.
//! Both are downloaded on demand ("Download on-device AI"); the server is
//! started when a task needs it and stopped after a while idle, so the model's
//! memory is only held while it's in use.
//!
//! Why a separate process and not llama.cpp linked in: transcribe-cpp vendors
//! its own ggml (0.26, statically on macOS and Windows ARM, as shared
//! libraries elsewhere), and llama.cpp brings a different ggml (0.28). Two
//! ggml builds in one process either collide at link time or, with shared
//! libraries, interpose each other's symbols at run time. A process also keeps
//! a 2 GB model out of dictation's memory and a crash out of the app, and the
//! pinned upstream builds cover all seven targets without touching our CI.
//!
//! The server binaries are llama.cpp's own release archives, pinned by
//! SHA-256 (the trust anchor; GitHub and our mirror are just pipes).

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use log::{debug, info, warn};
use once_cell::sync::OnceCell;
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::llm_client::RequestLimits;
use crate::managers::model::ModelManager;

/// The llama.cpp release the server binaries come from.
const RELEASE: &str = "b12098";

/// The model's context, prompt and reply together. Qwen3 1.7B takes 32k;
/// 12k tokens holds the router's long prompt (~26k characters) with room
/// for the transcript and reply. With an 8-bit K cache that's about 1 GB on
/// top of the model. The server keeps the last prompt's prefix, so the
/// router's fixed instructions are only read once per start.
const CONTEXT_TOKENS: u32 = 12_288;

/// The most prompt text sent to it (system + user), about 8–9k tokens.
pub const MAX_CHARS: usize = 32_000;

/// Stop the server after this long without a request: the model's memory
/// (~2 GB) goes back to the system. The next task starts it again (a few
/// seconds).
const IDLE_STOP: Duration = Duration::from_secs(10 * 60);

/// Loading the model from disk (and, the first time on Vulkan, compiling
/// shaders) before the server answers.
const START_TIMEOUT: Duration = Duration::from_secs(90);

/// A task's default deadline when its caller gives none.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);

/// One platform's llama.cpp release archive.
pub struct RuntimeAsset {
    pub name: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

impl RuntimeAsset {
    /// Upstream first, then our mirror (`{api}/models/llama.cpp/{release}/…`).
    pub fn urls(&self) -> Vec<String> {
        vec![
            format!(
                "https://github.com/ggml-org/llama.cpp/releases/download/{RELEASE}/{}",
                self.name
            ),
            format!(
                "{}/models/llama.cpp/{RELEASE}/{}",
                env!("BRAND_API_BASE_URL"),
                self.name
            ),
        ]
    }
}

/// Every archive we use, by target. Matches the app's own acceleration:
/// Metal on Apple silicon, CPU on Intel Macs and Windows on ARM, Vulkan on
/// Windows x64 and Linux (llama.cpp falls back to its CPU backend without a
/// Vulkan device).
pub const RUNTIME_ASSETS: &[(&str, RuntimeAsset)] = &[
    (
        "macos-aarch64",
        RuntimeAsset {
            name: "llama-b12098-bin-macos-arm64.tar.gz",
            size: 16_650_925,
            sha256: "73371d09105a776f8025c9b4a9634865adfd31653aa5819a5f07c3f7822221b2",
        },
    ),
    (
        "macos-x86_64",
        RuntimeAsset {
            name: "llama-b12098-bin-macos-x64.tar.gz",
            size: 12_387_660,
            sha256: "611d0666affdee08b7b93ba0943a67f01b0ef948f7ddeb9b1dd0a67383add437",
        },
    ),
    (
        "windows-x86_64",
        RuntimeAsset {
            name: "llama-b12098-bin-win-vulkan-x64.zip",
            size: 37_660_090,
            sha256: "3d8f6c95b0a18c9b3c7bdfc36cf22400d3f0c03551a89e72f7b90dc42bac5e2a",
        },
    ),
    (
        "windows-aarch64",
        RuntimeAsset {
            name: "llama-b12098-bin-win-cpu-arm64.zip",
            size: 13_197_187,
            sha256: "18cdf7c420c84438d52884e7fe7a7c9bf4180ef6fa2d5565e4151c818c45de5c",
        },
    ),
    (
        "linux-x86_64",
        RuntimeAsset {
            name: "llama-b12098-bin-ubuntu-vulkan-x64.tar.gz",
            size: 35_860_098,
            sha256: "e8425b66c7f6cf3da85fbc832b71bf15a99a24fac506cce3dbf1b09dcf0459f5",
        },
    ),
    (
        "linux-aarch64",
        RuntimeAsset {
            name: "llama-b12098-bin-ubuntu-vulkan-arm64.tar.gz",
            size: 29_164_722,
            sha256: "6c123ef6ce59922623fb122400bfe264abc3d4e3d635c8453a8db9af82d7236e",
        },
    ),
];

/// This computer's archive, if llama.cpp builds one for it.
pub fn runtime_asset() -> Option<&'static RuntimeAsset> {
    let target = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    RUNTIME_ASSETS
        .iter()
        .find(|(t, _)| *t == target)
        .map(|(_, asset)| asset)
}

static APP: OnceCell<AppHandle> = OnceCell::new();

/// The app, once started (for code that has no handle of its own).
pub fn app() -> Option<&'static AppHandle> {
    APP.get()
}

/// Remember the app (for paths and the model manager) and stop a server a
/// previous run left behind.
pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
    if let Some(pid_file) = base_dir().map(|d| d.join("server.pid")) {
        if let Some(pid) = std::fs::read_to_string(&pid_file)
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
        {
            kill_stale(pid);
        }
        let _ = std::fs::remove_file(pid_file);
    }
    std::thread::Builder::new()
        .name("ambient-local-llm-idle".into())
        .spawn(|| loop {
            std::thread::sleep(Duration::from_secs(30));
            let idle = SERVER
                .lock()
                .ok()
                .and_then(|s| s.as_ref().map(|s| s.last_used.elapsed() > IDLE_STOP))
                .unwrap_or(false);
            if idle {
                info!("On-device AI idle; stopping its server");
                stop();
            }
        })
        .ok();
}

fn base_dir() -> Option<PathBuf> {
    let app = APP.get()?;
    crate::portable::app_data_dir(app)
        .ok()
        .map(|d| d.join("on-device-ai"))
}

fn runtime_dir() -> Option<PathBuf> {
    base_dir().map(|d| d.join(format!("llama-{RELEASE}")))
}

/// Where the archive downloads to (resumable) before it's unpacked.
pub fn archive_path() -> anyhow::Result<PathBuf> {
    let dir = base_dir().ok_or_else(|| anyhow::anyhow!("App data folder unavailable"))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(format!("llama-{RELEASE}.partial")))
}

const SERVER_EXE: &str = if cfg!(windows) {
    "llama-server.exe"
} else {
    "llama-server"
};

/// `llama-server` in the unpacked release (at its root or one folder down,
/// as the archives differ).
fn server_binary() -> Option<PathBuf> {
    let dir = runtime_dir()?;
    let direct = dir.join(SERVER_EXE);
    if direct.is_file() {
        return Some(direct);
    }
    std::fs::read_dir(&dir)
        .ok()?
        .flatten()
        .map(|e| e.path().join(SERVER_EXE))
        .find(|p| p.is_file())
}

pub fn runtime_installed() -> bool {
    server_binary().is_some()
}

/// Unpack a verified archive into the runtime folder, then drop the archive.
/// The system's tar reads both formats (Windows 10+ ships bsdtar, which
/// reads zip); the SHA-256 already pinned the exact bytes.
pub fn install_runtime(archive: &Path) -> anyhow::Result<()> {
    let dir = runtime_dir().ok_or_else(|| anyhow::anyhow!("App data folder unavailable"))?;
    let staging = dir.with_extension("unpacking");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging)?;
    let mut tar = Command::new(tar_command());
    tar.arg("-xf").arg(archive).arg("-C").arg(&staging);
    no_window(&mut tar);
    let out = tar.output()?;
    if !out.status.success() {
        let _ = std::fs::remove_dir_all(&staging);
        anyhow::bail!(
            "Couldn't unpack the on-device AI runtime: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(&staging, &dir)?;
    let _ = std::fs::remove_file(archive);
    let binary = server_binary()
        .ok_or_else(|| anyhow::anyhow!("The on-device AI runtime has no llama-server"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755))?;
    }
    info!("On-device AI runtime installed at {binary:?}");
    Ok(())
}

fn tar_command() -> PathBuf {
    #[cfg(windows)]
    {
        let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
        PathBuf::from(root).join("System32").join("tar.exe")
    }
    #[cfg(not(windows))]
    {
        ["/usr/bin/tar", "/bin/tar"]
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_file())
            .unwrap_or_else(|| PathBuf::from("tar"))
    }
}

/// Delete the runtime (the model file is the model manager's).
pub fn remove_runtime() -> std::io::Result<()> {
    if let Some(dir) = base_dir() {
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
    }
    Ok(())
}

fn model_path() -> Option<PathBuf> {
    APP.get()?
        .try_state::<std::sync::Arc<ModelManager>>()?
        .reasoning_model_path()
}

/// Downloaded and runnable on this computer.
pub fn ready() -> bool {
    runtime_asset().is_some() && runtime_installed() && model_path().is_some()
}

// ── The server ──────────────────────────────────────────────────────────────

struct Server {
    child: Child,
    port: u16,
    key: String,
    last_used: Instant,
}

static SERVER: Mutex<Option<Server>> = Mutex::new(None);
/// One start at a time; later callers wait and then find it running.
static STARTING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

static CLIENT: once_cell::sync::Lazy<reqwest::Client> = once_cell::sync::Lazy::new(|| {
    reqwest::Client::builder()
        // Loopback only: never through a system proxy.
        .no_proxy()
        .connect_timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default()
});

/// The running server's port and key, marking it used.
fn running() -> Option<(u16, String)> {
    let mut guard = SERVER.lock().ok()?;
    let server = guard.as_mut()?;
    if !matches!(server.child.try_wait(), Ok(None)) {
        warn!("On-device AI server exited; it will be started again");
        *guard = None;
        return None;
    }
    server.last_used = Instant::now();
    Some((server.port, server.key.clone()))
}

async fn ensure_server() -> Option<(u16, String)> {
    if let Some(s) = running() {
        return Some(s);
    }
    let _starting = STARTING.lock().await;
    if let Some(s) = running() {
        return Some(s);
    }
    let binary = server_binary()?;
    let model = model_path()?;
    let port = free_port()?;
    let key = random_key()?;
    let started = Instant::now();
    let mut cmd = Command::new(&binary);
    cmd.args(server_args(&model, port, &key))
        .current_dir(binary.parent()?)
        .stdin(Stdio::null())
        .stdout(Stdio::null());
    // The server's own log, for support: overwritten each start.
    match base_dir().and_then(|d| std::fs::File::create(d.join("server.log")).ok()) {
        Some(log) => cmd.stderr(log),
        None => cmd.stderr(Stdio::null()),
    };
    #[cfg(target_os = "linux")]
    {
        // The release links its own libraries next to the binary.
        if let Some(dir) = binary.parent() {
            cmd.env("LD_LIBRARY_PATH", dir);
        }
        // Ends with us even if we crash.
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }
    }
    no_window(&mut cmd);
    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            warn!("Couldn't start the on-device AI server: {e}");
            return None;
        }
    };
    if let Some(dir) = base_dir() {
        let _ = std::fs::write(dir.join("server.pid"), child.id().to_string());
    }
    info!("Starting the on-device AI server on port {port}");
    if let Ok(mut guard) = SERVER.lock() {
        *guard = Some(Server {
            child,
            port,
            key: key.clone(),
            last_used: Instant::now(),
        });
    }
    // Ready when /health says so (503 while the model loads).
    let health = format!("http://127.0.0.1:{port}/health");
    while started.elapsed() < START_TIMEOUT {
        tokio::time::sleep(Duration::from_millis(200)).await;
        let alive = SERVER
            .lock()
            .ok()
            .and_then(|mut g| g.as_mut().map(|s| matches!(s.child.try_wait(), Ok(None))))
            .unwrap_or(false);
        if !alive {
            warn!("On-device AI server exited while starting (see on-device-ai/server.log)");
            stop();
            return None;
        }
        if CLIENT
            .get(&health)
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success())
        {
            info!(
                "On-device AI server ready in {}ms",
                started.elapsed().as_millis()
            );
            return Some((port, key));
        }
    }
    warn!("On-device AI server didn't become ready in time");
    stop();
    None
}

/// The server's command line: loopback only, a key per run, one slot,
/// thinking off (Qwen3's template), no web UI.
fn server_args(model: &Path, port: u16, key: &str) -> Vec<String> {
    vec![
        "-m".into(),
        model.to_string_lossy().into_owned(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--api-key".into(),
        key.into(),
        "-c".into(),
        CONTEXT_TOKENS.to_string(),
        // Halves the K cache; unlike a quantized V cache it doesn't need
        // flash attention, which not every backend has.
        "-ctk".into(),
        "q8_0".into(),
        "-np".into(),
        "1".into(),
        "--jinja".into(),
        "--reasoning".into(),
        "off".into(),
        "--no-webui".into(),
    ]
}

fn free_port() -> Option<u16> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).ok()?;
    listener.local_addr().ok().map(|a| a.port())
}

fn random_key() -> Option<String> {
    use ring::rand::SecureRandom;
    let mut bytes = [0u8; 16];
    ring::rand::SystemRandom::new().fill(&mut bytes).ok()?;
    Some(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

#[allow(unused_variables)]
fn no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

/// Stop the server (idle, quitting, or the model being deleted).
pub fn stop() {
    let server = SERVER.lock().ok().and_then(|mut g| g.take());
    if let Some(mut server) = server {
        let _ = server.child.kill();
        let _ = server.child.wait();
        if let Some(dir) = base_dir() {
            let _ = std::fs::remove_file(dir.join("server.pid"));
        }
        debug!("On-device AI server stopped");
    }
}

/// A server from a run that ended without stopping it (a crash), if that pid
/// is still a llama-server.
fn kill_stale(pid: u32) {
    #[cfg(unix)]
    {
        let is_ours = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "comm="])
            .output()
            .ok()
            .is_some_and(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .trim()
                    .ends_with(SERVER_EXE)
            });
        if is_ours {
            info!("Stopping an on-device AI server left from the last run ({pid})");
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }
        }
    }
    #[cfg(windows)]
    {
        let mut list = Command::new("tasklist");
        list.args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"]);
        no_window(&mut list);
        let is_ours = list
            .output()
            .ok()
            .is_some_and(|o| String::from_utf8_lossy(&o.stdout).contains(SERVER_EXE));
        if is_ours {
            info!("Stopping an on-device AI server left from the last run ({pid})");
            let mut kill = Command::new("taskkill");
            kill.args(["/PID", &pid.to_string(), "/F"]);
            no_window(&mut kill);
            let _ = kill.output();
        }
    }
}

/// Start the server ahead of a task that's about to need it (the user is
/// still speaking), so the model is loaded by then.
pub fn warm_up() {
    if !ready() {
        return;
    }
    tauri::async_runtime::spawn(async {
        let _ = ensure_server().await;
    });
}

#[derive(Deserialize)]
struct Reply {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    #[serde(default)]
    content: Option<String>,
}

/// System + user prompt → the model's text, on this computer. None when it
/// isn't downloaded, won't start, times out, or says nothing.
pub async fn complete(system: &str, user: &str, limits: RequestLimits) -> Option<String> {
    if !ready() || system.len() + user.len() > MAX_CHARS {
        return None;
    }
    let deadline = limits.timeout.unwrap_or(DEFAULT_TIMEOUT);
    let started = Instant::now();
    let (port, key) = tokio::time::timeout(START_TIMEOUT, ensure_server())
        .await
        .ok()
        .flatten()?;
    let mut body = serde_json::json!({
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "stream": false,
        "temperature": 0.2,
        // Belt and braces with `--reasoning off`.
        "chat_template_kwargs": { "enable_thinking": false },
    });
    if let Some(max) = limits.max_tokens {
        body["max_tokens"] = max.into();
    }
    // A cold start already took some of the caller's time; the request gets
    // the rest, but never less than a few seconds.
    let left = deadline
        .saturating_sub(started.elapsed())
        .max(Duration::from_secs(3));
    let reply = CLIENT
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .bearer_auth(key)
        .timeout(left)
        .json(&body)
        .send()
        .await;
    if let Ok(mut guard) = SERVER.lock() {
        if let Some(s) = guard.as_mut() {
            s.last_used = Instant::now();
        }
    }
    let reply = match reply {
        Ok(r) if r.status().is_success() => r.json::<Reply>().await.ok()?,
        Ok(r) => {
            warn!("On-device AI answered {}", r.status());
            return None;
        }
        Err(e) => {
            warn!("On-device AI request failed: {e}");
            return None;
        }
    };
    let text = reply.choices.into_iter().next()?.message.content?;
    let text = crate::agent::reasoning::strip(&text);
    debug!(
        "On-device AI answered in {}ms",
        started.elapsed().as_millis()
    );
    (!text.trim().is_empty()).then_some(text)
}

/// [`complete`] from a plain thread (the suggestion judge's worker).
pub fn complete_blocking(system: &str, user: &str, limits: RequestLimits) -> Option<String> {
    let (s, u) = (system.to_string(), user.to_string());
    std::thread::spawn(move || {
        tauri::async_runtime::block_on(async move { complete(&s, &u, limits).await })
    })
    .join()
    .ok()
    .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_target_the_app_ships_has_a_pinned_runtime() {
        for target in [
            "macos-aarch64",
            "macos-x86_64",
            "windows-x86_64",
            "windows-aarch64",
            "linux-x86_64",
            "linux-aarch64",
        ] {
            let (_, asset) = RUNTIME_ASSETS
                .iter()
                .find(|(t, _)| *t == target)
                .unwrap_or_else(|| panic!("no runtime for {target}"));
            assert!(asset.name.contains(RELEASE));
            assert_eq!(asset.sha256.len(), 64);
            assert!(asset.size > 1_000_000);
            assert!(asset.urls()[0].starts_with("https://github.com/ggml-org/llama.cpp/"));
        }
        assert!(runtime_asset().is_some(), "this build target has a runtime");
    }

    #[test]
    fn server_listens_on_loopback_with_thinking_off() {
        let args = server_args(Path::new("/m.gguf"), 4321, "k");
        let joined = args.join(" ");
        assert!(joined.contains("--host 127.0.0.1"));
        assert!(joined.contains("--port 4321"));
        assert!(joined.contains("--api-key k"));
        assert!(joined.contains("--reasoning off"));
        assert!(joined.contains("--no-webui"));
    }

    #[test]
    fn keys_are_random_hex() {
        let a = random_key().unwrap();
        assert_eq!(a.len(), 32);
        assert_ne!(a, random_key().unwrap());
    }
}
