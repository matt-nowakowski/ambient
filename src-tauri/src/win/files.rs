//! Finding the user's files on Windows, the Spotlight analogue: the Windows
//! Search index (names and contents) through its OLE DB provider, else a
//! quick, bounded walk of Desktop, Documents and Downloads plus the Recent
//! items list. Results are filtered like the macOS ones (no hidden, app,
//! code or data files).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use windows::core::{Interface, GUID, HSTRING};
use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
use windows::Win32::System::Com::{
    CoCreateInstance, CoTaskMemFree, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads, FOLDERID_Recent, IShellLinkW,
    SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT,
};

use super::com::{self, Dispatch};
use super::rules;

const MAX_RESULTS: usize = 12;
const WALK_BUDGET: Duration = Duration::from_millis(400);
const WALK_MAX_ENTRIES: usize = 20_000;
const WALK_MAX_DEPTH: usize = 5;

/// The user's home folder.
pub fn home() -> Option<String> {
    std::env::var("USERPROFILE").ok().filter(|h| !h.is_empty())
}

/// Files whose name (or, through the index, content) has every word, as
/// (native path, display name), most relevant first.
pub fn search(words: &[String]) -> Vec<(String, String)> {
    let Some(home) = home() else {
        return Vec::new();
    };
    let words = rules::safe_words(words);
    if words.is_empty() {
        return Vec::new();
    }
    com::ensure_init();
    let mut found = recent(&words);
    match index_search(&words, &home) {
        Some(hits) => found.extend(hits),
        None => found.extend(walk(&words)),
    }
    let mut seen = std::collections::HashSet::new();
    found
        .into_iter()
        .filter(|(path, _)| seen.insert(path.to_lowercase()))
        .filter(|(path, _)| crate::agent::personal::is_user_path(path, &home))
        .filter(|(path, _)| !is_hidden(Path::new(path)))
        .take(MAX_RESULTS)
        .collect()
}

/// The Windows Search index. `None` when the service or provider isn't
/// there (then the walk runs instead).
fn index_search(words: &[String], home: &str) -> Option<Vec<(String, String)>> {
    let sql = rules::search_sql(words, home)?;
    let conn = Dispatch::create("ADODB.Connection").ok()?;
    conn.put("CommandTimeout", VARIANT::from(2i32)).ok();
    conn.call(
        "Open",
        &[VARIANT::from(
            "Provider=Search.CollatorDSO;Extended Properties='Application=Windows';",
        )],
    )
    .ok()?;
    let result = (|| {
        let rs = conn.object("Execute", &[VARIANT::from(sql.as_str())])?;
        let mut out = Vec::new();
        for _ in 0..40 {
            let eof = rs.get("EOF").ok().and_then(|v| bool::try_from(&v).ok());
            if eof != Some(false) {
                break;
            }
            let fields = rs.object("Fields", &[])?;
            let field = |i: i32| {
                fields
                    .object("Item", &[VARIANT::from(i)])
                    .map(|f| f.text("Value"))
                    .unwrap_or_default()
            };
            let path = field(0);
            let name = field(1);
            if !path.is_empty() {
                let name = if name.is_empty() {
                    file_name(&path)
                } else {
                    name
                };
                out.push((path, name));
            }
            rs.call("MoveNext", &[]).ok()?;
        }
        let _ = rs.call("Close", &[]);
        Some(out)
    })();
    let _ = conn.call("Close", &[]);
    result
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// A known folder's path (OneDrive-redirected folders included).
pub fn known_folder(id: &GUID) -> Option<PathBuf> {
    let p = unsafe { SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None) }.ok()?;
    let path = unsafe { p.to_string() }.ok();
    unsafe { CoTaskMemFree(Some(p.0 as *const _)) };
    path.map(PathBuf::from)
}

fn is_hidden(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    std::fs::metadata(path)
        .map(|m| m.file_attributes() & (HIDDEN | SYSTEM) != 0)
        .unwrap_or(false)
}

/// Fallback: file names under Desktop, Documents and Downloads, bounded by
/// time, entries and depth.
fn walk(words: &[String]) -> Vec<(String, String)> {
    let deadline = Instant::now() + WALK_BUDGET;
    let roots = [&FOLDERID_Desktop, &FOLDERID_Documents, &FOLDERID_Downloads];
    let mut queue: VecDeque<(PathBuf, usize)> = roots
        .iter()
        .filter_map(|id| known_folder(id))
        .map(|p| (p, 0))
        .collect();
    let mut out = Vec::new();
    let mut entries = 0;
    while let Some((dir, depth)) = queue.pop_front() {
        if Instant::now() > deadline || entries > WALK_MAX_ENTRIES || out.len() >= MAX_RESULTS {
            break;
        }
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            entries += 1;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.starts_with('~') || name.starts_with('$') {
                continue;
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                if depth < WALK_MAX_DEPTH {
                    queue.push_back((entry.path(), depth + 1));
                }
            } else if kind.is_file() && rules::name_matches(&name, words) {
                out.push((entry.path().to_string_lossy().to_string(), name));
            }
        }
    }
    out
}

/// Recent items (the shortcuts Explorer keeps in `Recent`) whose name has
/// every word, resolved to the file they point at.
fn recent(words: &[String]) -> Vec<(String, String)> {
    let Some(dir) = known_folder(&FOLDERID_Recent) else {
        return Vec::new();
    };
    let Ok(read) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut items: Vec<(std::time::SystemTime, PathBuf, String)> = read
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let stem = rules::shortcut_stem(&name)?.to_string();
            rules::name_matches(&stem, words).then_some(())?;
            let modified = e.metadata().and_then(|m| m.modified()).ok()?;
            Some((modified, e.path(), stem))
        })
        .collect();
    items.sort_by(|a, b| b.0.cmp(&a.0));
    items
        .into_iter()
        .take(MAX_RESULTS)
        .filter_map(|(_, lnk, stem)| {
            let target = resolve_shortcut(&lnk)?;
            let is_file = Path::new(&target).is_file();
            is_file.then_some((target, stem))
        })
        .collect()
}

/// The path a `.lnk` shortcut points at.
pub fn resolve_shortcut(lnk: &Path) -> Option<String> {
    com::ensure_init();
    let link: IShellLinkW =
        unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }.ok()?;
    let file: IPersistFile = link.cast().ok()?;
    unsafe { file.Load(&HSTRING::from(lnk.as_os_str()), STGM_READ) }.ok()?;
    let mut buf = [0u16; 1024];
    let mut data = WIN32_FIND_DATAW::default();
    unsafe { link.GetPath(&mut buf, &mut data, 0) }.ok()?;
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let path = String::from_utf16_lossy(&buf[..len]);
    (!path.is_empty()).then_some(path)
}
