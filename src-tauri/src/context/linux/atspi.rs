//! AT-SPI2, the Linux accessibility bus, over D-Bus (zbus, pure Rust): the
//! same role macOS's Accessibility API plays. Every walk is bounded by nodes
//! and time, every call by a D-Bus timeout, and password fields are never
//! read.
//!
//! Apps only publish their accessibility trees when accessibility is on
//! (`org.a11y.Status.IsEnabled`); Chromium and Electron additionally need
//! `--force-renderer-accessibility`. When it's off, the agent reports the
//! permission as missing and the UI explains how to turn it on.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use zbus::blocking::{connection, Connection};
use zbus::zvariant::{OwnedObjectPath, OwnedValue};

const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const TEXT: &str = "org.a11y.atspi.Text";
const DOCUMENT: &str = "org.a11y.atspi.Document";
const COLLECTION: &str = "org.a11y.atspi.Collection";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";
const REGISTRY: &str = "org.a11y.atspi.Registry";
const ROOT: &str = "/org/a11y/atspi/accessible/root";
const NULL_PATH: &str = "/org/a11y/atspi/null";

/// Per-call ceiling: a hung app costs at most this per question.
const CALL_TIMEOUT: Duration = Duration::from_millis(300);

/// AtspiRole values (at-spi2-core `atspi-constants.h`).
pub mod role {
    pub const COMBO_BOX: u32 = 11;
    pub const DIALOG: u32 = 16;
    pub const FRAME: u32 = 23;
    pub const IMAGE: u32 = 27;
    pub const LABEL: u32 = 29;
    pub const LIST: u32 = 31;
    pub const LIST_ITEM: u32 = 32;
    pub const MENU: u32 = 33;
    pub const MENU_BAR: u32 = 34;
    pub const PASSWORD_TEXT: u32 = 40;
    pub const POPUP_MENU: u32 = 41;
    pub const SCROLL_BAR: u32 = 48;
    pub const SPIN_BUTTON: u32 = 52;
    pub const TABLE: u32 = 55;
    pub const TABLE_CELL: u32 = 56;
    pub const TERMINAL: u32 = 60;
    pub const TEXT: u32 = 61;
    pub const TOOL_BAR: u32 = 63;
    pub const TREE: u32 = 65;
    pub const TREE_TABLE: u32 = 66;
    pub const WINDOW: u32 = 69;
    pub const PARAGRAPH: u32 = 73;
    pub const ENTRY: u32 = 79;
    pub const HEADING: u32 = 83;
    pub const LINK: u32 = 88;
    pub const DOCUMENT_SPREADSHEET: u32 = 92;
    pub const DOCUMENT_TEXT: u32 = 94;
    pub const DOCUMENT_WEB: u32 = 95;
    pub const LIST_BOX: u32 = 98;
    pub const LANDMARK: u32 = 110;
    pub const STATIC: u32 = 116;
}

/// AtspiStateType bit numbers.
pub mod state {
    pub const ACTIVE: u32 = 1;
    pub const EDITABLE: u32 = 7;
    pub const FOCUSED: u32 = 12;
    pub const SHOWING: u32 = 25;
    pub const MANAGES_DESCENDANTS: u32 = 31;
    pub const READ_ONLY: u32 = 43;
}

/// Roles whose subtrees never hold content worth the calls (and password
/// fields, which are never read).
const SKIP_ROLES: &[u32] = &[
    role::MENU_BAR,
    role::MENU,
    role::POPUP_MENU,
    role::TOOL_BAR,
    role::SCROLL_BAR,
    role::IMAGE,
    role::PASSWORD_TEXT,
];

/// Roles whose text is read.
const TEXT_ROLES: &[u32] = &[
    role::STATIC,
    role::LABEL,
    role::TEXT,
    role::ENTRY,
    role::PARAGRAPH,
    role::HEADING,
    role::LINK,
    role::TABLE_CELL,
    role::LIST_ITEM,
    role::TERMINAL,
    role::DOCUMENT_TEXT,
];

