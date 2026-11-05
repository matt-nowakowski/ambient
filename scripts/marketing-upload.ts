// Creator videos for the marketing suite (/admin/marketing and the media kit).
// The website never uploads or holds R2 keys: you run this on your own machine
// with the key in ~/.ambient/r2-ambient.env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, optional R2_BUCKET and R2_ENDPOINT). Never run from CI
// or the site.
//
//   bun scripts/marketing-upload.ts <file> --title "…" [--notes "…"]
//       [--kind clip|b-roll|screen|other] [--orientation horizontal|vertical|square]
//       [--dry-run]
//   bun scripts/marketing-upload.ts --campaign <dir> [--dry-run]
//   bun scripts/marketing-upload.ts --list
//   bun scripts/marketing-upload.ts --remove <id>
//   bun scripts/marketing-upload.ts --set-attachment media/<key>
//
// An upload goes to marketing/<slug>-<id>.<ext> with its Content-Type,
// Content-Disposition: attachment (a plain link downloads; <video> still
// plays it) and a year-long immutable cache. With ffmpeg installed it also
// uploads a poster frame and records the duration. Then it rewrites
// marketing/manifest.json (no-cache), which the site reads within ~5 minutes.
// The marketing/ budget is 1 GB in all (the bucket is shared with releases),
// counted from the manifest.
//
// --campaign uploads a whole campaign render (video/out/campaign):
// <dir>/<concept>/<format>[-<lang>][-dark].(png|mp4) (no language suffix
// is English, e.g. story-pl-dark.png is Polish), plus an optional
// <dir>/contact-sheet.png. Each file goes to a stable key,
// marketing/campaign-<concept>-<format>[-dark].<ext>, as kind "campaign"
// with concept, format, theme and its pixel size; story.mp4 uses story.png
// (same theme) as its poster. Re-running replaces the same keys and manifest
// entries, so those files get a short cache instead of an immutable one.
//
// --set-attachment re-uploads an existing object (e.g. the launch videos in
// media/) with Content-Disposition: attachment, keeping its type and cache
// headers, so download buttons that link to it save the file.
//
// Writes go through a presigned PUT with plain headers: Bun's S3Client
// (1.2.x) drops contentDisposition on write and has no Cache-Control option
// or server-side copy.
import { S3Client } from "bun";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";

const PREFIX = "marketing/";
const MANIFEST = `${PREFIX}manifest.json`;
/** Decimal units, like R2's billing (web/lib/marketing/creator.ts). */
const BUDGET_BYTES = 1_000_000_000;
const KINDS = ["clip", "b-roll", "screen", "other"] as const;
const ORIENTATIONS = ["horizontal", "vertical", "square"] as const;
const FILE_CACHE = "public, max-age=31536000, immutable";
const MANIFEST_CACHE = "no-cache, max-age=0";
/** Campaign keys are reused on every re-render, so they can't be immutable. */
const CAMPAIGN_CACHE = "public, max-age=600";
/** Mirrors CAMPAIGN_CONCEPTS / CAMPAIGN_FORMATS in web/lib/marketing/creator.ts. */
const CONCEPTS: Record<string, string> = {
  nudge: "It nudges you",
  language: "Any language",
  ask: "Ask anything",
  notes: "Notes for any call",
  remind: "Remind me",
  free: "Free, on your computer",
};
const FORMATS: Record<string, string> = {
  story: "IG story",
  feed: "IG feed",
  x: "X banner",
  linkedin: "LinkedIn / X post",
  web: "Website banner",
  email: "Email banner",
};
const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

type Item = {
  id: string;
  title: string;
  notes: string;
  kind: (typeof KINDS)[number] | "campaign";
  orientation: (typeof ORIENTATIONS)[number];
  file: string;
  poster?: string;
  bytes: number;
  poster_bytes?: number;
  duration_s?: number;
  // campaign items only
  concept?: string;
  format?: string;
  theme?: "light" | "dark";
  lang?: string;
  width?: number;
  height?: number;
};
type Manifest = { updated: string; items: Item[] };

