//! Windows: the frontmost app from the foreground window, and its text
//! through UI Automation. Windows asks no permission for this; windows of
//! elevated (administrator) apps are simply unreadable.
//!
//! Mirrors `swift/ambient_native.swift`: metadata (titles, URLs, focus) is
//! cheap and read first; text is read only when asked, bounded by
//! characters, nodes and time, and never from a password field.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use ::windows::core::{Interface, BOOL, PCWSTR, PWSTR};
use ::windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use ::windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use ::windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use ::windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use ::windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use ::windows::Win32::UI::Accessibility::{
    CUIAutomation, CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationElement,
    IUIAutomationElement5, IUIAutomationTextPattern, IUIAutomationTreeWalker,
    IUIAutomationValuePattern, UIA_TextPatternId, UIA_ValuePatternId,
};
use ::windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongPtrW,
    GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
};

use super::{ContextSnapshot, FrontmostApp, OpenWindow, RawSnapshot, SnapshotDiag};
use crate::win::rules::{self, control, AddressCandidate};

/// `UIA_MainLandmarkTypeId`: a page's `role="main"` region.
const MAIN_LANDMARK: i32 = 80002;

// ── Windows and processes ───────────────────────────────────────────────

fn window_pid(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid
}

fn window_title(hwnd: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 {
        return String::new();
    }
    let mut buf = vec![0u16; len as usize + 1];
    let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn exe_path(pid: u32) -> Option<String> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut buf = [0u16; 1024];
    let mut size = buf.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
    };
    let _ = unsafe { CloseHandle(process) };
    ok.ok()?;
    Some(String::from_utf16_lossy(&buf[..size as usize]))
}

/// The executable's own name for itself (its FileDescription, "Google
/// Chrome"), else its ProductName.
fn product_name(path: &str) -> Option<String> {
    let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let file = PCWSTR(wide.as_ptr());
    let size = unsafe { GetFileVersionInfoSizeW(file, None) };
    if size == 0 {
        return None;
    }
    let mut data = vec![0u8; size as usize];
    unsafe { GetFileVersionInfoW(file, None, size, data.as_mut_ptr().cast()) }.ok()?;
    let query = |sub: &str| -> Option<(*mut std::ffi::c_void, u32)> {
        let sub: Vec<u16> = sub.encode_utf16().chain(Some(0)).collect();
        let mut ptr = std::ptr::null_mut();
        let mut len = 0u32;
        let found = unsafe {
            VerQueryValueW(
                data.as_ptr().cast(),
                PCWSTR(sub.as_ptr()),
                &mut ptr,
                &mut len,
            )
        };
        (found.as_bool() && !ptr.is_null() && len > 0).then_some((ptr, len))
    };
    // The first language/code page pair the file declares.
    let (ptr, len) = query("\\VarFileInfo\\Translation")?;
    if (len as usize) < 4 {
        return None;
    }
    let pair = unsafe { std::slice::from_raw_parts(ptr as *const u16, 2) };
    let (lang, codepage) = (pair[0], pair[1]);
    ["FileDescription", "ProductName"].iter().find_map(|field| {
        let (ptr, len) = query(&format!(
            "\\StringFileInfo\\{lang:04x}{codepage:04x}\\{field}"
        ))?;
        let chars = unsafe { std::slice::from_raw_parts(ptr as *const u16, len as usize) };
        let end = chars.iter().position(|&c| c == 0).unwrap_or(chars.len());
        let name = String::from_utf16_lossy(&chars[..end]).trim().to_string();
        (!name.is_empty()).then_some(name)
    })
}

/// App names by executable path (version info is read once).
static NAMES: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn app_name(path: &str) -> String {
    if let Ok(mut g) = NAMES.lock() {
        let cache = g.get_or_insert_with(HashMap::new);
        if let Some(name) = cache.get(path) {
            return name.clone();
        }
        let name = product_name(path).unwrap_or_else(|| rules::name_from_exe(path));
        if cache.len() > 256 {
            cache.clear();
        }
        cache.insert(path.to_string(), name.clone());
        return name;
    }
    rules::name_from_exe(path)
}

