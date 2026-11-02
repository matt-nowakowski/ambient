// Copies the repo-level brand.config.json (single source of truth) into
// web/lib/brand.config.json so Next/Turbopack can import it from inside the
// project root. Runs automatically before `dev` and `build`.
// If the parent file is not available (e.g. web/ deployed on its own), the
// existing committed copy is used as-is.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../brand.config.json");
const target = resolve(here, "../lib/brand.config.json");

if (!existsSync(source)) {
  if (!existsSync(target)) {
    console.error(`[sync-brand] Missing ${source} and no local copy at ${target}`);
    process.exit(1);
  }
  console.log("[sync-brand] ../../brand.config.json not found; using lib/brand.config.json as-is");
  process.exit(0);
}

const json = readFileSync(source, "utf8");
JSON.parse(json); // fail loudly on invalid JSON
const current = existsSync(target) ? readFileSync(target, "utf8") : "";
if (current !== json) {
  writeFileSync(target, json);
  console.log("[sync-brand] Updated lib/brand.config.json from ../brand.config.json");
} else {
  console.log("[sync-brand] lib/brand.config.json is up to date");
}