const { values: opts, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    title: { type: "string" },
    notes: { type: "string" },
    kind: { type: "string" },
    orientation: { type: "string" },
    list: { type: "boolean" },
    remove: { type: "string" },
    "set-attachment": { type: "string" },
    "dry-run": { type: "boolean" },
    campaign: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** The R2 key file; MARKETING_R2_ENV points elsewhere (e.g. a missing path for an offline --dry-run). */
const envPath = () =>
  process.env.MARKETING_R2_ENV || join(homedir(), ".ambient", "r2-ambient.env");

let client: S3Client | null = null;
async function s3() {
  if (client) return client;
  const path = envPath();
  let raw: string;
  try {
    raw = await Bun.file(path).text();
  } catch {
    fail(`Can't read ${path}.`);
  }
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = /^\s*(?:export\s+)?(R2_\w+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const missing = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ].filter((k) => !env[k]);
  if (missing.length) fail(`${path} is missing ${missing.join(", ")}.`);
  client = new S3Client({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint:
      env.R2_ENDPOINT ||
      `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    bucket: env.R2_BUCKET || "ambient-builds",
  });
  return client;
}

/** PUT through a presigned URL (only `host` is signed) so plain headers stick. */
async function put(
  key: string,
  body: Blob | string,
  headers: Record<string, string>,
) {
  const url = (await s3()).presign(key, { method: "PUT", expiresIn: 3600 });
  const res = await fetch(url, { method: "PUT", body, headers });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    fail(`R2 refused PUT ${key}: HTTP ${res.status} ${detail}`);
  }
}

async function readManifest(): Promise<Manifest> {
  const f = (await s3()).file(MANIFEST);
  if (!(await f.exists()))
    return { updated: new Date().toISOString(), items: [] };
  const m = (await f.json()) as Partial<Manifest>;
  return {
    updated: m.updated ?? new Date().toISOString(),
    items: Array.isArray(m.items) ? m.items : [],
  };
}

async function writeManifest(m: Manifest) {
  m.updated = new Date().toISOString();
  await put(MANIFEST, JSON.stringify(m, null, 2) + "\n", {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": MANIFEST_CACHE,
  });
}

const used = (m: Manifest) =>
  m.items.reduce((a, i) => a + (i.bytes || 0) + (i.poster_bytes || 0), 0);
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function slugify(s: string) {
  return (
    s
      .normalize("NFKD")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "video"
  );
}

/** Width, height and duration via ffprobe, when it's installed. */
function probe(file: string) {
  if (!Bun.which("ffprobe")) return null;
  const r = Bun.spawnSync([
    "ffprobe",
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    file,
  ]);
  if (r.exitCode !== 0) return null;
  try {
    const j = JSON.parse(r.stdout.toString()) as {
      streams?: { width?: number; height?: number }[];
      format?: { duration?: string };
    };
    const s = j.streams?.[0];
    const d = Number(j.format?.duration);
    return {
      width: s?.width ?? 0,
      height: s?.height ?? 0,
      duration: Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : null,
    };
  } catch {
    return null;
  }
}

/** A JPEG frame from ~1 s in (or the start of a short clip), max 1280 wide. */
function poster(file: string, dir: string, duration: number | null) {
  if (!Bun.which("ffmpeg")) return null;
  const out = join(dir, "poster.jpg");
  const at = duration && duration < 2 ? "0" : "1";
  const r = Bun.spawnSync([
    "ffmpeg",
    "-v",
    "error",
    "-y",
    "-ss",
    at,
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-q:v",
    "3",
    out,
  ]);
  return r.exitCode === 0 ? out : null;
}

function orientationOf(p: { width: number; height: number } | null) {
  if (!p?.width || !p.height) return null;
  const r = p.width / p.height;
  return r > 1.1 ? "horizontal" : r < 0.9 ? "vertical" : "square";
}

async function upload(path: string) {
  let size: number;
  try {
    const st = statSync(path);
    if (!st.isFile()) fail(`${path} is not a file.`);
    size = st.size;
  } catch {
    fail(`Can't read ${path}.`);
  }
  const ext = extname(path).toLowerCase();
  const type = TYPES[ext];
  if (!type)
    fail(
      `Unsupported file type ${ext || "(none)"}; one of ${Object.keys(TYPES).join(" ")}.`,
    );
  if (size === 0) fail("That file is empty.");
  const title = (opts.title ?? "").trim();
  if (!title) fail("--title is required.");
  const kind = (opts.kind ?? "clip") as Item["kind"];
  if (!KINDS.includes(kind)) fail(`--kind is one of ${KINDS.join(", ")}.`);
  if (
    opts.orientation &&
    !ORIENTATIONS.includes(opts.orientation as Item["orientation"])
  )
    fail(`--orientation is one of ${ORIENTATIONS.join(", ")}.`);

  const isVideo = type.startsWith("video/");
  const info = isVideo ? probe(path) : null;
  const orientation = (opts.orientation ??
    orientationOf(info) ??
    "horizontal") as Item["orientation"];
  const id = randomBytes(4).toString("hex").slice(0, 6);
  const name = `${slugify(title)}-${id}${ext === ".jpeg" ? ".jpg" : ext}`;
  const key = `${PREFIX}${name}`;

  const tmp = mkdtempSync(join(tmpdir(), "marketing-upload-"));
  try {
    const posterPath = isVideo
      ? poster(path, tmp, info?.duration ?? null)
      : null;
    const posterBytes = posterPath ? statSync(posterPath).size : 0;

    const manifest = opts["dry-run"]
      ? await readManifest().catch(
          () => ({ updated: "", items: [] }) as Manifest,
        )
      : await readManifest();
    const before = used(manifest);
    const after = before + size + posterBytes;
    console.log(
      `${basename(path)} → ${key} (${mb(size)}, ${type}, ${kind}, ${orientation}${info?.duration ? `, ${info.duration}s` : ""})`,
    );
    console.log(
      posterPath
        ? `poster: ${mb(posterBytes)}`
        : isVideo
          ? "poster: none (install ffmpeg for one)"
          : "poster: n/a",
    );
    console.log(
      `budget: ${mb(after)} of ${mb(BUDGET_BYTES)} after this upload`,
    );
    if (after > BUDGET_BYTES)
      fail(
        `Over the 1 GB marketing budget (${mb(before)} used). Remove something first: --list, --remove <id>.`,
      );
    if (opts["dry-run"]) return console.log("dry run: nothing uploaded.");

    await put(key, Bun.file(path), {
      "Content-Type": type,
      "Content-Disposition": attachment(name),
      "Cache-Control": FILE_CACHE,
    });
    let posterKey: string | undefined;
    if (posterPath) {
      posterKey = `${PREFIX}${slugify(title)}-${id}-poster.jpg`;
      await put(posterKey, Bun.file(posterPath), {
        "Content-Type": "image/jpeg",
        "Cache-Control": FILE_CACHE,
      });
    }
    // Re-read right before writing, to keep anything added meanwhile.
    const latest = await readManifest();
    latest.items.unshift({
      id,
      title: title.slice(0, 120),
      notes: (opts.notes ?? "").trim().slice(0, 2000),
      kind,
      orientation,
      file: name,
      ...(posterKey
        ? { poster: posterKey.slice(PREFIX.length), poster_bytes: posterBytes }
        : {}),
      bytes: size,
      ...(info?.duration ? { duration_s: info.duration } : {}),
    });
    await writeManifest(latest);
    console.log(
      `Uploaded. id ${id}. It shows in the Marketing tab and the kit within ~5 minutes.`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A PNG's pixel size from its IHDR chunk. */
function pngSize(path: string) {
  const b = readFileSync(path).subarray(0, 24);
  if (b.length < 24 || b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

type Planned = { path: string; key: string; type: string; item: Item };

/** Every file of a campaign render, as manifest items (PNGs first: they're the posters). */
function planCampaign(dir: string): Planned[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory())
    fail(`${dir} is not a directory.`);
  const out: Planned[] = [];
  const add = (
    path: string,
    concept: string,
    format: string,
    theme: "light" | "dark",
    ext: string,
    title: string,
    lang = "en",
  ) => {
    const name = `campaign-${concept}-${format}${lang === "en" ? "" : `-${lang}`}${theme === "dark" ? "-dark" : ""}.${ext}`;
    const size = statSync(path).size;
    if (!size) fail(`${path} is empty.`);
    const info = ext === "mp4" ? probe(path) : null;
    const dims = ext === "png" ? pngSize(path) : info;
    out.push({
      path,
      key: `${PREFIX}${name}`,
      type: TYPES[`.${ext}`],
      item: {
        id: name.replace(/\./g, "-"),
        title,
        notes: "",
        kind: "campaign",
        orientation: (orientationOf(dims) ??
          "horizontal") as Item["orientation"],
        file: name,
        bytes: size,
        concept,
        format,
        theme,
        ...(lang === "en" ? {} : { lang }),
        ...(dims?.width && dims.height
          ? { width: dims.width, height: dims.height }
          : {}),
        ...(info?.duration ? { duration_s: info.duration } : {}),
      },
    });
  };
  const sheet = join(dir, "contact-sheet.png");
  if (existsSync(sheet))
    add(sheet, "all", "sheet", "light", "png", "Campaign · Contact sheet");
  for (const concept of readdirSync(dir).sort()) {
    const sub = join(dir, concept);
    if (!statSync(sub).isDirectory()) continue;
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(concept)) {
      console.warn(`skipped ${sub}: not a concept slug`);
      continue;
    }
    if (!CONCEPTS[concept])
      console.warn(
        `note: ${concept} isn't a known concept; it shows under its slug`,
      );
    for (const file of readdirSync(sub).sort()) {
      // <format>[-<lang>][-dark].<ext>; no language suffix means English.
      const m = /^([a-z0-9]+)(?:-([a-z]{2,3}))?(-dark)?\.(png|mp4)$/.exec(file);
      if (!m || !FORMATS[m[1]]) {
        if (!file.startsWith(".")) console.warn(`skipped ${join(sub, file)}`);
        continue;
      }
      const lang = m[2] ?? "en";
      const theme = m[3] ? "dark" : "light";
      const title = `${CONCEPTS[concept] ?? concept} · ${FORMATS[m[1]]}${m[4] === "mp4" ? " video" : ""}${lang === "en" ? "" : ` · ${lang.toUpperCase()}`}${theme === "dark" ? " (dark)" : ""}`;
      add(join(sub, file), concept, m[1], theme, m[4], title, lang);
    }
  }
  // Each video takes the still of the same concept, format and theme as its poster.
  for (const p of out) {
    if (!p.item.file.endsWith(".mp4")) continue;
    const still = p.item.file.replace(/\.mp4$/, ".png");
    if (out.some((q) => q.item.file === still)) p.item.poster = still;
  }
  return out.sort(
    (a, b) =>
      Number(a.type.startsWith("video/")) - Number(b.type.startsWith("video/")),
  );
}

async function campaign(dir: string) {
  const plan = planCampaign(dir);
  if (!plan.length) fail(`Nothing to upload in ${dir}.`);
  const dry = !!opts["dry-run"];
  let manifest: Manifest = { updated: "", items: [] };
  if (!dry) manifest = await readManifest();
  else if (existsSync(envPath()))
    manifest = await readManifest().catch(() => {
      console.log("(couldn't read the live manifest; counting from empty)");
      return manifest;
    });
  else
    console.log(
      `(no ${envPath()}; counting the budget from an empty manifest)`,
    );

  const keys = new Set(plan.map((p) => p.item.file));
  const kept = manifest.items.filter((i) => !keys.has(i.file));
  const total = plan.reduce((n, p) => n + p.item.bytes, 0);
  const after = used({ updated: "", items: kept }) + total;
  for (const p of plan)
    console.log(
      `${mb(p.item.bytes).padStart(9)}  ${p.key}  ${p.item.width ?? "?"}×${p.item.height ?? "?"}  ${p.item.title}${p.item.poster ? `  (poster ${p.item.poster})` : ""}`,
    );
  const replaced = manifest.items.length - kept.length;
  const stale = kept.filter((i) => i.kind === "campaign").length;
  console.log(
    `\n${plan.length} file(s), ${mb(total)} in all${replaced ? `; replaces ${replaced} existing` : ""}.`,
  );
  if (stale)
    console.log(
      `${stale} older campaign item(s) not in this render stay; --remove <id> to drop them.`,
    );
  console.log(`budget: ${mb(after)} of ${mb(BUDGET_BYTES)} after this upload`);
  if (after > BUDGET_BYTES)
    fail(
      "Over the 1 GB marketing budget. Remove something first: --list, --remove <id>.",
    );
  if (dry) return console.log("dry run: nothing uploaded.");

  for (const [i, p] of plan.entries()) {
    console.log(`[${i + 1}/${plan.length}] ${p.key}`);
    await put(p.key, Bun.file(p.path), {
      "Content-Type": p.type,
      "Content-Disposition": attachment(
        `ambient-${p.item.file.replace(/^campaign-/, "")}`,
      ),
      "Cache-Control": CAMPAIGN_CACHE,
    });
  }
  // Re-read right before writing, to keep anything added meanwhile.
  const latest = await readManifest();
  latest.items = [
    ...latest.items.filter((i) => !keys.has(i.file)),
    ...plan.map((p) => p.item),
  ];
  await writeManifest(latest);
  console.log(
    `Uploaded ${plan.length} file(s), ${mb(total)}. They show in the Marketing tab and the kit within ~5 minutes.`,
  );
}

async function list() {
  const m = await readManifest();
  if (!m.items.length) return console.log("No creator videos yet.");
  for (const i of m.items)
    console.log(
      `${i.id}  ${mb(i.bytes).padStart(9)}  ${i.kind.padEnd(6)} ${i.orientation.padEnd(10)} ${i.title}  (${i.file})`,
    );
  console.log(
    `\n${m.items.length} item(s), ${mb(used(m))} of ${mb(BUDGET_BYTES)}; manifest updated ${m.updated}`,
  );
}

async function remove(id: string) {
  const m = await readManifest();
  const item = m.items.find((i) => i.id === id || i.file === id);
  if (!item) fail(`No item ${id} in the manifest (see --list).`);
  const c = await s3();
  // Drop it from the manifest first: a missing file in the list is worse than an orphan.
  m.items = m.items.filter((i) => i !== item);
  await writeManifest(m);
  for (const f of [item.file, item.poster]) if (f) await c.delete(PREFIX + f);
  console.log(`Removed ${item.id} (${item.title}).`);
}

async function setAttachment(key: string) {
  if (!/^(media|marketing)\/[\w.\-/]+$/.test(key) || key.includes(".."))
    fail(
      "--set-attachment takes a key under media/ or marketing/, e.g. media/ambient-launch-v6.mp4",
    );
  const c = await s3();
  const res = await fetch(c.presign(key, { method: "GET", expiresIn: 3600 }));
  if (res.status === 404) fail(`${key} doesn't exist.`);
  if (!res.ok) fail(`R2 refused GET ${key}: HTTP ${res.status}`);
  const type =
    res.headers.get("content-type") ??
    TYPES[extname(key).toLowerCase()] ??
    "application/octet-stream";
  const cache = res.headers.get("cache-control");
  const tmp = mkdtempSync(join(tmpdir(), "marketing-attach-"));
  try {
    // Through a temp file: launch videos are too big to hold in memory twice.
    const local = join(tmp, basename(key));
    await Bun.write(local, res);
    console.log(`${key}: ${mb(statSync(local).size)}, ${type}; re-uploading…`);
    await put(key, Bun.file(local), {
      "Content-Type": type,
      "Content-Disposition": attachment(basename(key)),
      ...(cache ? { "Cache-Control": cache } : {}),
    });
    console.log(
      `Done. ${key} now downloads as ${basename(key)}. Cached copies at the public origin may take a while to pick it up.`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (opts.help) {
  console.log(
    'bun scripts/marketing-upload.ts <file> --title "…" [--notes "…"] [--kind clip|b-roll|screen|other] [--orientation horizontal|vertical|square] [--dry-run]\n' +
      "bun scripts/marketing-upload.ts --campaign <dir> [--dry-run]\n" +
      "bun scripts/marketing-upload.ts --list | --remove <id> | --set-attachment media/<key>",
  );
} else if (opts.list) await list();
else if (opts.remove) await remove(opts.remove);
else if (opts["set-attachment"]) await setAttachment(opts["set-attachment"]);
else if (opts.campaign) await campaign(opts.campaign);
else if (positionals.length === 1) await upload(positionals[0]);
else
  fail(
    "Give one file to upload, or --campaign <dir>, --list, --remove <id>, --set-attachment <key>. --help for more.",
  );
