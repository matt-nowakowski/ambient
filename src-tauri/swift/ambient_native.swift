// Native macOS helpers for the ambient agent: reading on-screen text through
// the Accessibility API, and the Keychain-held key for the local memory store.
//
// Exposed as a C ABI to Rust (src/context, src/recall). Strings are returned as
// malloc'd UTF-8 JSON and must be released with `ambient_free`.
//
// Privacy: nothing here captures pixels or writes to disk. Text is read only
// when Rust asks for it, after its never-watch policy has allowed the app.

import AppKit
import ApplicationServices
import CoreAudio
import CoreMedia
import EventKit
import ScreenCaptureKit
import Foundation
import Security

// MARK: - Plumbing

private func toCString(_ s: String) -> UnsafeMutablePointer<CChar>? {
    return strdup(s)
}

private func json(_ object: [String: Any]) -> UnsafeMutablePointer<CChar>? {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: []),
          let s = String(data: data, encoding: .utf8) else { return nil }
    return toCString(s)
}

@_cdecl("ambient_free")
public func ambient_free(_ ptr: UnsafeMutablePointer<CChar>?) {
    free(ptr)
}

// MARK: - Accessibility

@_cdecl("ambient_ax_trusted")
public func ambient_ax_trusted() -> Bool {
    return AXIsProcessTrusted()
}

/// Frontmost app as JSON: {"pid", "bundle_id", "name"}. Cheap; no AX calls, so
/// Rust can apply the never-watch list before any text is read.
@_cdecl("ambient_frontmost_app")
public func ambient_frontmost_app() -> UnsafeMutablePointer<CChar>? {
    guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
    return json([
        "pid": Int(app.processIdentifier),
        "bundle_id": app.bundleIdentifier ?? "",
        "name": app.localizedName ?? "",
    ])
}

private func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
    var value: AnyObject?
    let err = AXUIElementCopyAttributeValue(el, name as CFString, &value)
    return err == .success ? value : nil
}

private func stringAttr(_ el: AXUIElement, _ name: String) -> String? {
    if let s = attr(el, name) as? String { return s }
    if let u = attr(el, name) as? URL { return u.absoluteString }
    return nil
}

private func isSettable(_ el: AXUIElement, _ name: String) -> Bool {
    var settable: DarwinBoolean = false
    return AXUIElementIsAttributeSettable(el, name as CFString, &settable) == .success && settable.boolValue
}

private let editableRoles: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]
private let textRoles: Set<String> = ["AXStaticText", "AXTextArea", "AXTextField", "AXHeading", "AXLink", "AXCell"]
// Containers whose subtrees never hold readable content worth the AX calls.
private let skipRoles: Set<String> = ["AXMenuBar", "AXMenu", "AXToolbar", "AXScrollBar", "AXImage", "AXSecureTextField"]

/// Chromium browsers. Google Chrome (and Brave, Edge, Vivaldi, Opera) only
/// build a page's accessibility tree for an assistive app that sets
/// AXEnhancedUserInterface on the application element:
/// `BrowserCrApplication accessibilitySetValue:forAttribute:` in
/// chrome/browser/chrome_browser_application_mac.mm handles only that
/// attribute, and turns on complete accessibility (web contents included)
/// about 2 s later. It ignores AXManualAccessibility, which only Electron
/// honours, and plain queries (macOS 14+) wake only the browser's own UI:
/// the toolbar and tabs, with an empty content area.
private let chromiumBrowsers: Set<String> = [
    "com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.dev", "com.google.Chrome.canary",
    "org.chromium.Chromium", "com.brave.Browser", "com.brave.Browser.beta", "com.microsoft.edgemac",
    "com.microsoft.edgemac.Beta", "com.vivaldi.Vivaldi", "com.operasoftware.Opera",
]

/// Pids asked for complete accessibility, and when (Chrome applies it ~2 s later).
private var enhancedAsked: [pid_t: Date] = [:]
private let enhancedLock = NSLock()

private func boolAttr(_ el: AXUIElement, _ name: String) -> Bool? {
    if let n = attr(el, name) as? NSNumber { return n.boolValue }
    return nil
}

