use std::time::Duration;

use crate::{Error, InputDevice};

/// Which device to open and what the sink receives. The device always runs at
/// its OS format; `RecorderConfig::default()` delivers the default device's
/// audio unchanged.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RecorderConfig {
    /// An `InputDevice::id` from `list_input_devices`. `None` opens the
    /// system default device.
    pub device: Option<String>,
    /// The rate the sink receives. `None` keeps the device's rate, with no
    /// resampling.
    pub sample_rate: Option<u32>,
    /// Which channels the sink receives. Default: all of them.
    pub channels: Channels,
    /// Frames per `process_chunk` call (one sample per channel). `None` is
    /// about 10 ms; set it when the sink needs a fixed size, like a VAD.
    pub frames_per_chunk: Option<usize>,
    /// Moves a Bluetooth headset (AirPods) to this Mac while recording.
    /// macOS only.
    pub take_headset: bool,
    /// Audio kept from just before `start`. While the stream runs between
    /// recordings, the most recent `pre_roll` of audio is held in memory and
    /// handed to the next recording first, so a word begun as the user hits
    /// the key is kept. Never written anywhere; dropped on close. Zero (the
    /// default) keeps nothing.
    pub pre_roll: Duration,
}

impl RecorderConfig {
    /// 16 kHz mono, 30 ms chunks: the usual ASR input.
    pub fn speech() -> Self {
        Self {
            device: None,
            sample_rate: Some(16_000),
            channels: Channels::MixToMono,
            frames_per_chunk: Some(480),
            take_headset: false,
            pre_roll: Duration::ZERO,
        }
    }
}

/// Which channels the sink receives.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Channels {
    /// All device channels, interleaved.
    #[default]
    All,
    /// Average of all device channels.
    MixToMono,
    /// One channel, zero-based.
    Only(u16),
}

/// A sample rate and channel count.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Format {
    pub sample_rate: u32,
    pub channels: u16,
}

/// What a recorder opened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecorderInfo {
    pub device: InputDevice,
    pub device_format: Format,
    /// What the sink receives.
    pub format: Format,
    /// The requested `frames_per_chunk`, or the resolved ~10 ms default.
    pub frames_per_chunk: usize,
}

/// What ended a recording.
#[derive(Debug, Clone)]
pub enum EndReason {
    StopCalled,
    /// The recorder failed; the audio up to the failure was delivered.
    RecorderFailed(Error),
    /// The sink panicked; carries the panic message. The recorder is fine.
    SinkPanicked(String),
}
