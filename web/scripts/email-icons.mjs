// Renders the email feature icons into web/public/email/ from the app's own
// icon set: lucide (lucide-react in the repo root, as src/ uses it), same
// glyphs, round caps, one thin stroke.
//
//   node web/scripts/email-icons.mjs        (from the repo root; uses the root
//                                             node_modules: lucide-react, playwright,
//                                             and the installed Google Chrome)
//
// Each icon is a quiet glass tile, 34px with a 9px radius and a hairline border,
// near-transparent fill, the glyph at 18px in muted ink with stroke 1.75 (the
// app's lucide weight; the site's 1.25 on a 16px grid is the same optical
// weight). icon-<name>.png is the light-scheme tile, icon-<name>-dark.png the
// dark one; the email swaps them by prefers-color-scheme. Rendered at 2x.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../public/email");
const require = createRequire(resolve(here, "../../package.json"));

/** Email icon name → lucide icon. */
const ICONS = {
  ask: "message-circle",
  wave: "audio-lines",
  mic: "mic",
  calendar: "calendar",
  shield: "shield-check",
  key: "key-round",
  mail: "mail",
  download: "download",
  refresh: "refresh-cw",
  heart: "heart",
  book: "book-open",
  sparkle: "sparkles",
};

const TILE = 34;
const GLYPH = 18;
const STROKE = 1.75;
const SCHEMES = {
  light: { suffix: "", fill: "rgba(10,10,14,0.025)", border: "rgba(10,10,14,0.10)", ink: "#55555b" },
  dark: { suffix: "-dark", fill: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.12)", ink: "#a9a9b1" },
};

const lucideDir = dirname(require.resolve("lucide-react/package.json"));
const svgFor = async (name, ink) => {
  const mod = await import(resolve(lucideDir, "dist/esm/icons", `${name}.js`));
  const body = mod.__iconNode
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH}" height="${GLYPH}" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};

const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 200, height: 200 } });
mkdirSync(OUT, { recursive: true });

for (const [scheme, s] of Object.entries(SCHEMES)) {
  for (const [name, lucide] of Object.entries(ICONS)) {
    const svg = await svgFor(lucide, s.ink);
    await page.setContent(
      `<html><body style="margin:0;background:transparent">
<div id="t" style="width:${TILE}px;height:${TILE}px;box-sizing:border-box;border-radius:9px;background:${s.fill};border:0.5px solid ${s.border};display:flex;align-items:center;justify-content:center">${svg}</div>
</body></html>`,
    );
    await page.locator("#t").screenshot({ path: resolve(OUT, `icon-${name}${s.suffix}.png`), omitBackground: true });
  }
  console.log(`${scheme}: ${Object.keys(ICONS).length} icons`);
}
await browser.close();