/// Chromium and Electron apps only build their accessibility tree when asked.
/// AXManualAccessibility asks Electron apps without the side effects of
/// AXEnhancedUserInterface. Chromium browsers need AXEnhancedUserInterface
/// itself (see `chromiumBrowsers`); it's set once per process and read back
/// rather than trusted (Chrome can return an error even when it took). Its
/// known side effect: window managers that animate windows (Rectangle,
/// Magnet) move that browser's windows less smoothly.
/// Returns whether the browser reports it on (nil when not asked).
@discardableResult
private func wakeAccessibility(_ app: AXUIElement, pid: pid_t) -> Bool? {
    AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    let bundle = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier ?? ""
    guard chromiumBrowsers.contains(bundle) else { return nil }
    let on = boolAttr(app, "AXEnhancedUserInterface") ?? false
    if !on {
        enhancedLock.lock()
        let last = enhancedAsked[pid]
        // Ask again at most every 10 s if it didn't stick (VoiceOver toggling
        // or another tool may turn it off).
        if last == nil || Date().timeIntervalSince(last!) > 10 {
            enhancedAsked[pid] = Date()
            enhancedLock.unlock()
            AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
            return boolAttr(app, "AXEnhancedUserInterface") ?? false
        }
        enhancedLock.unlock()
    }
    return on
}

/// Seconds since complete accessibility was asked of this pid (nil if never).
private func secondsSinceEnhanced(_ pid: pid_t) -> Double? {
    enhancedLock.lock()
    defer { enhancedLock.unlock() }
    return enhancedAsked[pid].map { Date().timeIntervalSince($0) }
}

/// Breadth-first walk collecting visible text, bounded by characters, nodes and time.
private func collectText(_ root: AXUIElement, maxChars: Int, deadline: Date) -> String {
    var visited = 0
    return collectText(root, maxChars: maxChars, deadline: deadline, visited: &visited)
}

private func collectText(_ root: AXUIElement, maxChars: Int, deadline: Date, visited: inout Int) -> String {
    var out = ""
    var seen = Set<String>()
    // Links off the page's own site keep where they go ("Website →
    // https://truth.network"), so "open their website" can use the real link.
    let pageHost = stringAttr(root, "AXURL").flatMap { URL(string: $0)?.host }
    var queue: [AXUIElement] = [root]
    while !queue.isEmpty, out.count < maxChars, visited < 4000, Date() < deadline {
        let el = queue.removeFirst()
        visited += 1
        let role = stringAttr(el, kAXRoleAttribute) ?? ""
        if skipRoles.contains(role) { continue }
        if role == "AXLink", let href = stringAttr(el, "AXURL"), let link = URL(string: href),
           link.scheme == "https" || link.scheme == "http", let host = link.host, host != pageHost {
            let label = (stringAttr(el, kAXTitleAttribute) ?? stringAttr(el, kAXDescriptionAttribute) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let line = (label.isEmpty ? "Link" : label) + " → " + String(href.prefix(120))
            if !seen.contains(line) {
                seen.insert(line)
                out += line + "\n"
            }
        }
        if textRoles.contains(role) {
            let value = stringAttr(el, kAXValueAttribute) ?? stringAttr(el, kAXTitleAttribute) ?? ""
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count > 1, !seen.contains(trimmed) {
                seen.insert(trimmed)
                out += trimmed + "\n"
            }
        }
        if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            queue.append(contentsOf: children)
        }
    }
    return out.count > maxChars ? String(out.prefix(maxChars)) : out
}

private func findWebArea(_ root: AXUIElement, depth: Int = 0) -> AXUIElement? {
    if depth > 12 { return nil }
    if stringAttr(root, kAXRoleAttribute) == "AXWebArea" { return root }
    guard let children = attr(root, kAXChildrenAttribute) as? [AXUIElement] else { return nil }
    for child in children {
        if let found = findWebArea(child, depth: depth + 1) { return found }
    }
    return nil
}

/// The page's `role="main"` region (AXLandmarkMain), breadth-first and
/// bounded, if the page marks one.
private func findMain(_ root: AXUIElement, deadline: Date) -> AXUIElement? {
    var queue: [(AXUIElement, Int)] = [(root, 0)]
    var visited = 0
    while !queue.isEmpty, visited < 600, Date() < deadline {
        let (el, depth) = queue.removeFirst()
        visited += 1
        if stringAttr(el, kAXSubroleAttribute) == "AXLandmarkMain" { return el }
        if depth >= 14 { continue }
        if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            queue.append(contentsOf: children.map { ($0, depth + 1) })
        }
    }
    return nil
}

/// URLs and titles of the web frames in a window: a browser's page, its side
/// panel (where wallet extensions such as MetaMask live) and extension popups.
/// Walks the browser chrome only (never into a page), bounded by nodes and time.
private struct Frames {
    var urls: [String] = []
    var titles: [String] = []
    /// Short labels of the browser's own UI (tab titles, a side panel's
    /// header, a popup's title), never the toolbar's (a pinned extension
    /// button is always there) and never page content. Used only to spot
    /// private places when the browser exposes no page content.
    var labels: [String] = []
    var webAreas = 0
    /// Children of the first web area: 0 means the browser built no tree for it.
    var webAreaChildren = -1
    var visited = 0
}

