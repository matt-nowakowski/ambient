import { timingSafeEqual } from "node:crypto";
import { runTips } from "@/lib/email/tips";

export const maxDuration = 60;

/**
 * Daily tips (Vercel Cron, see vercel.json; 15:41 UTC, daytime in Europe and
 * the Americas): sends each confirmed tips subscriber the next tip once it's
 * due (lib/email/tip-schedule.ts), at most TIPS_PER_RUN a run. Anyone who
 * unsubscribed in Resend meanwhile is dropped instead.
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
    const result = await runTips();
    console.info(`[tips] due=${result.due} sent=${result.sent} stopped=${result.stopped} failed=${result.failed}`);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[tips] failed:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