fn app_for_pid(pid: u32) -> FrontmostApp {
    if pid == unsafe { GetCurrentProcessId() } {
        return FrontmostApp {
            pid: pid as i32,
            bundle_id: env!("BRAND_IDENTIFIER").into(),
            name: env!("BRAND_NAME").into(),
        };
    }
    let path = exe_path(pid).unwrap_or_default();
    FrontmostApp {
        pid: pid as i32,
        bundle_id: rules::bundle_id_for_exe(&path),
        name: if path.is_empty() {
            String::new()
        } else {
            app_name(&path)
        },
    }
}

/// The process a top-level window really belongs to. Store (UWP) apps are
/// hosted by ApplicationFrameHost; the app is its child's process.
fn owning_pid(hwnd: HWND) -> u32 {
    let pid = window_pid(hwnd);
    let host = exe_path(pid)
        .map(|p| rules::bundle_id_for_exe(&p) == "applicationframehost.exe")
        .unwrap_or(false);
    if !host {
        return pid;
    }
    struct Search {
        host: u32,
        found: u32,
    }
    unsafe extern "system" fn child(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam.0 as *mut Search);
        let pid = window_pid(hwnd);
        if pid != search.host {
            search.found = pid;
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut search = Search {
        host: pid,
        found: pid,
    };
    unsafe {
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(child),
            LPARAM(&mut search as *mut Search as isize),
        );
    }
    search.found
}

/// The foreground window and the process of the app it belongs to.
fn foreground() -> Option<(HWND, u32)> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }
    Some((hwnd, owning_pid(hwnd)))
}

pub fn ax_trusted() -> bool {
    // UI Automation needs no permission on Windows.
    true
}

pub fn frontmost_app() -> Option<FrontmostApp> {
    let (_, pid) = foreground()?;
    (pid != 0).then(|| app_for_pid(pid))
}

// ── UI Automation ───────────────────────────────────────────────────────

thread_local! {
    static UIA: RefCell<Option<IUIAutomation>> = const { RefCell::new(None) };
}

/// This thread's UI Automation client, with timeouts so a hung app can't
/// hang the agent.
fn automation() -> Option<IUIAutomation> {
    UIA.with(|cell| {
        if let Some(uia) = cell.borrow().as_ref() {
            return Some(uia.clone());
        }
        crate::win::com::ensure_init();
        let uia: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
                .or_else(|_| CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER))
        }
        .ok()?;
        if let Ok(uia2) = uia.cast::<IUIAutomation2>() {
            unsafe {
                let _ = uia2.SetConnectionTimeout(1000);
                let _ = uia2.SetTransactionTimeout(300);
            }
        }
        *cell.borrow_mut() = Some(uia.clone());
        Some(uia)
    })
}

fn control_type(el: &IUIAutomationElement) -> i32 {
    unsafe { el.CurrentControlType() }.map(|c| c.0).unwrap_or(0)
}

fn name(el: &IUIAutomationElement) -> String {
    unsafe { el.CurrentName() }
        .map(|s| s.to_string())
        .unwrap_or_default()
}

fn is_password(el: &IUIAutomationElement) -> bool {
    unsafe { el.CurrentIsPassword() }
        .map(|b| b.as_bool())
        .unwrap_or(false)
}

fn value_pattern(el: &IUIAutomationElement) -> Option<IUIAutomationValuePattern> {
    unsafe { el.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) }.ok()
}

fn text_pattern(el: &IUIAutomationElement) -> Option<IUIAutomationTextPattern> {
    unsafe { el.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) }.ok()
}

/// The element's value (an edit field's text, a browser document's URL).
fn value(el: &IUIAutomationElement) -> Option<String> {
    let v = value_pattern(el)?;
    let s = unsafe { v.CurrentValue() }.ok()?.to_string();
    (!s.is_empty()).then_some(s)
}

