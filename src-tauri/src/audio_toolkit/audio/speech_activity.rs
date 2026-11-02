//! How long the speaker has been quiet, for auto-stop on a long pause.
//!
//! Fed from the capture sink's VAD decisions (the smoothed detector, so a
//! brief pause inside a sentence stays "speech" for its hangover tail). Read
//! from the shortcut coordinator's thread, so it is all atomics.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use crate::audio_toolkit::constants::WHISPER_SAMPLE_RATE;

/// Voiced audio needed before a pause can end the recording, so a cough or a
/// click before the first word never stops it.
const MIN_VOICED: Duration = Duration::from_millis(300);

pub struct SpeechActivity {
    frame_ms: f64,
    /// The detector keeps reporting speech this long after the voice stops.
    hangover: Duration,
    /// Frames reported as speech, all segments together.
    speech_frames: AtomicU64,
    /// Separate runs of speech (each carries one hangover tail).
    segments: AtomicU64,
    /// Frames reported as non-speech since the last speech frame.
    quiet_frames: AtomicU64,
    last_was_speech: AtomicBool,
}

impl SpeechActivity {
    pub fn new(frame_samples: usize, hangover: Duration) -> Self {
        Self {
            frame_ms: frame_samples as f64 * 1000.0 / WHISPER_SAMPLE_RATE as f64,
            hangover,
            speech_frames: AtomicU64::new(0),
            segments: AtomicU64::new(0),
            quiet_frames: AtomicU64::new(0),
            last_was_speech: AtomicBool::new(false),
        }
    }

    /// One detector frame's decision.
    pub fn on_frame(&self, speech: bool) {
        if speech {
            if !self.last_was_speech.swap(true, Ordering::AcqRel) {
                self.segments.fetch_add(1, Ordering::AcqRel);
            }
            self.speech_frames.fetch_add(1, Ordering::AcqRel);
            self.quiet_frames.store(0, Ordering::Release);
        } else {
            self.last_was_speech.store(false, Ordering::Release);
            self.quiet_frames.fetch_add(1, Ordering::AcqRel);
        }
    }

    fn frames(&self, frames: u64) -> Duration {
        Duration::from_secs_f64(frames as f64 * self.frame_ms / 1000.0)
    }

    /// Roughly how much of what was heard was voice (speech frames minus
    /// each segment's hangover tail).
    fn voiced(&self) -> Duration {
        let reported = self.frames(self.speech_frames.load(Ordering::Acquire));
        let tails = self.hangover * self.segments.load(Ordering::Acquire) as u32;
        reported.saturating_sub(tails)
    }

    /// How long it has been quiet since the speaker last spoke, or `None`
    /// while nobody has said anything yet (or is speaking now).
    pub fn silence_after_speech(&self) -> Option<Duration> {
        if self.voiced() < MIN_VOICED || self.last_was_speech.load(Ordering::Acquire) {
            return None;
        }
        // The detector only reports silence once its hangover ran out, so the
        // voice actually stopped that much earlier.
        Some(self.hangover + self.frames(self.quiet_frames.load(Ordering::Acquire)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 512-sample frames: 32 ms each.
    fn activity() -> SpeechActivity {
        SpeechActivity::new(512, Duration::from_millis(450))
    }

    fn feed(a: &SpeechActivity, speech: bool, ms: u64) {
        for _ in 0..ms / 32 {
            a.on_frame(speech);
        }
    }

    #[test]
    fn nothing_before_speech() {
        let a = activity();
        feed(&a, false, 10_000);
        assert_eq!(a.silence_after_speech(), None);
    }

    #[test]
    fn a_cough_is_not_speech() {
        let a = activity();
        // ~100 ms of voice plus the 450 ms hangover tail.
        feed(&a, true, 550);
        feed(&a, false, 5_000);
        assert_eq!(a.silence_after_speech(), None);
    }

    #[test]
    fn counts_the_pause_after_speech() {
        let a = activity();
        feed(&a, false, 1_000);
        feed(&a, true, 2_000);
        assert_eq!(a.silence_after_speech(), None, "still talking");
        feed(&a, false, 1_024);
        let quiet = a.silence_after_speech().expect("spoke, then paused");
        assert!(quiet >= Duration::from_millis(1_450) && quiet < Duration::from_millis(1_500));
        // Speaking again resets the pause.
        feed(&a, true, 320);
        feed(&a, false, 64);
        let quiet = a.silence_after_speech().unwrap();
        assert!(quiet < Duration::from_millis(600));
    }
}
