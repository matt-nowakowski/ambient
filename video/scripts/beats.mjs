// Tempo and onset check for the bed: afconvert -f WAVE -d LEI16@22050 -c 1 public/music/bed.mp3 /tmp/bed.wav && node scripts/beats.mjs /tmp/bed.wav
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
// find data chunk
let off = 12, data;
while (off < buf.length) { const id = buf.toString("ascii", off, off + 4); const n = buf.readUInt32LE(off + 4); if (id === "data") { data = buf.subarray(off + 8, off + 8 + n); break; } off += 8 + n; }
const sr = 22050, hop = 256;
const N = data.length / 2;
const frames = Math.floor(N / hop);
const env = new Float64Array(frames);
// low-band-ish energy: simple one-pole lowpass then rectify
let lp = 0;
for (let i = 0; i < frames; i++) { let e = 0; for (let j = 0; j < hop; j++) { const x = data.readInt16LE((i * hop + j) * 2) / 32768; lp += 0.08 * (x - lp); e += lp * lp; } env[i] = Math.sqrt(e / hop); }
const flux = new Float64Array(frames);
for (let i = 1; i < frames; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
const fps = sr / hop;
// per-second rms summary
const rms = []; for (let s = 0; s < frames / fps; s++) { let m = 0; for (let i = Math.floor(s * fps); i < Math.min(frames, Math.floor((s + 1) * fps)); i++) m = Math.max(m, env[i]); rms.push(m.toFixed(2)); }
console.log("dur", (N / sr).toFixed(2), "peak env per s:", rms.join(" "));
// tempo-locked phase search for 120 BPM (and nearby)
for (const bpm of [118, 120, 122, 124, 126, 128]) {
  const per = (60 / bpm) * fps; let best = [0, -1];
  for (let ph = 0; ph < per; ph += 0.25) { let s = 0; for (let k = ph; k < frames; k += per) s += flux[Math.round(k)] || 0; if (s > best[1]) best = [ph, s]; }
  console.log(bpm, "phase s", (best[0] / fps).toFixed(3), "score", best[1].toFixed(2));
}
// strongest onsets
const peaks = []; for (let i = 2; i < frames - 2; i++) if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1]) peaks.push([i / fps, flux[i]]);
peaks.sort((a, b) => b[1] - a[1]);
console.log("top onsets", peaks.slice(0, 30).map((p) => p[0].toFixed(2)).sort((a, b) => a - b).join(" "));
const half = []; for (let s = 0; s < frames / fps; s += 0.5) { let m = 0, c = 0; for (let i = Math.floor(s * fps); i < Math.min(frames, Math.floor((s + 0.5) * fps)); i++) { m += env[i]; c++; } half.push(`${s.toFixed(1)}:${(m / c).toFixed(2)}`); }
console.log(half.join(" "));