/// The value can be typed into (not read-only).
fn value_editable(el: &IUIAutomationElement) -> bool {
    value_pattern(el)
        .and_then(|v| unsafe { v.CurrentIsReadOnly() }.ok())
        .is_some_and(|ro| !ro.as_bool())
}

/// The selected text in an element with a TextPattern.
fn selection(el: &IUIAutomationElement) -> Option<String> {
    let pattern = text_pattern(el)?;
    let ranges = unsafe { pattern.GetSelection() }.ok()?;
    let first = unsafe { ranges.GetElement(0) }.ok()?;
    let text = unsafe { first.GetText(8000) }.ok()?.to_string();
    (!text.trim().is_empty()).then_some(text)
}

fn children(
    walker: &IUIAutomationTreeWalker,
    el: &IUIAutomationElement,
) -> Vec<IUIAutomationElement> {
    let mut out = Vec::new();
    let mut child = unsafe { walker.GetFirstChildElement(el) }.ok();
    while let Some(c) = child {
        if out.len() >= 500 {
            break;
        }
        child = unsafe { walker.GetNextSiblingElement(&c) }.ok();
        out.push(c);
    }
    out
}

/// Text of a document element through its TextPattern (the page, without
/// walking every node), limited to `max` characters.
fn document_text(el: &IUIAutomationElement, max: usize) -> Option<String> {
    let pattern = text_pattern(el)?;
    let range = unsafe { pattern.DocumentRange() }.ok()?;
    let text = unsafe { range.GetText(i32::try_from(max).unwrap_or(i32::MAX)) }
        .ok()?
        .to_string();
    (!text.trim().is_empty()).then_some(text)
}

/// Text of `region` inside `doc`, through the document's TextPattern.
fn region_text(
    doc: &IUIAutomationElement,
    region: &IUIAutomationElement,
    max: usize,
) -> Option<String> {
    let pattern = text_pattern(doc)?;
    let range = unsafe { pattern.RangeFromChild(region) }.ok()?;
    let text = unsafe { range.GetText(i32::try_from(max).unwrap_or(i32::MAX)) }
        .ok()?
        .to_string();
    (!text.trim().is_empty()).then_some(text)
}

/// The page's `role="main"` region, breadth-first and bounded.
fn find_main(
    walker: &IUIAutomationTreeWalker,
    root: &IUIAutomationElement,
    deadline: Instant,
) -> Option<IUIAutomationElement> {
    let mut queue = VecDeque::from([(root.clone(), 0usize)]);
    let mut visited = 0;
    while let Some((el, depth)) = queue.pop_front() {
        if visited >= 600 || Instant::now() > deadline {
            break;
        }
        visited += 1;
        let landmark = el
            .cast::<IUIAutomationElement5>()
            .ok()
            .and_then(|e| unsafe { e.CurrentLandmarkType() }.ok())
            .map(|l| l.0);
        if landmark == Some(MAIN_LANDMARK) {
            return Some(el);
        }
        if depth < 14 {
            queue.extend(children(walker, &el).into_iter().map(|c| (c, depth + 1)));
        }
    }
    None
}

/// Breadth-first walk collecting visible text, bounded by characters, nodes
/// and time. Password fields and their values are never read.
fn collect_text(
    walker: &IUIAutomationTreeWalker,
    root: &IUIAutomationElement,
    max_chars: usize,
    deadline: Instant,
) -> String {
    let mut out = String::new();
    let mut seen = HashSet::new();
    let mut queue = VecDeque::from([root.clone()]);
    let mut visited = 0;
    while let Some(el) = queue.pop_front() {
        if out.len() >= max_chars || visited >= 4000 || Instant::now() > deadline {
            break;
        }
        visited += 1;
        let ct = control_type(&el);
        if rules::skip_subtree(ct) || is_password(&el) {
            continue;
        }
        if ct == control::DOCUMENT {
            if let Some(text) = document_text(&el, max_chars.saturating_sub(out.len())) {
                push_line(&mut out, &mut seen, &text);
                continue;
            }
        }
        if rules::is_text_type(ct) {
            let text = if ct == control::EDIT {
                value(&el).unwrap_or_else(|| name(&el))
            } else {
                name(&el)
            };
            push_line(&mut out, &mut seen, &text);
        }
        queue.extend(children(walker, &el));
    }
    truncate(out, max_chars)
}

