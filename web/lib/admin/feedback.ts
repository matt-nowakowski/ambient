import "server-only";
import { isDatabaseConfigured } from "../db";
import { FEEDBACK_KINDS, FEEDBACK_OS, FEEDBACK_SOURCES, FEEDBACK_STATUSES, type FeedbackExample } from "../feedback-core";
import { feedbackDb } from "../feedback-store";
import { demoFeedback } from "./feedback-demo";

/** One report as the admin inbox shows it. */
export type FeedbackItem = {
  id: number;
  created: string;
  kind: string;
  source: string;
  message: string;
  email: string | null;
  version: string;
  os: string;
  plan: string;
  diagnostics: Record<string, unknown> | null;
  example: FeedbackExample | null;
  status: string;
  note: string;
};

export type FeedbackFilters = { kind?: string; status?: string; version?: string; os?: string; source?: string };

export type FeedbackInbox =
  | { ok: true; items: FeedbackItem[]; versions: string[]; counts: Record<string, number> }
  | { ok: false; error: string };

const pick = (list: readonly string[], v: string | undefined) => (v && list.includes(v) ? v : undefined);

/** Only known values pass through to the query; anything else means "all". */
export function cleanFilters(sp: Record<string, string | string[] | undefined>): FeedbackFilters {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const version = one("version");
  return {
    kind: pick(FEEDBACK_KINDS, one("kind")),
    status: pick(FEEDBACK_STATUSES, one("status")),
    os: pick(FEEDBACK_OS, one("os")),
    source: pick(FEEDBACK_SOURCES, one("source")),
    version: version && /^[0-9A-Za-z.+-]{1,20}$/.test(version) ? version : undefined,
  };
}

function matches(f: FeedbackFilters, i: FeedbackItem) {
  return (
    (!f.kind || i.kind === f.kind) &&
    (!f.status || i.status === f.status) &&
    (!f.version || i.version === f.version) &&
    (!f.os || i.os === f.os) &&
    (!f.source || i.source === f.source)
  );
}

function countByStatus(items: { status: string }[]) {
  const counts: Record<string, number> = { open: 0, triaged: 0, done: 0 };
  for (const i of items) counts[i.status] = (counts[i.status] ?? 0) + 1;
  return counts;
}

export async function feedbackInbox(filters: FeedbackFilters, demo: boolean): Promise<FeedbackInbox> {
  if (demo) {
    const all = demoFeedback();
    return {
      ok: true,
      items: all.filter((i) => matches(filters, i)),
      versions: [...new Set(all.map((i) => i.version))].sort().reverse(),
      counts: countByStatus(all),
    };
  }
  if (!isDatabaseConfigured()) return { ok: false, error: "DATABASE_URL isn't set" };
  try {
    const sql = await feedbackDb();
    const [rows, versions, counts] = await Promise.all([
      sql`
        select id, created, kind, source, message, email, version, os, plan, diagnostics, example, status, note
        from feedback
        where (${filters.kind ?? null}::text is null or kind = ${filters.kind ?? null})
          and (${filters.status ?? null}::text is null or status = ${filters.status ?? null})
          and (${filters.version ?? null}::text is null or version = ${filters.version ?? null})
          and (${filters.os ?? null}::text is null or os = ${filters.os ?? null})
          and (${filters.source ?? null}::text is null or source = ${filters.source ?? null})
        order by created desc
        limit 200`,
      sql`select distinct version from feedback order by version desc limit 30`,
      sql`select status, count(*)::int as n from feedback group by status`,
    ]);
    return {
      ok: true,
      items: rows.map((r) => ({
        id: Number(r.id),
        created: new Date(r.created as string).toISOString(),
        kind: String(r.kind),
        source: String(r.source),
        message: String(r.message),
        email: (r.email as string | null) ?? null,
        version: String(r.version),
        os: String(r.os),
        plan: String(r.plan),
        diagnostics: (r.diagnostics as Record<string, unknown> | null) ?? null,
        example: (r.example as FeedbackExample | null) ?? null,
        status: String(r.status),
        note: String(r.note ?? ""),
      })),
      versions: versions.map((r) => String(r.version)),
      counts: Object.fromEntries(counts.map((r) => [String(r.status), Number(r.n)])),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 120) : "query failed" };
  }
}

/** Open reports, for the Overview. Null when the database isn't available. */
export async function openFeedbackCount(demo: boolean): Promise<number | null> {
  if (demo) return demoFeedback().filter((i) => i.status === "open").length;
  if (!isDatabaseConfigured()) return null;
  try {
    const sql = await feedbackDb();
    const rows = await sql`select count(*)::int as n from feedback where status = 'open'`;
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}
