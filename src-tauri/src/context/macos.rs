//! FFI to swift/ambient_native.swift.

use std::ffi::{c_char, CStr};

use super::{ContextSnapshot, FrontmostApp};

extern "C" {
    fn ambient_free(ptr: *mut c_char);
    fn ambient_ax_trusted() -> bool;
    fn ambient_frontmost_app() -> *mut c_char;
    fn ambient_context_snapshot(pid: i32, max_chars: i32) -> *mut c_char;
    fn ambient_open_windows(skip: *const c_char, max_chars: i32) -> *mut c_char;
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

pub fn window_snapshot(pid: i32, max_chars: usize) -> Option<ContextSnapshot> {
    let max = i32::try_from(max_chars).unwrap_or(i32::MAX);
    take_json(unsafe { ambient_context_snapshot(pid, max) })
}

pub fn open_windows(skip: &[String], max_chars: usize) -> Vec<super::OpenWindow> {
    let skip = std::ffi::CString::new(skip.join("\n")).unwrap_or_default();
    let max = i32::try_from(max_chars).unwrap_or(i32::MAX);
    take_json(unsafe { ambient_open_windows(skip.as_ptr(), max) }).unwrap_or_default()
}