private let labelRoles: Set<String> = ["AXStaticText", "AXRadioButton", "AXTab", "AXPopUpButton", "AXButton", "AXHeading"]
// The toolbar (pinned extensions, bookmarks) and menus are always there, so
// they say nothing about what's open.
private let chromeSkipRoles: Set<String> = ["AXToolbar", "AXMenuBar", "AXMenu", "AXScrollBar", "AXImage"]

private func shortLabel(_ el: AXUIElement) -> String? {
    for name in [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute] {
        if let s = stringAttr(el, name)?.trimmingCharacters(in: .whitespacesAndNewlines),
           s.count > 1, s.count <= 120 {
            return s
        }
    }
    return nil
}

private func webFrames(_ window: AXUIElement, deadline: Date, labels wantLabels: Bool = false) -> Frames {
    var f = Frames()
    var queue: [(AXUIElement, Int)] = [(window, 0)]
    while !queue.isEmpty, f.visited < 800, Date() < deadline {
        let (el, depth) = queue.removeFirst()
        f.visited += 1
        let role = stringAttr(el, kAXRoleAttribute) ?? ""
        if role == "AXWebArea" {
            f.webAreas += 1
            if f.webAreaChildren < 0 {
                f.webAreaChildren = (attr(el, kAXChildrenAttribute) as? [AXUIElement])?.count ?? 0
            }
            if let url = stringAttr(el, "AXURL"), !url.isEmpty { f.urls.append(url) }
            if let title = stringAttr(el, kAXTitleAttribute), !title.isEmpty { f.titles.append(title) }
            continue // the page's own content is not walked
        }
        if chromeSkipRoles.contains(role) { continue }
        // Tabs count only when selected: a wallet in a background tab
        // shouldn't blind the agent to the page in front.
        let isTab = role == "AXRadioButton" || role == "AXTab"
        let selected = !isTab || (attr(el, kAXValueAttribute) as? NSNumber)?.boolValue == true
            || boolAttr(el, kAXSelectedAttribute) == true
        if wantLabels, selected, labelRoles.contains(role), f.labels.count < 60, let label = shortLabel(el) {
            f.labels.append(label)
        }
        if depth < 14, let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            queue.append(contentsOf: children.map { ($0, depth + 1) })
        }
    }
    return f
}

/// The app's other windows that aren't ordinary windows: extension popups
/// (MetaMask's is its own window), bubbles and panels. Their titles and web
/// frames, never their content.
private func popupWindows(_ app: AXUIElement, besides focused: AXUIElement?, deadline: Date, labels wantLabels: Bool) -> (count: Int, frames: Frames) {
    var out = Frames()
    var count = 0
    guard let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement] else { return (0, out) }
    for w in windows.prefix(12) {
        if let focused = focused, CFEqual(w, focused) { continue }
        let subrole = stringAttr(w, kAXSubroleAttribute) ?? ""
        if subrole == "AXStandardWindow" { continue }
        count += 1
        if let t = stringAttr(w, kAXTitleAttribute), !t.isEmpty { out.titles.append(t) }
        let f = webFrames(w, deadline: deadline, labels: wantLabels)
        out.urls += f.urls
        out.titles += f.titles
        out.labels += f.labels.prefix(20)
    }
    return (count, out)
}

/// The web frame holding the focused element, if any (walks up its parents).
private func enclosingWebArea(_ el: AXUIElement) -> AXUIElement? {
    var current: AXUIElement? = el
    for _ in 0..<48 {
        guard let node = current else { return nil }
        if stringAttr(node, kAXRoleAttribute) == "AXWebArea" { return node }
        current = attr(node, kAXParentAttribute).map { $0 as! AXUIElement }
    }
    return nil
}

/// Browsers, whose own UI (tabs, side panel header, popups) is read for
/// labels when looking for private places.
private let browserBundles: Set<String> = chromiumBrowsers.union([
    "company.thebrowser.Browser", "com.apple.Safari", "org.mozilla.firefox",
])

