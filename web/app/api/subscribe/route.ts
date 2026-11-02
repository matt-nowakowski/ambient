import { emailListsConfigured, normaliseEmail, requestNewsletter } from "@/lib/email/subscriptions";
import { readJson } from "@/lib/polar";

/**
 * POST {email, website?} → starts newsletter double opt-in: adds the address
 * to the Resend newsletter audience as unsubscribed and emails a signed
 * confirmation link. `website` is a honeypot: filled → silently accepted.
 * Always the same 200 for any valid address, so it can't reveal who's on the list.
 */
const WINDOW_MS = 10 * 60_000;
const hits = new Map<string, number[]>();

function limited(ip: string, now = Date.now()) {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5_000) hits.clear();
  return list.length > 5;
}

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = normaliseEmail(body?.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });
  if (typeof body?.website === "string" && body.website) return Response.json({ ok: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });

  if (!emailListsConfigured()) {
    console.info("[subscribe] skipped: RESEND_API_KEY or EMAIL_TOKEN_SECRET not set");
    return Response.json({ error: "not_configured", message: "Email updates aren’t set up yet." }, { status: 503 });
  }
  await requestNewsletter(email);
  return Response.json({ ok: true });
}
