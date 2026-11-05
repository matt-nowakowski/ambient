//! A model's deliberation must never become the text we type, show or parse.
//!
//! Some models think out loud even when asked not to: a `<think>` block
//! before the answer, a `<reasoning>` or `<scratchpad>` section, or (when the
//! chat template opened the block for them) just a closing `</think>` with
//! the reasoning before it. Every model reply goes through [`strip`] before it
//! is used, whichever engine produced it.

/// Tag names that hold reasoning rather than the answer. Compared without
/// regard to case.
const TAGS: &[&str] = &[
    "think",
    "thinking",
    "thought",
    "thoughts",
    "reasoning",
    "reflection",
    "scratchpad",
];

/// Where an opening tag for one of [`TAGS`] starts and ends in `lower`
/// (from `from`), and its name: `<think>` or `<think foo="…">`.
fn next_open(lower: &str, from: usize) -> Option<(usize, usize, &'static str)> {
    let mut at = from;
    while let Some(i) = lower[at..].find('<').map(|i| i + at) {
        let rest = &lower[i + 1..];
        for tag in TAGS {
            if let Some(after) = rest.strip_prefix(tag) {
                match after.chars().next() {
                    Some('>') => return Some((i, i + 1 + tag.len() + 1, tag)),
                    Some(c) if c.is_whitespace() => {
                        if let Some(end) = after.find('>') {
                            return Some((i, i + 1 + tag.len() + end + 1, tag));
                        }
                    }
                    _ => {}
                }
            }
        }
        at = i + 1;
    }
    None
}

/// The end of the last closing tag for any of [`TAGS`] in `lower`.
fn last_close(lower: &str) -> Option<usize> {
    TAGS.iter()
        .filter_map(|tag| {
            let close = format!("</{tag}>");
            lower.rfind(&close).map(|i| i + close.len())
        })
        .max()
}

/// The reply without any reasoning blocks, trimmed. An opening tag that is
/// never closed hides everything after it (the model ran out of room while
/// still thinking); a closing tag with no opening hides everything before it
/// (the template opened the block). Can return an empty string: callers
/// treat that like no reply and fall back.
pub fn strip(reply: &str) -> String {
    // ASCII lowercasing keeps byte offsets, so positions found in `lower`
    // index `reply` too.
    let lower = reply.to_ascii_lowercase();
    let mut out = String::with_capacity(reply.len());
    let mut kept_lower = String::with_capacity(reply.len());
    let mut at = 0;
    while let Some((start, open_end, tag)) = next_open(&lower, at) {
        out.push_str(&reply[at..start]);
        kept_lower.push_str(&lower[at..start]);
        let close = format!("</{tag}>");
        match lower[open_end..].find(&close) {
            Some(i) => at = open_end + i + close.len(),
            None => {
                at = reply.len();
                break;
            }
        }
    }
    out.push_str(&reply[at..]);
    kept_lower.push_str(&lower[at..]);
    let out = match last_close(&kept_lower) {
        Some(end) => out[end..].to_string(),
        None => out,
    };
    out.trim().to_string()
}

/// [`strip`], or None when nothing but reasoning (or nothing at all) came
/// back.
pub fn answer_of(reply: &str) -> Option<String> {
    Some(strip(reply)).filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_reasoning_blocks_in_their_spellings() {
        assert_eq!(strip("<think>\n\n</think>\n\nwrite"), "write");
        assert_eq!(
            strip("<THINK>the user wants a reply</THINK>Sounds good."),
            "Sounds good."
        );
        assert_eq!(
            strip("<thinking>hm</thinking>\nSee you at 5."),
            "See you at 5."
        );
        assert_eq!(
            strip("<reasoning type=\"internal\">a</reasoning>Done."),
            "Done."
        );
        assert_eq!(strip("<scratchpad>x</scratchpad> Hi Sam"), "Hi Sam");
        assert_eq!(strip("<reflection>y</reflection>Ok"), "Ok");
        assert_eq!(
            strip("Before. <thought>z</thought> After."),
            "Before.  After."
        );
        // Several blocks.
        assert_eq!(strip("<think>a</think>One <think>b</think>two"), "One two");
    }

    #[test]
    fn an_unclosed_block_hides_the_rest() {
        assert_eq!(strip("<think> the user is asking about"), "");
        assert_eq!(strip("Thanks! <think>should I add"), "Thanks!");
        assert_eq!(answer_of("<think>still going"), None);
    }

    #[test]
    fn a_lone_closing_tag_hides_what_came_before() {
        assert_eq!(
            strip("The user said hi, so reply.</think>\n\nHi there!"),
            "Hi there!"
        );
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        for s in [
            "Hello.",
            "I think we should ship <b>today</b>.",
            "a < b and c > d",
            "Use the <thinker> component",
            "Zażółć gęślą jaźń",
            "{\"intent\":\"write\",\"text\":\"Hi\"}",
        ] {
            assert_eq!(strip(s), s.trim(), "{s}");
        }
        assert_eq!(strip("  padded  "), "padded");
        assert_eq!(answer_of("   "), None);
    }

    #[test]
    fn keeps_json_after_reasoning_parseable() {
        let reply = "<think>{\"intent\":\"answer\"}</think>{\"intent\":\"write\",\"text\":\"Hi\"}";
        assert_eq!(strip(reply), "{\"intent\":\"write\",\"text\":\"Hi\"}");
    }
}
