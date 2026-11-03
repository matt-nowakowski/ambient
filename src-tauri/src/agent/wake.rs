//! Hands-free "Hey Ambient" (opt-in, off by default, Pro).
//!
//! While on, a low-power mic stream runs the same speech detector as meetings.
//! When the user starts speaking after a pause, only the first ~2 s are
//! transcribed, on this Mac, with the already-loaded speech model; anything
//! that doesn't open with the wake phrase is dropped at once. Nothing is
//! recorded, stored or sent unless the user said "Hey Ambient".
//!
//! False triggers are kept down by: the phrase must open an utterance (after
//! silence), a tight match on "ambient" (with the usual transcription slips)
//! as the first or second word, nothing while dictating, and the listener
//! stops during Ambient's own meeting notes.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::actions::{process_transcription_output, OutputMode};
use crate::audio_feedback::{play_feedback_sound, SoundType};
use crate::hud::{self, HudContent, HudTone};
use crate::managers::transcription::TranscriptionManager;
use crate::meeting::capture::Mic;
use crate::meeting::segmenter::Utterance;
use crate::meeting::segmenter::{Segmenter, RATE};
use crate::settings::get_settings;

/// Transcribe only this much of each utterance to look for the wake phrase.
const CHECK_SAMPLES: usize = RATE * 22 / 10; // 2.2 s
/// After a bare "Hey Ambient", wait this long for the request.
const FOLLOW_UP: Duration = Duration::from_secs(8);
/// A spoken reply to a suggestion is short ("yes", "not now").
const REPLY_SAMPLES: usize = RATE * 3;
/// The suggestion card's own timeout, plus a little.
const REPLY_WINDOW: Duration = Duration::from_secs(10);

static RUNNING: AtomicBool = AtomicBool::new(false);

/// Greetings accepted before the name, across the app's languages.
const GREETINGS: &[&str] = &[
    "hey",
    "hi",
    "hello",
    "ok",
    "okay",
    "yo",
    "hola",
    "oye",
    "oi",
    "olá",
    "ola",
    "hallo",
    "hej",
    "hei",
    "salut",
    "bonjour",
    "ciao",
    "ehi",
    "привет",
    "эй",
    "привіт",
    "cześć",
    "ahoj",
    "merhaba",
    "halo",
    "hai",
];
/// "ambient" as speech models tend to write it.
const NAMES: &[&str] = &[
    "ambient",
    "ambiant",
    "ambiente",
    "ambien",
    "ambients",
    "embient",
    "ambyent",
    "амбиент",
    "эмбиент",
];

fn words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| {
            w.trim_matches(|c: char| !c.is_alphanumeric())
                .to_lowercase()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

/// If `text` opens with the wake phrase, the rest of it (possibly empty).
pub fn strip_wake(text: &str) -> Option<String> {
    let w = words(text);
    let name_at = match w.as_slice() {
        [first, ..] if NAMES.contains(&first.as_str()) => 0,
        [g, second, ..] if GREETINGS.contains(&g.as_str()) && NAMES.contains(&second.as_str()) => 1,
        _ => return None,
    };
    // Drop the original words up to and including the name.
    let mut seen = 0;
    let mut rest = text;
    for part in text.split_whitespace() {
        if part.trim_matches(|c: char| !c.is_alphanumeric()).is_empty() {
            continue;
        }
        if seen == name_at {
            let idx = text.find(part).unwrap_or(0) + part.len();
            rest = &text[idx..];
            break;
        }
        seen += 1;
    }
    // Drop the separator after the name (", " / ": " / "! "), keep "¿" etc.
    Some(
        rest.trim_start_matches([',', ':', ';', '.', '!', '、', '，', ' '])
            .trim()
            .to_string(),
    )
}

pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("ambient-wake".into())
        .spawn(move || supervise(app))
        .expect("spawn wake supervisor");
}

/// Opens the mic while the setting is on (and no meeting is running), closes it otherwise.
fn supervise(app: AppHandle) {
    loop {
        std::thread::sleep(Duration::from_secs(1));
        let agent = get_settings(&app).agent;
        let want = agent.wake_word
            && !agent.is_paused()
            && crate::plan::is_paid(&app)
            && !crate::meeting::is_active();
        if want && !RUNNING.load(Ordering::SeqCst) {
            listen(&app);
        }
    }
}

