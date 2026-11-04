use super::{VadFrame, VadTailReport, VoiceActivityDetector};
use anyhow::Result;
use std::collections::VecDeque;

/// One pre-roll buffer slot. `emitted` and `voiced` exist only to power the
/// end-of-recording `tail_report()` diagnostic; they never affect emission.
struct BufferedFrame {
    samples: Vec<f32>,
    emitted: bool,
    voiced: bool,
}

pub struct SmoothedVad {
    inner_vad: Box<dyn VoiceActivityDetector>,
    prefill_frames: usize,
    /// Pre-roll for the first speech since `reset`: speech at the very start
    /// of a recording is often soft ("so…", "hi"), and the detector can be
    /// slow to call it, so the first onset reaches further back.
    initial_prefill_frames: usize,
    hangover_frames: usize,
    onset_frames: usize,
    /// Speech has been confirmed since the last `reset`.
    heard_speech: bool,

    frame_buffer: VecDeque<BufferedFrame>,
    hangover_counter: usize,
    onset_counter: usize,
    in_speech: bool,

    temp_out: Vec<f32>,
}

impl SmoothedVad {
    pub fn new(
        inner_vad: Box<dyn VoiceActivityDetector>,
        prefill_frames: usize,
        hangover_frames: usize,
        onset_frames: usize,
    ) -> Self {
        Self {
            inner_vad,
            prefill_frames,
            initial_prefill_frames: prefill_frames,
            hangover_frames,
            onset_frames,
            heard_speech: false,
            frame_buffer: VecDeque::new(),
            hangover_counter: 0,
            onset_counter: 0,
            in_speech: false,
            temp_out: Vec::new(),
        }
    }

    /// A longer pre-roll for the first speech after each `reset` (never
    /// shorter than the usual one).
    pub fn with_initial_prefill(mut self, frames: usize) -> Self {
        self.initial_prefill_frames = frames.max(self.prefill_frames);
        self
    }

    fn prefill_limit(&self) -> usize {
        if self.heard_speech {
            self.prefill_frames
        } else {
            self.initial_prefill_frames
        }
    }

    fn mark_last_emitted(&mut self) {
        if let Some(frame) = self.frame_buffer.back_mut() {
            frame.emitted = true;
        }
    }
}

impl VoiceActivityDetector for SmoothedVad {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> Result<VadFrame<'a>> {
        // 1. Buffer every incoming frame for possible pre-roll
        self.frame_buffer.push_back(BufferedFrame {
            samples: frame.to_vec(),
            emitted: false,
            voiced: false,
        });
        let limit = self.prefill_limit();
        while self.frame_buffer.len() > limit + 1 {
            self.frame_buffer.pop_front();
        }

        // 2. Delegate to the wrapped boolean VAD
        let is_voice = self.inner_vad.is_voice(frame)?;
        if let Some(last) = self.frame_buffer.back_mut() {
            last.voiced = is_voice;
        }

