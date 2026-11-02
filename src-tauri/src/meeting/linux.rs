//! Linux meeting audio, through the PulseAudio API that both PulseAudio and
//! PipeWire (pipewire-pulse) serve:
//!
//! - Call audio ("them"): the default output's monitor source, recorded by
//!   `parec` as 16 kHz mono float. Nothing is written to disk.
//! - Mic in use: another app has a recording stream open on a real input
//!   (`pactl list source-outputs`), not a monitor and not ours.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use serde_json::Value;

/// A recording stream, as `pactl` describes it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SourceOutput {
    pub source: Option<u32>,
    pub corked: bool,
    pub pid: Option<u32>,
    pub app: String,
}

/// Level meters and mixers: they open recording streams without recording.
const METERS: &[&str] = &[
    "pavucontrol",
    "pulseaudio volume control",
    "pwvucontrol",
    "gnome-control-center",
    "gnome settings",
    "plasma-pa",
    "kmix",
    "easyeffects",
    "helvum",
    "qpwgraph",
];

/// `pactl -f json list source-outputs`.
pub fn parse_source_outputs_json(json: &str) -> Option<Vec<SourceOutput>> {
    let items: Vec<Value> = serde_json::from_str(json).ok()?;
    Some(
        items
            .iter()
            .map(|o| {
                let props = &o["properties"];
                let prop = |k: &str| props[k].as_str().unwrap_or_default().to_string();
                SourceOutput {
                    source: o["source"].as_u64().and_then(|s| u32::try_from(s).ok()),
                    corked: o["corked"].as_bool().unwrap_or(false),
                    pid: prop("application.process.id").parse().ok(),
                    app: {
                        let name = prop("application.name");
                        if name.is_empty() {
                            prop("application.process.binary")
                        } else {
                            name
                        }
                    },
                }
            })
            .collect(),
    )
}

/// `pactl list source-outputs` (text, for pactl older than 16).
pub fn parse_source_outputs_text(text: &str) -> Vec<SourceOutput> {
    let mut out = Vec::new();
    let mut cur: Option<SourceOutput> = None;
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with("Source Output #") {
            out.extend(cur.take());
            cur = Some(SourceOutput::default());
            continue;
        }
        let Some(o) = cur.as_mut() else { continue };
        if let Some(v) = t.strip_prefix("Source:") {
            o.source = v.trim().parse().ok();
        } else if let Some(v) = t.strip_prefix("Corked:") {
            o.corked = v.trim() == "yes";
        } else if let Some((k, v)) = t.split_once(" = ") {
            let v = v.trim().trim_matches('"');
            match k.trim() {
                "application.process.id" => o.pid = v.parse().ok(),
                "application.name" => o.app = v.to_string(),
                "application.process.binary" if o.app.is_empty() => o.app = v.to_string(),
                _ => {}
            }
        }
    }
    out.extend(cur);
    out
}

/// Indexes of monitor sources in `pactl list short sources`.
pub fn monitor_sources(short: &str) -> Vec<u32> {
    short
        .lines()
        .filter_map(|l| {
            let mut cols = l.split('\t');
            let index = cols.next()?.trim().parse().ok()?;
            let name = cols.next()?;
            name.ends_with(".monitor").then_some(index)
        })
        .collect()
}

/// Whether any of these streams is another app recording a real input.
pub fn someone_else_recording(outputs: &[SourceOutput], monitors: &[u32], own_pid: u32) -> bool {
    outputs.iter().any(|o| {
        !o.corked
            && o.pid != Some(own_pid)
            && !o.source.is_some_and(|s| monitors.contains(&s))
            && !METERS.contains(&o.app.to_lowercase().as_str())
    })
}

/// Little-endian f32 samples from raw bytes; leftover bytes stay in `buf`.
pub fn take_samples(buf: &mut Vec<u8>) -> Vec<f32> {
    let whole = buf.len() / 4 * 4;
    let samples = buf[..whole]
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    buf.drain(..whole);
    samples
}

#[cfg(target_os = "linux")]
pub use imp::{mic_in_use, SystemAudio};

#[cfg(target_os = "linux")]
mod imp {
    use std::io::Read;
    use std::process::{Child, Command, Stdio};
    use std::sync::mpsc::Sender;
    use std::sync::Mutex;
    use std::thread::JoinHandle;
    use std::time::{Duration, Instant};

    use super::super::capture::{Frames, Source};
    use super::*;
    use crate::agent::linux::output_within;

    fn pactl(args: &[&str]) -> Option<String> {
        output_within(
            Command::new("pactl").args(args),
            Duration::from_millis(1500),
        )
    }

    static CACHE: Mutex<Option<(bool, Instant)>> = Mutex::new(None);

    /// True when another app is recording from a microphone (a call).
    pub fn mic_in_use() -> bool {
        let mut g = CACHE
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some((v, at)) = *g {
            if at.elapsed() < Duration::from_secs(2) {
                return v;
            }
        }
        let outputs = pactl(&["-f", "json", "list", "source-outputs"])
            .and_then(|j| parse_source_outputs_json(&j))
            .or_else(|| pactl(&["list", "source-outputs"]).map(|t| parse_source_outputs_text(&t)))
            .unwrap_or_default();
        let monitors = pactl(&["list", "short", "sources"])
            .map(|s| monitor_sources(&s))
            .unwrap_or_default();
        let v = someone_else_recording(&outputs, &monitors, std::process::id());
        *g = Some((v, Instant::now()));
        v
    }

