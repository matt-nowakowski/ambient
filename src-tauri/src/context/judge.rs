//! Is this page private? A scored judgement over what the window already
//! shows: the shape of its URL, its title, the browser's labels, and the
//! text on it. Banking, payment, medical, password and government-ID pages
//! are recognised by what they look like, not by a list of their domains.
//!
//! Each kind of private page collects evidence in three bands, and only the
//! sum decides:
//!
//! - *place*: URL paths and hosts shaped like the kind (`/checkout`, a host
//!   with "bank" in it, a government TLD), short title segments ("Online
//!   Banking", "Kontoübersicht", "Test Results"), and the known names of
//!   banks (a hint, never needed). Capped below the threshold, so where a
//!   page is never decides on its own;
//! - *content*: the page's words and fields (balance, transactions,
//!   transfer; card number, CVC, expiry; lab results, medications; passport
//!   number, PESEL), with words in running prose counting half, so an article
//!   *about* a bank isn't one;
//! - *structure*: things that carry their own proof (an IBAN whose checksum
//!   holds, a masked account number, a Luhn-valid card number, a PESEL or an
//!   SSN next to its label, a balance printed beside an amount).
//!
//! Login paths, one-time codes and a focused password field say "something
//! private", not what: they add to a kind only once that kind has evidence
//! of its own. Wallets and password managers known by their app, extension
//! or vault URL stay decisive (`sensitive::sensitive_place_why`).
//!
//! Nothing here keeps or sends text; logs get the names of the signals that
//! fired, never what matched.

use once_cell::sync::Lazy;
use regex::Regex;

use super::sensitive::{self, SensitivePlace};

/// The score at which a kind of page is private.
pub const THRESHOLD: u32 = 10;
/// Most that where a page is (URL, host, title) adds to one kind.
const PLACE_CAP: u32 = 6;
/// Most that words alone add to one kind.
const VOCAB_CAP: u32 = 8;
/// Most that the kind-less signals (login, codes, password field) add.
const GENERIC_CAP: u32 = 6;
/// Evidence a kind needs of its own before the kind-less signals count.
const GENERIC_NEEDS: u32 = 4;
/// A label is a short line of its own (a form field), not words in prose.
const LABEL_MAX_CHARS: usize = 40;

/// What the judgement can see of a window.
#[derive(Debug, Default, Clone, Copy)]
pub struct Page<'a> {
    pub app_name: &'a str,
    pub bundle_id: &'a str,
    /// The window title, frame titles and browser UI labels.
    pub titles: &'a [&'a str],
    /// The page URL and frame URLs.
    pub urls: &'a [&'a str],
    /// The window's text; empty when only metadata was read.
    pub text: &'a str,
    /// A password field has focus.
    pub secure_focus: bool,
}

/// The verdict: which kind of private page, if any, the best score, and the
/// names of the signals that fired (for logs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Judgement {
    pub place: Option<SensitivePlace>,
    pub score: u32,
    pub signals: Vec<&'static str>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Finance,
    Payment,
    Health,
    Identity,
    Passwords,
}

const KINDS: [Kind; 5] = [
    Kind::Finance,
    Kind::Payment,
    Kind::Health,
    Kind::Identity,
    Kind::Passwords,
];

impl Kind {
    fn place(self) -> SensitivePlace {
        match self {
            Kind::Finance => SensitivePlace::Banking,
            Kind::Payment => SensitivePlace::Payment,
            Kind::Health => SensitivePlace::Health,
            Kind::Identity => SensitivePlace::Identity,
            Kind::Passwords => SensitivePlace::PasswordManager,
        }
    }
}

#[derive(Default, Clone, Copy)]
struct Score {
    place: u32,
    vocab: u32,
    content: u32,
}

impl Score {
    fn own(&self) -> u32 {
        self.place.min(PLACE_CAP) + self.vocab.min(VOCAB_CAP) + self.content
    }
}

#[derive(Default)]
struct Tally {
    scores: [Score; 5],
    generic: u32,
    signals: Vec<&'static str>,
}

impl Tally {
    fn at(&mut self, kind: Kind) -> &mut Score {
        let i = KINDS.iter().position(|k| *k == kind).unwrap_or(0);
        &mut self.scores[i]
    }
    fn place(&mut self, kind: Kind, w: u32, name: &'static str) {
        self.at(kind).place += w;
        self.signals.push(name);
    }
    fn vocab(&mut self, kind: Kind, w: u32, name: &'static str) {
        self.at(kind).vocab += w;
        self.signals.push(name);
    }
    fn content(&mut self, kind: Kind, w: u32, name: &'static str) {
        self.at(kind).content += w;
        self.signals.push(name);
    }
    fn generic(&mut self, w: u32, name: &'static str) {
        self.generic += w;
        self.signals.push(name);
    }
    fn verdict(mut self) -> Judgement {
        let generic = self.generic.min(GENERIC_CAP);
        let mut best: Option<(Kind, u32)> = None;
        for (kind, s) in KINDS.iter().zip(self.scores.iter()) {
            let own = s.own();
            let total = if own >= GENERIC_NEEDS {
                own + generic
            } else {
                own
            };
            if best.is_none_or(|(_, b)| total > b) {
                best = Some((*kind, total));
            }
        }
        let (kind, score) = best.unwrap_or((Kind::Finance, 0));
        self.signals.sort_unstable();
        self.signals.dedup();
        Judgement {
            place: (score >= THRESHOLD).then(|| kind.place()),
            score,
            signals: self.signals,
        }
    }
}

