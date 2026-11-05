import "server-only";

/**
 * Creator videos (clips, b-roll, screen recordings) for the Marketing tab and
 * the media kit. The site never uploads or signs anything: the coordinator
 * adds files to R2 under marketing/ with scripts/marketing-upload.ts, which
 * also rewrites marketing/manifest.json. This reads that public manifest and
 * links each file through /marketing/* (next.config.ts redirects it to R2).
 *
 * Objects are uploaded with Content-Disposition: attachment, so a plain link
 * downloads and a <video> still plays them.
 */
export const PREFIX = "marketing/";
/** Decimal units, like R2's billing. Enforced by the upload script; shown here. */
export const BUDGET_BYTES = 1_000_000_000;
/** Cached server-side for five minutes; a new upload shows up within that. */
const REVALIDATE_SECONDS = 300;
const TIMEOUT_MS = 4000;

export const KINDS = [
  { id: "clip", label: "Creator clip" },
  { id: "b-roll", label: "B-roll" },
  { id: "screen", label: "Screen recording" },
  { id: "other", label: "Other" },
] as const;
export const ORIENTATIONS = [
  { id: "horizontal", label: "Horizontal" },
  { id: "vertical", label: "Vertical" },
  { id: "square", label: "Square" },
] as const;
export type Kind = (typeof KINDS)[number]["id"];
export type Orientation = (typeof ORIENTATIONS)[number]["id"];

export type CreatorVideo = {
  id: string;
  title: string;
  notes: string;
  kind: Kind;
  orientation: Orientation;
  bytes: number;
  durationS: number | null;
  /** Same-origin paths (/marketing/…), redirected to the public bucket. */
  src: string;
  poster: string | null;
  isVideo: boolean;
};

export type CreatorVideos = { videos: CreatorVideo[]; updated: string | null; usedBytes: number };

const EMPTY: CreatorVideos = { videos: [], updated: null, usedBytes: 0 };

/** A key under marketing/ the manifest may point at: no traversal, no URLs. */
const safeFile = (v: unknown): string | null =>
  typeof v === "string" && /^[\w][\w.-]{0,200}$/.test(v) && !v.includes("..") && v !== "manifest.json" ? v : null;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;

function parse(raw: unknown): CreatorVideos {
  if (!raw || typeof raw !== "object") return EMPTY;
  const m = raw as { updated?: unknown; items?: unknown };
  const items = Array.isArray(m.items) ? m.items : [];
  let usedBytes = 0;
  const videos: CreatorVideo[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const file = safeFile(r.file);
    const id = text(r.id, 64);
    if (!file || !id) continue;
    const bytes = num(r.bytes) ?? 0;
    usedBytes += bytes + (num(r.poster_bytes) ?? 0);
    const poster = safeFile(r.poster);
    videos.push({
      id,
      title: text(r.title, 120) || file,
      notes: text(r.notes, 2000),
      kind: KINDS.find((k) => k.id === r.kind)?.id ?? "other",
      orientation: ORIENTATIONS.find((o) => o.id === r.orientation)?.id ?? "horizontal",
      bytes,
      durationS: num(r.duration_s),
      src: `/${PREFIX}${file}`,
      poster: poster ? `/${PREFIX}${poster}` : null,
      isVideo: VIDEO_EXT.test(file),
    });
  }
  return { videos, updated: typeof m.updated === "string" ? m.updated : null, usedBytes };
}

/** The manifest, or an empty list when it's missing, slow or malformed. */
export async function creatorVideos(): Promise<CreatorVideos> {
  try {
    const res = await fetch(`${process.env.DOWNLOADS_ORIGIN}/${PREFIX}manifest.json`, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return EMPTY;
    return parse(await res.json());
  } catch {
    return EMPTY;
  }
}
