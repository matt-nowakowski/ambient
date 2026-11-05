import "server-only";
import { randomUUID } from "node:crypto";
import { isDatabaseConfigured, marketingDb } from "../db";
import { attachment, deleteObject, headObject, presign, r2MissingEnv } from "./r2";

/**
 * Creator clips (UGC, b-roll, screen recordings) for the Marketing tab and
 * the media kit. The browser uploads straight to R2 with a presigned PUT, so
 * no file passes through a Vercel function; Neon keeps the metadata.
 *
 * The R2 bucket is capped at 6 GB in all and releases, models and the launch
 * video already use most of it, so marketing/ has its own budget, checked
 * when an upload URL is handed out (atomically, counting uploads in flight)
 * and again against the real object size when the upload is confirmed.
 */
export const PREFIX = "marketing/";
/** Decimal units, like R2's billing and the release workflow's BUDGET_BYTES. */
export const MAX_FILE_BYTES = 500_000_000;
export const BUDGET_BYTES = 1_500_000_000;
/** An upload URL lives an hour; a reservation that never completes is dropped after two. */
const PUT_EXPIRES = 3600;
const PENDING_TTL_MINUTES = 120;
/** How long the preview and download links on a rendered page work. */
const GET_EXPIRES = 6 * 3600;

export const KINDS = [
  { id: "clip", label: "Creator clip" },
  { id: "broll", label: "B-roll" },
  { id: "screen", label: "Screen recording" },
  { id: "image", label: "Image" },
  { id: "other", label: "Other" },
] as const;
export const ORIENTATIONS = [
  { id: "horizontal", label: "Horizontal" },
  { id: "vertical", label: "Vertical" },
  { id: "square", label: "Square" },
] as const;
export type Kind = (typeof KINDS)[number]["id"];
export type Orientation = (typeof ORIENTATIONS)[number]["id"];

export type Upload = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  title: string;
  notes: string;
  kind: Kind;
  orientation: Orientation;
  createdAt: string;
  createdBy: string;
};
/** An upload with links for a page render; they expire after GET_EXPIRES. */
export type UploadWithUrls = Upload & { viewUrl: string; downloadUrl: string };

export type UploadsState =
  | { ok: true; uploads: UploadWithUrls[]; usedBytes: number }
  | { ok: false; reason: string; missingEnv?: string[] };

export function uploadsMissingEnv(): string[] {
  return [...(isDatabaseConfigured() ? [] : ["DATABASE_URL"]), ...r2MissingEnv()];
}

type Row = {
  id: string;
  key: string;
  filename: string;
  content_type: string;
  size: string | number;
  title: string;
  notes: string;
  kind: Kind;
  orientation: Orientation;
  status: string;
  created_by: string;
  created_at: string | Date;
};

const toUpload = (r: Row): Upload => ({
  id: r.id,
  filename: r.filename,
  contentType: r.content_type,
  size: Number(r.size),
  title: r.title,
  notes: r.notes,
  kind: r.kind,
  orientation: r.orientation,
  createdAt: new Date(r.created_at).toISOString(),
  createdBy: r.created_by,
});

const withUrls = (r: Row): UploadWithUrls => ({
  ...toUpload(r),
  viewUrl: presign("GET", r.key, { expires: GET_EXPIRES }),
  downloadUrl: presign("GET", r.key, { expires: GET_EXPIRES, query: { "response-content-disposition": attachment(r.filename) } }),
});