fn re(p: &str) -> Regex {
    Regex::new(p).expect("judge pattern")
}

// ── Where the page is ────────────────────────────────────────────────────

/// Path segments (lowercased, split on / - _ . ?) that say what a page is.
const PATH_WORDS: &[(Kind, &[&str])] = &[
    (
        Kind::Finance,
        &[
            "banking",
            "onlinebanking",
            "netbanking",
            "ebanking",
            "accounts",
            "transfers",
            "statements",
            "bankowosc",
            "rachunki",
            "konten",
            "umsaetze",
            "finanzstatus",
            "cuentas",
            "posicion",
            "movimientos",
        ],
    ),
    (
        Kind::Payment,
        &[
            "checkout", "payment", "payments", "pay", "billing", "kasse", "zahlung", "platnosc",
            "pago", "pagar",
        ],
    ),
    (
        Kind::Health,
        &[
            "patient",
            "patients",
            "mychart",
            "medical",
            "records",
            "lab",
            "results",
            "prescriptions",
            "pacjent",
            "ikp",
            "patientenakte",
            "historia",
            "clinica",
        ],
    ),
    (
        Kind::Identity,
        &[
            "passport",
            "visa",
            "ssn",
            "taxes",
            "tax",
            "identity",
            "epuap",
            "mobywatel",
            "elster",
            "reisepass",
            "personalausweis",
            "dni",
            "pasaporte",
        ],
    ),
    (
        Kind::Passwords,
        &["vault", "passwords", "logins", "password"],
    ),
];

/// Path segments of signing in.
const AUTH_WORDS: &[&str] = &[
    "login", "signin", "logon", "auth", "2fa", "mfa", "otp", "verify", "sso",
];

/// Host labels that say what a site is ("e-bank.example.pl").
static HOST_WORDS: Lazy<Vec<(Kind, Regex)>> = Lazy::new(|| {
    vec![
        (
            Kind::Finance,
            re(r"(?:^|[.\-])(?:[a-z]*bank(?:ing)?|banco|banca|ebank)(?:[.\-]|$)"),
        ),
        (
            Kind::Health,
            re(r"(?:^|[.\-])(?:mychart|patient[a-z]*|pacjent|patienten)(?:[.\-]|$)"),
        ),
        (
            Kind::Identity,
            re(r"(?:\.gov(?:\.[a-z]{2})?|\.gob\.[a-z]{2}|\.gouv\.fr|\.bund\.de|\.gov\.pl)$"),
        ),
    ]
});

fn path_words(url: &str) -> Vec<String> {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let path = rest.split_once('/').map_or("", |(_, p)| p);
    let path = path.split('#').next().unwrap_or("");
    path.to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_string)
        .collect()
}

fn judge_urls(urls: &[&str], t: &mut Tally) {
    for url in urls {
        let lower = url.to_ascii_lowercase();
        if !(lower.starts_with("https://") || lower.starts_with("http://")) {
            continue;
        }
        let words = path_words(url);
        for (kind, list) in PATH_WORDS {
            if words.iter().any(|w| list.contains(&w.as_str())) {
                t.place(*kind, 4, url_signal(*kind));
            }
        }
        if words.iter().any(|w| AUTH_WORDS.contains(&w.as_str())) {
            t.generic(3, "auth_path");
        }
        if let Some(host) = sensitive::host_of(url) {
            for (kind, pattern) in HOST_WORDS.iter() {
                if pattern.is_match(&host) {
                    t.place(*kind, 3, host_signal(*kind));
                }
            }
            if sensitive::known_bank_host(&host) {
                t.place(Kind::Finance, 6, "known_bank_host");
            }
        }
    }
}

fn url_signal(kind: Kind) -> &'static str {
    match kind {
        Kind::Finance => "finance_path",
        Kind::Payment => "payment_path",
        Kind::Health => "health_path",
        Kind::Identity => "identity_path",
        Kind::Passwords => "password_path",
    }
}

fn host_signal(kind: Kind) -> &'static str {
    match kind {
        Kind::Finance => "finance_host",
        Kind::Health => "health_host",
        _ => "government_host",
    }
}

