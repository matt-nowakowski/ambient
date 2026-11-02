// Music bed (ElevenLabs music, composition plan so each section lands on a known second).
//   node scripts/music.mjs  -> public/music/bed.mp3
// v3: between v1 (EDM, 120) and v2 (zen, 80): a tight, warm modern tech-launch
// groove at 100 BPM (a beat is 0.6 s, a bar 2.4 s). Section edges match the cut
// in src/beats.ts (in beats): intro 0-8, groove 8-36, breakdown 36-42 (Hey
// Ambient), fuller groove 42-82, a riser 82-88 under the end of privacy, the lift on the logo
// 88-104, a lighter bar, then a final warm hit at beat 110 and a clean tail.
// (v1: bed-v1.mp3, v2: bed-v2.mp3 are kept.)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const key = (process.env.ELEVENLABS_API_KEY || fs.readFileSync(path.join(os.homedir(), ".ambient/elevenlabs.key"), "utf8")).trim();

const g = [
  "modern tech product launch music",
  "100 BPM",
  "tight warm groove",
  "punchy but soft kick and crisp claps",
  "warm round bass",
  "plucked synth arpeggios",
  "lush warm pads",
  "confident, optimistic, calm and premium",
  "instrumental",
];
const B = 600; // one beat in ms
const plan = {
  positive_global_styles: g,
  negative_global_styles: ["vocals", "lyrics", "EDM", "big room", "dubstep", "aggressive", "harsh bright hi-hats", "distorted", "trap", "lo-fi", "orchestral"],
  sections: [
    { section_name: "Intro", positive_local_styles: ["filtered plucks on every beat", "soft kick enters on the fifth beat", "building"], negative_local_styles: ["full groove"], duration_ms: 8 * B, lines: [] },
    { section_name: "Groove", positive_local_styles: ["tight warm groove", "kick and soft claps on two and four", "warm bass", "plucked arpeggio", "steady drive"], negative_local_styles: ["breakdown"], duration_ms: 28 * B, lines: [] },
    { section_name: "Breakdown", positive_local_styles: ["drums drop out", "warm pad and a single pluck motif", "intimate, a held breath"], negative_local_styles: ["kick"], duration_ms: 6 * B, lines: [] },
    { section_name: "Groove 2", positive_local_styles: ["groove returns fuller", "kick, claps, shaker", "warm bass line", "pads widen", "uplifting drive"], negative_local_styles: ["breakdown", "harsh"], duration_ms: 40 * B, lines: [] },
    { section_name: "Riser", positive_local_styles: ["drums stop", "soft filtered riser", "tension before the lift"], negative_local_styles: ["kick"], duration_ms: 6 * B, lines: [] },
    { section_name: "Lift", positive_local_styles: ["the lift lands on the first beat with a warm bright chord", "full groove", "anthemic but tasteful", "big warm pads"], negative_local_styles: ["quiet", "EDM drop"], duration_ms: 16 * B, lines: [] },
    { section_name: "Settle", positive_local_styles: ["groove thins to kick and plucks", "warm"], negative_local_styles: ["new melody"], duration_ms: 6 * B, lines: [] },
    { section_name: "Button", positive_local_styles: ["one final warm chord hit on the first beat", "then a short clean reverb tail", "ends cleanly"], negative_local_styles: ["fade in", "new melody", "drums after the hit"], duration_ms: 6 * B, lines: [] },
  ],
};

const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ composition_plan: plan }),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const out = process.argv[2] || path.join(root, "public/music/bed.mp3");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
console.log("wrote", path.relative(root, out));