/** Ready uploads, newest first, with fresh links; drops stale reservations on the way. */
export async function listUploads(): Promise<UploadsState> {
  const missing = uploadsMissingEnv();
  if (missing.length) return { ok: false, reason: "not_configured", missingEnv: missing };
  try {
    const sql = await marketingDb();
    const stale = (await sql`
      delete from marketing_uploads
      where status = 'pending' and created_at < now() - make_interval(mins => ${PENDING_TTL_MINUTES})
      returning key`) as { key: string }[];
    // A browser may have finished a PUT nobody confirmed: remove the orphan.
    await Promise.allSettled(stale.map((s) => deleteObject(s.key)));
    const rows = (await sql`select * from marketing_uploads order by created_at desc`) as Row[];
    const ready = rows.filter((r) => r.status === "ready");
    const usedBytes = rows.reduce((a, r) => a + Number(r.size), 0);
    return { ok: true, uploads: ready.map(withUrls), usedBytes };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "error" };
  }
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const safeName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120) || "file";

export type NewUpload = { filename: string; size: number; contentType: string; title: string; notes: string; kind: string; orientation: string };
export type StartResult = { ok: true; id: string; url: string; contentType: string } | { ok: false; error: string };

/** Reserves room in the budget and returns a presigned PUT for the browser. */
export async function startUpload(input: NewUpload, adminEmail: string): Promise<StartResult> {
  if (uploadsMissingEnv().length) return { ok: false, error: `Not configured: set ${uploadsMissingEnv().join(", ")}.` };
  const size = Math.floor(Number(input.size));
  const contentType = clean(input.contentType, 100).toLowerCase() || "application/octet-stream";
  if (!/^(video|image)\/[\w.+-]+$/.test(contentType)) return { ok: false, error: "Only video and image files." };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "That file is empty." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `Files can be up to ${MAX_FILE_BYTES / 1e6} MB.` };
  const kind = KINDS.find((k) => k.id === input.kind)?.id ?? "other";
  const orientation = ORIENTATIONS.find((o) => o.id === input.orientation)?.id ?? "horizontal";
  const filename = clean(input.filename, 200) || "file";
  const title = clean(input.title, 120) || filename;
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : "";
  const id = randomUUID();
  const key = `${PREFIX}${id}/${safeName(filename)}`;

  const sql = await marketingDb();
  // One statement, so two uploads at once can't both squeeze under the budget.
  const inserted = (await sql`
    insert into marketing_uploads (id, key, filename, content_type, size, title, notes, kind, orientation, created_by)
    select ${id}, ${key}, ${filename}, ${contentType}, ${size}, ${title}, ${notes}, ${kind}, ${orientation}, ${adminEmail}
    where (select coalesce(sum(size), 0) from marketing_uploads) + ${size} <= ${BUDGET_BYTES}
    returning id`) as { id: string }[];
  if (!inserted.length) return { ok: false, error: "Not enough room left in the marketing budget. Delete something first." };
  return { ok: true, id, url: presign("PUT", key, { expires: PUT_EXPIRES, headers: { "content-type": contentType } }), contentType };
}

/** After the browser's PUT: check R2 really has it, at an allowed size, and mark it ready. */
export async function completeUpload(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sql = await marketingDb();
  const [row] = (await sql`select * from marketing_uploads where id = ${id}`) as Row[];
  if (!row) return { ok: false, error: "Upload not found." };
  const head = await headObject(row.key);
  if (!head) {
    await sql`delete from marketing_uploads where id = ${id}`;
    return { ok: false, error: "R2 doesn't have the file. Try again." };
  }
  if (head.size > MAX_FILE_BYTES || head.size !== Number(row.size)) {
    // Signed for one size, sent another: don't let it slip past the budget.
    await deleteObject(row.key);
    await sql`delete from marketing_uploads where id = ${id}`;
    return { ok: false, error: "The uploaded file didn't match what was declared, so it was removed." };
  }
  await sql`update marketing_uploads set status = 'ready' where id = ${id}`;
  return { ok: true };
}

export async function deleteUpload(id: string) {
  const sql = await marketingDb();
  const [row] = (await sql`select key from marketing_uploads where id = ${id}`) as { key: string }[];
  if (!row) return;
  await deleteObject(row.key);
  await sql`delete from marketing_uploads where id = ${id}`;
}
