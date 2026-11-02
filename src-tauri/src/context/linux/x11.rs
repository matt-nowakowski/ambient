//! X11 window metadata (EWMH), pure Rust over x11rb: the active window, the
//! window list and the pointer's buttons. Titles and classes only; no pixels.

use std::sync::Mutex;

use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt as _, KeyButMask, Window};
use x11rb::rust_connection::RustConnection;

use super::appid::parse_wm_class;

/// A top-level window, as the window manager knows it.
#[derive(Debug, Clone, Default)]
pub struct WindowInfo {
    pub pid: Option<u32>,
    /// `WM_CLASS` class ("firefox", "Slack").
    pub class: String,
    pub title: String,
}

struct Atoms {
    active: Atom,
    client_list: Atom,
    pid: Atom,
    net_name: Atom,
    utf8: Atom,
}

struct X {
    conn: RustConnection,
    root: Window,
    atoms: Atoms,
}

static X: Mutex<Option<X>> = Mutex::new(None);

/// An X11 session (not Wayland, where XWayland only sees its own clients).
pub fn is_x11_session() -> bool {
    let wayland = std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland")
        || std::env::var_os("WAYLAND_DISPLAY").is_some();
    !wayland && std::env::var_os("DISPLAY").is_some()
}

fn connect() -> Option<X> {
    let (conn, screen) = RustConnection::connect(None).ok()?;
    let root = conn.setup().roots.get(screen)?.root;
    let intern = |name: &[u8]| -> Option<Atom> {
        Some(conn.intern_atom(false, name).ok()?.reply().ok()?.atom)
    };
    let atoms = Atoms {
        active: intern(b"_NET_ACTIVE_WINDOW")?,
        client_list: intern(b"_NET_CLIENT_LIST")?,
        pid: intern(b"_NET_WM_PID")?,
        net_name: intern(b"_NET_WM_NAME")?,
        utf8: intern(b"UTF8_STRING")?,
    };
    Some(X { conn, root, atoms })
}

/// Run `f` with the shared connection, reconnecting once if it broke.
fn with<R>(f: impl Fn(&X) -> Option<R>) -> Option<R> {
    if !is_x11_session() {
        return None;
    }
    let mut guard = X.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    if guard.is_none() {
        *guard = connect();
    }
    let x = guard.as_ref()?;
    if let Some(r) = f(x) {
        return Some(r);
    }
    // The server may have gone away (or the call failed): retry fresh.
    *guard = connect();
    guard.as_ref().and_then(f)
}

fn prop(
    x: &X,
    win: Window,
    atom: Atom,
    ty: impl Into<Atom>,
) -> Option<x11rb::protocol::xproto::GetPropertyReply> {
    x.conn
        .get_property(false, win, atom, ty, 0, 4096)
        .ok()?
        .reply()
        .ok()
}

fn info(x: &X, win: Window) -> WindowInfo {
    let pid = prop(x, win, x.atoms.pid, AtomEnum::CARDINAL)
        .and_then(|r| r.value32().and_then(|mut v| v.next()))
        .filter(|p| *p > 0);
    let class = prop(x, win, AtomEnum::WM_CLASS.into(), AtomEnum::STRING)
        .map(|r| parse_wm_class(&r.value).1)
        .unwrap_or_default();
    let title = prop(x, win, x.atoms.net_name, x.atoms.utf8)
        .filter(|r| !r.value.is_empty())
        .or_else(|| prop(x, win, AtomEnum::WM_NAME.into(), AtomEnum::ANY))
        .map(|r| String::from_utf8_lossy(&r.value).to_string())
        .unwrap_or_default();
    WindowInfo { pid, class, title }
}

/// The window with input focus, per `_NET_ACTIVE_WINDOW`.
pub fn active_window() -> Option<WindowInfo> {
    with(|x| {
        let win = prop(x, x.root, x.atoms.active, AtomEnum::WINDOW)?
            .value32()?
            .next()
            .filter(|w| *w != 0)?;
        Some(info(x, win))
    })
}

/// Every managed top-level window, per `_NET_CLIENT_LIST`.
pub fn client_list() -> Vec<WindowInfo> {
    with(|x| {
        let reply = prop(x, x.root, x.atoms.client_list, AtomEnum::WINDOW)?;
        let windows: Vec<Window> = reply.value32()?.take(200).collect();
        Some(windows.into_iter().map(|w| info(x, w)).collect())
    })
    .unwrap_or_default()
}

/// Whether the left or right mouse button is down (X11 only; Wayland
/// doesn't let a client see the pointer outside its own surfaces).
pub fn buttons_down() -> bool {
    with(|x| {
        let reply = x.conn.query_pointer(x.root).ok()?.reply().ok()?;
        Some(reply.mask.contains(KeyButMask::BUTTON1) || reply.mask.contains(KeyButMask::BUTTON3))
    })
    .unwrap_or(false)
}