/// Containers that can hold a vast number of children.
const BIG_CONTAINERS: &[u32] = &[
    role::LIST,
    role::TABLE,
    role::TREE,
    role::TREE_TABLE,
    role::LIST_BOX,
    role::DOCUMENT_SPREADSHEET,
];

const EDITABLE_ROLES: &[u32] = &[role::TEXT, role::ENTRY, role::COMBO_BOX, role::SPIN_BUTTON];

/// An accessible object: its owner's bus name and object path.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Node {
    pub bus: String,
    pub path: OwnedObjectPath,
}

impl Node {
    fn from_pair((bus, path): (String, OwnedObjectPath)) -> Option<Node> {
        (path.as_str() != NULL_PATH && !bus.is_empty()).then_some(Node { bus, path })
    }
}

/// A set of AtspiStateType bits.
#[derive(Clone, Copy, Debug, Default)]
pub struct States(u64);

impl States {
    pub fn has(self, bit: u32) -> bool {
        bit < 64 && self.0 & (1u64 << bit) != 0
    }
}

static A11Y: Mutex<Option<Connection>> = Mutex::new(None);
static SESSION: Mutex<Option<Connection>> = Mutex::new(None);
static ENABLED: Mutex<Option<(bool, Instant)>> = Mutex::new(None);

fn session() -> Option<Connection> {
    let mut g = SESSION
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if g.is_none() {
        *g = connection::Builder::session()
            .ok()?
            .method_timeout(Duration::from_secs(2))
            .build()
            .ok();
    }
    g.clone()
}

/// A property of an object on the session bus.
pub fn session_property(dest: &str, path: &str, iface: &str, name: &str) -> Option<OwnedValue> {
    let conn = session()?;
    let reply = conn
        .call_method(Some(dest), path, Some(PROPERTIES), "Get", &(iface, name))
        .ok()?;
    reply.body().deserialize::<OwnedValue>().ok()
}

/// Whether accessibility is on for the session (`org.a11y.Status`), cached
/// for a few seconds since it's asked on every trigger.
pub fn is_enabled() -> bool {
    let mut g = ENABLED
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some((on, at)) = *g {
        if at.elapsed() < Duration::from_secs(3) {
            return on;
        }
    }
    let flag = |name: &str| {
        session_property("org.a11y.Bus", "/org/a11y/bus", "org.a11y.Status", name)
            .and_then(|v| bool::try_from(v).ok())
            .unwrap_or(false)
    };
    let on = flag("IsEnabled") || flag("ScreenReaderEnabled");
    *g = Some((on, Instant::now()));
    on
}

/// The accessibility bus, connected once (its address comes from `org.a11y.Bus`).
fn a11y() -> Option<Connection> {
    let mut g = A11Y
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if g.is_none() {
        let address: String = session()?
            .call_method(
                Some("org.a11y.Bus"),
                "/org/a11y/bus",
                Some("org.a11y.Bus"),
                "GetAddress",
                &(),
            )
            .ok()?
            .body()
            .deserialize()
            .ok()?;
        *g = connection::Builder::address(address.as_str())
            .ok()?
            .method_timeout(CALL_TIMEOUT)
            .build()
            .ok();
    }
    g.clone()
}

/// Forget the bus connection (after it failed), so the next call reconnects.
fn reset() {
    if let Ok(mut g) = A11Y.lock() {
        *g = None;
    }
}

/// Call `method` on `node` and decode the reply.
fn call<B, R>(conn: &Connection, node: &Node, iface: &str, method: &str, body: &B) -> Option<R>
where
    B: serde::Serialize + zbus::zvariant::DynamicType,
    R: for<'d> serde::Deserialize<'d> + zbus::zvariant::Type,
{
    let reply = match conn.call_method(
        Some(node.bus.as_str()),
        node.path.as_str(),
        Some(iface),
        method,
        body,
    ) {
        Ok(r) => r,
        Err(zbus::Error::InputOutput(e)) if e.kind() != std::io::ErrorKind::TimedOut => {
            reset();
            return None;
        }
        Err(_) => return None,
    };
    reply.body().deserialize::<R>().ok()
}

