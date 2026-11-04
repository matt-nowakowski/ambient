//! Linux: what's on screen, as text, through AT-SPI2 (GNOME, KDE and most
//! toolkits), with the active window from EWMH on X11.
//!
//! - X11: `_NET_ACTIVE_WINDOW` names the frontmost app (no accessibility
//!   needed); its text comes from AT-SPI.
//! - Wayland: there is no API for the active window, so it's the AT-SPI frame
//!   in the ACTIVE state (works on GNOME and KDE when accessibility is on).
//!
//! The same rules hold as on macOS: never-watch apps are skipped before any
//! of their text is read, private places are spotted from metadata first, and
//! password fields are never read.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

pub mod appid;
#[cfg(target_os = "linux")]
mod atspi;
#[cfg(target_os = "linux")]
pub mod x11;

#[cfg(target_os = "linux")]
pub use appid::{is_browser, is_call_app, NEVER_WATCH};

#[cfg(target_os = "linux")]
pub use imp::*;

/// An AT-SPI role (at-spi2-core `AtspiRole`) under the macOS name the
/// agent's focus rules use, as Windows maps UI Automation's control types:
/// without it, "no text field is focused" was never known on Linux.
pub fn ax_role(role: Option<u32>, editable: bool) -> &'static str {
    match role.unwrap_or(0) {
        61 | 79 | 40 => "AXTextField", // text, entry, password text
        82 | 95 if editable => "AXTextArea",
        82 | 95 => "AXWebArea", // document frame, document web
        11 => "AXComboBox",
        43 | 62 => "AXButton", // push button, toggle button
        7 => "AXCheckBox",
        44 | 37 => "AXRadioButton", // radio button, page tab
        38 => "AXTabGroup",
        88 => "AXLink",
        27 => "AXImage",
        31 | 98 => "AXList",     // list, list box
        32 | 90 | 91 => "AXRow", // list item, table row, tree item
        65 => "AXOutline",
        55 | 66 => "AXTable", // table, tree table
        56 => "AXCell",
        35 => "AXMenuItem",
        29 | 116 => "AXStaticText", // label, static
        83 => "AXHeading",
        23 | 69 => "AXWindow", // frame, window
        _ if editable => "AXTextArea",
        _ => "AXUnknown",
    }
}

#[cfg(test)]
mod tests {
    use super::ax_role;