/// Short title segments that name a kind of page.
static TITLE_WORDS: Lazy<Vec<(Kind, u32, &'static str, Regex)>> = Lazy::new(|| {
    vec![
        (
            Kind::Finance,
            5,
            "finance_title",
            re(
                r"(?i)\b(?:online[ -]?banking|internet banking|mobile banking|bankowość(?: internetowa| elektroniczna)?|onlinebanking|banca (?:online|en línea|electrónica|digital)|account(?:s)? (?:overview|summary)|my accounts|kontoübersicht|finanzübersicht|finanzstatus|mein konto|posición global|mis cuentas|moje (?:konta|finanse|rachunki))\b",
            ),
        ),
        (
            Kind::Finance,
            3,
            "accounts_title",
            re(r"(?i)^\s*(?:accounts|konten|rachunki|cuentas)\s*$"),
        ),
        (
            Kind::Payment,
            4,
            "payment_title",
            re(
                r"(?i)\b(?:checkout|secure checkout|payment|pay(?:ment)? details|kasse|zahlung|bezahlen|płatność|płatności|pago|pagar|finalizar compra)\b",
            ),
        ),
        (
            Kind::Health,
            5,
            "health_title",
            re(
                r"(?i)\b(?:mychart|patient portal|medical records?|health records?|test results|lab results|internetowe konto pacjenta|patientenportal|patientenakte|carpeta de salud|historia clínica|mi salud)\b",
            ),
        ),
        (
            Kind::Identity,
            4,
            "identity_title",
            re(
                r"(?i)\b(?:passport|visa application|tax return|social security|steuererklärung|personalausweis|reisepass|paszport|dowód osobisty|e-urząd skarbowy|pasaporte|agencia tributaria|mobywatel|epuap)\b",
            ),
        ),
        (
            Kind::Passwords,
            4,
            "password_title",
            re(
                r"(?i)\b(?:password manager|passwords|vault|keychain|hasła|menedżer haseł|passwörter|kennwörter|contraseñas)\b",
            ),
        ),
    ]
});

/// A title's segments ("Kontoübersicht – Meine Bank" → two), keeping only the
/// short ones: a page names itself in a few words, a headline runs longer.
fn title_segments(title: &str) -> Vec<String> {
    // A spaced hyphen separates; one inside a word ("Online-Banking") doesn't.
    title
        .replace(" - ", " | ")
        .split(['|', '–', '—', '·', '•', ':', '»', '›'])
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.split_whitespace().count() <= 5)
        .map(str::to_string)
        .collect()
}

fn judge_titles(titles: &[&str], t: &mut Tally) {
    for (kind, w, name, pattern) in TITLE_WORDS.iter() {
        if titles
            .iter()
            .any(|title| title_segments(title).iter().any(|s| pattern.is_match(s)))
        {
            t.place(*kind, *w, name);
        }
    }
}

// ── What the page says ───────────────────────────────────────────────────

/// Words a kind of page uses; each family counts once.
static VOCAB: Lazy<Vec<(Kind, &'static str, Regex)>> = Lazy::new(|| {
    vec![
        (
            Kind::Finance,
            "balance",
            re(
                r"(?i)\b(?:available balance|current balance|account balance|balance|saldo|kontostand|dostępne środki|verfügbarer betrag)\b",
            ),
        ),
        (
            Kind::Finance,
            "transactions",
            re(
                r"(?i)\b(?:transactions|recent activity|transaktionen|umsätze|historia (?:transakcji|operacji|rachunku)|movimientos|operaciones)\b",
            ),
        ),
        (
            Kind::Finance,
            "transfer",
            re(r"(?i)\b(?:transfer|send money|überweisung|przelew|przelewy|transferencia|bizum)\b"),
        ),
        (
            Kind::Finance,
            "statement",
            re(r"(?i)\b(?:statements?|kontoauszug|kontoauszüge|wyciąg|wyciągi|extractos?)\b"),
        ),
        (
            Kind::Health,
            "patient",
            re(r"(?i)\b(?:patient|pacjent|pacjenta|paciente)\b"),
        ),
        (
            Kind::Health,
            "diagnosis",
            re(r"(?i)\b(?:diagnos[ie]s|diagnose|diagnoza|diagnóstico|befund)\b"),
        ),
        (
            Kind::Health,
            "medications",
            re(r"(?i)\b(?:medications?|leki|medikamente|medicación|medicamentos)\b"),
        ),
        (
            Kind::Health,
            "allergies",
            re(r"(?i)\b(?:allerg(?:ies|ien|ie|ias|ia)|alergie)\b"),
        ),
        (
            Kind::Health,
            "immunizations",
            re(r"(?i)\b(?:immuni[sz]ations?|vaccinations?|szczepienia|impfungen|vacunas)\b"),
        ),
        (
            Kind::Health,
            "results",
            re(
                r"(?i)\b(?:lab results|test results|wyniki badań|laborbefunde|laborwerte|resultados de (?:laboratorio|análisis))\b",
            ),
        ),
        (
            Kind::Health,
            "prescriptions",
            re(r"(?i)\b(?:prescriptions?|e-?recepta|recepty|rezept|e-rezept|receta)\b"),
        ),
        (
            Kind::Health,
            "record_number",
            re(r"(?i)\b(?:mrn|medical record number|health number|nhs number)\b"),
        ),
        (
            Kind::Passwords,
            "vault_items",
            re(r"(?i)\b(?:copy username|all items|logins|secure notes|autofill|vault)\b"),
        ),
    ]
});