fn property(conn: &Connection, node: &Node, iface: &str, name: &str) -> Option<OwnedValue> {
    call::<_, OwnedValue>(conn, node, PROPERTIES, "Get", &(iface, name))
}

/// One walk's view of the bus.
pub struct Bus {
    conn: Connection,
}

impl Bus {
    pub fn open() -> Option<Bus> {
        if !is_enabled() {
            return None;
        }
        Some(Bus { conn: a11y()? })
    }

    pub fn role(&self, n: &Node) -> Option<u32> {
        call(&self.conn, n, ACCESSIBLE, "GetRole", &())
    }

    pub fn role_name(&self, n: &Node) -> Option<String> {
        call(&self.conn, n, ACCESSIBLE, "GetRoleName", &())
    }

    pub fn name(&self, n: &Node) -> String {
        property(&self.conn, n, ACCESSIBLE, "Name")
            .and_then(|v| String::try_from(v).ok())
            .unwrap_or_default()
    }

    pub fn states(&self, n: &Node) -> States {
        let words: Vec<u32> = call(&self.conn, n, ACCESSIBLE, "GetState", &()).unwrap_or_default();
        let lo = u64::from(words.first().copied().unwrap_or(0));
        let hi = u64::from(words.get(1).copied().unwrap_or(0));
        States(lo | (hi << 32))
    }

    pub fn children(&self, n: &Node) -> Vec<Node> {
        let pairs: Vec<(String, OwnedObjectPath)> =
            call(&self.conn, n, ACCESSIBLE, "GetChildren", &()).unwrap_or_default();
        pairs
            .into_iter()
            .take(400)
            .filter_map(Node::from_pair)
            .collect()
    }

    fn child_count(&self, n: &Node) -> Option<i32> {
        property(&self.conn, n, ACCESSIBLE, "ChildCount").and_then(|v| i32::try_from(v).ok())
    }

    pub fn parent(&self, n: &Node) -> Option<Node> {
        let v = property(&self.conn, n, ACCESSIBLE, "Parent")?;
        let pair = <(String, OwnedObjectPath)>::try_from(v).ok()?;
        Node::from_pair(pair)
    }

    pub fn attributes(&self, n: &Node) -> HashMap<String, String> {
        call(&self.conn, n, ACCESSIBLE, "GetAttributes", &()).unwrap_or_default()
    }

    fn char_count(&self, n: &Node) -> Option<i32> {
        property(&self.conn, n, TEXT, "CharacterCount").and_then(|v| i32::try_from(v).ok())
    }

    /// Up to `max` characters of the node's Text interface, if it has one.
    pub fn text(&self, n: &Node, max: usize) -> Option<String> {
        let count = self.char_count(n)?;
        if count <= 0 {
            return None;
        }
        let end = count.min(i32::try_from(max).unwrap_or(i32::MAX));
        let text: String = call(&self.conn, n, TEXT, "GetText", &(0i32, end))?;
        // Embedded objects (links, images) show as U+FFFC; their text is
        // read from their own nodes.
        Some(text.replace('\u{FFFC}', " "))
    }

    /// The first selected range of the node's text.
    pub fn selection(&self, n: &Node, max: usize) -> Option<String> {
        let count: i32 = call(&self.conn, n, TEXT, "GetNSelections", &())?;
        if count <= 0 {
            return None;
        }
        let (start, end): (i32, i32) = call(&self.conn, n, TEXT, "GetSelection", &(0i32,))?;
        if end <= start {
            return None;
        }
        let end = end.min(start.saturating_add(i32::try_from(max).unwrap_or(i32::MAX)));
        let text: String = call(&self.conn, n, TEXT, "GetText", &(start, end))?;
        Some(text.replace('\u{FFFC}', " ")).filter(|s| !s.trim().is_empty())
    }