fn push_line(out: &mut String, seen: &mut HashSet<String>, text: &str) {
    let trimmed = text.trim();
    if trimmed.chars().count() > 1 && seen.insert(trimmed.to_string()) {
        out.push_str(trimmed);
        out.push('\n');
    }
}

fn truncate(s: String, max_chars: usize) -> String {
    if s.chars().count() > max_chars {
        s.chars().take(max_chars).collect()
    } else {
        s
    }
}

/// What the window's chrome says about it, read without entering any page:
/// its web documents (URL and title), address bar candidates, and whether
/// it's a private window.
#[derive(Default)]
struct Chrome {
    documents: Vec<IUIAutomationElement>,
    frame_urls: Vec<String>,
    frame_titles: Vec<String>,
    addresses: Vec<AddressCandidate>,
    /// Tab titles (a wallet's or password manager's tab, for the private
    /// place checks only).
    labels: Vec<String>,
    private: bool,
    nodes: u32,
}

fn read_chrome(
    walker: &IUIAutomationTreeWalker,
    window: &IUIAutomationElement,
    deadline: Instant,
) -> Chrome {
    let mut chrome = Chrome::default();
    let mut queue = VecDeque::from([(window.clone(), 0usize)]);
    let mut visited = 0;
    while let Some((el, depth)) = queue.pop_front() {
        if visited >= 600 || Instant::now() > deadline {
            break;
        }
        visited += 1;
        chrome.nodes = visited;
        let ct = control_type(&el);
        match ct {
            control::DOCUMENT => {
                let url = value(&el).unwrap_or_default();
                if !url.is_empty() {
                    chrome.frame_urls.push(url);
                }
                let title = name(&el);
                if !title.is_empty() {
                    chrome.frame_titles.push(title);
                }
                chrome.documents.push(el);
                continue; // the page's own content is not walked
            }
            control::EDIT if !is_password(&el) => {
                chrome.addresses.push(AddressCandidate {
                    name: name(&el),
                    automation_id: unsafe { el.CurrentAutomationId() }
                        .map(|s| s.to_string())
                        .unwrap_or_default(),
                    value: value(&el).unwrap_or_default(),
                });
            }
            control::BUTTON | control::TEXT | control::MENU_ITEM | control::SPLIT_BUTTON => {
                if rules::is_private_marker(&name(&el)) {
                    chrome.private = true;
                }
            }
            control::TAB_ITEM => {
                let label = name(&el);
                if !label.is_empty() && chrome.labels.len() < 64 {
                    chrome.labels.push(label);
                }
            }
            _ => {}
        }
        if depth < 14 {
            queue.extend(children(walker, &el).into_iter().map(|c| (c, depth + 1)));
        }
    }
    chrome
}

/// The web document holding `el`, if any (walks up its parents).
fn enclosing_document(
    walker: &IUIAutomationTreeWalker,
    el: &IUIAutomationElement,
) -> Option<IUIAutomationElement> {
    let mut current = Some(el.clone());
    for _ in 0..48 {
        let node = current?;
        if control_type(&node) == control::DOCUMENT {
            return Some(node);
        }
        current = unsafe { walker.GetParentElement(&node) }.ok();
    }
    None
}

/// The page document to read: the one showing the address bar's URL, else
/// the first.
fn page_document(chrome: &Chrome, url: Option<&str>) -> Option<IUIAutomationElement> {
    url.and_then(|u| {
        chrome
            .documents
            .iter()
            .find(|d| value(d).and_then(|v| rules::normalize_url(&v)).as_deref() == Some(u))
            .cloned()
    })
    .or_else(|| chrome.documents.first().cloned())
}

