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
];

/// Password managers, by app name. (Their bundle ids are also on the
/// never-watch list; a match here says so out loud instead of skipping
/// silently.)
pub const PASSWORD_MANAGER_APP_NAMES: &[&str] = &[
    "1Password",
    "1Password 7",
    "Bitwarden",
    "LastPass",
    "Dashlane",
    "KeePassXC",
    "KeePassium",
    "Enpass",
    "Keeper Password Manager",
    "NordPass",
    "Proton Pass",
    "Passwords",
    "Keychain Access",
];

pub const PASSWORD_MANAGER_BUNDLE_IDS: &[&str] = &[
    "com.1password.1password",
    "com.agilebits.onepassword7",
    "com.bitwarden.desktop",
    "com.lastpass.LastPass",
    "com.dashlane.dashlanephonefinal",
    "com.apple.keychainaccess",
    "com.apple.Passwords",
    "org.keepassxc.keepassxc",
];

/// Wallet extension popups and wallet sites, matched on a window or frame
/// title, or a URL.
pub const WALLET_MARKERS: &[&str] = &[
    "MetaMask",
    "Phantom Wallet",
    "Rabby Wallet",
    "Coinbase Wallet",
    "Ledger Live",
    "Trezor Suite",
    "Keplr",
    "Trust Wallet",
    "OKX Wallet",
    "Solflare",
    "Backpack Wallet",
    "app.safe.global",
    "portfolio.metamask.io",
    "wallet.coinbase.com",
];

/// Chrome Web Store ids of wallet extensions. Their popups, side panels and
/// full-page views load from `chrome-extension://<id>/…` (Chrome, Brave,
/// Arc, Edge). Firefox gives each install a random id, so there only titles
/// match.
const WALLET_EXTENSION_IDS: &[&str] = &[
    "nkbihfbeogaeaoehlefnkodbefgpgknn", // MetaMask
    "ejbalbakoplchlghecdalmeeeajnimhm", // MetaMask (Edge)
    "bfnaelmomeimhlpmgjnjophhpkkoljpa", // Phantom
    "acmacodkjbdgmoleebolmdjonilkdbch", // Rabby
    "hnfanknocfeofbddgcijnmhnfnkdnaad", // Coinbase Wallet
    "egjidjbpglichdcondbcbdnbeeppgdph", // Trust Wallet
    "mcohilncbfahbmgdjkbpemcciiolgcge", // OKX Wallet
    "dmkamcknogkgcdfhhbddcghachkejeap", // Keplr
    "bhhhlbepdkbapadjdnnojkbgioiodbic", // Solflare
    "aflkmfhebedbjioipglgcbcmnbpgliof", // Backpack
];

/// Password manager extensions (same scheme as above).
const PASSWORD_EXTENSION_IDS: &[&str] = &[
    "aeblfdkhhhdcdjpifhhbdiojplfjncoa", // 1Password
    "nngceckbapebfimnlniiiahkandclblb", // Bitwarden
    "hdokiejnpimakedhajhdlcegeplioahd", // LastPass
    "fdjamakpfbbddfjaooikfcpapjohcfmg", // Dashlane
    "ghmbeldphafepmbegfdlkpapadhbakde", // Proton Pass
    "fooolghllnmhmmndgjiamiiodkpenpbb", // NordPass
    "bfogiafebfohielmmehodmfbbebbbpei", // Keeper
];

/// Browser pages that list saved passwords, and password managers' web vaults.
const PASSWORD_URL_MARKERS: &[&str] = &[
    "chrome://password-manager",
    "chrome://settings/passwords",
    "brave://password-manager",
    "edge://wallet",
    "edge://settings/passwords",
    "about:logins",
    "vault.bitwarden.com",
    "my.1password.com",
    "my.1password.eu",
    "lastpass.com/vault",
    "app.dashlane.com",
    "pass.proton.me",
];

/// Banks and brokers whose whole site is treated as private (host, or any
/// subdomain of it). Best effort: the big ones, in the markets we ship to.
const BANKING_DOMAINS: &[&str] = &[
    "chase.com",
    "bankofamerica.com",
    "wellsfargo.com",
    "citi.com",
    "usbank.com",
    "capitalone.com",
    "pnc.com",
    "ally.com",
    "schwab.com",
    "fidelity.com",
    "vanguard.com",
    "americanexpress.com",
    "discover.com",
    "paypal.com",
    "venmo.com",
    "hsbc.com",
    "hsbc.co.uk",
    "barclays.co.uk",
    "lloydsbank.com",
    "natwest.com",
    "santander.co.uk",
    "revolut.com",
    "monzo.com",
    "starlingbank.com",
    "n26.com",
    "wise.com",
    "ing.com",
    "ing.de",
    "ing.nl",
    "deutsche-bank.de",
    "commerzbank.de",
    "sparkasse.de",
    "bnpparibas.net",
    "credit-agricole.fr",
    "rbc.com",
    "td.com",
    "scotiabank.com",
    "commbank.com.au",
    "pkobp.pl",
    "ipko.pl",
    "mbank.pl",
    "santander.pl",
];