/// Form labels and buttons: on a line of their own. Each family counts once.
static LABELS: Lazy<Vec<(Kind, u32, &'static str, Regex)>> = Lazy::new(|| {
    vec![
        (
            Kind::Passwords,
            3,
            "password_actions",
            re(
                r"(?i)\b(?:show password|copy password|reveal password|password generator|generate password|saved passwords|password health|pokaż hasło|kopiuj hasło|passwort (?:kopieren|anzeigen)|copiar contraseña|mostrar contraseña)\b",
            ),
        ),
        (
            Kind::Finance,
            2,
            "account_label",
            re(
                r"(?i)\b(?:account number|account no\.?|routing number|sort code|iban|bic|swift|kontonummer|bankleitzahl|numer (?:rachunku|konta)|nr rachunku|número de cuenta)\b",
            ),
        ),
        (
            Kind::Payment,
            3,
            "card_label",
            re(
                r"(?i)\b(?:card number|credit card number|debit card number|cardholder|name on card|kartennummer|karteninhaber|numer karty|número de (?:la )?tarjeta|titular de la tarjeta)\b",
            ),
        ),
        (
            Kind::Payment,
            3,
            "cvc_label",
            re(
                r"(?i)\b(?:cvv2?|cvc2?|cid|security code|prüfnummer|kartenprüfnummer|kod cvv|kod cvc|código de seguridad)\b",
            ),
        ),
        (
            Kind::Payment,
            3,
            "expiry_label",
            re(
                r"(?i)(?:\bexpir(?:y|ation)(?: date)?\b|\bexp\.? date\b|\bmm ?/ ?yy\b|\bgültig bis\b|\bablaufdatum\b|\bdata ważności\b|\bfecha de (?:caducidad|vencimiento)\b)",
            ),
        ),
        (
            Kind::Payment,
            2,
            "pay_button",
            re(
                r"(?i)^(?:pay(?: now)?|place order|complete (?:purchase|order)|buy now|confirm payment|zapłać|jetzt (?:kaufen|bezahlen)|zahlungspflichtig bestellen|pagar(?: ahora)?|confirmar pago)\b",
            ),
        ),
        (
            Kind::Identity,
            3,
            "id_number_label",
            re(
                r"(?i)\b(?:passport (?:number|no\.?)|document number|id number|social security number|ssn|national insurance number|pesel|personalausweisnummer|ausweisnummer|steuer-?id|steueridentifikationsnummer|numer dowodu|numer paszportu|número de pasaporte)\b",
            ),
        ),
        (
            Kind::Identity,
            2,
            "birth_label",
            re(
                r"(?i)\b(?:date of birth|place of birth|data urodzenia|miejsce urodzenia|geburtsdatum|geburtsort|fecha de nacimiento|lugar de nacimiento)\b",
            ),
        ),
        (
            Kind::Identity,
            2,
            "nationality_label",
            re(
                r"(?i)\b(?:nationality|citizenship|obywatelstwo|staatsangehörigkeit|nacionalidad)\b",
            ),
        ),
    ]
});

/// One-time codes and second factors.
static MFA: Lazy<Regex> = Lazy::new(|| {
    re(
        r"(?i)\b(?:one-time (?:code|password|passcode)|verification code|authentication code|security code (?:sent|we sent)|enter the code|kod (?:sms|weryfikacyjny|autoryzacyjny)|bestätigungscode|sicherheitscode|push-tan|smstan|código de verificación|clave de un solo uso)\b",
    )
});

/// A password field's label on a line of its own.
static PASSWORD_LABEL: Lazy<Regex> =
    Lazy::new(|| re(r"(?i)^(?:password|passwort|hasło|contraseña|pin)\s*:?\s*$"));

/// Money: an amount with its currency, either side.
static AMOUNT: Lazy<Regex> = Lazy::new(|| {
    re(
        r"(?:[$€£]\s?-?\d{1,3}(?:[.,\u{a0} ]\d{3})*(?:[.,]\d{2})?\b|\b\d{1,3}(?:[.,\u{a0} ]\d{3})*(?:[.,]\d{2})?\s?(?:€|zł|PLN|EUR|USD|GBP|CHF|\$|£))",
    )
});

