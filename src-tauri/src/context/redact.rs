//! On-device redaction, applied to every piece of screen text before it may
//! leave the Mac (and before it's saved to screen memory). Deliberately
//! conservative: it's better to blank a harmless long token than to send a
//! real secret.

use once_cell::sync::Lazy;
use regex::Regex;

pub const MASK: &str = "[redacted]";

static PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        // Private key blocks.
        r"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
        // Well-known token shapes: OpenAI/Anthropic-style, GitHub, Slack, AWS, Stripe, Google, JWTs.
        r"\b(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_\-]{16,}\b",
        r"\bgh[pousr]_[A-Za-z0-9]{30,}\b",
        r"\bxox[abprs]-[A-Za-z0-9\-]{10,}\b",
        r"\bAKIA[0-9A-Z]{16}\b",
        r"\bAIza[0-9A-Za-z_\-]{35}\b",
        r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b",
        // "password: hunter2", "api_key = …", "secret=…".
        r"(?i)\b(?:password|passwd|pwd|passcode|api[_ -]?key|secret|token|pin)\b\s*[:=]\s*\S+",
        // One-time codes in context ("your code is 482913").
        r"(?i)\b(?:code|otp|verification|2fa)\b[^\n\d]{0,20}\b\d{4,8}\b",
        // IBANs.
        r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b",
        // Long opaque tokens (hex or base64-ish, 40+ chars).
        r"\b[A-Fa-f0-9]{40,}\b",
        r"\b[A-Za-z0-9+/_\-]{48,}={0,2}",
    ]
    .iter()
    .map(|p| Regex::new(p).expect("valid redaction pattern"))
    .collect()
});

/// 13–19 digit runs (spaces or dashes allowed) that pass the Luhn check.
static CARD: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b(?:\d[ -]?){12,18}\d\b").expect("card pattern"));

fn luhn(digits: &str) -> bool {
    let nums: Vec<u32> = digits.chars().filter_map(|c| c.to_digit(10)).collect();
    if !(13..=19).contains(&nums.len()) {
        return false;
    }
    let sum: u32 = nums
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| {
            if i % 2 == 1 {
                let d2 = d * 2;
                if d2 > 9 {
                    d2 - 9
                } else {
                    d2
                }
            } else {
                d
            }
        })
        .sum();
    sum % 10 == 0
}

/// Returns the text with secrets replaced by [`MASK`], and how many were found.
pub fn redact(text: &str) -> (String, usize) {
    let mut count = 0;
    let mut out = CARD
        .replace_all(text, |c: &regex::Captures| {
            if luhn(&c[0]) {
                count += 1;
                MASK.to_string()
            } else {
                c[0].to_string()
            }
        })
        .into_owned();
    for re in PATTERNS.iter() {
        let n = re.find_iter(&out).count();
        if n > 0 {
            count += n;
            out = re.replace_all(&out, MASK).into_owned();
        }
    }
    (out, count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_secrets_and_keeps_prose() {
        let (out, n) = redact(
            "Card 4242 4242 4242 4242, key sk-proj-abcdefghijklmnopqrstuvwx, \
             password: hunter2, your code is 482913. Lunch on Friday at 1pm?",
        );
        assert_eq!(n, 4, "{out}");
        assert!(!out.contains("4242 4242"));
        assert!(!out.contains("hunter2"));
        assert!(!out.contains("482913"));
        assert!(out.contains("Lunch on Friday at 1pm?"));
    }

    #[test]
    fn leaves_ordinary_numbers() {
        let (out, n) = redact("Revenue was 1234567 in 2025, call 555 0100.");
        assert_eq!(n, 0);
        assert_eq!(out, "Revenue was 1234567 in 2025, call 555 0100.");
    }
}