/// Snapshot of the given app's focused window as JSON:
/// {"window_title", "url", "focused_role", "editable", "secure", "selection", "text",
///  "frame_urls", "frame_titles", "ui_labels", "diag"}.
/// `maxChars` <= 0 skips the text walk and the selection (metadata only).
/// "diag" holds counts only (for logs): web areas found, children of the
/// first, nodes visited, popup windows, whether a Chromium browser reports
/// complete accessibility on and for how long it's been asked.
@_cdecl("ambient_context_snapshot")
public func ambient_context_snapshot(_ pid: Int32, _ maxChars: Int32) -> UnsafeMutablePointer<CChar>? {
    guard AXIsProcessTrusted() else { return nil }
    let app = AXUIElementCreateApplication(pid_t(pid))
    AXUIElementSetMessagingTimeout(app, 0.25)
    let enhanced = wakeAccessibility(app, pid: pid_t(pid))
    let bundle = NSRunningApplication(processIdentifier: pid_t(pid))?.bundleIdentifier ?? ""
    let isBrowser = browserBundles.contains(bundle)

    var result: [String: Any] = [:]
    var diag: [String: Any] = [:]
    if let on = enhanced {
        diag["enhanced_ui"] = on
        if let s = secondsSinceEnhanced(pid_t(pid)) { diag["enhanced_age_s"] = Int(s) }
    }
    let window = attr(app, kAXFocusedWindowAttribute).map { $0 as! AXUIElement }
    var frameUrls: [String] = []
    var frameTitles: [String] = []
    var uiLabels: [String] = []
    if let window = window {
        result["window_title"] = stringAttr(window, kAXTitleAttribute) ?? ""
        if let doc = stringAttr(window, kAXDocumentAttribute) { result["url"] = doc }
        let deadline = Date().addingTimeInterval(0.15)
        let frames = webFrames(window, deadline: deadline, labels: isBrowser)
        frameUrls = frames.urls
        frameTitles = frames.titles
        uiLabels = frames.labels
        diag["web_areas"] = frames.webAreas
        diag["web_area_children"] = frames.webAreaChildren
        diag["chrome_nodes"] = frames.visited
    }
    // Extension popups and other non-standard windows of a browser.
    if isBrowser {
        let popups = popupWindows(app, besides: window, deadline: Date().addingTimeInterval(0.1), labels: true)
        diag["popup_windows"] = popups.count
        frameUrls += popups.frames.urls
        frameTitles += popups.frames.titles
        uiLabels += popups.frames.labels
    }

    if let focusedObj = attr(app, kAXFocusedUIElementAttribute) {
        let focused = focusedObj as! AXUIElement
        let role = stringAttr(focused, kAXRoleAttribute) ?? ""
        result["focused_role"] = role
        result["secure"] = role == "AXSecureTextField"
        result["editable"] = editableRoles.contains(role) || isSettable(focused, kAXValueAttribute)
        if let area = enclosingWebArea(focused) {
            if let url = stringAttr(area, "AXURL"), !url.isEmpty { frameUrls.append(url) }
            if let title = stringAttr(area, kAXTitleAttribute), !title.isEmpty { frameTitles.append(title) }
        }
        if maxChars > 0, role != "AXSecureTextField", let sel = stringAttr(focused, kAXSelectedTextAttribute), !sel.isEmpty {
            result["selection"] = String(sel.prefix(8000))
        }
        // What the user is writing (draft suggestions). Never for password fields.
        if maxChars > 0, role != "AXSecureTextField", (result["editable"] as? Bool) == true,
           let value = stringAttr(focused, kAXValueAttribute), !value.isEmpty {
            result["focused_text"] = String(value.prefix(6000))
        }
    }

    if maxChars > 0, let window = window, (result["secure"] as? Bool) != true {
        let deadline = Date().addingTimeInterval(0.6)
        // Browsers: read the page, not the tab strip, and take its URL.
        let root = findWebArea(window) ?? window
        if let url = stringAttr(root, "AXURL") { result["url"] = url }
        // Web apps like Gmail spend the node and time budget on navigation
        // before reaching the content; start at the page's main region.
        let main = findMain(root, deadline: Date().addingTimeInterval(0.2))
        let content = main ?? root
        var visited = 0
        result["text"] = collectText(content, maxChars: Int(maxChars), deadline: deadline, visited: &visited)
        diag["text_nodes"] = visited
        diag["found_web_area"] = stringAttr(root, kAXRoleAttribute) == "AXWebArea"
        diag["found_main"] = main != nil
    }
    result["frame_urls"] = frameUrls
    result["frame_titles"] = frameTitles
    result["ui_labels"] = uiLabels
    result["diag"] = diag
    return json(result)
}

// MARK: - The focused text field (smart writing: "Use my words")

/// The focused element of `pid` as JSON: {"role", "secure", "loc", "len"}
/// (the selected range in UTF-16 units; `len` 0 is the caret), plus "value"
/// and "selection" when `readText` is set. Never reads a password field.
/// Values longer than 200,000 UTF-16 units aren't returned (the caller then
/// treats the field as unreadable).
@_cdecl("ambient_focused_field")
public func ambient_focused_field(_ pid: Int32, _ readText: Bool) -> UnsafeMutablePointer<CChar>? {
    guard AXIsProcessTrusted() else { return nil }
    let app = AXUIElementCreateApplication(pid_t(pid))
    AXUIElementSetMessagingTimeout(app, 0.25)
    guard let obj = attr(app, kAXFocusedUIElementAttribute),
          CFGetTypeID(obj) == AXUIElementGetTypeID() else { return nil }
    let focused = obj as! AXUIElement
    let role = stringAttr(focused, kAXRoleAttribute) ?? ""
    var result: [String: Any] = ["role": role, "secure": role == "AXSecureTextField"]
    if role == "AXSecureTextField" { return json(result) }
    if let rangeObj = attr(focused, kAXSelectedTextRangeAttribute),
       CFGetTypeID(rangeObj) == AXValueGetTypeID() {
        var range = CFRange()
        if AXValueGetValue(rangeObj as! AXValue, .cfRange, &range) {
            result["loc"] = range.location
            result["len"] = range.length
        }
    }
    if readText {
        if let v = stringAttr(focused, kAXValueAttribute), v.utf16.count <= 200_000 {
            result["value"] = v
        }
        if let s = stringAttr(focused, kAXSelectedTextAttribute) { result["selection"] = s }
    }
    return json(result)
}

