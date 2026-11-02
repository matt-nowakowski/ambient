// Music bed (ElevenLabs music, composition plan so each section lands on a known second).
//   node scripts/music.mjs  -> public/music/bed.mp3
// v2: serene and airy, 80 BPM (a beat is 0.75 s, a bar 3 s). Section edges match
// the cut in src/beats.ts: breakdown at 24 s (Hey Ambient), lift from 30 s, swell
// into the logo at 54 s, a resolving chord, then a ringing tail to 64.5 s.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const key = (process.env.ELEVENLABS_API_KEY || fs.readFileSync(path.join(os.homedir(), ".ambient/elevenlabs.key"), "utf8")).trim();

const g = [
  "serene ambient electronica",
  "80 BPM",
  "soft warm analog pads",
  "gentle felt piano",
  "delicate plucked arpeggios on the beat",
  "airy, spacious, calm, hopeful",
  "warm and intimate",
  "modern premium product film",
  "instrumental",
];
const plan = {
  positive_global_styles: g,
  negative_global_styles: ["vocals", "lyrics", "EDM", "four-on-the-floor", "drops", "big drums", "claps", "dubstep", "aggressive", "distorted", "trap hi-hats", "orchestral hits"],
  sections: [
    { section_name: "Dawn", positive_local_styles: ["warm pad swells in from silence", "a single soft piano note on the downbeat", "airy shimmer"], negative_local_styles: ["drums"], duration_ms: 6000, lines: [] },
    { section_name: "Flow", positive_local_styles: ["gentle plucked arpeggio pulse on every beat", "soft felt piano melody", "light brushed shaker", "slowly building warmth"], negative_local_styles: ["kick drum", "loud"], duration_ms: 18000, lines: [] },
    { section_name: "Breath", positive_local_styles: ["breakdown", "everything falls away to a sustained pad", "sparse high piano notes", "intimate and quiet"], negative_local_styles: ["percussion", "pulse"], duration_ms: 6000, lines: [] },
    { section_name: "Lift", positive_local_styles: ["the pulse returns fuller", "soft muted kick on beats one and three", "warm bass", "piano chords", "gentle uplifting motion"], negative_local_styles: ["aggressive", "loud drums"], duration_ms: 18000, lines: [] },
    { section_name: "Swell", positive_local_styles: ["gentle rising swell", "pads open up", "soft reverse cymbal into the next section", "anticipation"], negative_local_styles: ["snare roll", "white noise riser"], duration_ms: 6000, lines: [] },
    { section_name: "Resolve", positive_local_styles: ["a warm resolving major chord on the first beat", "piano and pads together", "glowing, complete"], negative_local_styles: ["drop", "new melody"], duration_ms: 6000, lines: [] },
    { section_name: "Tail", positive_local_styles: ["the final chord rings out", "soft reverb tail", "fades to silence"], negative_local_styles: ["new notes", "percussion"], duration_ms: 4500, lines: [] },
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