    /// The call audio: what's playing on the default output, via `parec`.
    pub struct SystemAudio {
        child: Child,
        reader: Option<JoinHandle<()>>,
    }

    impl SystemAudio {
        /// Err holds an i18n key explaining why the call audio isn't captured.
        pub fn start(tx: Sender<Frames>) -> Result<Self, &'static str> {
            let spawned = Command::new("parec")
                .args([
                    "--device=@DEFAULT_MONITOR@",
                    "--format=float32le",
                    "--rate=16000",
                    "--channels=1",
                    "--raw",
                    "--latency-msec=60",
                    concat!("--client-name=", env!("BRAND_NAME")),
                    "--stream-name=Meeting notes",
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn();
            let mut child = match spawned {
                Ok(c) => c,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    return Err("meetings.systemAudio.linuxNoParec")
                }
                Err(e) => {
                    log::warn!("couldn't start parec: {e}");
                    return Err("meetings.systemAudio.failed");
                }
            };
            // A missing sound server makes parec exit straight away.
            std::thread::sleep(Duration::from_millis(250));
            if !matches!(child.try_wait(), Ok(None)) {
                let _ = child.wait();
                return Err("meetings.systemAudio.failed");
            }
            let Some(mut stdout) = child.stdout.take() else {
                let _ = child.kill();
                let _ = child.wait();
                return Err("meetings.systemAudio.failed");
            };
            let reader = std::thread::Builder::new()
                .name("call-audio".into())
                .spawn(move || {
                    let mut chunk = [0u8; 3200]; // 50 ms
                    let mut pending = Vec::with_capacity(6400);
                    loop {
                        match stdout.read(&mut chunk) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => {
                                pending.extend_from_slice(&chunk[..n]);
                                let samples = take_samples(&mut pending);
                                if !samples.is_empty()
                                    && tx.send((Source::System, samples)).is_err()
                                {
                                    break;
                                }
                            }
                        }
                    }
                });
            let reader = match reader {
                Ok(r) => r,
                Err(_) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("meetings.systemAudio.failed");
                }
            };
            Ok(Self {
                child,
                reader: Some(reader),
            })
        }

        pub fn stop(mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            if let Some(r) = self.reader.take() {
                let _ = r.join();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JSON: &str = r#"[
      {"index":71,"source":55,"corked":false,"properties":{"application.name":"Firefox","application.process.id":"4242"}},
      {"index":72,"source":56,"corked":false,"properties":{"application.name":"pavucontrol","application.process.id":"77"}},
      {"index":73,"source":60,"corked":false,"properties":{"application.name":"parec","application.process.id":"88"}}
    ]"#;

    #[test]
    fn reads_pactl_json() {
        let outs = parse_source_outputs_json(JSON).unwrap();
        assert_eq!(outs.len(), 3);
        assert_eq!(outs[0].pid, Some(4242));
        assert_eq!(outs[0].source, Some(55));
        assert_eq!(outs[0].app, "Firefox");
    }

    #[test]
    fn reads_pactl_text() {
        let text = "Source Output #71\n\tDriver: protocol-native.c\n\tSource: 55\n\tCorked: no\n\tProperties:\n\t\tapplication.name = \"zoom\"\n\t\tapplication.process.id = \"999\"\nSource Output #72\n\tSource: 3\n\tCorked: yes\n";
        let outs = parse_source_outputs_text(text);
        assert_eq!(outs.len(), 2);
        assert_eq!(outs[0].pid, Some(999));
        assert_eq!(outs[0].app, "zoom");
        assert!(outs[1].corked);
    }

    #[test]
    fn tells_a_call_from_meters_monitors_and_ourselves() {
        let short = "55\talsa_input.usb-mic\tPipeWire\ts16le 1ch 48000Hz\tRUNNING\n60\talsa_output.pci.analog-stereo.monitor\tPipeWire\tfloat32le 2ch 48000Hz\tRUNNING\n";
        let monitors = monitor_sources(short);
        assert_eq!(monitors, vec![60]);
        let outs = parse_source_outputs_json(JSON).unwrap();
        assert!(someone_else_recording(&outs, &monitors, 1));
        // Firefox is us: only the meter and the monitor recorder remain.
        assert!(!someone_else_recording(&outs, &monitors, 4242));
    }

    #[test]
    fn decodes_float_samples_across_reads() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&0.5f32.to_le_bytes());
        buf.extend_from_slice(&(-1.0f32).to_le_bytes()[..2]);
        assert_eq!(take_samples(&mut buf), vec![0.5]);
        assert_eq!(buf.len(), 2);
        buf.extend_from_slice(&(-1.0f32).to_le_bytes()[2..]);
        assert_eq!(take_samples(&mut buf), vec![-1.0]);
        assert!(buf.is_empty());
    }
}
