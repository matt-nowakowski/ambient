// Renders the campaign creative into out/campaign/<concept>/<format>[-dark].(png|mp4):
// every format as a PNG of the last frame (light and dark), and the IG story
// as an H.264 MP4 (light). One bundle, one browser, then a contact sheet.
//
//   node scripts/campaign.mjs                 # everything
//   node scripts/campaign.mjs nudge ask       # some concepts
//   STILLS_ONLY=1 node scripts/campaign.mjs   # skip the videos
//   FORMATS=story,x node scripts/campaign.mjs # some formats
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "out", "campaign");
const CONCEPTS = ["nudge", "language", "ask", "notes", "remind", "free"];
const FORMATS = ["story", "feed", "x", "linkedin", "web", "email"];
const THEMES = ["light", "dark"];

const pick = process.argv.slice(2).filter((a) => CONCEPTS.includes(a));
const concepts = pick.length ? pick : CONCEPTS;
const formats = process.env.FORMATS ? process.env.FORMATS.split(",") : FORMATS;
const videos = !process.env.STILLS_ONLY;

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.ts") });
const browser = await openBrowser("chrome", { browserExecutable: process.env.REMOTION_CHROME ?? null });
const mb = (p) => (statSync(p).size / 1e6).toFixed(2);

try {
  for (const concept of concepts) {
    mkdirSync(path.join(out, concept), { recursive: true });
    for (const format of formats) {
      for (const theme of THEMES) {
        const inputProps = { concept, theme, still: true };
        const composition = await selectComposition({ serveUrl, id: `Campaign-${format}`, inputProps, puppeteerInstance: browser });
        const name = `${format}${theme === "dark" ? "-dark" : ""}`;
        const png = path.join(out, concept, `${name}.png`);
        await renderStill({ serveUrl, composition, inputProps, output: png, frame: composition.durationInFrames - 1, imageFormat: "png", puppeteerInstance: browser });
        console.log(`${png}  ${mb(png)} MB`);
        if (videos && format === "story" && theme === "light") {
          const mp4 = path.join(out, concept, `${name}.mp4`);
          // a composition of its own: selectComposition bakes the still's props into it
          const motion = await selectComposition({ serveUrl, id: `Campaign-${format}`, inputProps: { concept, theme }, puppeteerInstance: browser });
          await renderMedia({
            serveUrl,
            composition: motion,
            inputProps: { concept, theme },
            codec: "h264",
            videoBitrate: "8M",
            pixelFormat: "yuv420p",
            imageFormat: "jpeg",
            jpegQuality: 92,
            muted: true,
            concurrency: 6,
            outputLocation: mp4,
            puppeteerInstance: browser,
          });
          console.log(`${mp4}  ${mb(mp4)} MB`);
        }
      }
    }
  }
} finally {
  await browser.close({ silent: true });
}

execFileSync("python3", [path.join(root, "scripts", "contact-sheet.py"), out], { stdio: "inherit" });
