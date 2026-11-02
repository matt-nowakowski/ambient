import { unsubscribeFromToken } from "@/lib/email/subscriptions";

/**
 * RFC 8058 one-click unsubscribe: mail clients POST
 * "List-Unsubscribe=One-Click" to the List-Unsubscribe URL (?t=<signed token>).
 * No page, no confirmation step, as the RFC requires. GET is not accepted here
 * (link scanners prefetch GETs); people clicking the footer link land on
 * /email/unsubscribe instead.
 */
export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const ok = await unsubscribeFromToken(t);
  return ok ? new Response(null, { status: 200 }) : Response.json({ error: "invalid_token" }, { status: 400 });
}