/// The text right before the caret (or the selection) in the focused element
/// of `pid`: at most `maxUnits` UTF-16 units, as JSON {"before", "mono"}.
/// "before" is "" at the start of the field; "mono" is set when the app says
/// the text there is in a fixed-width font (a code editor or terminal).
/// Never reads a password field (returns {"secure": true}).
@_cdecl("ambient_text_before_caret")
public func ambient_text_before_caret(_ pid: Int32, _ maxUnits: Int) -> UnsafeMutablePointer<CChar>? {
    guard AXIsProcessTrusted() else { return nil }
    let app = AXUIElementCreateApplication(pid_t(pid))
    AXUIElementSetMessagingTimeout(app, 0.25)
    guard let obj = attr(app, kAXFocusedUIElementAttribute),
          CFGetTypeID(obj) == AXUIElementGetTypeID() else { return nil }
    let focused = obj as! AXUIElement
    if stringAttr(focused, kAXRoleAttribute) == "AXSecureTextField" { return json(["secure": true]) }
    guard let rangeObj = attr(focused, kAXSelectedTextRangeAttribute),
          CFGetTypeID(rangeObj) == AXValueGetTypeID() else { return nil }
    var sel = CFRange()
    guard AXValueGetValue(rangeObj as! AXValue, .cfRange, &sel), sel.location >= 0 else { return nil }
    if sel.location == 0 { return json(["before": ""]) }
    let n = min(max(maxUnits, 1), sel.location)
    var range = CFRange(location: sel.location - n, length: n)
    guard let rangeValue = AXValueCreate(.cfRange, &range) else { return nil }
    var result: [String: Any] = [:]
    var out: CFTypeRef?
    if AXUIElementCopyParameterizedAttributeValue(
        focused, kAXStringForRangeParameterizedAttribute as CFString, rangeValue, &out) == .success,
       let s = out as? String {
        result["before"] = s
    } else if let v = stringAttr(focused, kAXValueAttribute), v.utf16.count <= 200_000,
              sel.location <= v.utf16.count {
        let units = Array(v.utf16)[(sel.location - n)..<sel.location]
        result["before"] = String(decoding: units, as: UTF16.self)
    } else {
        return nil
    }
    var styled: CFTypeRef?
    if AXUIElementCopyParameterizedAttributeValue(
        focused, kAXAttributedStringForRangeParameterizedAttribute as CFString, rangeValue, &styled) == .success,
       let a = styled as? NSAttributedString, a.length > 0,
       let font = a.attribute(NSAttributedString.Key("AXFont"), at: a.length - 1, effectiveRange: nil) as? [String: Any],
       let name = font["AXFontName"] as? String {
        result["mono"] = NSFont(name: name, size: 12)?.isFixedPitch ?? false
    }
    return json(result)
}

/// Select `len` UTF-16 units from `loc` in the focused element of `pid`.
/// True when the app accepted the new range.
@_cdecl("ambient_select_range")
public func ambient_select_range(_ pid: Int32, _ loc: Int, _ len: Int) -> Bool {
    guard AXIsProcessTrusted() else { return false }
    let app = AXUIElementCreateApplication(pid_t(pid))
    AXUIElementSetMessagingTimeout(app, 0.25)
    guard let obj = attr(app, kAXFocusedUIElementAttribute),
          CFGetTypeID(obj) == AXUIElementGetTypeID() else { return false }
    let focused = obj as! AXUIElement
    if stringAttr(focused, kAXRoleAttribute) == "AXSecureTextField" { return false }
    var range = CFRange(location: loc, length: len)
    guard let value = AXValueCreate(.cfRange, &range) else { return false }
    return AXUIElementSetAttributeValue(focused, kAXSelectedTextRangeAttribute as CFString, value) == .success
}

// MARK: - Pressing a button (opening a reply)