/// Text of a window: its page's main region or whole page in a browser, the
/// window's controls elsewhere.
fn window_text(
    walker: &IUIAutomationTreeWalker,
    root: &IUIAutomationElement,
    page: Option<&IUIAutomationElement>,
    max_chars: usize,
    budget: Duration,
) -> String {
    let deadline = Instant::now() + budget;
    if let Some(doc) = page {
        // Web apps spend the budget on navigation before the content; start
        // at the page's main region when it marks one.
        let main_deadline = Instant::now() + budget / 3;
        if let Some(main) = find_main(walker, doc, main_deadline) {
            if let Some(text) = region_text(doc, &main, max_chars) {
                return truncate(text, max_chars);
            }
            return collect_text(walker, &main, max_chars, deadline);
        }
        if let Some(text) = document_text(doc, max_chars) {
            return truncate(text, max_chars);
        }
        return collect_text(walker, doc, max_chars, deadline);
    }
    collect_text(walker, root, max_chars, deadline)
}

/// Snapshot of the foreground window of `pid`. `max_chars == 0` reads
/// metadata only (titles, URLs, focus; no text, no selection).
pub fn window_snapshot(pid: i32, max_chars: usize) -> Option<RawSnapshot> {
    let (hwnd, front_pid) = foreground()?;
    // Never Ambient's own windows (it's on the never-watch list anyway, and
    // UI Automation into our own UI thread could deadlock).
    if front_pid as i32 != pid || front_pid == unsafe { GetCurrentProcessId() } {
        return None;
    }
    let uia = automation()?;
    let walker = unsafe { uia.ControlViewWalker() }.ok()?;
    let root = unsafe { uia.ElementFromHandle(hwnd) }.ok()?;

    let mut snap = ContextSnapshot {
        window_title: window_title(hwnd),
        ..Default::default()
    };
    let chrome = read_chrome(&walker, &root, Instant::now() + Duration::from_millis(150));
    snap.url = rules::pick_address(&chrome.addresses).or_else(|| {
        chrome
            .frame_urls
            .iter()
            .find_map(|u| rules::normalize_url(u).filter(|u| u.starts_with("http")))
    });
    snap.private_window = chrome.private;
    snap.frame_urls = chrome.frame_urls.clone();
    snap.frame_titles = chrome.frame_titles.clone();

    let focused = unsafe { uia.GetFocusedElement() }
        .ok()
        .filter(|f| unsafe { f.CurrentProcessId() }.ok() == Some(pid));
    if let Some(focused) = &focused {
        let ct = control_type(focused);
        snap.secure = is_password(focused);
        // An edit field is writable unless it says it's read-only.
        let read_only = value_pattern(focused)
            .and_then(|v| unsafe { v.CurrentIsReadOnly() }.ok())
            .is_some_and(|ro| ro.as_bool());
        snap.editable = !snap.secure
            && ((ct == control::EDIT && !read_only)
                || (matches!(ct, control::DOCUMENT | control::COMBO_BOX)
                    && value_editable(focused)));
        snap.focused_role = Some(rules::role_for(ct, snap.editable).to_string());
        let doc = enclosing_document(&walker, focused);
        if let Some(doc) = &doc {
            if let Some(url) = value(doc) {
                snap.frame_urls.push(url);
            }
            let title = name(doc);
            if !title.is_empty() {
                snap.frame_titles.push(title);
            }
        }
        if max_chars > 0 && !snap.secure {
            // The focused field's selection, else the page's (a link or
            // button can have focus while text on the page is selected).
            snap.selection = selection(focused).or_else(|| doc.as_ref().and_then(selection));
            // What the user is writing (draft suggestions).
            if snap.editable {
                snap.focused_text = value(focused)
                    .or_else(|| document_text(focused, 6000))
                    .map(|t| truncate(t, 6000));
            }
        }
    }

    if max_chars > 0 && !snap.secure && !snap.private_window {
        let page = page_document(&chrome, snap.url.as_deref());
        snap.text = Some(window_text(
            &walker,
            &root,
            page.as_ref(),
            max_chars,
            Duration::from_millis(600),
        ));
    }
    Some(RawSnapshot {
        snap,
        ui_labels: chrome.labels,
        diag: SnapshotDiag {
            web_areas: Some(chrome.documents.len() as u32),
            chrome_nodes: Some(chrome.nodes),
            found_web_area: Some(!chrome.documents.is_empty()),
            ..Default::default()
        },
    })
}

