import { ipAllowed } from "@/lib/auth";
import { parseBatch } from "@/lib/agent/telemetry";
import { recordBatch, scheduleTelemetryFlush } from "@/lib/agent/telemetry-store";

/**
 * Opt-in anonymous product analytics from the desktop app: counts and timing
 * buckets only, checked strictly against lib/agent/telemetry-schema.json.
 * Anything off the allowlist rejects the whole batch. Bodies are never logged
 * or stored; accepted events only add to daily counters.
 *
 * The app sends at most one batch every 10 minutes (and one on quit), so the
 * per-install limit is generous for it and tight for anything else.
 */
const MAX_BODY_BYTES = 64 * 1024;
/** Per 15 minutes (lib/auth.ts ipAllowed's window). */
const PER_INSTALL = 6;
const PER_IP = 120;

const clientIp = (req: Request) =>
  req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export async function POST(req: Request) {
  if (!ipAllowed("telemetry-ip", clientIp(req), PER_IP)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const batch = parseBatch(body);
  if (!batch) return Response.json({ error: "invalid" }, { status: 400 });
  if (!ipAllowed("telemetry-install", batch.install, PER_INSTALL)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  recordBatch(batch);
  scheduleTelemetryFlush();
  return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