/// The accessible name of a button or link: its title, description, help, or
/// (links) the text inside it.
private func controlNames(_ el: AXUIElement) -> [String] {
    var names = [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute]
        .compactMap { stringAttr(el, $0) }
    if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
        for c in children.prefix(3) where stringAttr(c, kAXRoleAttribute) == "AXStaticText" {
            if let v = stringAttr(c, kAXValueAttribute) { names.append(v) }
        }
    }
    return names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty }
}

/// Press the button or link named one of `labels` (newline-separated, any
/// case) in the app's focused window, page content included (Gmail's Reply).
/// Links win over buttons, and the last match over earlier ones: in a Gmail
/// thread the "Reply" link under the newest message, else the newest
/// message's Reply button. Bounded by nodes and time.
/// Returns 0 pressed, 1 not found, 2 the press failed, 3 no permission or window.
@_cdecl("ambient_press_labeled")
public func ambient_press_labeled(_ pid: Int32, _ labels: UnsafePointer<CChar>) -> Int32 {
    guard AXIsProcessTrusted() else { return 3 }
    let wanted = Set(String(cString: labels).split(separator: "\n").map { $0.lowercased() })
    let app = AXUIElementCreateApplication(pid_t(pid))
    AXUIElementSetMessagingTimeout(app, 0.3)
    guard let window = attr(app, kAXFocusedWindowAttribute).map({ $0 as! AXUIElement }) else { return 3 }
    let deadline = Date().addingTimeInterval(1.5)
    var links: [AXUIElement] = []
    var buttons: [AXUIElement] = []
    var queue: [AXUIElement] = [window]
    var visited = 0
    while !queue.isEmpty, visited < 8000, Date() < deadline {
        let el = queue.removeFirst()
        visited += 1
        let role = stringAttr(el, kAXRoleAttribute) ?? ""
        if role == "AXButton" || role == "AXLink" || role == "AXMenuButton" {
            if controlNames(el).contains(where: { wanted.contains($0) }) {
                if role == "AXLink" { links.append(el) } else { buttons.append(el) }
            }
        }
        if role == "AXMenuBar" || role == "AXScrollBar" || role == "AXImage" || role == "AXStaticText" { continue }
        if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            queue.append(contentsOf: children)
        }
    }
    guard let target = links.last ?? buttons.last else { return 1 }
    return AXUIElementPerformAction(target, kAXPressAction as CFString) == .success ? 0 : 2
}

// MARK: - Keychain

/// Fetch the 32-byte memory key, creating it on first use. Writes the key into
/// `out` and returns true on success. The key never leaves the Keychain other
/// than into this process's memory.
@_cdecl("ambient_memory_key")
public func ambient_memory_key(_ service: UnsafePointer<CChar>, _ out: UnsafeMutablePointer<UInt8>) -> Bool {
    let svc = String(cString: service)
    let account = "memory-key"
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: svc,
        kSecAttrAccount as String: account,
        kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
       let data = item as? Data, data.count == 32 {
        data.copyBytes(to: out, count: 32)
        return true
    }
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, 32, &bytes) == errSecSuccess else { return false }
    let add: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: svc,
        kSecAttrAccount as String: account,
        kSecValueData as String: Data(bytes),
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    SecItemDelete([kSecClass as String: kSecClassGenericPassword,
                   kSecAttrService as String: svc,
                   kSecAttrAccount as String: account] as CFDictionary)
    guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { return false }
    for i in 0..<32 { out[i] = bytes[i] }
    return true
}

// MARK: - Reminders and calendar (EventKit)

private let eventStore = EKEventStore()

/// "YYYY-MM-DDTHH:MM" in local time.
private func parseLocal(_ s: String) -> Date? {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    for format in ["yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd"] {
        f.dateFormat = format
        if let d = f.date(from: s) { return d }
    }
    return nil
}

/// Blocks the calling (background) thread until the user answers the prompt.
private func requestAccess(_ type: EKEntityType) -> Bool {
    let status = EKEventStore.authorizationStatus(for: type)
    if #available(macOS 14.0, *) {
        if status == .fullAccess { return true }
    } else if status == .authorized {
        return true
    }
    if status == .denied || status == .restricted { return false }
    let sem = DispatchSemaphore(value: 0)
    var granted = false
    if #available(macOS 14.0, *) {
        let done: (Bool, Error?) -> Void = { ok, _ in granted = ok; sem.signal() }
        if type == .reminder {
            eventStore.requestFullAccessToReminders(completion: done)
        } else {
            eventStore.requestFullAccessToEvents(completion: done)
        }
    } else {
        eventStore.requestAccess(to: type) { ok, _ in granted = ok; sem.signal() }
    }
    _ = sem.wait(timeout: .now() + 120)
    return granted
}

private func result(_ ok: Bool, _ detail: String) -> UnsafeMutablePointer<CChar>? {
    return json(["ok": ok, "detail": detail])
}