        match (self.in_speech, is_voice) {
            // Potential start of speech - need to accumulate onset frames
            (false, true) => {
                self.onset_counter += 1;
                if self.onset_counter >= self.onset_frames {
                    // We have enough consecutive voice frames to trigger speech
                    self.in_speech = true;
                    self.heard_speech = true;
                    self.hangover_counter = self.hangover_frames;
                    self.onset_counter = 0; // Reset for next time

                    // Collect prefill + current frame
                    self.temp_out.clear();
                    for buffered in self.frame_buffer.iter_mut().filter(|f| !f.emitted) {
                        self.temp_out.extend(buffered.samples.iter());
                        buffered.emitted = true;
                    }
                    Ok(VadFrame::Speech(&self.temp_out))
                } else {
                    // Not enough frames yet, still silence
                    Ok(VadFrame::Noise)
                }
            }

            // Ongoing Speech
            (true, true) => {
                self.hangover_counter = self.hangover_frames;
                self.mark_last_emitted();
                Ok(VadFrame::Speech(frame))
            }

            // End of Speech or interruption during onset phase
            (true, false) => {
                if self.hangover_counter > 0 {
                    self.hangover_counter -= 1;
                    self.mark_last_emitted();
                    Ok(VadFrame::Speech(frame))
                } else {
                    self.in_speech = false;
                    Ok(VadFrame::Noise)
                }
            }

            // Silence or broken onset sequence
            (false, false) => {
                self.onset_counter = 0; // Reset onset counter on silence
                Ok(VadFrame::Noise)
            }
        }
    }

    fn frame_samples(&self) -> usize {
        self.inner_vad.frame_samples()
    }

    fn set_hangover_frames(&mut self, frames: usize) {
        self.hangover_frames = frames;
    }

    /// Trailing run of withheld frames plus smoothing state. Interior
    /// withheld frames (before already-emitted speech) are not counted.
    fn tail_report(&self) -> Option<VadTailReport> {
        let mut withheld_frames = 0;
        let mut withheld_voiced_frames = 0;
        for frame in self
            .frame_buffer
            .iter()
            .rev()
            .take_while(|frame| !frame.emitted)
        {
            withheld_frames += 1;
            if frame.voiced {
                withheld_voiced_frames += 1;
            }
        }

        Some(VadTailReport {
            withheld_frames,
            withheld_voiced_frames,
            in_speech: self.in_speech,
            onset_counter: self.onset_counter,
            hangover_counter: self.hangover_counter,
        })
    }

    fn reset(&mut self) {
        self.inner_vad.reset();
        self.frame_buffer.clear();
        self.hangover_counter = 0;
        self.onset_counter = 0;
        self.in_speech = false;
        self.heard_speech = false;
        self.temp_out.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Inner VAD that replays a scripted voice/no-voice sequence.
    struct ScriptedVad {
        script: VecDeque<bool>,
    }

    impl ScriptedVad {
        fn new(script: &[bool]) -> Self {
            Self {
                script: script.iter().copied().collect(),
            }
        }
    }

    impl VoiceActivityDetector for ScriptedVad {
        fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> Result<VadFrame<'a>> {
            if self.script.pop_front().unwrap_or(false) {
                Ok(VadFrame::Speech(frame))
            } else {
                Ok(VadFrame::Noise)
            }
        }

        fn frame_samples(&self) -> usize {
            4
        }
    }

    fn frame(value: f32) -> Vec<f32> {
        vec![value; 4]
    }

    fn smoothed(script: &[bool], onset_frames: usize) -> SmoothedVad {
        SmoothedVad::new(Box::new(ScriptedVad::new(script)), 3, 2, onset_frames)
    }

    fn emitted(vad: &mut SmoothedVad, values: &[f32]) -> Vec<f32> {
        let mut out = Vec::new();
        for &v in values {
            if let VadFrame::Speech(samples) = vad.push_frame(&frame(v)).unwrap() {
                out.extend_from_slice(samples);
            }
        }
        out
    }

    #[test]
    fn first_speech_keeps_the_longer_initial_prefill() {
        // 5 silent frames, then speech: the first onset reaches back 4
        // frames (initial prefill), not 3.
        let script = [false, false, false, false, false, true, true];
        let mut vad = smoothed(&script, 1).with_initial_prefill(4);
        let out = emitted(&mut vad, &[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
        let firsts: Vec<f32> = out.chunks(4).map(|f| f[0]).collect();
        assert_eq!(firsts, vec![0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    }

    #[test]
    fn later_speech_uses_the_usual_prefill() {
        // Speech, silence past the hangover, then speech again: the second
        // onset gets the usual 3-frame prefill.
        let script = [true, false, false, false, false, false, false, false, true];
        let mut vad = smoothed(&script, 1).with_initial_prefill(6);
        let values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let out = emitted(&mut vad, &values);
        let firsts: Vec<f32> = out.chunks(4).map(|f| f[0]).collect();
        // 1 + 2 hangover frames, then 6..=8 prefill and the onset frame 9.
        assert_eq!(firsts, vec![1.0, 2.0, 3.0, 6.0, 7.0, 8.0, 9.0]);
    }

    #[test]
    fn reset_restores_the_initial_prefill() {
        let mut vad = smoothed(&[true], 1).with_initial_prefill(5);
        let _ = emitted(&mut vad, &[1.0]);
        assert_eq!(vad.prefill_limit(), 3);
        vad.reset();
        assert_eq!(vad.prefill_limit(), 5);
    }

    #[test]
    fn tail_report_counts_withheld_onset_tail() {
        // One voiced frame at the end: onset (2 frames) never confirms, so
        // both trailing frames are withheld and one of them is voiced —
        // consistent with a final word cut off at the stop boundary.
        let mut vad = smoothed(&[false, true], 2);
        assert!(!vad.push_frame(&frame(0.1)).unwrap().is_speech());
        assert!(!vad.push_frame(&frame(0.9)).unwrap().is_speech());

        let report = vad.tail_report().expect("smoothed VAD always reports");
        assert_eq!(report.withheld_frames, 2);
        assert_eq!(report.withheld_voiced_frames, 1);
        assert_eq!(report.onset_counter, 1);
        assert!(!report.in_speech);
    }

    #[test]
    fn tail_report_counts_only_trailing_run() {
        // Speech emitted through hangover, then silence past the hangover is
        // withheld. Only the trailing run counts — frames older than an
        // emitted frame are excluded.
        let mut vad = smoothed(&[true, true, false, false, false, false], 2);
        for v in [0.1, 0.2, 0.3, 0.4] {
            let _ = vad.push_frame(&frame(v)).unwrap();
        }
        assert!(!vad.push_frame(&frame(0.5)).unwrap().is_speech()); // past hangover
        assert!(!vad.push_frame(&frame(0.6)).unwrap().is_speech());

        let report = vad.tail_report().unwrap();
        assert_eq!(report.withheld_frames, 2);
        assert_eq!(report.withheld_voiced_frames, 0);
    }
}
