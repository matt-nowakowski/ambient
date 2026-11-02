// Voiceover generator (ElevenLabs). Reads the key from ~/.ambient/elevenlabs.key
// (or ELEVENLABS_API_KEY) and never prints it.
//   node scripts/voice.mjs samples          -> out/voice-samples/<voice>.mp3
//   node scripts/voice.mjs scenes [ids...]  -> public/vo/<id>.mp3 + <id>.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LINES } from "../src/lines.mjs";

/** The narrator. Change this one constant and re-run `scenes` to re-voice. */
export const VOICE_ID = process.env.VOICE_ID || "pFZP5JQG7iQjIQuC4Bku"; // Lily
const MODEL = process.env.VOICE_MODEL || "eleven_v4";
const SETTINGS = { stability: 0.42, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.06 };

const SAMPLE_VOICES = {
  sarah: "EXAVITQu4vr4xnSDxMaL",
  lily: "pFZP5JQG7iQjIQuC4Bku",
  matilda: "XrExE9yKIg1WjnnlVkGX",
};

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const key = (process.env.ELEVENLABS_API_KEY || fs.readFileSync(path.join(os.homedir(), ".ambient/elevenlabs.key"), "utf8")).trim();

async function tts(voiceId, text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** Characters -> words with start/end seconds. */
function words(al) {
  const out = [];
  let cur = null;
  al.characters.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) out.push(cur); cur = null; return; }
    if (!cur) cur = { w: "", start: al.character_start_times_seconds[i], end: 0 };
    cur.w += c;
    cur.end = al.character_end_times_seconds[i];
  });
  if (cur) out.push(cur);
  return out;
}

const [mode, ...ids] = process.argv.slice(2);
if (mode === "samples") {
  const dir = path.join(root, "out/voice-samples");
  fs.mkdirSync(dir, { recursive: true });
  const text = Object.values(LINES).slice(0, 5).join(" ");
  for (const [name, id] of Object.entries(SAMPLE_VOICES)) {
    const r = await tts(id, text);
    fs.writeFileSync(path.join(dir, `${name}.mp3`), Buffer.from(r.audio_base64, "base64"));
    console.log("sample", name, text.length, "chars");
  }
} else if (mode === "scenes") {
  const dir = path.join(root, "public/vo");
  fs.mkdirSync(dir, { recursive: true });
  for (const id of ids.length ? ids : Object.keys(LINES)) {
    const r = await tts(VOICE_ID, LINES[id]);
    fs.writeFileSync(path.join(dir, `${id}.mp3`), Buffer.from(r.audio_base64, "base64"));
    const w = words(r.alignment);
    const duration = w.length ? w[w.length - 1].end : 0;
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, text: LINES[id], duration, words: w }, null, 1));
    console.log(id, duration.toFixed(2) + "s", LINES[id].length, "chars");
  }
} else {
  console.log("usage: node scripts/voice.mjs samples | scenes [ids...]");
}
