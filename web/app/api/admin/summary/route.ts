import { adminApiGuard } from "@/lib/admin/guard";
import { buildSummary } from "@/lib/admin/summary";

export const dynamic = "force-dynamic";

/** The admin dashboard's data as JSON (same as /admin renders). Admin session required. */
export async function GET(req: Request) {
  const denied = await adminApiGuard();
  if (denied) return denied;
  const p = new URL(req.url).searchParams.get("period");
  const summary = await buildSummary(p === "30d" || p === "all" ? p : "month");
  // Customer emails stay out of the JSON; the page shows them on expand only.
  const consumers = summary.consumers.map((c) => ({ ...c, email: null }));
  const orgs = summary.orgs.map((o) => ({ ...o, email: null }));
  return Response.json(
    { ...summary, consumers, orgs },
    { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } },
  );
}
