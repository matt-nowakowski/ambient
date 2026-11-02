//! Sensitive moments: a wallet's recovery phrase or a private key on screen.
//!
//! Redaction blanks a secret inside otherwise useful text; this is stronger.
//! When a window shows one of these, the whole window is dropped (not stored,
//! not used for an answer or a suggestion, never sent) and the agent shows
//! that it stepped back.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

/// The BIP-39 English list that 12/24-word recovery phrases are drawn from.
static BIP39: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    include_str!("data/bip39_english.txt")
        .lines()
        .map(str::trim)
        .filter(|w| !w.is_empty())
        .collect()
});

static KEYS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        // PEM / OpenSSH private keys.
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        // Extended private keys (BIP-32): xprv/yprv/zprv/tprv…
        r"\b[xyzt]prv[1-9A-HJ-NP-Za-km-z]{100,}\b",
        // Bitcoin WIF private keys.
        r"\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b",
        // Raw 32-byte keys as hex, as wallets export them (no 0x: an 0x-prefixed
        // 64-hex string is usually a transaction hash on an explorer).
        r"(?:^|[^0-9A-Za-z])[0-9a-fA-F]{64}(?:$|[^0-9A-Za-z])",
        // Solana-style base58 secret keys (64 bytes).
        r"\b[1-9A-HJ-NP-Za-km-z]{86,88}\b",
    ]
    .iter()
    .map(|p| Regex::new(p).expect("key pattern"))
    .collect()
});

static PHRASE_WORDS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(?:secret recovery phrase|recovery phrase|seed phrase|mnemonic|backup phrase|private key)\b").expect("hint")
});

/// Wallets: never read, by app name (bundle ids vary across versions).
pub const WALLET_APP_NAMES: &[&str] = &[
    "Ledger Live",
    "Trezor Suite",
    "Exodus",
    "Electrum",
    "Sparrow",
    "Wasabi",
    "MetaMask",
    "Phantom",
    "Rabby",
    "Coinbase Wallet",
    "Trust Wallet",
    "Rainbow",
    "Keplr",
    "Atomic Wallet",
    "Bitwarden",
    "KeePassXC",
    "Enpass",
];

/// Wallet extension popups and wallet sites, matched on title or URL.
pub const WALLET_MARKERS: &[&str] = &[
    "MetaMask",
    "Phantom Wallet",
    "Rabby Wallet",
    "Coinbase Wallet",
    "Ledger Live",
    "Trezor Suite",
    "Keplr",
    "app.safe.global",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sensitive {
    RecoveryPhrase,
    PrivateKey,
}

/// Longest run of consecutive BIP-39 words, ignoring list numbering ("1.", "2)").
fn longest_bip39_run(text: &str) -> usize {
    let (mut best, mut run) = (0, 0);
    for raw in text.split(|c: char| c.is_whitespace() || c == ',' || c == '·' || c == '|') {
        let token = raw.trim_matches(|c: char| !c.is_alphanumeric());
        if token.is_empty() || token.chars().all(|c| c.is_ascii_digit()) {
            continue; // numbering or separators don't break a phrase
        }
        if BIP39.contains(token.to_lowercase().as_str())
            && token.chars().all(|c| c.is_ascii_alphabetic())
        {
            run += 1;
            best = best.max(run);
        } else {
            run = 0;
        }
    }
    best
}

/// Whether this text shows a recovery phrase or a private key.
pub fn detect(text: &str) -> Option<Sensitive> {
    // Prose almost always contains words outside the list ("the", "of", "is"),
    // so 12 in a row is a phrase. With a phrase hint nearby, 8 is enough.
    let run = longest_bip39_run(text);
    if run >= 12 || (run >= 8 && PHRASE_WORDS.is_match(text)) {
        return Some(Sensitive::RecoveryPhrase);
    }
    if KEYS.iter().any(|re| re.is_match(text)) {
        return Some(Sensitive::PrivateKey);
    }
    None
}

pub fn is_wallet(app_name: &str, title: &str, url: &str) -> bool {
    WALLET_APP_NAMES
        .iter()
        .any(|n| app_name.eq_ignore_ascii_case(n))
        || WALLET_MARKERS
            .iter()
            .any(|m| title.contains(m) || url.contains(m))
}

/// For transcripts (meetings): blank a spoken phrase or key instead of
/// dropping the whole meeting.
pub fn scrub(text: &str) -> String {
    if detect(text).is_some() {
        "[sensitive information not kept]".to_string()
    } else {
        text.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spots_phrases_and_keys() {
        let phrase = "1. abandon 2. ability 3. able 4. about 5. above 6. absent 7. absorb 8. abstract 9. absurd 10. abuse 11. access 12. accident";
        assert_eq!(detect(phrase), Some(Sensitive::RecoveryPhrase));
        assert_eq!(
            detect("Your Secret Recovery Phrase: wagon trick ocean dial cluster bronze maple goat"),
            Some(Sensitive::RecoveryPhrase)
        );
        assert_eq!(
            detect("Private key: 4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318"),
            Some(Sensitive::PrivateKey)
        );
        assert_eq!(
            detect("-----BEGIN OPENSSH PRIVATE KEY-----\nabc"),
            Some(Sensitive::PrivateKey)
        );
    }

    #[test]
    fn leaves_ordinary_text() {
        assert_eq!(detect("I think we should move the launch to Friday because the payments work isn't ready yet."), None);
        assert_eq!(
            detect(
                "Tx 0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060 confirmed"
            ),
            None
        );
        assert!(is_wallet("MetaMask", "", ""));
        assert!(!is_wallet("Slack", "general", "app.slack.com"));
    }
}