/// A balance shown with its amount, a line or two apart.
static BALANCE_WORD: Lazy<Regex> =
    Lazy::new(|| re(r"(?i)\b(?:balance|saldo|kontostand|dostępne środki|verfügbar)\b"));

/// A masked account or card number ("•••• 4821", "ending in 4821").
static MASKED: Lazy<Regex> = Lazy::new(|| {
    re(
        r"(?i)(?:(?:[*•·]|\bx){2,}[ \u{a0}]?\d{4}\b|(?:\.{3}|…)\d{4}\b|\b(?:ending in|ends in|endet auf|kończący się na|terminada en)\s*\d{4}\b)",
    )
});

/// IBAN candidates (spaces allowed), and Polish NRB account numbers (the
/// same 26 digits without "PL").
static IBAN: Lazy<Regex> = Lazy::new(|| {
    re(r"\b[A-Z]{2}\d{2}(?:[ \u{a0}]?[A-Z0-9]{4}){2,7}(?:[ \u{a0}]?[A-Z0-9]{1,4})?\b")
});
static NRB: Lazy<Regex> = Lazy::new(|| re(r"\b\d{2}(?:[ \u{a0}]?\d{4}){6}\b"));

/// 13–19 digits, spaces or dashes between (cards).
static CARD: Lazy<Regex> = Lazy::new(|| re(r"\b(?:\d[ -]?){12,18}\d\b"));

static SSN: Lazy<Regex> = Lazy::new(|| re(r"\b\d{3}-\d{2}-\d{4}\b"));
static SSN_LABEL: Lazy<Regex> = Lazy::new(|| re(r"(?i)\b(?:social security|ssn)\b"));
static PESEL: Lazy<Regex> = Lazy::new(|| re(r"\b\d{11}\b"));
static PESEL_LABEL: Lazy<Regex> = Lazy::new(|| re(r"(?i)\bpesel\b"));
static DNI: Lazy<Regex> = Lazy::new(|| re(r"\b\d{8}[A-Z]\b"));

/// An IBAN whose mod-97 checksum holds.
pub fn valid_iban(candidate: &str) -> bool {
    let s: String = candidate.chars().filter(|c| !c.is_whitespace()).collect();
    if !(15..=34).contains(&s.len()) || !s.is_ascii() {
        return false;
    }
    let (head, tail) = s.split_at(4);
    let mut rem: u32 = 0;
    for c in tail.chars().chain(head.chars()) {
        let v = match c.to_digit(36) {
            Some(v) => v,
            None => return false,
        };
        rem = if v >= 10 {
            (rem * 100 + v) % 97
        } else {
            (rem * 10 + v) % 97
        };
    }
    rem == 1
}

fn valid_pesel(digits: &str) -> bool {
    let d: Vec<u32> = digits.chars().filter_map(|c| c.to_digit(10)).collect();
    if d.len() != 11 {
        return false;
    }
    let weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    let sum: u32 = weights.iter().zip(&d).map(|(w, x)| w * x).sum();
    (10 - sum % 10) % 10 == d[10]
}

fn valid_dni(s: &str) -> bool {
    let (num, letter) = s.split_at(8);
    let Ok(n) = num.parse::<u32>() else {
        return false;
    };
    let letters = b"TRWAGMYFPDXBNJZSQVHLCKE";
    letters.get((n % 23) as usize).copied() == letter.bytes().next()
}

/// A card number worth counting: Luhn-valid and not a documented test card
/// (4242 4242 4242 4242 and friends repeat one group).
fn real_card(found: &str) -> bool {
    let digits: String = found.chars().filter(char::is_ascii_digit).collect();
    if !super::redact::luhn(&digits) {
        return false;
    }
    let groups: Vec<&str> = (0..digits.len() / 4)
        .map(|i| &digits[i * 4..i * 4 + 4])
        .collect();
    !(groups.len() >= 3 && groups.iter().all(|g| *g == groups[0]))
}

/// The label `label` sits within `window` bytes before or after `m`.
fn labelled(text: &str, start: usize, end: usize, label: &Regex, window: usize) -> bool {
    let mut lo = start.saturating_sub(window);
    while lo > 0 && !text.is_char_boundary(lo) {
        lo -= 1;
    }
    let mut hi = (end + window).min(text.len());
    while hi < text.len() && !text.is_char_boundary(hi) {
        hi += 1;
    }
    text.get(lo..hi).is_some_and(|w| label.is_match(w))
}

/// Mostly running prose (an article, an email) rather than an interface:
/// most of the text sits in long lines.
fn is_prose(text: &str) -> bool {
    let total: usize = text.lines().map(|l| l.trim().len()).sum();
    if total == 0 {
        return false;
    }
    let long: usize = text
        .lines()
        .map(str::trim)
        .filter(|l| l.len() > 100)
        .map(str::len)
        .sum();
    long * 2 > total
}

