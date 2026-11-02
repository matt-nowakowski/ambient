//! The pure decisions behind the Windows integrations (no Win32 calls), kept
//! apart so they are unit-tested on every platform.

// ── Apps ────────────────────────────────────────────────────────────────

/// The stable id of a Windows app: its executable's file name, lowercased
/// ("C:\\…\\chrome.exe" → "chrome.exe"). The analogue of a macOS bundle id.
pub fn bundle_id_for_exe(path: &str) -> String {
    path.rsplit(['\\', '/'])
        .next()
        .unwrap_or(path)
        .trim()
        .to_lowercase()
}

/// A readable name when the executable carries no description
/// ("C:\\…\\ms-teams.exe" → "ms-teams").
pub fn name_from_exe(path: &str) -> String {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path).trim();
    match file.rsplit_once('.') {
        Some((stem, ext)) if ext.eq_ignore_ascii_case("exe") => stem.to_string(),
        _ => file.to_string(),
    }
}

// ── UI Automation ───────────────────────────────────────────────────────

/// UI Automation control type ids (UIA_*ControlTypeId).
pub mod control {
    pub const BUTTON: i32 = 50000;
    pub const CHECK_BOX: i32 = 50002;
    pub const COMBO_BOX: i32 = 50003;
    pub const EDIT: i32 = 50004;
    pub const HYPERLINK: i32 = 50005;
    pub const IMAGE: i32 = 50006;
    pub const LIST_ITEM: i32 = 50007;
    pub const LIST: i32 = 50008;
    pub const MENU: i32 = 50009;
    pub const MENU_BAR: i32 = 50010;
    pub const MENU_ITEM: i32 = 50011;
    pub const RADIO_BUTTON: i32 = 50013;
    pub const SCROLL_BAR: i32 = 50014;
    pub const SPLIT_BUTTON: i32 = 50031;
    pub const TAB: i32 = 50018;
    pub const TAB_ITEM: i32 = 50019;
    pub const TEXT: i32 = 50020;
    pub const TOOL_BAR: i32 = 50021;
    pub const TOOL_TIP: i32 = 50022;
    pub const TREE: i32 = 50023;
    pub const TREE_ITEM: i32 = 50024;
    pub const GROUP: i32 = 50026;
    pub const DATA_GRID: i32 = 50028;
    pub const DATA_ITEM: i32 = 50029;
    pub const DOCUMENT: i32 = 50030;
    pub const WINDOW: i32 = 50032;
    pub const HEADER: i32 = 50034;
    pub const TABLE: i32 = 50036;
    pub const TITLE_BAR: i32 = 50037;
}

/// The focused element's role, in the macOS accessibility vocabulary the
/// agent already reasons in (`classify_focus`). Roles a Windows app may
/// report while the user types (panes, custom controls) map to an unknown
/// role, so a wrong guess never stops dictation from being typed.
pub fn role_for(control_type: i32, editable: bool) -> &'static str {
    use control::*;
    match control_type {
        EDIT => "AXTextField",
        DOCUMENT if editable => "AXTextArea",
        DOCUMENT => "AXWebArea",
        COMBO_BOX => "AXComboBox",
        BUTTON | SPLIT_BUTTON => "AXButton",
        CHECK_BOX => "AXCheckBox",
        RADIO_BUTTON | TAB_ITEM => "AXRadioButton",
        HYPERLINK => "AXLink",
        IMAGE => "AXImage",
        LIST => "AXList",
        LIST_ITEM | TREE_ITEM => "AXRow",
        TREE => "AXOutline",
        TABLE | DATA_GRID => "AXTable",
        DATA_ITEM => "AXCell",
        MENU_ITEM => "AXMenuItem",
        TAB => "AXTabGroup",
        TEXT => "AXStaticText",
        WINDOW => "AXWindow",
        GROUP => "AXGroup",
        HEADER => "AXHeading",
        _ => "AXUnknown",
    }
}

/// Containers whose subtrees hold no readable content worth the calls.
pub fn skip_subtree(control_type: i32) -> bool {
    use control::*;
    matches!(
        control_type,
        MENU_BAR | MENU | TOOL_BAR | SCROLL_BAR | IMAGE | TITLE_BAR | TOOL_TIP
    )
}

/// Elements whose name or value is text worth reading.
pub fn is_text_type(control_type: i32) -> bool {
    use control::*;
    matches!(
        control_type,
        TEXT | EDIT | HYPERLINK | DATA_ITEM | LIST_ITEM | TREE_ITEM | HEADER
    )
}

