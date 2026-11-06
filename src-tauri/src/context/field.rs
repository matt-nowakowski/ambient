//! The focused text field, for smart writing: whether text is selected (a
//! cheap signal for "make this more formal"), the selection itself when the
//! user asks for a rewrite, and, for "Use my words", the field's text and
//! caret so exactly the inserted text can be selected and replaced.
//!
//! Offsets here are in characters (Unicode scalar values) on every
//! platform; each platform converts from its own units (macOS: UTF-16,
//! Windows: UI Automation text units, Linux: AT-SPI characters). Nothing
//! read here is stored or sent: the caller compares it and forgets it.
//! Password fields, never-watch apps and private places are never read.

/// What the platform reports about the focused field.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FocusedField {
    /// The field's whole text, when asked for and readable.
    pub value: Option<String>,
    /// The selected text, when asked for.
    pub selection: Option<String>,
    /// Start of the selection (the caret when nothing is selected), in
    /// characters of `value`. None when the position couldn't be read or
    /// converted.
    pub caret: Option<usize>,
    /// Characters selected (0 = just a caret).
    pub sel_len: usize,
}

impl FocusedField {
    pub fn has_selection(&self) -> bool {
        self.sel_len > 0
    }
}

/// UTF-16 offset → character offset in `s` (None if it falls inside a
/// character or past the end).
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
pub fn utf16_to_chars(s: &str, utf16: usize) -> Option<usize> {
    let mut units = 0usize;
    for (i, c) in s.chars().enumerate() {
        if units == utf16 {
            return Some(i);
        }
        if units > utf16 {
            return None;
        }
        units += c.len_utf16();
    }
    (units == utf16).then(|| s.chars().count())
}

/// Character offset → UTF-16 offset in `s` (None past the end).
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
pub fn chars_to_utf16(s: &str, chars: usize) -> Option<usize> {
    let mut units = 0usize;
    let mut n = 0usize;
    for c in s.chars() {
        if n == chars {
            return Some(units);
        }
        units += c.len_utf16();
        n += 1;
    }
    (n == chars).then_some(units)
}

/// The focused field of the app in front, or None when it can't be read, is
/// a password field, or the app is private or on the never-watch list.
/// `read_text` adds the field's text and selection; without it only the
/// selection's length and position are read (no text at all).
pub fn focused_field(read_text: bool, never_watch: &[String]) -> Option<FocusedField> {
    let app = super::frontmost_app()?;
    if super::sensitive::sensitive_app(&app.name, &app.bundle_id).is_some()
        || super::is_never_watch(&app.bundle_id, never_watch)
        || app.bundle_id == env!("BRAND_IDENTIFIER")
        || !super::accessibility_trusted()
    {
        return None;
    }
    if crate::testing::active() {
        return crate::testing::focused_field(read_text);
    }
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        let field = super::platform::focused_field(app.pid, read_text)?;
        // Never hand out text that looks like a recovery phrase or key.
        let secret = [&field.value, &field.selection].iter().any(|t| {
            t.as_deref()
                .is_some_and(|t| super::sensitive::detect(t).is_some())
        });
        if secret {
            return None;
        }
        Some(field)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = read_text;
        None
    }
}

/// The few characters right before the caret (or the selection) of the
/// focused field, for joining a dictation to what's already typed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CaretContext {
    /// Up to `max_chars` characters; empty at the start of the field.
    pub before: String,
    /// The text is set in a fixed-width font (a code editor or terminal),
    /// when the platform says which font.
    pub monospace: bool,
}

/// What's right before the caret in the app in front, or None when it can't
/// be read (no field, no position, a password field, a private or
/// never-watch app). Ambient's own windows are read too (the onboarding's
/// practice note). Only used on this computer, then forgotten.
pub fn caret_context(max_chars: usize, never_watch: &[String]) -> Option<CaretContext> {
    let app = super::frontmost_app()?;
    if super::sensitive::sensitive_app(&app.name, &app.bundle_id).is_some()
        || super::is_never_watch(&app.bundle_id, never_watch)
        || !super::accessibility_trusted()
    {
        return None;
    }
    if crate::testing::active() {
        return crate::testing::caret_context(max_chars);
    }
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        let ctx = super::platform::text_before_caret(app.pid, max_chars)?;
        if super::sensitive::detect(&ctx.before).is_some() {
            return None;
        }
        Some(ctx)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = max_chars;
        None
    }
}

/// The last `n` characters of `s`.
pub fn last_chars(s: &str, n: usize) -> String {
    let count = s.chars().count();
    s.chars().skip(count.saturating_sub(n)).collect()
}

/// Select `len` characters from `start` in the focused field of the app in
/// front. True when the app took the selection (the caller verifies by
/// reading it back).
pub fn select_chars(start: usize, len: usize) -> bool {
    let Some(app) = super::frontmost_app() else {
        return false;
    };
    if app.bundle_id == env!("BRAND_IDENTIFIER") || crate::testing::active() {
        return false;
    }
    #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
    {
        super::platform::select_chars(app.pid, start, len)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = (start, len);
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_between_utf16_and_characters() {
        let s = "a😀b";
        assert_eq!(utf16_to_chars(s, 0), Some(0));
        assert_eq!(utf16_to_chars(s, 1), Some(1));
        // Inside the emoji's surrogate pair.
        assert_eq!(utf16_to_chars(s, 2), None);
        assert_eq!(utf16_to_chars(s, 3), Some(2));
        assert_eq!(utf16_to_chars(s, 4), Some(3));
        assert_eq!(utf16_to_chars(s, 5), None);
        assert_eq!(chars_to_utf16(s, 2), Some(3));
        assert_eq!(chars_to_utf16(s, 3), Some(4));
        assert_eq!(chars_to_utf16(s, 4), None);
        assert_eq!(utf16_to_chars("", 0), Some(0));
    }
}