fn judge_text(text: &str, t: &mut Tally) {
    if text.trim().is_empty() {
        return;
    }
    // Words in prose are talk about a thing; in an interface, the thing.
    let prose = is_prose(text);
    let word_weight = if prose { 1 } else { 2 };
    if prose {
        t.signals.push("prose");
    }
    for (kind, name, pattern) in VOCAB.iter() {
        if pattern.is_match(text) {
            t.vocab(*kind, word_weight, name);
        }
    }

    let short_lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && l.chars().count() <= LABEL_MAX_CHARS)
        .collect();
    for (kind, w, name, pattern) in LABELS.iter() {
        if short_lines.iter().any(|l| pattern.is_match(l)) {
            t.content(*kind, *w, name);
        }
    }
    if short_lines.iter().any(|l| PASSWORD_LABEL.is_match(l)) {
        t.generic(2, "password_label");
    }
    if MFA.is_match(text) {
        t.generic(3, "one_time_code");
    }

    // Money on the page: several amounts, and a balance beside one.
    if AMOUNT.find_iter(text).take(3).count() >= 3 {
        t.content(Kind::Finance, 2, "amounts");
    }
    let balance_beside_amount = BALANCE_WORD.find_iter(text).any(|m| {
        let mut hi = (m.end() + 40).min(text.len());
        while hi < text.len() && !text.is_char_boundary(hi) {
            hi += 1;
        }
        text.get(m.end()..hi)
            .is_some_and(|after| AMOUNT.is_match(after))
    });
    if balance_beside_amount {
        t.content(Kind::Finance, 2, "balance_amount");
    }
    if MASKED.is_match(text) {
        t.content(Kind::Finance, 3, "masked_number");
        t.content(Kind::Payment, 2, "masked_number");
    }

    let iban = IBAN.find_iter(text).any(|m| valid_iban(m.as_str()))
        || NRB
            .find_iter(text)
            .any(|m| valid_iban(&format!("PL{}", m.as_str())));
    if iban {
        t.content(Kind::Finance, 4, "iban");
    }
    if CARD.find_iter(text).any(|m| real_card(m.as_str())) {
        t.content(Kind::Payment, 5, "card_number");
    }
    if SSN
        .find_iter(text)
        .any(|m| labelled(text, m.start(), m.end(), &SSN_LABEL, 60))
    {
        t.content(Kind::Identity, 5, "ssn");
    }
    if PESEL
        .find_iter(text)
        .any(|m| valid_pesel(m.as_str()) && labelled(text, m.start(), m.end(), &PESEL_LABEL, 60))
    {
        t.content(Kind::Identity, 5, "pesel");
    }
    if DNI.find_iter(text).any(|m| valid_dni(m.as_str())) {
        t.content(Kind::Identity, 5, "dni");
    }
}

/// Judge a window. With no text (metadata only), only decisive hints and
/// the shape of the place can speak, and place alone stays below the
/// threshold, so most pages are judged once their text is read (in memory;
/// a private page's text is dropped right there).
pub fn judge(page: &Page) -> Judgement {
    if let Some((place, rule)) =
        sensitive::sensitive_place_why(page.app_name, page.bundle_id, page.titles, page.urls)
    {
        return Judgement {
            place: Some(place),
            score: THRESHOLD,
            signals: vec![rule],
        };
    }
    let mut t = Tally::default();
    judge_urls(page.urls, &mut t);
    judge_titles(page.titles, &mut t);
    judge_text(page.text, &mut t);
    if page.secure_focus {
        t.generic(3, "password_field");
    }
    t.verdict()
}

#[cfg(test)]
mod tests {
    use super::*;
    use SensitivePlace::*;

    fn page(title: &str, url: &str, text: &str) -> Judgement {
        judge(&Page {
            app_name: "Google Chrome",
            bundle_id: "com.google.Chrome",
            titles: &[title],
            urls: &[url],
            text,
            secure_focus: false,
        })
    }

    fn sensitive(j: &Judgement, want: SensitivePlace) {
        assert_eq!(j.place, Some(want), "score {} via {:?}", j.score, j.signals);
    }

    fn ordinary(j: &Judgement) {
        assert_eq!(j.place, None, "score {} via {:?}", j.score, j.signals);
    }

    #[test]
    fn checksums() {
        assert!(valid_iban("DE89 3704 0044 0532 0130 00"));
        assert!(valid_iban("GB82WEST12345698765432"));
        assert!(valid_iban("ES91 2100 0418 4502 0005 1332"));
        assert!(valid_iban("PL61109010140000071219812874"));
        assert!(!valid_iban("DE89 3704 0044 0532 0130 01"));
        assert!(valid_pesel("44051401359"));
        assert!(!valid_pesel("44051401358"));
        assert!(valid_dni("12345678Z"));
        assert!(!valid_dni("12345678A"));
        assert!(real_card("4539 1488 0343 6467"));
        assert!(!real_card("4242 4242 4242 4242"));
    }