/// URL schemes a browser's address bar or page can show as they are.
const SCHEMES: &[&str] = &[
    "http://",
    "https://",
    "file://",
    "chrome://",
    "edge://",
    "brave://",
    "vivaldi://",
    "opera://",
    "arc://",
    "about:",
    "chrome-extension://",
    "extension://",
    "moz-extension://",
];

/// An address bar's text as a URL. Chromium hides the scheme
/// ("github.com/x" → "https://github.com/x"); a search being typed (words,
/// no host) is not a URL.
pub fn normalize_url(value: &str) -> Option<String> {
    let v = value.trim();
    if v.is_empty() || v.chars().any(char::is_whitespace) {
        return None;
    }
    let lower = v.to_ascii_lowercase();
    if SCHEMES.iter().any(|s| lower.starts_with(s)) {
        return Some(v.to_string());
    }
    let host = lower.split(['/', '?', '#']).next().unwrap_or("");
    let bare = host.split(':').next().unwrap_or("");
    if bare == "localhost" || bare.parse::<std::net::Ipv4Addr>().is_ok() {
        return Some(format!("http://{v}"));
    }
    let valid_host = bare.contains('.')
        && !bare.starts_with('.')
        && !bare.ends_with('.')
        && bare
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '.');
    valid_host.then(|| format!("https://{v}"))
}

/// An address bar candidate: an edit field in a browser's chrome.
#[derive(Debug, Clone, Default)]
pub struct AddressCandidate {
    pub name: String,
    pub automation_id: String,
    pub value: String,
}

/// The page's URL from the browser's edit fields: the one that names itself
/// the address bar (Chromium "Address and search bar", Firefox
/// `urlbar-input`), else the first whose text is a URL (the name is
/// localised).
pub fn pick_address(candidates: &[AddressCandidate]) -> Option<String> {
    let named = |c: &&AddressCandidate| {
        let name = c.name.to_lowercase();
        let id = c.automation_id.to_lowercase();
        id.contains("urlbar")
            || id.contains("omnibox")
            || name.contains("address")
            || name.contains("url")
            || name.contains("location")
    };
    candidates
        .iter()
        .filter(named)
        .chain(candidates.iter())
        .find_map(|c| normalize_url(&c.value))
}

/// Names a browser gives the control that shows a private window (Chrome's
/// "Incognito" avatar button, Edge's "InPrivate", Brave's "Private").
pub fn is_private_marker(name: &str) -> bool {
    let n = name.trim();
    ["Incognito", "InPrivate", "Private", "Private browsing"]
        .iter()
        .any(|m| n.eq_ignore_ascii_case(m))
}

// ── Files ───────────────────────────────────────────────────────────────

/// Search words reduced to what is safe inside a Windows Search SQL string.
pub fn safe_words(words: &[String]) -> Vec<String> {
    words
        .iter()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
                .collect::<String>()
        })
        .filter(|w| w.chars().count() > 1)
        .collect()
}

/// The Windows Search (SystemIndex) query for files under `scope` whose name
/// or content has every word. `None` when nothing is left to search for.
pub fn search_sql(words: &[String], scope: &str) -> Option<String> {
    let words = safe_words(words);
    if words.is_empty() {
        return None;
    }
    let scope = scope.replace('\\', "/").replace('\'', "''");
    let clauses = words
        .iter()
        .map(|w| format!("(System.ItemNameDisplay LIKE '%{w}%' OR CONTAINS(*, '\"{w}\"'))"))
        .collect::<Vec<_>>()
        .join(" AND ");
    Some(format!(
        "SELECT TOP 40 System.ItemPathDisplay, System.ItemNameDisplay FROM SystemIndex \
         WHERE SCOPE='file:{scope}' AND {clauses} ORDER BY System.DateModified DESC"
    ))
}

/// Whether a file name has every search word (case-insensitive).
pub fn name_matches(file_name: &str, words: &[String]) -> bool {
    let name = file_name.to_lowercase();
    !words.is_empty() && words.iter().all(|w| name.contains(&w.to_lowercase()))
}

/// The name of a Recent item or Start menu shortcut ("Q3 deck.pptx.lnk" →
/// "Q3 deck.pptx").
pub fn shortcut_stem(file_name: &str) -> Option<&str> {
    let (stem, ext) = file_name.rsplit_once('.')?;
    ext.eq_ignore_ascii_case("lnk").then_some(stem)
}

