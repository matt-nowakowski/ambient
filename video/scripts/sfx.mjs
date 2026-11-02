// Sound effects (ElevenLabs sound generation), same key as scripts/voice.mjs; never printed.
//   node scripts/sfx.mjs [ids...]  -> public/sfx/<id>.mp3
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const key = (process.env.ELEVENLABS_API_KEY || fs.readFileSync(path.join(os.homedir(), ".ambient/elevenlabs.key"), "utf8")).trim();

export const SFX = {
  click: { text: "A single soft, subtle UI click, like a premium trackpad click on a Mac. Clean, quiet, short, dry, no reverb.", duration: 0.5 },
  tap: { text: "A single gentle soft tap on a glass touch surface, muted, warm, very short, minimal UI sound.", duration: 0.5 },
  typing: { text: "Quiet, soft typing on a modern low-profile laptop keyboard, steady relaxed pace, close and intimate, no room noise.", duration: 3 },
  whoosh: { text: "A very soft, airy, slow whoosh transition, like a breath of wind, smooth and gentle, subtle, cinematic UI.", duration: 1.2 },
  swish: { text: "Soft short airy swoosh of a card sliding into view, smooth breathy wind, gentle fade in and fade out, no impact.", duration: 0.8 },
  chime: { text: "Clear, present, warm crystal singing-bowl chime, one bright bell strike with a long shimmering tail, serene, like a smart device gently waking up.", duration: 2.5 },
  logo: { text: "A warm, elegant, soft sonic logo: two gentle bell and felt-piano tones rising, with an airy shimmering tail, calm and premium.", duration: 3 },
  pop: { text: "One single soft rounded marimba-like notification blip, gentle, warm, very short, a single note only.", duration: 0.5 },
};

const ids = process.argv.slice(2);
const dir = path.join(root, "public/sfx");
fs.mkdirSync(dir, { recursive: true });
for (const id of ids.length ? ids : Object.keys(SFX)) {
  const s = SFX[id];
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: s.text, duration_seconds: s.duration, prompt_influence: 0.6 }),
  });
  if (!res.ok) { console.error(id, res.status, (await res.text()).slice(0, 300)); continue; }
  fs.writeFileSync(path.join(dir, `${id}.mp3`), Buffer.from(await res.arrayBuffer()));
  console.log("wrote sfx", id);
}