/// Titles banks put on their signed-in pages.
const BANKING_TITLE_MARKERS: &[&str] = &["Online Banking", "Internet Banking", "Online-Banking"];

/// A kind of place that's private as a whole, whatever is on screen now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SensitivePlace {
    Wallet,
    PasswordManager,
    Banking,
}

/// The app itself is private (decided from its name and bundle id alone,
/// before any of its windows is read).
pub fn sensitive_app(app_name: &str, bundle_id: &str) -> Option<SensitivePlace> {
    let named = |names: &[&str]| names.iter().any(|n| app_name.eq_ignore_ascii_case(n));
    if named(WALLET_APP_NAMES) {
        return Some(SensitivePlace::Wallet);
    }
    if named(PASSWORD_MANAGER_APP_NAMES) || PASSWORD_MANAGER_BUNDLE_IDS.contains(&bundle_id) {
        return Some(SensitivePlace::PasswordManager);
    }
    None
}

/// The host of a URL, lowercased ("https://user@www.chase.com:443/x" →
/// "www.chase.com").
fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let authority = rest.split(['/', '?', '#']).next()?;
    let host = authority.rsplit('@').next()?.split(':').next()?;
    (!host.is_empty()).then(|| host.to_ascii_lowercase())
}

fn on_domain(host: &str, domain: &str) -> bool {
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|sub| sub.ends_with('.'))
}

/// Which kind of private place a window is, from what identifies it: the
/// app, the window title, and the titles and URLs of its frames (a browser's
/// page, side panel or extension popup). Never needs the page's text.
pub fn sensitive_place(
    app_name: &str,
    bundle_id: &str,
    titles: &[&str],
    urls: &[&str],
) -> Option<SensitivePlace> {
    sensitive_place_why(app_name, bundle_id, titles, urls).map(|(place, _)| place)
}

/// Which rule matched (for logs: a fixed name, never the matched text).
pub fn sensitive_place_why(
    app_name: &str,
    bundle_id: &str,
    titles: &[&str],
    urls: &[&str],
) -> Option<(SensitivePlace, &'static str)> {
    if let Some(place) = sensitive_app(app_name, bundle_id) {
        return Some((place, "app"));
    }
    let extension = |ids: &[&str]| {
        urls.iter().any(|u| {
            let u = u.to_ascii_lowercase();
            (u.starts_with("chrome-extension://") || u.starts_with("extension://"))
                && ids.iter().any(|id| u.contains(id))
        })
    };
    if extension(WALLET_EXTENSION_IDS) {
        return Some((SensitivePlace::Wallet, "wallet_extension_id"));
    }
    if WALLET_MARKERS
        .iter()
        .any(|m| urls.iter().any(|s| s.contains(m)))
    {
        return Some((SensitivePlace::Wallet, "wallet_url"));
    }
    if WALLET_MARKERS
        .iter()
        .any(|m| titles.iter().any(|s| s.contains(m)))
    {
        return Some((SensitivePlace::Wallet, "wallet_title"));
    }
    if extension(PASSWORD_EXTENSION_IDS) {
        return Some((SensitivePlace::PasswordManager, "password_extension_id"));
    }
    if urls.iter().any(|u| {
        let u = u.to_ascii_lowercase();
        PASSWORD_URL_MARKERS.iter().any(|m| u.contains(m))
    }) {
        return Some((SensitivePlace::PasswordManager, "password_url"));
    }
    let bank_host = urls.iter().filter_map(|u| host_of(u)).any(|host| {
        BANKING_DOMAINS
            .iter()
            .any(|domain| on_domain(&host, domain))
    });
    if bank_host {
        return Some((SensitivePlace::Banking, "bank_host"));
    }
    if BANKING_TITLE_MARKERS
        .iter()
        .any(|m| titles.iter().any(|t| t.contains(m)))
    {
        return Some((SensitivePlace::Banking, "bank_title"));
    }
    None
}

/// The extension ids in a set of frame URLs (`chrome-extension://<id>/…`),
/// for logs: they say which extension a side panel or popup belongs to.
pub fn extension_ids<'a>(urls: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut ids: Vec<String> = urls
        .into_iter()
        .filter_map(|u| {
            let rest = u
                .strip_prefix("chrome-extension://")
                .or_else(|| u.strip_prefix("extension://"))?;
            let id = rest.split('/').next()?;
            (!id.is_empty()).then(|| id.to_ascii_lowercase())
        })
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

