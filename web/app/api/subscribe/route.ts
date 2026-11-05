import { noteTipSubscriber } from "@/lib/activity";
import { emailListsConfigured, normaliseEmail, requestNewsletter } from "@/lib/email/subscriptions";
import { machineKey, parseMachine } from "@/lib/machine";
import { readJson } from "@/lib/polar";

/**
 * POST {email, website?, machine?, language?, plan?} → starts newsletter
 * double opt-in: adds the address to the Resend newsletter audience as
 * unsubscribed and emails a signed confirmation link. `website` is a honeypot:
 * filled → silently accepted. Always the same 200 for any valid address, so it
 * can't reveal who's on the list.
 *
 * The app's optional "Email me tips" (Free and not signed in) also sends the
 * device's machine hash, the app language and its plan; when a machine comes
 * with the request the email is recorded in `accounts` (lib/activity.ts) with
 * source "tips", linked to the device's activity rows through a keyed hash. No
 * IP address is stored.
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

/** BCP-47-ish app language ("en", "zh-TW", "pt-BR"), or null. */
const tipLanguage = (raw: unknown) =>
  typeof raw === "string" && raw.length <= 35 && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(raw) ? raw : null;

/** Tips subscribers are Free or on their trial; anything else is treated as Free. */
const tipPlan = (raw: unknown): "free" | "trial" => (raw === "trial" ? "trial" : "free");

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
  // Only the app sends a machine hash; the website's newsletter form doesn't,
  // and stays out of the admin's list of emails.
  const machine = parseMachine(body?.machine);
  if (machine) noteTipSubscriber(email, tipPlan(body?.plan), machineKey(machine), tipLanguage(body?.language));
  return Response.json({ ok: true });
}