// ── Every open window ───────────────────────────────────────────────────

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked = 0u32;
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        )
    }
    .is_ok()
        && cloaked != 0
}

/// Visible top-level app windows with titles, front to back: what Alt+Tab
/// shows.
fn app_windows() -> Vec<HWND> {
    unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = &mut *(lparam.0 as *mut Vec<HWND>);
        let visible = IsWindowVisible(hwnd).as_bool();
        let owned = GetWindow(hwnd, GW_OWNER).is_ok_and(|o| !o.0.is_null());
        let tool = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW.0 != 0;
        let mut rect = RECT::default();
        let sized = GetWindowRect(hwnd, &mut rect).is_ok()
            && rect.right - rect.left > 50
            && rect.bottom - rect.top > 50;
        if visible
            && !owned
            && !tool
            && sized
            && GetWindowTextLengthW(hwnd) > 0
            && !is_cloaked(hwnd)
        {
            list.push(hwnd);
        }
        BOOL(1)
    }
    let mut list: Vec<HWND> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(each), LPARAM(&mut list as *mut Vec<HWND> as isize));
    }
    list
}

/// Text of every app's open windows (at most four per app), minus `skip`
/// (bundle ids never to read) and private windows. Bounded by time overall
/// and per window.
pub fn open_windows(skip: &[String], max_chars: usize) -> Vec<OpenWindow> {
    let Some(uia) = automation() else {
        return Vec::new();
    };
    let Ok(walker) = (unsafe { uia.ControlViewWalker() }) else {
        return Vec::new();
    };
    let own = unsafe { GetCurrentProcessId() };
    let overall = Instant::now() + Duration::from_millis(2500);
    let mut per_app: HashMap<u32, usize> = HashMap::new();
    let mut out = Vec::new();
    for hwnd in app_windows() {
        if Instant::now() > overall {
            break;
        }
        let pid = owning_pid(hwnd);
        if pid == own {
            continue;
        }
        let count = per_app.entry(pid).or_insert(0);
        if *count >= 4 {
            continue;
        }
        *count += 1;
        let app = app_for_pid(pid);
        if app.bundle_id.is_empty() || skip.iter().any(|s| s == &app.bundle_id) {
            continue;
        }
        let Ok(root) = (unsafe { uia.ElementFromHandle(hwnd) }) else {
            continue;
        };
        let chrome = read_chrome(&walker, &root, Instant::now() + Duration::from_millis(100));
        let titles: Vec<&str> = chrome.frame_titles.iter().map(String::as_str).collect();
        let urls: Vec<&str> = chrome.frame_urls.iter().map(String::as_str).collect();
        if chrome.private
            || super::sensitive::sensitive_place(&app.name, &app.bundle_id, &titles, &urls)
                .is_some()
        {
            continue;
        }
        let url = rules::pick_address(&chrome.addresses).or_else(|| {
            chrome
                .frame_urls
                .iter()
                .find_map(|u| rules::normalize_url(u).filter(|u| u.starts_with("http")))
        });
        let page = page_document(&chrome, url.as_deref());
        let text = window_text(
            &walker,
            &root,
            page.as_ref(),
            max_chars,
            Duration::from_millis(250),
        );
        if text.chars().count() < 20 {
            continue;
        }
        out.push(OpenWindow {
            bundle_id: app.bundle_id,
            name: app.name,
            title: window_title(hwnd),
            url,
            text,
        });
    }
    out
}
