import { timingSafeEqual } from "node:crypto";
import { runTuning } from "@/lib/agent/config-store";

export const maxDuration = 30;

/**
 * Daily auto-tuning (Vercel Cron, see vercel.json): reads the last 14 days of
 * aggregate product events and adjusts the agent's tunables by the rules in
 * lib/agent/config.ts. Manual and pinned values are never touched; paused
 * from /admin, it does nothing. Every change lands in agent_config_history.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set
 * the endpoint refuses to run at all.
 */
function authorized(req: Request, secret: string) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!authorized(req, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runTuning();
    return Response.json(
      { skipped: result.skipped ?? null, changes: result.changes.map((c) => ({ key: c.key, old: c.old, new: c.new, reason: c.reason })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[tune] failed:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
