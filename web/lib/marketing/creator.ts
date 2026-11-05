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

/**
 * Campaign creative (video/out/campaign, uploaded with --campaign): items of
 * kind "campaign" with a concept, a format and a theme. Unknown slugs still
 * show (labelled by their slug), after the known ones.
 */
export const CAMPAIGN_CONCEPTS = [
  { id: "nudge", label: "It nudges you" },
  { id: "language", label: "Any language" },
  { id: "ask", label: "Ask anything" },
  { id: "notes", label: "Notes for any call" },
  { id: "remind", label: "Remind me" },
  { id: "free", label: "Free, on your computer" },
  { id: "all", label: "Contact sheet" },
] as const;
export const CAMPAIGN_FORMATS = [
  { id: "story", label: "IG story", w: 1080, h: 1920 },
  { id: "feed", label: "IG feed", w: 1080, h: 1350 },
  { id: "x", label: "X banner", w: 1500, h: 500 },
  { id: "linkedin", label: "LinkedIn / X post", w: 1200, h: 627 },
  { id: "web", label: "Website banner", w: 1920, h: 600 },
  { id: "email", label: "Email banner", w: 1200, h: 400 },
  { id: "sheet", label: "Contact sheet", w: 0, h: 0 },
] as const;

export type CampaignAsset = {
  id: string;
  title: string;
  concept: string;
  format: string;
  formatLabel: string;
  theme: "light" | "dark";
  /** Pixel size, from the manifest or the format; null when neither knows. */
  width: number | null;
  height: number | null;
  bytes: number;
  src: string;
  poster: string | null;
  isVideo: boolean;
};
export type CampaignGroup = { id: string; label: string; assets: CampaignAsset[] };
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

/** `videos` are the creator videos; campaign items are kept apart in `campaign`. */
export type CreatorVideos = { videos: CreatorVideo[]; campaign: CampaignAsset[]; updated: string | null; usedBytes: number };

const EMPTY: CreatorVideos = { videos: [], campaign: [], updated: null, usedBytes: 0 };

/** A key under marketing/ the manifest may point at: no traversal, no URLs. */
const safeFile = (v: unknown): string | null =>
  typeof v === "string" && /^[\w][\w.-]{0,200}$/.test(v) && !v.includes("..") && v !== "manifest.json" ? v : null;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const slug = (v: unknown) => (typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/.test(v) ? v : null);

function parse(raw: unknown): CreatorVideos {
  if (!raw || typeof raw !== "object") return EMPTY;
  const m = raw as { updated?: unknown; items?: unknown };
  const items = Array.isArray(m.items) ? m.items : [];
  let usedBytes = 0;
  const videos: CreatorVideo[] = [];
  const campaign: CampaignAsset[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const file = safeFile(r.file);
    const id = text(r.id, 64);
    if (!file || !id) continue;
    const bytes = num(r.bytes) ?? 0;
    usedBytes += bytes + (num(r.poster_bytes) ?? 0);
    const poster = safeFile(r.poster);
    if (r.kind === "campaign") {
      const format = slug(r.format) ?? "other";
      const known = CAMPAIGN_FORMATS.find((x) => x.id === format);
      campaign.push({
        id,
        title: text(r.title, 120) || file,
        concept: slug(r.concept) ?? "other",
        format,
        formatLabel: known?.label ?? format,
        theme: r.theme === "dark" ? "dark" : "light",
        width: num(r.width) || known?.w || null,
        height: num(r.height) || known?.h || null,
        bytes,
        src: `/${PREFIX}${file}`,
        poster: poster ? `/${PREFIX}${poster}` : null,
        isVideo: VIDEO_EXT.test(file),
      });
      continue;
    }
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
  return { videos, campaign, updated: typeof m.updated === "string" ? m.updated : null, usedBytes };
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

const rank = (list: readonly { id: string }[], id: string) => {
  const i = list.findIndex((x) => x.id === id);
  return i < 0 ? list.length : i;
};

/**
 * Campaign assets by concept, in the campaign's order (unknown concepts last,
 * by slug); inside one, by format, the video before its still, light before dark.
 */
export function groupCampaign(assets: CampaignAsset[]): CampaignGroup[] {
  const groups = new Map<string, CampaignAsset[]>();
  for (const a of assets) groups.set(a.concept, [...(groups.get(a.concept) ?? []), a]);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(CAMPAIGN_CONCEPTS, a) - rank(CAMPAIGN_CONCEPTS, b) || a.localeCompare(b))
    .map(([id, list]) => ({
      id,
      label: CAMPAIGN_CONCEPTS.find((c) => c.id === id)?.label ?? id,
      assets: list.sort(
        (a, b) =>
          rank(CAMPAIGN_FORMATS, a.format) - rank(CAMPAIGN_FORMATS, b.format) ||
          Number(b.isVideo) - Number(a.isVideo) ||
          Number(a.theme === "dark") - Number(b.theme === "dark") ||
          a.format.localeCompare(b.format),
      ),
    }));
}
