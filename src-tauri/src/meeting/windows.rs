//! Windows: the call's audio ("them") by WASAPI loopback on the default
//! output device, and whether another app is using the microphone (the
//! privacy ConsentStore Windows keeps for its mic indicator). Audio arrives
//! as 16 kHz mono on the same channel as the macOS capture; nothing is
//! written to disk.

use std::sync::mpsc::Sender;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;

use super::capture::{Frames, Source};
use crate::win::rules::{self, Downsampler};

const TARGET_RATE: u32 = 16_000;

pub struct SystemAudio {
    _stream: cpal::Stream,
}

impl SystemAudio {
    /// Err holds an i18n key explaining why the call audio isn't captured.
    pub fn start(tx: Sender<Frames>) -> Result<Self, &'static str> {
        const FAILED: &str = "meetings.systemAudio.failed";
        let host = cpal::default_host();
        let device = host.default_output_device().ok_or(FAILED)?;
        let supported = device.default_output_config().map_err(|e| {
            log::warn!("call audio: no output config: {e}");
            FAILED
        })?;
        let channels = usize::from(supported.channels().max(1));
        let rate = supported.sample_rate();
        let config = supported.config();
        let on_error = |e: cpal::Error| log::warn!("call audio stream error: {e}");
        let timeout = Some(Duration::from_secs(3));
        // An input stream on an output device is WASAPI loopback: what the
        // speakers play, the call included.
        let stream = match supported.sample_format() {
            SampleFormat::F32 => {
                let mut down = Downsampler::new(rate, TARGET_RATE);
                device.build_input_stream::<f32, _, _>(
                    config,
                    move |data: &[f32], _| {
                        let out = down.push(&rules::mix_to_mono(data, channels));
                        if !out.is_empty() {
                            let _ = tx.send((Source::System, out));
                        }
                    },
                    on_error,
                    timeout,
                )
            }
            SampleFormat::I16 => {
                let mut down = Downsampler::new(rate, TARGET_RATE);
                device.build_input_stream::<i16, _, _>(
                    config,
                    move |data: &[i16], _| {
                        let floats: Vec<f32> =
                            data.iter().map(|s| f32::from(*s) / 32_768.0).collect();
                        let out = down.push(&rules::mix_to_mono(&floats, channels));
                        if !out.is_empty() {
                            let _ = tx.send((Source::System, out));
                        }
                    },
                    on_error,
                    timeout,
                )
            }
            other => {
                log::warn!("call audio: unsupported sample format {other:?}");
                return Err(FAILED);
            }
        }
        .map_err(|e| {
            log::warn!("call audio: loopback didn't open: {e}");
            FAILED
        })?;
        stream.play().map_err(|e| {
            log::warn!("call audio: loopback didn't start: {e}");
            FAILED
        })?;
        Ok(Self { _stream: stream })
    }

    pub fn stop(self) {
        // Dropping the stream stops the capture.
    }
}

/// True when an app other than Ambient is using the microphone now.
pub fn mic_in_use() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
    let Ok(store) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(STORE) else {
        return false;
    };
    let own = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let in_use = |key: &RegKey| {
        let start: u64 = key.get_value("LastUsedTimeStart").unwrap_or(0);
        let stop: u64 = key.get_value("LastUsedTimeStop").unwrap_or(0);
        rules::consent_in_use(start, stop)
    };
    // Store (packaged) apps: one key each.
    let packaged = store
        .enum_keys()
        .flatten()
        .filter(|name| name != "NonPackaged")
        .filter_map(|name| store.open_subkey(&name).ok())
        .any(|key| in_use(&key));
    if packaged {
        return true;
    }
    // Desktop apps: one key per executable path.
    let Ok(desktop) = store.open_subkey("NonPackaged") else {
        return false;
    };
    desktop
        .enum_keys()
        .flatten()
        .filter(|name| !rules::is_own_consent_key(name, &own))
        .filter_map(|name| desktop.open_subkey(&name).ok())
        .any(|key| in_use(&key))
}