    /// The caret's character offset in the node's text.
    pub fn caret(&self, n: &Node) -> Option<i32> {
        property(&self.conn, n, TEXT, "CaretOffset").and_then(|v| i32::try_from(v).ok())
    }

    /// The first selection's (start, end) character offsets, if any.
    pub fn selection_range(&self, n: &Node) -> Option<(i32, i32)> {
        let count: i32 = call(&self.conn, n, TEXT, "GetNSelections", &())?;
        if count <= 0 {
            return None;
        }
        call(&self.conn, n, TEXT, "GetSelection", &(0i32,))
    }

    /// Select characters `start..end` of the node's text.
    pub fn set_selection(&self, n: &Node, start: i32, end: i32) -> bool {
        let count: i32 = call(&self.conn, n, TEXT, "GetNSelections", &()).unwrap_or(0);
        let ok: Option<bool> = if count > 0 {
            call(&self.conn, n, TEXT, "SetSelection", &(0i32, start, end))
        } else {
            call(&self.conn, n, TEXT, "AddSelection", &(start, end))
        };
        ok.unwrap_or(false)
    }

    /// A web document's URL (Firefox: DocURL; Chromium and WebKit: URI).
    pub fn doc_url(&self, n: &Node) -> Option<String> {
        let attrs: HashMap<String, String> =
            call(&self.conn, n, DOCUMENT, "GetAttributes", &()).unwrap_or_default();
        ["DocURL", "URI", "URL"]
            .iter()
            .filter_map(|k| attrs.get(*k))
            .find(|u| !u.is_empty())
            .cloned()
    }

    /// Applications on the bus.
    pub fn apps(&self) -> Vec<Node> {
        let root = Node {
            bus: REGISTRY.into(),
            path: OwnedObjectPath::try_from(ROOT).expect("valid root path"),
        };
        self.children(&root)
    }

    /// The process that owns an application's bus connection.
    pub fn pid(&self, app: &Node) -> Option<u32> {
        self.conn
            .call_method(
                Some("org.freedesktop.DBus"),
                "/org/freedesktop/DBus",
                Some("org.freedesktop.DBus"),
                "GetConnectionUnixProcessID",
                &(app.bus.as_str(),),
            )
            .ok()?
            .body()
            .deserialize::<u32>()
            .ok()
    }

    /// The first descendant in the given state, through the Collection
    /// interface (one call) where the toolkit has it.
    fn find_by_state(&self, root: &Node, bit: u32) -> Option<Node> {
        let mut words = [0i32; 2];
        words[(bit / 32) as usize] = (1u32 << (bit % 32)) as i32;
        // MatchRule: states, ALL; attributes, roles, interfaces: ALL of none.
        const ALL: i32 = 1;
        let rule = (
            words.to_vec(),
            ALL,
            HashMap::<String, String>::new(),
            ALL,
            Vec::<i32>::new(),
            ALL,
            Vec::<String>::new(),
            ALL,
            false,
        );
        let found: Vec<(String, OwnedObjectPath)> = call(
            &self.conn,
            root,
            COLLECTION,
            "GetMatches",
            &(rule, 1u32, 1i32, true),
        )?;
        found.into_iter().find_map(Node::from_pair)
    }

    /// The focused accessible inside `frame`.
    pub fn focused(&self, frame: &Node, deadline: Instant) -> Option<Node> {
        if let Some(n) = self.find_by_state(frame, state::FOCUSED) {
            return Some(n);
        }
        // No Collection (GTK4, some Qt): walk the showing part of the tree.
        let mut queue = VecDeque::from([(frame.clone(), 0u32)]);
        let mut visited = 0;
        while let Some((n, depth)) = queue.pop_front() {
            if visited >= 800 || Instant::now() > deadline {
                break;
            }
            visited += 1;
            let st = self.states(&n);
            if st.has(state::FOCUSED) && n != *frame {
                return Some(n);
            }
            if (n != *frame && !st.has(state::SHOWING)) || st.has(state::MANAGES_DESCENDANTS) {
                continue;
            }
            if depth < 30 {
                queue.extend(self.children(&n).into_iter().map(|c| (c, depth + 1)));
            }
        }
        None
    }