    #[test]
    fn atspi_roles_read_like_the_mac_ones() {
        assert_eq!(ax_role(Some(95), false), "AXWebArea");
        assert_eq!(ax_role(Some(95), true), "AXTextArea");
        assert_eq!(ax_role(Some(43), false), "AXButton");
        assert_eq!(ax_role(Some(79), false), "AXTextField");
        assert_eq!(ax_role(Some(85), true), "AXTextArea");
        assert_eq!(ax_role(None, false), "AXUnknown");
        // A web page with focus on it is "certainly not a field"; unknown
        // roles stay "can't tell".
        let not_field = |r| crate::agent::classify_focus(Some(ax_role(r, false)), false, "", "");
        assert_eq!(not_field(Some(95)), Some(false));
        assert_eq!(not_field(Some(67)), None);
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use std::time::{Duration, Instant};

    use super::super::{ContextSnapshot, FrontmostApp, OpenWindow};
    use super::appid;
    use super::atspi::{self, role, Bus};
    use super::x11;

    /// AT-SPI is on, so window text can be read. (The Linux counterpart of
    /// macOS's Accessibility permission.)
    pub fn ax_trusted() -> bool {
        atspi::is_enabled()
    }

    /// The app id and a display name of a process.
    fn identify(pid: u32, fallback_name: &str) -> (String, String) {
        if pid == std::process::id() {
            return (env!("BRAND_IDENTIFIER").into(), env!("BRAND_NAME").into());
        }
        let exe = std::fs::read_link(format!("/proc/{pid}/exe"))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let flatpak = std::fs::read_to_string(format!("/proc/{pid}/root/.flatpak-info")).ok();
        let id = appid::app_id(&exe, flatpak.as_deref());
        let name = if fallback_name.trim().is_empty() {
            appid::display_name(&id)
        } else {
            fallback_name.trim().to_string()
        };
        (id, name)
    }

    pub fn frontmost_app() -> Option<FrontmostApp> {
        if x11::is_x11_session() {
            if let Some(w) = x11::active_window() {
                let pid = w.pid?;
                let (bundle_id, name) = identify(pid, &w.class);
                return Some(FrontmostApp {
                    pid: i32::try_from(pid).ok()?,
                    bundle_id,
                    name,
                });
            }
        }
        // Wayland (or an X11 window manager without EWMH): ask AT-SPI.
        let bus = Bus::open()?;
        let frame = atspi::active_frame(&bus, None)?;
        let pid = frame.pid?;
        let (bundle_id, name) = identify(pid, &frame.app_name);
        Some(FrontmostApp {
            pid: i32::try_from(pid).ok()?,
            bundle_id,
            name,
        })
    }

    /// Snapshot of the given app's active window. `max_chars == 0` reads
    /// metadata only (title, URLs, focus), skipping the text walk and the
    /// selection.
    pub fn window_snapshot(pid: i32, max_chars: usize) -> Option<ContextSnapshot> {
        let bus = Bus::open()?;
        let frame = atspi::active_frame(&bus, u32::try_from(pid).ok())?;
        // The active window must belong to the app the policy allowed.
        if frame.pid.is_some_and(|p| i64::from(p) != i64::from(pid)) {
            return None;
        }
        let window = frame.frame;
        let mut snap = ContextSnapshot {
            window_title: frame.title,
            ..Default::default()
        };
        if snap.window_title.is_empty() && x11::is_x11_session() {
            // Some toolkits leave the frame unnamed; the window manager knows.
            snap.window_title = x11::active_window().map(|w| w.title).unwrap_or_default();
        }
        let (mut frame_urls, mut frame_titles) =
            bus.web_frames(&window, Instant::now() + Duration::from_millis(150));

        if let Some(focused) = bus.focused(&window, Instant::now() + Duration::from_millis(150)) {
            let r = bus.role(&focused);
            let st = bus.states(&focused);
            snap.secure = r == Some(role::PASSWORD_TEXT);
            snap.editable = !snap.secure && atspi::is_editable(r, st);
            snap.focused_role = Some(super::ax_role(r, snap.editable).to_string());
            if let Some(doc) = bus.enclosing_document(&focused) {
                if let Some(url) = bus.doc_url(&doc) {
                    frame_urls.push(url);
                }
                let title = bus.name(&doc);
                if !title.is_empty() {
                    frame_titles.push(title);
                }
            }
            if max_chars > 0 && !snap.secure {
                snap.selection = bus.selection(&focused, 8000);
                if snap.editable {
                    snap.focused_text = bus.text(&focused, 6000).filter(|t| !t.is_empty());
                }
            }
        }

        if max_chars > 0 && !snap.secure {
            let deadline = Instant::now() + Duration::from_millis(600);
            // Browsers: read the page, not the tab strip, and take its URL.
            let root = bus
                .find_web_area(&window, Instant::now() + Duration::from_millis(150))
                .unwrap_or_else(|| window.clone());
            if let Some(url) = bus.doc_url(&root) {
                snap.url = Some(url);
            }
            let content = bus
                .find_main(&root, Instant::now() + Duration::from_millis(200))
                .unwrap_or(root);
            snap.text = Some(bus.collect_text(&content, max_chars, deadline));
        } else if snap.url.is_none() {
            // Metadata only: the page in front is the first web frame found.
            snap.url = frame_urls.first().cloned();
        }
        snap.frame_urls = frame_urls;
        snap.frame_titles = frame_titles;
        Some(snap)
    }

    /// The focused node of `pid`'s active window (never a password field).
    fn focused_text_node(bus: &Bus, pid: i32) -> Option<atspi::Node> {
        let frame = atspi::active_frame(bus, u32::try_from(pid).ok())?;
        if frame.pid.is_some_and(|p| i64::from(p) != i64::from(pid)) {
            return None;
        }
        let focused = bus.focused(&frame.frame, Instant::now() + Duration::from_millis(150))?;
        (bus.role(&focused) != Some(role::PASSWORD_TEXT)).then_some(focused)
    }

    /// The focused field (see `field::focused_field`). AT-SPI offsets are
    /// characters already.
    pub fn focused_field(pid: i32, read_text: bool) -> Option<super::super::field::FocusedField> {
        let bus = Bus::open()?;
        let n = focused_text_node(&bus, pid)?;
        let (start, end) = match bus.selection_range(&n) {
            Some((s, e)) if e > s => (s, e),
            _ => {
                let c = bus.caret(&n)?;
                (c, c)
            }
        };
        let value = if read_text {
            bus.text(&n, 200_000)
        } else {
            None
        };
        let selection = if read_text {
            bus.selection(&n, 8000)
        } else {
            None
        };
        Some(super::super::field::FocusedField {
            value,
            selection,
            caret: usize::try_from(start).ok(),
            sel_len: usize::try_from(end - start).unwrap_or(0),
        })
    }

    /// Select characters `start..start + len` of the focused field.
    pub fn select_chars(pid: i32, start: usize, len: usize) -> bool {
        let Some(bus) = Bus::open() else {
            return false;
        };
        let Some(n) = focused_text_node(&bus, pid) else {
            return false;
        };
        let (Ok(s), Ok(e)) = (i32::try_from(start), i32::try_from(start + len)) else {
            return false;
        };
        bus.set_selection(&n, s, e)
    }

    /// Text of every open window (up to four per app), skipping `skip` app
    /// ids. On X11 the window list is `_NET_CLIENT_LIST`; the text always
    /// comes from AT-SPI.
    pub fn open_windows(skip: &[String], max_chars: usize) -> Vec<OpenWindow> {
        let Some(bus) = Bus::open() else {
            return Vec::new();
        };
        let overall = Instant::now() + Duration::from_millis(2500);
        let mut frames = atspi::frames(&bus, 4, overall);
        if x11::is_x11_session() {
            // Only apps with a window the window manager lists (not hidden
            // helpers or tray processes).
            let listed: Vec<u32> = x11::client_list()
                .into_iter()
                .filter_map(|w| w.pid)
                .collect();
            if !listed.is_empty() {
                frames.retain(|f| f.pid.is_some_and(|p| listed.contains(&p)));
            }
        }
        let mut out = Vec::new();
        for f in frames {
            if Instant::now() > overall {
                break;
            }
            let Some(pid) = f.pid else { continue };
            let (bundle_id, name) = identify(pid, &f.app_name);
            if skip.iter().any(|s| s.eq_ignore_ascii_case(&bundle_id)) {
                continue;
            }
            let root = bus
                .find_web_area(&f.frame, Instant::now() + Duration::from_millis(100))
                .unwrap_or_else(|| f.frame.clone());
            let text = bus.collect_text(
                &root,
                max_chars,
                Instant::now() + Duration::from_millis(250),
            );
            if text.chars().count() < 20 {
                continue;
            }
            out.push(OpenWindow {
                url: bus.doc_url(&root),
                bundle_id,
                name,
                title: f.title,
                text,
            });
        }
        out
    }
}
