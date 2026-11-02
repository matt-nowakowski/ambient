//! Cuts a continuous 16 kHz mono stream into utterances for transcription:
//! speech starts a segment (with a little pre-roll), ~0.8 s of silence or 25 s
//! of continuous speech ends it.

use crate::audio_toolkit::{EarshotVad, VoiceActivityDetector};

pub const RATE: usize = 16_000;
pub const FRAME: usize = 256; // Earshot's 16 ms frame
const PREROLL_FRAMES: usize = 19; // ~300 ms
const END_SILENCE_FRAMES: usize = 50; // ~800 ms
const MAX_FRAMES: usize = 25 * RATE / FRAME; // 25 s
const MIN_SPEECH_FRAMES: usize = 25; // ~400 ms of actual speech

pub struct Utterance {
    /// Milliseconds since the meeting started.
    pub start_ms: u64,
    pub samples: Vec<f32>,
}

pub struct Segmenter {
    vad: EarshotVad,
    pending: Vec<f32>,
    preroll: std::collections::VecDeque<Vec<f32>>,
    current: Vec<f32>,
    speech_frames: usize,
    silence: usize,
    in_speech: bool,
    /// Frames seen since the start (the channel's clock).
    position: usize,
    start_frame: usize,
}

impl Segmenter {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self {
            vad: EarshotVad::new(0.5)?,
            pending: Vec::new(),
            preroll: std::collections::VecDeque::new(),
            current: Vec::new(),
            speech_frames: 0,
            silence: 0,
            in_speech: false,
            position: 0,
            start_frame: 0,
        })
    }

    /// Feed any number of samples; returns finished utterances.
    pub fn push(&mut self, samples: &[f32]) -> Vec<Utterance> {
        self.pending.extend_from_slice(samples);
        let mut out = Vec::new();
        while self.pending.len() >= FRAME {
            let frame: Vec<f32> = self.pending.drain(..FRAME).collect();
            if let Some(u) = self.frame(frame) {
                out.push(u);
            }
        }
        out
    }

    /// Flush whatever is in progress (meeting ended).
    pub fn finish(&mut self) -> Option<Utterance> {
        self.in_speech.then(|| self.cut()).flatten()
    }

    fn frame(&mut self, frame: Vec<f32>) -> Option<Utterance> {
        let speech = self.vad.is_voice(&frame).unwrap_or(false);
        self.position += 1;
        if !self.in_speech {
            if speech {
                self.in_speech = true;
                self.start_frame = self.position.saturating_sub(self.preroll.len() + 1);
                self.current = self.preroll.drain(..).flatten().collect();
                self.current.extend_from_slice(&frame);
                self.speech_frames = 1;
                self.silence = 0;
            } else {
                self.preroll.push_back(frame);
                if self.preroll.len() > PREROLL_FRAMES {
                    self.preroll.pop_front();
                }
            }
            return None;
        }
        self.current.extend_from_slice(&frame);
        if speech {
            self.speech_frames += 1;
            self.silence = 0;
        } else {
            self.silence += 1;
        }
        let frames = self.current.len() / FRAME;
        if self.silence >= END_SILENCE_FRAMES || frames >= MAX_FRAMES {
            return self.cut();
        }
        None
    }

    fn cut(&mut self) -> Option<Utterance> {
        self.in_speech = false;
        let samples = std::mem::take(&mut self.current);
        let enough = self.speech_frames >= MIN_SPEECH_FRAMES;
        self.speech_frames = 0;
        self.silence = 0;
        enough.then(|| Utterance {
            start_ms: (self.start_frame * FRAME * 1000 / RATE) as u64,
            samples,
        })
    }
}