    /// The nearest web document holding `n` (walks up its parents).
    pub fn enclosing_document(&self, n: &Node) -> Option<Node> {
        let mut current = Some(n.clone());
        for _ in 0..48 {
            let node = current?;
            if self.role(&node) == Some(role::DOCUMENT_WEB) {
                return Some(node);
            }
            current = self.parent(&node);
        }
        None
    }

    /// URLs and titles of the web documents in a window (a browser's page,
    /// side panel, extension popup). Walks the browser chrome only, never
    /// into a page; bounded by nodes and time.
    pub fn web_frames(&self, window: &Node, deadline: Instant) -> (Vec<String>, Vec<String>) {
        let mut urls = Vec::new();
        let mut titles = Vec::new();
        let mut queue = VecDeque::from([(window.clone(), 0u32)]);
        let mut visited = 0;
        while let Some((n, depth)) = queue.pop_front() {
            if visited >= 600 || Instant::now() > deadline {
                break;
            }
            visited += 1;
            let r = self.role(&n);
            if r == Some(role::DOCUMENT_WEB) {
                if let Some(url) = self.doc_url(&n) {
                    urls.push(url);
                }
                let title = self.name(&n);
                if !title.is_empty() {
                    titles.push(title);
                }
                continue;
            }
            if r.is_some_and(|r| SKIP_ROLES.contains(&r)) {
                continue;
            }
            if depth < 14 {
                queue.extend(self.children(&n).into_iter().map(|c| (c, depth + 1)));
            }
        }
        (urls, titles)
    }

    /// The showing web document in a window (the current tab), if any.
    pub fn find_web_area(&self, window: &Node, deadline: Instant) -> Option<Node> {
        let mut queue = VecDeque::from([(window.clone(), 0u32)]);
        let mut visited = 0;
        while let Some((n, depth)) = queue.pop_front() {
            if visited >= 600 || Instant::now() > deadline {
                break;
            }
            visited += 1;
            let r = self.role(&n);
            if r == Some(role::DOCUMENT_WEB) {
                if self.states(&n).has(state::SHOWING) {
                    return Some(n);
                }
                continue;
            }
            if r.is_some_and(|r| SKIP_ROLES.contains(&r)) {
                continue;
            }
            if depth < 14 {
                queue.extend(self.children(&n).into_iter().map(|c| (c, depth + 1)));
            }
        }
        None
    }

    /// The page's `role="main"` region, if it marks one.
    pub fn find_main(&self, root: &Node, deadline: Instant) -> Option<Node> {
        let mut queue = VecDeque::from([(root.clone(), 0u32)]);
        let mut visited = 0;
        while let Some((n, depth)) = queue.pop_front() {
            if visited >= 600 || Instant::now() > deadline {
                break;
            }
            visited += 1;
            if self.role(&n) == Some(role::LANDMARK)
                && self
                    .attributes(&n)
                    .get("xml-roles")
                    .is_some_and(|r| r.split_whitespace().any(|r| r == "main"))
            {
                return Some(n);
            }
            if depth < 14 {
                queue.extend(self.children(&n).into_iter().map(|c| (c, depth + 1)));
            }
        }
        None
    }