/// {"ok", "detail"}: detail is the item id on success, an error code otherwise.
@_cdecl("ambient_create_reminder")
public func ambient_create_reminder(_ title: UnsafePointer<CChar>, _ due: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard requestAccess(.reminder) else { return result(false, "no_permission") }
    let reminder = EKReminder(eventStore: eventStore)
    reminder.title = String(cString: title)
    guard let list = eventStore.defaultCalendarForNewReminders() else { return result(false, "no_list") }
    reminder.calendar = list
    if let date = parseLocal(String(cString: due)) {
        reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        reminder.addAlarm(EKAlarm(absoluteDate: date))
    }
    do {
        try eventStore.save(reminder, commit: true)
        return result(true, reminder.calendarItemIdentifier)
    } catch {
        return result(false, "save_failed")
    }
}

@_cdecl("ambient_create_event")
public func ambient_create_event(
    _ title: UnsafePointer<CChar>, _ start: UnsafePointer<CChar>,
    _ end: UnsafePointer<CChar>, _ location: UnsafePointer<CChar>
) -> UnsafeMutablePointer<CChar>? {
    guard requestAccess(.event) else { return result(false, "no_permission") }
    guard let startDate = parseLocal(String(cString: start)) else { return result(false, "bad_date") }
    let event = EKEvent(eventStore: eventStore)
    event.title = String(cString: title)
    event.startDate = startDate
    event.endDate = parseLocal(String(cString: end)) ?? startDate.addingTimeInterval(3600)
    let loc = String(cString: location)
    if !loc.isEmpty { event.location = loc }
    guard let calendar = eventStore.defaultCalendarForNewEvents else { return result(false, "no_calendar") }
    event.calendar = calendar
    do {
        try eventStore.save(event, span: .thisEvent, commit: true)
        return result(true, event.eventIdentifier ?? "")
    } catch {
        return result(false, "save_failed")
    }
}

/// Undo for the HUD: remove a reminder or event created a moment ago.
@_cdecl("ambient_delete_item")
public func ambient_delete_item(_ id: UnsafePointer<CChar>) -> Bool {
    let ident = String(cString: id)
    if let item = eventStore.calendarItem(withIdentifier: ident) as? EKReminder {
        return (try? eventStore.remove(item, commit: true)) != nil
    }
    if let event = eventStore.event(withIdentifier: ident) {
        return (try? eventStore.remove(event, span: .thisEvent, commit: true)) != nil
    }
    return false
}

// MARK: - Meetings: system audio and mic-in-use

/// True when some process is using the default input device. Checked before
/// Ambient opens the mic itself, it means another app (a call) has it.
@_cdecl("ambient_mic_in_use")
public func ambient_mic_in_use() -> Bool {
    var device = AudioObjectID(0)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &device) == noErr,
          device != 0 else { return false }
    var running: UInt32 = 0
    size = UInt32(MemoryLayout<UInt32>.size)
    address.mSelector = kAudioDevicePropertyDeviceIsRunningSomewhere
    guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &running) == noErr else { return false }
    return running != 0
}

/// Receives 16 kHz mono float frames of the Mac's audio output.
public typealias AmbientAudioCallback = @convention(c) (UnsafePointer<Float>?, Int32, UnsafeMutableRawPointer?) -> Void

@available(macOS 13.0, *)
private final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let callback: AmbientAudioCallback
    private let context: UnsafeMutableRawPointer?
    private let queue = DispatchQueue(label: "ambient.system-audio")

    init(callback: AmbientAudioCallback, context: UnsafeMutableRawPointer?) {
        self.callback = callback
        self.context = context
    }

    func start() -> Int32 {
        let sem = DispatchSemaphore(value: 0)
        var shareable: SCShareableContent?
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, _ in
            shareable = content
            sem.signal()
        }
        _ = sem.wait(timeout: .now() + 10)
        guard let content = shareable, let display = content.displays.first else { return 1 } // no permission
        let own = content.applications.filter { $0.processID == ProcessInfo.processInfo.processIdentifier }
        let filter = SCContentFilter(display: display, excludingApplications: own, exceptingWindows: [])

        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 16_000
        config.channelCount = 1
        // Audio only: the smallest, slowest video ScreenCaptureKit allows.
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        config.queueDepth = 3

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        do {
            try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        } catch {
            return 2
        }
        var started = false
        let startSem = DispatchSemaphore(value: 0)
        stream.startCapture { error in
            started = error == nil
            startSem.signal()
        }
        _ = startSem.wait(timeout: .now() + 10)
        guard started else { return 3 }
        self.stream = stream
        return 0
    }

    func stop() {
        let sem = DispatchSemaphore(value: 0)
        stream?.stopCapture { _ in sem.signal() }
        _ = sem.wait(timeout: .now() + 5)
        stream = nil
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid else { return }
        var blockBuffer: CMBlockBuffer?
        var list = AudioBufferList()
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &list,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: 0,
            blockBufferOut: &blockBuffer)
        guard status == noErr, let data = list.mBuffers.mData else { return }
        let frames = Int32(list.mBuffers.mDataByteSize) / Int32(MemoryLayout<Float>.size)
        callback(data.assumingMemoryBound(to: Float.self), frames, context)
    }
}

