//! Windows integrations for the voice agent: COM helpers, file search,
//! Outlook's calendar and the user's automations. The screen reader is in
//! `context/windows.rs` and call audio in `meeting/windows.rs`.
//!
//! `rules` holds the pure decisions and builds everywhere so its tests run
//! on any platform; the rest is Windows-only.

pub mod rules;

#[cfg(target_os = "windows")]
pub mod calendar;
#[cfg(target_os = "windows")]
pub mod com;
#[cfg(target_os = "windows")]
pub mod files;
#[cfg(target_os = "windows")]
pub mod shortcuts;
