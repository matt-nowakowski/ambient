#!/usr/bin/env bun
/**
 * Applies `brand.config.json` to every file that can't read it at runtime:
 * Tauri config, Cargo.toml, the NSIS installer, Nix, CI workflows, docs.
 *
 * Code that *can* read the config does so directly and is untouched here:
 *   - UI strings use `{{appName}}` (src/i18n/index.ts default variable)
 *   - React imports `BRAND` from src/lib/brand.ts
 *   - Rust uses `env!("BRAND_NAME")` etc., emitted by src-tauri/build.rs
 *   - The website imports web/lib/brand.ts
 *
 * `brand.lock.json` records the brand last applied, so this script knows what
 * to replace. Usage:
 *   bun run brand          apply brand.config.json
 *   bun run brand --check  exit 1 if brand.config.json hasn't been applied
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CONFIG_PATH = join(ROOT, "brand.config.json");
const LOCK_PATH = join(ROOT, "brand.lock.json");

type Applied = {
  name: string;
  slug: string;
  identifier: string;
  domain: string;
  githubRepo: string;
};

const KEYS: (keyof Applied)[] = [
  "name",
  "slug",
  "identifier",
  "domain",
  "githubRepo",
];

const pick = (o: Record<string, unknown>): Applied =>
  Object.fromEntries(KEYS.map((k) => [k, String(o[k])])) as Applied;

const next = pick(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
const prev: Applied = existsSync(LOCK_PATH)
  ? pick(JSON.parse(readFileSync(LOCK_PATH, "utf8")))
  : next;

if (!/^[a-z][a-z0-9]*$/.test(next.slug)) {
  console.error(
    `brand.config.json: slug "${next.slug}" must be lowercase letters/digits (it becomes the binary and crate name).`,
  );
  process.exit(1);
}
if (!/^[A-Za-z][A-Za-z0-9 ]*$/.test(next.name)) {
  console.error(
    `brand.config.json: name "${next.name}" must be letters, digits and spaces.`,
  );
  process.exit(1);
}

const check = process.argv.includes("--check");
const changed = KEYS.filter((k) => prev[k] !== next[k]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const upper = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "_");
// A name with spaces can't be part of an identifier (UtterPasteProvider).
const ident = (s: string) => s.replace(/[^A-Za-z0-9]/g, "");

type Rule = [RegExp, string];

/** Rules turning brand `from` into `to`, most specific first. */
const brandRules = (from: Applied, to: Applied, name = to.name): Rule[] => [
  [new RegExp(escape(from.identifier), "g"), to.identifier],
  ...(from.githubRepo
    ? ([[new RegExp(escape(from.githubRepo), "g"), to.githubRepo]] as Rule[])
    : []),
  [new RegExp(escape(from.domain), "g"), to.domain],
  [new RegExp(`\\b${upper(from.slug)}_`, "g"), `${upper(to.slug)}_`],
  [new RegExp(`__${upper(from.slug)}_`, "g"), `__${upper(to.slug)}_`],
  [new RegExp(`\\b${escape(ident(from.name))}(?=[A-Z])`, "g"), ident(to.name)],
  [new RegExp(`\\b${escape(from.name)}(?=_)`, "g"), ident(to.name)],
  [new RegExp(`\\b${escape(from.name)}\\b`, "g"), name],
  [new RegExp(`\\b${escape(from.slug)}(?=_app_lib|_test_)`, "g"), to.slug],
  [new RegExp(`\\b${escape(from.slug)}\\b`, "g"), to.slug],
];

const apply = (line: string, rules: Rule[]) => {
  let out = line;
  for (const [re, to] of rules) out = out.replace(re, to);
  return out;
};

const LOCALES = /^src\/i18n\/locales\//;
// Never rewritten.
const SKIP = [
  /^brand\.(config|lock)\.json$/,
  /^scripts\/apply-brand\.ts$/,
  /(^|\/)(Cargo\.lock|bun\.lock|package-lock\.json|catalog\.json)$/,
  /^LICENSE$/,
  /(^|\/)(node_modules|\.next|target|dist)\//,
  /\.(png|ico|icns|jpg|jpeg|gif|webp|woff2?|ttf|otf|wav|mp3|gguf|bin|onnx|lock)$/,
];
const files = execSync("git ls-files --cached --others --exclude-standard", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f && !SKIP.some((re) => re.test(f)))
  .filter((f) => existsSync(join(ROOT, f)));

const pending: string[] = [];
for (const file of files) {
  const path = join(ROOT, file);
  const buf = readFileSync(path);
  if (buf.includes(0)) continue; // binary
  const before = buf.toString("utf8");
  // Locales say {{appName}} (filled at runtime); only env var names
  // (UTTER_…) are literal there.
  const locale = LOCALES.test(file);
  const renameRules = !changed.length
    ? []
    : locale
      ? brandRules(prev, next).filter(([re]) => re.source.endsWith("_"))
      : brandRules(prev, next);
  if (!renameRules.length) continue;
  const after = before
    .split("\n")
    .map((line) => apply(line, renameRules))
    .join("\n");
  if (after !== before) {
    pending.push(file);
    if (!check) writeFileSync(path, after);
  }
}

if (check) {
  if (changed.length || pending.length) {
    if (changed.length)
      console.error(
        `brand.config.json changed (${changed.join(", ")}) but wasn't applied.`,
      );
    for (const f of pending) console.error(`  stale brand name in ${f}`);
    console.error("Run: bun run brand");
    process.exit(1);
  }
  console.log(`Brand "${next.name}" is applied everywhere.`);
  process.exit(0);
}

writeFileSync(LOCK_PATH, JSON.stringify(next, null, 2) + "\n");
for (const f of pending) console.log(`  ${f}`);
console.log(
  changed.length
    ? `\nApplied "${prev.name}" → "${next.name}" in ${pending.length} files.`
    : `\nBrand "${next.name}" is applied; normalized ${pending.length} files.`,
);
if (prev.identifier !== next.identifier)
  console.log(
    "Note: the bundle identifier changed, so the app's data directory moves; existing users start fresh.",
  );