    #[test]
    fn online_banking_in_english() {
        // A credit union nobody has listed: the screen says what it is.
        let text = "Accounts\nEveryday Checking ••••4821\nAvailable balance\n$2,340.18\nSavings ••••9033\nAvailable balance\n$12,050.00\nRecent transactions\nBlue Bottle Coffee\n-$4.50\nPayroll ACME INC\n$3,200.00\nTransfer\nPay bills\nStatements";
        sensitive(
            &page(
                "Dashboard | Acme Federal Credit Union",
                "https://online.acmefcu.org/dashboard",
                text,
            ),
            Banking,
        );
    }

    #[test]
    fn online_banking_in_polish() {
        let text = "Pulpit\nRachunki\nKonto osobiste\nNumer rachunku\n61 1090 1014 0000 0712 1981 2874\nDostępne środki\n4 523,18 PLN\nHistoria transakcji\nPrzelew\nWyciągi";
        sensitive(
            &page(
                "Pulpit - Bankowość internetowa",
                "https://e-bank.example.pl/frontend/pulpit",
                text,
            ),
            Banking,
        );
        // Without the title or host: the account number and the page's own
        // words are enough.
        sensitive(&page("Pulpit", "https://example.pl/app", text), Banking);
    }

    #[test]
    fn online_banking_in_german() {
        let text = "Finanzübersicht\nGirokonto\nIBAN\nDE89 3704 0044 0532 0130 00\nKontostand\n1.234,56 €\nUmsätze\nREWE Markt -23,40 €\nGehalt 2.810,00 €\nÜberweisung\nKontoauszüge";
        sensitive(
            &page(
                "Finanzübersicht – Meine Bank",
                "https://www.example.de/banking/start",
                text,
            ),
            Banking,
        );
    }

    #[test]
    fn online_banking_in_spanish() {
        let text = "Posición global\nCuenta Online\nES91 2100 0418 4502 0005 1332\nSaldo disponible\n3.210,45 €\nÚltimos movimientos\nMercadona -54,20 €\nNómina 1.950,00 €\nTransferencia\nExtractos";
        sensitive(
            &page(
                "Posición global",
                "https://www.example.es/particulares/",
                text,
            ),
            Banking,
        );
    }

    #[test]
    fn a_listed_bank_is_a_hint_not_a_verdict() {
        // The bank's own marketing page: known host, nothing private on it.
        ordinary(&page(
            "Credit Cards, Mortgages, Banking | Chase.com",
            "https://www.chase.com/",
            "Open a checking account today and get a bonus when you set up direct deposit. Explore our credit cards, mortgages, auto loans and investing products, all in one place with Chase.",
        ));
        // Signed in: the same host plus what's on screen.
        sensitive(
            &page(
                "Accounts",
                "https://secure.chase.com/web/auth/dashboard",
                "Accounts\nTOTAL CHECKING (...5521)\nAvailable balance\n$1,204.33\nPresent balance\n$1,250.00\nSee activity\nTransfer money",
            ),
            Banking,
        );
    }

    #[test]
    fn checkout_and_card_forms() {
        let checkout = "Contact\nShipping address\nPayment\nAll transactions are secure and encrypted.\nCard number\nName on card\nExpiration date (MM / YY)\nSecurity code\nPay now";
        sensitive(
            &page(
                "Checkout - Acme Store",
                "https://shop.acme.com/checkouts/c/9f2/payment",
                checkout,
            ),
            Payment,
        );
        // A card form inside an app, no URL to go on.
        let form = judge(&Page {
            app_name: "Acme",
            bundle_id: "com.acme.app",
            titles: &["Upgrade"],
            urls: &[],
            text: "Upgrade to Team\nCard number\n4539 1488 0343 6467\nMM/YY\nCVC\nPay $49.00",
            secure_focus: false,
        });
        sensitive(&form, Payment);
    }

    #[test]
    fn a_medical_portal() {
        let text = "Welcome, Jordan\nTest Results\nComplete blood count\nResulted Oct 28\nMedications\nAtorvastatin 20 mg\nAllergies\nPenicillin\nImmunizations\nMessages from your care team\nPatient ID";
        sensitive(
            &page(
                "MyChart - Test Results",
                "https://mychart.examplehealth.org/MyChart/app/test-results",
                text,
            ),
            Health,
        );
        // Polish: Internetowe Konto Pacjenta.
        sensitive(
            &page(
                "Internetowe Konto Pacjenta",
                "https://pacjent.gov.pl/",
                "Moje konto\nRecepty\nSkierowania\nWyniki badań\nSzczepienia\nDane pacjenta\nPESEL\n44051401359",
            ),
            Health,
        );
    }