/// Letters and digits only, lowercased: how a spoken name is compared with
/// a shortcut's ("run my Morning Routine" finds "Morning-Routine.lnk").
pub fn loose(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// A `file://` link the HUD can open: the native path with spaces escaped,
/// as the macOS results are (`hud_action` reverses it).
pub fn file_url(path: &str) -> String {
    format!("file://{}", path.replace(' ', "%20"))
}

// ── Calendar ────────────────────────────────────────────────────────────

/// An OLE Automation date (days since 1899-12-30, local time) as a local
/// date and time.
pub fn ole_to_naive(date: f64) -> Option<chrono::NaiveDateTime> {
    if !date.is_finite() {
        return None;
    }
    let base = chrono::NaiveDate::from_ymd_opt(1899, 12, 30)?.and_hms_opt(0, 0, 0)?;
    let millis = (date * 86_400_000.0).round() as i64;
    base.checked_add_signed(chrono::Duration::milliseconds(millis))
}

/// The `Items.Restrict` filter for appointments starting in a window, in
/// the unambiguous form Outlook parses in any locale.
pub fn outlook_filter(from: chrono::NaiveDateTime, to: chrono::NaiveDateTime) -> String {
    format!(
        "[Start] >= '{}' AND [Start] <= '{}'",
        from.format("%Y-%m-%d %H:%M"),
        to.format("%Y-%m-%d %H:%M")
    )
}

/// Outlook's attendee list ("Ana Lima; Sam Ortiz") as names.
pub fn split_attendees(list: &str) -> Vec<String> {
    list.split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

// ── Meetings ────────────────────────────────────────────────────────────

/// Whether a microphone ConsentStore entry is in use now: it started and
/// hasn't stopped.
pub fn consent_in_use(last_start: u64, last_stop: u64) -> bool {
    last_start != 0 && last_stop == 0
}

/// Whether a `NonPackaged` ConsentStore key is this app's own executable
/// (the key is the path with `\` written as `#`).
pub fn is_own_consent_key(key: &str, own_exe: &str) -> bool {
    !own_exe.is_empty() && key.eq_ignore_ascii_case(&own_exe.replace('\\', "#"))
}

/// Interleaved frames mixed down to mono.
pub fn mix_to_mono(data: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    data.chunks_exact(channels)
        .map(|f| f.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Streaming downsampler to 16 kHz: each output sample is the mean of the
/// input samples in its period (a box low-pass, enough for speech).
pub struct Downsampler {
    step: f64,
    pos: f64,
    acc: f32,
    n: u32,
}

impl Downsampler {
    pub fn new(from_rate: u32, to_rate: u32) -> Self {
        Self {
            step: f64::from(from_rate.max(1)) / f64::from(to_rate.max(1)),
            pos: 0.0,
            acc: 0.0,
            n: 0,
        }
    }

    pub fn push(&mut self, input: &[f32]) -> Vec<f32> {
        if (self.step - 1.0).abs() < f64::EPSILON {
            return input.to_vec();
        }
        let mut out = Vec::with_capacity((input.len() as f64 / self.step) as usize + 1);
        for &s in input {
            self.acc += s;
            self.n += 1;
            self.pos += 1.0;
            if self.pos >= self.step {
                self.pos -= self.step;
                out.push(self.acc / self.n as f32);
                self.acc = 0.0;
                self.n = 0;
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_ids_and_names() {
        assert_eq!(
            bundle_id_for_exe(r"C:\Program Files\Google\Chrome\Application\Chrome.exe"),
            "chrome.exe"
        );
        assert_eq!(name_from_exe(r"C:\x\ms-teams.exe"), "ms-teams");
        assert_eq!(name_from_exe("zoom"), "zoom");
    }

    #[test]
    fn roles_never_block_typing_on_a_guess() {
        assert_eq!(role_for(control::EDIT, false), "AXTextField");
        assert_eq!(role_for(control::DOCUMENT, false), "AXWebArea");
        assert_eq!(role_for(control::DOCUMENT, true), "AXTextArea");
        assert_eq!(role_for(control::BUTTON, false), "AXButton");
        // Pane (50033) and Custom (50025): unknown, so dictation still types.
        assert_eq!(role_for(50033, false), "AXUnknown");
        assert_eq!(role_for(50025, false), "AXUnknown");
    }

    #[test]
    fn address_bar_text_becomes_a_url() {
        assert_eq!(
            normalize_url("github.com/foo?x=1").as_deref(),
            Some("https://github.com/foo?x=1")
        );
        assert_eq!(
            normalize_url("https://meet.google.com/abc").as_deref(),
            Some("https://meet.google.com/abc")
        );
        assert_eq!(
            normalize_url("chrome://settings/passwords").as_deref(),
            Some("chrome://settings/passwords")
        );
        assert_eq!(
            normalize_url("localhost:3000/a").as_deref(),
            Some("http://localhost:3000/a")
        );
        assert_eq!(normalize_url("rust borrow checker"), None);
        assert_eq!(normalize_url("hello"), None);
        assert_eq!(normalize_url(""), None);
    }

    #[test]
    fn picks_the_named_address_bar_first() {
        let c = |name: &str, id: &str, value: &str| AddressCandidate {
            name: name.into(),
            automation_id: id.into(),
            value: value.into(),
        };
        let found = pick_address(&[
            c("Find", "", "docs.rs"),
            c("Address and search bar", "", "chase.com/login"),
        ]);
        assert_eq!(found.as_deref(), Some("https://chase.com/login"));
        // Localised name: the first field holding a URL.
        let found = pick_address(&[c("Rechercher", "", "two words"), c("Barre", "", "x.org")]);
        assert_eq!(found.as_deref(), Some("https://x.org"));
        assert_eq!(pick_address(&[c("Search", "", "flights to lisbon")]), None);
    }

    #[test]
    fn private_window_markers() {
        assert!(is_private_marker("Incognito"));
        assert!(is_private_marker("InPrivate"));
        assert!(!is_private_marker("Incognito mode explained"));
    }

    #[test]
    fn search_sql_is_bounded_and_escaped() {
        let words = vec!["Q3".to_string(), "deck'); DROP".to_string(), "*".into()];
        let sql = search_sql(&words, r"C:\Users\o'neil").expect("sql");
        assert!(sql.contains("SCOPE='file:C:/Users/o''neil'"));
        assert!(sql.contains("LIKE '%Q3%'"));
        assert!(sql.contains("LIKE '%deckDROP%'"));
        assert!(!sql.contains(';'));
        assert!(sql.starts_with("SELECT TOP 40"));
        assert_eq!(search_sql(&["!".to_string()], "C:/"), None);
    }

    #[test]
    fn file_names_and_shortcuts() {
        let words = vec!["q3".to_string(), "Deck".to_string()];
        assert!(name_matches("Q3 Sales deck final.pptx", &words));
        assert!(!name_matches("Q3 numbers.xlsx", &words));
        assert_eq!(shortcut_stem("Q3 deck.pptx.lnk"), Some("Q3 deck.pptx"));
        assert_eq!(shortcut_stem("notes.txt"), None);
        assert_eq!(loose("Morning-Routine"), loose("morning routine"));
        assert_eq!(
            file_url(r"C:\Users\sam\Documents\Q3 deck.pptx"),
            r"file://C:\Users\sam\Documents\Q3%20deck.pptx"
        );
    }

    #[test]
    fn ole_dates_and_outlook_filter() {
        let d = ole_to_naive(46_328.5).expect("date");
        assert_eq!(d.format("%Y-%m-%d %H:%M").to_string(), "2026-11-02 12:00");
        assert_eq!(ole_to_naive(f64::NAN), None);
        let to = d + chrono::Duration::minutes(10);
        assert_eq!(
            outlook_filter(d, to),
            "[Start] >= '2026-11-02 12:00' AND [Start] <= '2026-11-02 12:10'"
        );
        assert_eq!(
            split_attendees("Ana Lima; Sam Ortiz;  "),
            vec!["Ana Lima".to_string(), "Sam Ortiz".to_string()]
        );
    }

    #[test]
    fn consent_store_entries() {
        assert!(consent_in_use(133_000_000_000_000_000, 0));
        assert!(!consent_in_use(
            133_000_000_000_000_000,
            133_000_000_000_000_100
        ));
        assert!(!consent_in_use(0, 0));
        assert!(is_own_consent_key(
            "C:#Program Files#Ambient#ambient.exe",
            r"C:\Program Files\Ambient\Ambient.exe"
        ));
        assert!(!is_own_consent_key(
            "C:#Program Files#Zoom#bin#Zoom.exe",
            ""
        ));
    }

    #[test]
    fn audio_is_mixed_and_downsampled() {
        assert_eq!(mix_to_mono(&[1.0, 0.0, 0.5, 0.5], 2), vec![0.5, 0.5]);
        let mut ds = Downsampler::new(48_000, 16_000);
        let out = ds.push(&[3.0; 4800]);
        assert_eq!(out.len(), 1600);
        assert!(out.iter().all(|s| (*s - 3.0).abs() < 1e-6));
        // Streaming across calls keeps the ratio.
        let mut ds = Downsampler::new(44_100, 16_000);
        let n: usize = (0..10).map(|_| ds.push(&[0.0; 4410]).len()).sum();
        assert!((15_990..=16_010).contains(&n), "{n}");
        let mut same = Downsampler::new(16_000, 16_000);
        assert_eq!(same.push(&[0.25, 0.5]), vec![0.25, 0.5]);
    }
}