/// Host names only, for logs (never paths or queries).
pub fn hosts<'a>(urls: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = urls.into_iter().filter_map(host_of).collect();
    out.sort();
    out.dedup();
    out
}

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
    }

    use SensitivePlace::*;

    #[test]
    fn spots_wallet_extensions_in_a_browser() {
        // The tester's case: MetaMask's side panel in Chrome. The window keeps
        // the page's title; only the side panel's frame gives it away.
        let side_panel = "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/sidepanel.html#/home";
        assert_eq!(
            sensitive_place(
                "Google Chrome",
                "com.google.Chrome",
                &["Hacker News"],
                &["https://news.ycombinator.com/", side_panel],
            ),
            Some(Wallet)
        );
        // Popup windows and frames titled after the wallet.
        assert_eq!(
            sensitive_place("Google Chrome", "com.google.Chrome", &["MetaMask"], &[]),
            Some(Wallet)
        );
        assert_eq!(
            sensitive_place(
                "Brave Browser",
                "com.brave.Browser",
                &["New Tab", "Phantom Wallet"],
                &[]
            ),
            Some(Wallet)
        );
        assert_eq!(
            sensitive_place(
                "Arc",
                "company.thebrowser.Browser",
                &[""],
                &["chrome-extension://acmacodkjbdgmoleebolmdjonilkdbch/popup.html"],
            ),
            Some(Wallet)
        );
        assert_eq!(sensitive_place("MetaMask", "", &[], &[]), Some(Wallet));
    }

    #[test]
    fn spots_password_managers_and_banks() {
        assert_eq!(
            sensitive_place("1Password", "com.1password.1password", &[], &[]),
            Some(PasswordManager)
        );
        assert_eq!(
            sensitive_app("Bitwarden", "com.bitwarden.desktop"),
            Some(PasswordManager)
        );
        assert_eq!(
            sensitive_place(
                "Google Chrome",
                "com.google.Chrome",
                &["Google Password Manager"],
                &["chrome://password-manager/passwords"],
            ),
            Some(PasswordManager)
        );
        assert_eq!(
            sensitive_place(
                "Google Chrome",
                "com.google.Chrome",
                &[""],
                &["chrome-extension://nngceckbapebfimnlniiiahkandclblb/popup/index.html"],
            ),
            Some(PasswordManager)
        );
        assert_eq!(
            sensitive_place(
                "Safari",
                "com.apple.Safari",
                &["Accounts"],
                &["https://secure.chase.com/web/auth/dashboard"],
            ),
            Some(Banking)
        );
        assert_eq!(
            sensitive_place(
                "Safari",
                "com.apple.Safari",
                &["Welcome to Online Banking"],
                &[]
            ),
            Some(Banking)
        );
    }

    #[test]
    fn leaves_ordinary_windows() {
        for (app, bundle, title, url) in [
            (
                "Slack",
                "com.tinyspeck.slackmacgap",
                "general",
                "https://app.slack.com/",
            ),
            (
                "Google Chrome",
                "com.google.Chrome",
                "Phantom Thread (2017) - IMDb",
                "https://www.imdb.com/title/tt5776858/",
            ),
            // Lookalike hosts aren't the bank.
            (
                "Safari",
                "com.apple.Safari",
                "Chase the dream",
                "https://notchase.com/blog",
            ),
            (
                "Safari",
                "com.apple.Safari",
                "Recipes",
                "https://chase.com.example.org/",
            ),
            // Other extensions are fine.
            (
                "Google Chrome",
                "com.google.Chrome",
                "uBlock",
                "chrome-extension://cjpalhdlnbpafiamejdnhcphjbkeiagm/dashboard.html",
            ),
        ] {
            assert_eq!(
                sensitive_place(app, bundle, &[title], &[url]),
                None,
                "{title} {url}"
            );
        }
    }

    #[test]
    fn spots_a_wallet_from_the_browser_ui_alone() {
        // Chrome with no page content exposed: only the side panel's header
        // ("MetaMask") among the browser UI labels.
        assert_eq!(
            sensitive_place_why(
                "Google Chrome",
                "com.google.Chrome",
                &["Hacker News", "MetaMask", "Close"],
                &[],
            ),
            Some((Wallet, "wallet_title"))
        );
        assert_eq!(
            extension_ids([
                "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/sidepanel.html#/home",
                "https://news.ycombinator.com/item?id=1",
                "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/popup.html",
            ]),
            vec!["nkbihfbeogaeaoehlefnkodbefgpgknn".to_string()]
        );
        assert_eq!(
            hosts(["https://mail.google.com/mail/u/0/#inbox/x", "about:blank"]),
            vec!["mail.google.com".to_string()]
        );
    }

    #[test]
    fn reads_hosts() {
        assert_eq!(
            host_of("https://user@WWW.Chase.com:443/x?y").as_deref(),
            Some("www.chase.com")
        );
        assert_eq!(host_of("about:logins"), None);
        assert!(on_domain("secure.chase.com", "chase.com"));
        assert!(!on_domain("notchase.com", "chase.com"));
    }
}
