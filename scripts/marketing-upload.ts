// Creator videos for the marketing suite (/admin/marketing and the media kit).
// The website never uploads or holds R2 keys: you run this on your own machine
// with the key in ~/.ambient/r2-ambient.env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, optional R2_BUCKET and R2_ENDPOINT). Never run from CI
// or the site.
//
//   bun scripts/marketing-upload.ts <file> --title "…" [--notes "…"]
//       [--kind clip|b-roll|screen|other] [--orientation horizontal|vertical|square]
//       [--dry-run]
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
// --set-attachment re-uploads an existing object (e.g. the launch videos in
// media/) with Content-Disposition: attachment, keeping its type and cache
// headers, so download buttons that link to it save the file.
//
// Writes go through a presigned PUT with plain headers: Bun's S3Client
// (1.2.x) drops contentDisposition on write and has no Cache-Control option
// or server-side copy.
import { S3Client } from "bun";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
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
  kind: (typeof KINDS)[number];
  orientation: (typeof ORIENTATIONS)[number];
  file: string;
  poster?: string;
  bytes: number;
  poster_bytes?: number;
  duration_s?: number;
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
    help: { type: "boolean", short: "h" },
  },
});

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

let client: S3Client | null = null;
async function s3() {
  if (client) return client;
  const path = join(homedir(), ".ambient", "r2-ambient.env");
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
      "bun scripts/marketing-upload.ts --list | --remove <id> | --set-attachment media/<key>",
  );
} else if (opts.list) await list();
else if (opts.remove) await remove(opts.remove);
else if (opts["set-attachment"]) await setAttachment(opts["set-attachment"]);
else if (positionals.length === 1) await upload(positionals[0]);
else
  fail(
    "Give one file to upload, or --list, --remove <id>, --set-attachment <key>. --help for more.",
  );
