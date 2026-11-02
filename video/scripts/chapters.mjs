// Writes out/chapters.json ([{title, start}] in seconds) from src/beats.ts.
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const src = fs.readFileSync(path.join(root, "src/beats.ts"), "utf8");
const num = (name) => Number(src.match(new RegExp(`${name} = ([\\d.]+)`))[1]);
const BPM = num("BPM");
const FIRST = num("FIRST_BEAT");
const END = num("END_BEAT");
const block = src.slice(src.indexOf("CHAPTERS"));
const chapters = [...block.matchAll(/\["([^"]+)", ([\d.]+)\]/g)].map(([, title, b]) => ({
  title,
  start: +(Number(b) === 0 ? 0 : FIRST + (Number(b) * 60) / BPM).toFixed(2),
}));
fs.mkdirSync(path.join(root, "out"), { recursive: true });
fs.writeFileSync(path.join(root, "out/chapters.json"), JSON.stringify(chapters, null, 2) + "\n");
console.log(chapters, "duration", (FIRST + (END * 60) / BPM).toFixed(2) + "s");