    /// Breadth-first walk collecting visible text, bounded by characters,
    /// nodes and time. Password fields and their subtrees are skipped.
    pub fn collect_text(&self, root: &Node, max_chars: usize, deadline: Instant) -> String {
        let mut out = String::new();
        let mut chars = 0usize;
        let mut seen = HashSet::new();
        let mut queue = VecDeque::from([root.clone()]);
        let mut visited = 0;
        while let Some(n) = queue.pop_front() {
            if chars >= max_chars || visited >= 4000 || Instant::now() > deadline {
                break;
            }
            visited += 1;
            let Some(r) = self.role(&n) else { continue };
            if SKIP_ROLES.contains(&r) {
                continue;
            }
            if TEXT_ROLES.contains(&r) {
                let value = self
                    .text(&n, max_chars.saturating_sub(chars).max(1))
                    .filter(|t| !t.trim().is_empty())
                    .unwrap_or_else(|| self.name(&n));
                let trimmed = value.trim().to_string();
                if trimmed.chars().count() > 1 && seen.insert(trimmed.clone()) {
                    chars += trimmed.chars().count() + 1;
                    out.push_str(&trimmed);
                    out.push('\n');
                }
            }
            // Huge tables and lists (a spreadsheet has millions of cells):
            // skip rather than list every child.
            if BIG_CONTAINERS.contains(&r) && self.child_count(&n).is_none_or(|c| c > 500) {
                continue;
            }
            queue.extend(self.children(&n));
        }
        if out.chars().count() > max_chars {
            out = out.chars().take(max_chars).collect();
        }
        out
    }
}

/// A focused or listed top-level window.
pub struct Frame {
    pub frame: Node,
    pub pid: Option<u32>,
    pub app_name: String,
    pub title: String,
}

fn is_window_role(r: Option<u32>) -> bool {
    matches!(r, Some(role::FRAME | role::WINDOW | role::DIALOG))
}

/// The active top-level window (the frame in the ACTIVE state). With a pid
/// from X11, that app is looked at first.
pub fn active_frame(bus: &Bus, pid_hint: Option<u32>) -> Option<Frame> {
    let deadline = Instant::now() + Duration::from_millis(500);
    // Our own window counts too (it's on the never-watch list, so it's
    // named, never read): otherwise the app behind it would look frontmost.
    let mut apps: Vec<(Node, Option<u32>)> = bus
        .apps()
        .into_iter()
        .map(|a| {
            let pid = bus.pid(&a);
            (a, pid)
        })
        .collect();
    if let Some(hint) = pid_hint {
        apps.sort_by_key(|(_, pid)| *pid != Some(hint));
    }
    for (app, pid) in apps.into_iter().take(80) {
        if Instant::now() > deadline {
            break;
        }
        for frame in bus.children(&app).into_iter().take(30) {
            if !is_window_role(bus.role(&frame)) {
                continue;
            }
            if bus.states(&frame).has(state::ACTIVE) {
                return Some(Frame {
                    title: bus.name(&frame),
                    frame,
                    pid,
                    app_name: bus.name(&app),
                });
            }
        }
    }
    None
}

/// Top-level windows of every app, at most `per_app` each.
pub fn frames(bus: &Bus, per_app: usize, deadline: Instant) -> Vec<Frame> {
    let own = std::process::id();
    let mut out = Vec::new();
    for app in bus.apps().into_iter().take(80) {
        if Instant::now() > deadline {
            break;
        }
        let pid = bus.pid(&app);
        if pid == Some(own) {
            continue;
        }
        let app_name = bus.name(&app);
        let mut taken = 0;
        for frame in bus.children(&app).into_iter().take(30) {
            if taken >= per_app {
                break;
            }
            if !is_window_role(bus.role(&frame)) {
                continue;
            }
            taken += 1;
            out.push(Frame {
                title: bus.name(&frame),
                frame,
                pid,
                app_name: app_name.clone(),
            });
        }
    }
    out
}

/// Whether the focused node is a text field the user is writing in.
pub fn is_editable(r: Option<u32>, st: States) -> bool {
    (st.has(state::EDITABLE) && !st.has(state::READ_ONLY))
        || r.is_some_and(|r| EDITABLE_ROLES.contains(&r) && !st.has(state::READ_ONLY))
}
