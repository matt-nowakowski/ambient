//! FFI to swift/ambient_native.swift.

use std::ffi::{c_char, CStr};

use super::{FrontmostApp, RawSnapshot};

extern "C" {
    fn ambient_free(ptr: *mut c_char);
    fn ambient_ax_trusted() -> bool;
    fn ambient_frontmost_app() -> *mut c_char;
    fn ambient_context_snapshot(pid: i32, max_chars: i32) -> *mut c_char;
    fn ambient_open_windows(skip: *const c_char, max_chars: i32) -> *mut c_char;
    fn ambient_press_labeled(pid: i32, labels: *const c_char) -> i32;
    fn ambient_focused_field(pid: i32, read_text: bool) -> *mut c_char;
    fn ambient_select_range(pid: i32, loc: isize, len: isize) -> bool;
}

/// Take ownership of a Swift-allocated JSON string and parse it.
fn take_json<T: serde::de::DeserializeOwned>(ptr: *mut c_char) -> Option<T> {
    if ptr.is_null() {
        return None;
    }
    // SAFETY: the Swift side returns a NUL-terminated strdup'd string, freed below.
    let parsed = unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .ok()
        .and_then(|s| serde_json::from_str(s).ok());
    unsafe { ambient_free(ptr) };
    parsed
}

pub fn ax_trusted() -> bool {
    unsafe { ambient_ax_trusted() }
}

pub fn frontmost_app() -> Option<FrontmostApp> {
    take_json(unsafe { ambient_frontmost_app() })
}

pub fn window_snapshot(pid: i32, max_chars: usize) -> Option<RawSnapshot> {
    let max = i32::try_from(max_chars).unwrap_or(i32::MAX);
    take_json(unsafe { ambient_context_snapshot(pid, max) })
}

pub fn open_windows(skip: &[String], max_chars: usize) -> Vec<super::OpenWindow> {
    let skip = std::ffi::CString::new(skip.join("\n")).unwrap_or_default();
    let max = i32::try_from(max_chars).unwrap_or(i32::MAX);
    take_json(unsafe { ambient_open_windows(skip.as_ptr(), max) }).unwrap_or_default()
}

/// 0 pressed, 1 not found, 2 press failed, 3 no permission or window.
pub fn press_labeled(pid: i32, labels: &[&str]) -> i32 {
    let Ok(labels) = std::ffi::CString::new(labels.join("\n")) else {
        return 1;
    };
    unsafe { ambient_press_labeled(pid, labels.as_ptr()) }
}

#[derive(serde::Deserialize)]
struct RawField {
    #[serde(default)]
    secure: bool,
    loc: Option<i64>,
    len: Option<i64>,
    value: Option<String>,
    selection: Option<String>,
}

/// The focused field (see `field::focused_field`). AX ranges are UTF-16;
/// they're converted to characters against the value when it was read.
pub fn focused_field(pid: i32, read_text: bool) -> Option<super::field::FocusedField> {
    let raw: RawField = take_json(unsafe { ambient_focused_field(pid, read_text) })?;
    if raw.secure {
        return None;
    }
    let loc = raw.loc.and_then(|l| usize::try_from(l).ok());
    let len = raw.len.and_then(|l| usize::try_from(l).ok()).unwrap_or(0);
    let (caret, sel_len) = match (&raw.value, loc) {
        (Some(v), Some(loc)) => {
            let start = super::field::utf16_to_chars(v, loc);
            let end = super::field::utf16_to_chars(v, loc + len);
            match (start, end) {
                (Some(s), Some(e)) => (Some(s), e - s),
                _ => (None, len),
            }
        }
        _ => (None, len),
    };
    Some(super::field::FocusedField {
        value: raw.value,
        selection: raw.selection.filter(|s| !s.is_empty()),
        caret,
        sel_len,
    })
}

/// Select characters `start..start + len` of the focused field.
pub fn select_chars(pid: i32, start: usize, len: usize) -> bool {
    let Some(value) = focused_field(pid, true).and_then(|f| f.value) else {
        return false;
    };
    let (Some(a), Some(b)) = (
        super::field::chars_to_utf16(&value, start),
        super::field::chars_to_utf16(&value, start + len),
    ) else {
        return false;
    };
    let (Ok(loc), Ok(n)) = (isize::try_from(a), isize::try_from(b - a)) else {
        return false;
    };
    unsafe { ambient_select_range(pid, loc, n) }
}