    #[test]
    fn a_password_vault_on_the_web() {
        sensitive(
            &page(
                "Vault | Acme Pass",
                "https://app.acmepass.io/vault/items",
                "All items\nLogins\nSecure notes\ngithub.com\nmatt@example.com\nCopy username\nCopy password\nShow password\nPassword generator",
            ),
            PasswordManager,
        );
        // The known apps stay decisive.
        assert_eq!(
            judge(&Page {
                app_name: "1Password",
                bundle_id: "com.1password.1password",
                ..Default::default()
            })
            .place,
            Some(PasswordManager)
        );
    }

    #[test]
    fn a_government_id_form() {
        let text = "Renew your passport\nSurname\nGiven names\nDate of birth\nPlace of birth\nNationality\nPassport number\nSocial Security Number\n123-45-6789\nContinue";
        sensitive(
            &page(
                "Renew a passport | Travel.State.gov",
                "https://travel.state.gov/passport/renew",
                text,
            ),
            Identity,
        );
    }

    #[test]
    fn a_news_article_about_a_bank() {
        let text = "JPMorgan Chase said on Tuesday that a fault in its online banking app left some customers unable to see their account balance or send transfers for several hours, the second outage this year.\nThe bank said no customer data was affected and that payments made during the outage would be processed by Wednesday. Analysts said the incident would put pressure on the lender to speed up investment in its systems, which handled $10 trillion in transfers last year.\nShares closed down 1.2% at $201.40.";
        ordinary(&page(
            "Chase online banking outage leaves customers locked out - BBC News",
            "https://www.bbc.co.uk/news/business-68123456",
            text,
        ));
    }

    #[test]
    fn an_expense_spreadsheet_the_user_is_editing() {
        // Judgement call: it's the user's own budget, not a bank. It has money
        // and a balance column, but nothing that only a bank shows (no account
        // number, no masked card, no bank place), so Ambient can still help.
        // An IBAN typed into a cell would still be redacted before anything
        // leaves the computer.
        let text = "Date\nDescription\nCategory\nAmount\nBalance\n01/10\nRent\nHousing\n-$1,200.00\n$3,450.00\n03/10\nGroceries\nFood\n-$84.20\n$3,365.80\n05/10\nTransfer to savings\nSavings\n-$500.00\n$2,865.80";
        ordinary(&judge(&Page {
            app_name: "Microsoft Excel",
            bundle_id: "com.microsoft.Excel",
            titles: &["Budget 2026.xlsx"],
            urls: &[],
            text,
            secure_focus: false,
        }));
    }

    #[test]
    fn a_github_page() {
        ordinary(&page(
            "anthropics/ambient: Pull requests · GitHub",
            "https://github.com/anthropics/ambient/pulls",
            "Code\nIssues\nPull requests\nActions\nSecurity\nInsights\nSettings\nfix(payments): retry the webhook on 502\n#482 opened 2 days ago by matt\nTransfer ownership\nfeat: show account balance in the dashboard",
        ));
        // A login page alone is not a kind of private page.
        ordinary(&judge(&Page {
            app_name: "Safari",
            bundle_id: "com.apple.Safari",
            titles: &["Sign in to GitHub · GitHub"],
            urls: &["https://github.com/login"],
            text:
                "Sign in to GitHub\nUsername or email address\nPassword\nForgot password?\nSign in",
            secure_focus: true,
        }));
    }

    #[test]
    fn an_email_about_an_invoice() {
        // Judgement call: an email that asks to be paid, with the payee's IBAN.
        // Not a bank page: the IBAN is redacted before any text leaves, and
        // the user may well ask Ambient to summarise or answer it.
        ordinary(&page(
            "Invoice 2026-118 from Northwind Ltd - matt@example.com - Gmail",
            "https://mail.google.com/mail/u/0/#inbox/FMfcgzQ",
            "Hi Matt,\nPlease find attached invoice 2026-118 for October's work. The amount due is €1,250.00, payable within 14 days by bank transfer to IBAN DE89 3704 0044 0532 0130 00 (BIC COBADEFFXXX). Let me know if you need anything else for your records.\nThanks,\nAnna",
        ));
    }

    #[test]
    fn a_health_news_article() {
        ordinary(&page(
            "New diabetes medication cuts hospital visits, study finds - The Guardian",
            "https://www.theguardian.com/society/2026/nov/04/diabetes-medication",
            "A new class of diabetes medication reduced hospital admissions by a third, according to a study of 12,000 patients published on Wednesday. Researchers said the diagnosis rate had also risen, and that prescriptions for the drug had doubled since it was approved last year.",
        ));
    }
}
