//! Two audio sources for a meeting: the microphone ("you") and the
//! computer's own output ("them", the call). Both deliver 16 kHz mono to a channel; nothing
//! is written to disk.

use std::sync::mpsc::Sender;

use ambient_recorder::{AudioChunk, Recorder, RecorderConfig, Sink};

use super::segmenter::FRAME;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Mic,
    System,
}

pub type Frames = (Source, Vec<f32>);

struct MicSink(Sender<Frames>);

impl Sink for MicSink {
    fn process_chunk(&mut self, chunk: AudioChunk<'_>) {
        let n = chunk.valid_frames * chunk.channels as usize;
        let _ = self.0.send((Source::Mic, chunk.samples[..n].to_vec()));
    }
}

pub struct Mic(Recorder<MicSink>);

impl Mic {
    pub fn start(tx: Sender<Frames>) -> Result<Self, String> {
        let config = RecorderConfig {
            frames_per_chunk: Some(FRAME),
            ..RecorderConfig::speech()
        };
        let recorder = Recorder::open(config).map_err(|e| e.to_string())?;
        recorder
            .start(MicSink(tx))
            .map_err(|_| "couldn't start the microphone".to_string())?;
        Ok(Self(recorder))
    }

    pub fn stop(self) {
        let _ = self.0.stop();
    }
}

#[cfg(target_os = "macos")]
pub mod system {
    use std::ffi::c_void;
    use std::sync::mpsc::Sender;

    use super::{Frames, Source};

    type Callback = extern "C" fn(*const f32, i32, *mut c_void);

    extern "C" {
        fn ambient_system_audio_start(cb: Callback, ctx: *mut c_void) -> i32;
        fn ambient_system_audio_stop();
        fn ambient_mic_in_use() -> bool;
    }

    extern "C" fn on_audio(data: *const f32, frames: i32, ctx: *mut c_void) {
        if data.is_null() || ctx.is_null() || frames <= 0 {
            return;
        }
        // SAFETY: ctx is the Box<Sender> leaked in `start`, alive until `stop`;
        // data holds `frames` floats for the duration of this call.
        let tx = unsafe { &*(ctx as *const Sender<Frames>) };
        let samples = unsafe { std::slice::from_raw_parts(data, frames as usize) }.to_vec();
        let _ = tx.send((Source::System, samples));
    }

    pub struct SystemAudio(*mut Sender<Frames>);

    // The pointer is only touched by the Swift capture queue and `stop`.
    unsafe impl Send for SystemAudio {}

    impl SystemAudio {
        /// Err holds an i18n key explaining why the call audio isn't captured.
        pub fn start(tx: Sender<Frames>) -> Result<Self, &'static str> {
            let ctx = Box::into_raw(Box::new(tx));
            match unsafe { ambient_system_audio_start(on_audio, ctx as *mut c_void) } {
                0 => Ok(Self(ctx)),
                code => {
                    drop(unsafe { Box::from_raw(ctx) });
                    Err(match code {
                        1 => "meetings.systemAudio.noPermission",
                        4 => "meetings.systemAudio.oldMacOS",
                        _ => "meetings.systemAudio.failed",
                    })
                }
            }
        }

        pub fn stop(self) {
            unsafe { ambient_system_audio_stop() };
            // The capture has stopped, so no callback can still hold ctx.
            drop(unsafe { Box::from_raw(self.0) });
        }
    }

    pub fn mic_in_use() -> bool {
        unsafe { ambient_mic_in_use() }
    }
}

/// Windows: WASAPI loopback and the microphone ConsentStore.
#[cfg(target_os = "windows")]
pub mod system {
    pub use super::super::windows::{mic_in_use, SystemAudio};
}

/// Linux: the default output's monitor (PipeWire or PulseAudio), and
/// `pactl` for whether another app holds the mic. See `meeting/linux.rs`.
#[cfg(target_os = "linux")]
pub mod system {
    pub use super::super::linux::{mic_in_use, SystemAudio};
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub mod system {
    use std::sync::mpsc::Sender;

    use super::Frames;

    pub struct SystemAudio;

    impl SystemAudio {
        pub fn start(_tx: Sender<Frames>) -> Result<Self, &'static str> {
            Err("meetings.systemAudio.unsupported")
        }
        pub fn stop(self) {}
    }

    pub fn mic_in_use() -> bool {
        false
    }
}