/// One listening session; returns when the setting goes off or a meeting starts.
fn listen(app: &AppHandle) {
    let (tx, rx) = mpsc::channel();
    let mic = match Mic::start(tx) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("wake word: couldn't open the microphone: {e}");
            std::thread::sleep(Duration::from_secs(10));
            return;
        }
    };
    RUNNING.store(true, Ordering::SeqCst);
    let Ok(mut seg) = Segmenter::new() else {
        mic.stop();
        RUNNING.store(false, Ordering::SeqCst);
        return;
    };
    let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();
    let mut awaiting_request: Option<Instant> = None;
    let mut last_check = Instant::now();

    loop {
        // Re-check the setting about once a second.
        if last_check.elapsed() > Duration::from_secs(1) {
            last_check = Instant::now();
            let agent = get_settings(app).agent;
            if !agent.wake_word
                || agent.is_paused()
                || crate::meeting::is_active()
                || !crate::plan::is_paid(app)
            {
                break;
            }
            if awaiting_request.is_some_and(|t| t.elapsed() > FOLLOW_UP) {
                awaiting_request = None;
                hud::hide(app);
            }
        }
        let Ok((_, samples)) = rx.recv_timeout(Duration::from_millis(500)) else {
            continue;
        };
        for utt in seg.push(&samples) {
            if crate::tray::dictation_in_progress(app) {
                continue; // they're dictating with a key; never interfere
            }
            // A suggestion is up: "yes" / "not now" answers it, no wake phrase.
            if heard_reply(app, &tm, &utt) {
                continue;
            }
            tm.initiate_model_load();
            if awaiting_request.take().is_some() {
                // The request after a bare "Hey Ambient".
                if let Ok(text) = tm.transcribe(utt.samples) {
                    handle_request(app, text.trim().to_string());
                }
                continue;
            }
            let head: Vec<f32> = utt.samples.iter().take(CHECK_SAMPLES).copied().collect();
            let Ok(head_text) = tm.transcribe(head) else {
                continue;
            };
            if strip_wake(&head_text).is_none() {
                continue; // not for us: dropped
            }
            play_feedback_sound(app, SoundType::Start);
            // Show it was heard at once; the full transcription comes next.
            hud::show(
                app,
                HudContent::Listening {
                    heard: String::new(),
                },
            );
            // Say it in one breath, or pause and then ask.
            let full = if utt.samples.len() > CHECK_SAMPLES {
                tm.transcribe(utt.samples).unwrap_or(head_text)
            } else {
                head_text
            };
            match strip_wake(&full).filter(|r| r.split_whitespace().count() >= 2) {
                Some(request) => handle_request(app, request),
                // Still listening (the card stays until the request or the
                // follow-up window ends).
                None => awaiting_request = Some(Instant::now()),
            }
        }
    }
    mic.stop();
    RUNNING.store(false, Ordering::SeqCst);
}

/// The request goes through the Ask path: answer, act or recall, never typed.
fn handle_request(app: &AppHandle, text: String) {
    if text.trim().is_empty() {
        // Heard the name but no request: say so rather than vanish.
        hud::show(
            app,
            HudContent::Status {
                text: "hud.status.heardNothing".into(),
                tone: HudTone::Neutral,
                undo: false,
            },
        );
        return;
    }
    hud::show(
        app,
        HudContent::Listening {
            heard: text.clone(),
        },
    );
    super::milestone(app, "wake");
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        crate::telemetry::next_route_from_wake();
        let processed = process_transcription_output(&app, &text, true, OutputMode::Ask).await;
        if let Some(route) = processed.agent_route {
            super::handle(&app, route);
        }
    });
}

/// A short utterance while a suggestion waits: answer it if it's a clear
/// "yes" / "no" / "not now". Transcribed on this Mac; nothing is kept.
fn heard_reply(app: &AppHandle, tm: &TranscriptionManager, utt: &Utterance) -> bool {
    if utt.samples.len() > REPLY_SAMPLES
        || !super::proactive::awaiting_reply()
        || !tm.is_model_loaded()
    {
        return false;
    }
    tm.transcribe(utt.samples.clone())
        .is_ok_and(|text| super::proactive::handle_spoken_reply(app, &text))
}

static REPLY_LISTENING: AtomicBool = AtomicBool::new(false);

/// While a suggestion card is up, listen for a spoken "yes" / "not now"
/// without a shortcut. On-device and short-lived: the mic opens only while
/// the card is visible (≤ 10 s), only when the speech model is already loaded
/// (no surprise model load), never during dictation or a meeting, and only
/// short utterances are transcribed and matched against the reply phrases.
/// Nothing is recorded, stored or sent. With "Hey Ambient" on, its listener
/// already hears replies, so no second stream is opened.
pub fn listen_for_reply(app: &AppHandle) {
    if RUNNING.load(Ordering::SeqCst) || REPLY_LISTENING.swap(true, Ordering::SeqCst) {
        return;
    }
    let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();
    if !tm.is_model_loaded()
        || crate::meeting::is_active()
        || crate::tray::dictation_in_progress(app)
    {
        REPLY_LISTENING.store(false, Ordering::SeqCst);
        return;
    }
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("ambient-reply".into())
        .spawn(move || {
            listen_reply(&app, &tm);
            REPLY_LISTENING.store(false, Ordering::SeqCst);
        });
    if spawned.is_err() {
        REPLY_LISTENING.store(false, Ordering::SeqCst);
    }
}

fn listen_reply(app: &AppHandle, tm: &TranscriptionManager) {
    let (tx, rx) = mpsc::channel();
    let Ok(mic) = Mic::start(tx) else { return };
    let Ok(mut seg) = Segmenter::new() else {
        mic.stop();
        return;
    };
    let started = Instant::now();
    'listen: while started.elapsed() < REPLY_WINDOW
        && super::proactive::awaiting_reply()
        && !crate::tray::dictation_in_progress(app)
    {
        let Ok((_, samples)) = rx.recv_timeout(Duration::from_millis(250)) else {
            continue;
        };
        for utt in seg.push(&samples) {
            if heard_reply(app, tm, &utt) {
                break 'listen;
            }
        }
    }
    mic.stop();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wake_phrase() {
        assert_eq!(
            strip_wake("Hey Ambient, what's the weather tomorrow?").as_deref(),
            Some("what's the weather tomorrow?")
        );
        assert_eq!(
            strip_wake("Ambient remind me at 5").as_deref(),
            Some("remind me at 5")
        );
        assert_eq!(strip_wake("hey ambiant").as_deref(), Some(""));
        assert_eq!(
            strip_wake("Hola Ambiente, ¿qué hora es?").as_deref(),
            Some("¿qué hora es?")
        );
        assert_eq!(strip_wake("I like ambient music"), None);
        assert_eq!(strip_wake("The ambient lighting is off"), None);
        assert_eq!(strip_wake("hey can you check the ambient noise"), None);
    }
}