private var systemAudio: AnyObject?

/// 0 = capturing; 1 = no Screen Recording permission; 2/3 = couldn't start;
/// 4 = macOS older than 13.
@_cdecl("ambient_system_audio_start")
public func ambient_system_audio_start(_ callback: AmbientAudioCallback, _ context: UnsafeMutableRawPointer?) -> Int32 {
    guard #available(macOS 13.0, *) else { return 4 }
    let capture = SystemAudioCapture(callback: callback, context: context)
    let result = capture.start()
    if result == 0 { systemAudio = capture }
    return result
}

@_cdecl("ambient_system_audio_stop")
public func ambient_system_audio_stop() {
    if #available(macOS 13.0, *), let capture = systemAudio as? SystemAudioCapture {
        capture.stop()
    }
    systemAudio = nil
}

// MARK: - Open windows (finding the user's things without connecting anything)

/// Text of every window of every regular app that's open, as JSON
/// [{"pid","bundle_id","name","title","url","text"}]. `skip` is a
/// newline-separated list of bundle ids never to read. Bounded by time and
/// characters per window.
@_cdecl("ambient_open_windows")
public func ambient_open_windows(_ skip: UnsafePointer<CChar>, _ maxCharsPerWindow: Int32) -> UnsafeMutablePointer<CChar>? {
    guard AXIsProcessTrusted() else { return nil }
    let skipped = Set(String(cString: skip).split(separator: "\n").map(String.init))
    let ownPid = ProcessInfo.processInfo.processIdentifier
    var out: [[String: Any]] = []
    let overall = Date().addingTimeInterval(2.5)
    for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
        if Date() > overall { break }
        let bundle = app.bundleIdentifier ?? ""
        if app.processIdentifier == ownPid || skipped.contains(bundle) { continue }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(axApp, 0.2)
        wakeAccessibility(axApp, pid: app.processIdentifier)
        guard let windows = attr(axApp, kAXWindowsAttribute) as? [AXUIElement] else { continue }
        for window in windows.prefix(4) {
            if Date() > overall { break }
            let title = stringAttr(window, kAXTitleAttribute) ?? ""
            let root = findWebArea(window) ?? window
            let text = collectText(root, maxChars: Int(maxCharsPerWindow), deadline: Date().addingTimeInterval(0.25))
            if text.count < 20 { continue }
            var entry: [String: Any] = [
                "pid": Int(app.processIdentifier), "bundle_id": bundle,
                "name": app.localizedName ?? "", "title": title, "text": text,
            ]
            if let url = stringAttr(root, "AXURL") ?? stringAttr(window, kAXDocumentAttribute) { entry["url"] = url }
            out.append(entry)
        }
    }
    guard let data = try? JSONSerialization.data(withJSONObject: out),
          let s = String(data: data, encoding: .utf8) else { return nil }
    return strdup(s)
}

// MARK: - Upcoming events (meeting prep)

/// Events starting within `minutes`, as JSON [{"id","title","start","notes",
/// "location","attendees":[...]}]. Never prompts: returns [] unless Calendar
/// access was already granted (e.g. the first time the user added an event).
@_cdecl("ambient_upcoming_events")
public func ambient_upcoming_events(_ minutes: Int32) -> UnsafeMutablePointer<CChar>? {
    let status = EKEventStore.authorizationStatus(for: .event)
    var allowed = status == .authorized
    if #available(macOS 14.0, *) { allowed = allowed || status == .fullAccess }
    guard allowed else { return strdup("[]") }
    let now = Date()
    let predicate = eventStore.predicateForEvents(
        withStart: now, end: now.addingTimeInterval(TimeInterval(minutes) * 60), calendars: nil)
    let iso = ISO8601DateFormatter()
    let events: [[String: Any]] = eventStore.events(matching: predicate)
        .filter { !$0.isAllDay && $0.startDate > now }
        .prefix(3)
        .map { e in
            [
                "id": e.eventIdentifier ?? "",
                "title": e.title ?? "",
                "start": iso.string(from: e.startDate),
                "notes": String((e.notes ?? "").prefix(2000)),
                "location": e.location ?? "",
                "attendees": (e.attendees ?? []).compactMap { $0.name },
            ]
        }
    guard let data = try? JSONSerialization.data(withJSONObject: events),
          let s = String(data: data, encoding: .utf8) else { return strdup("[]") }
    return strdup(s)
}
