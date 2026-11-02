import { after } from "next/server";
import { runEmailAction } from "@/lib/email/polar-actions";
import { decide, verifyPolarWebhook } from "@/lib/email/polar-webhook";

/**
 * Polar → customer emails. Subscribe this endpoint to: order.paid,
 * subscription.canceled, subscription.revoked (anything else is accepted and
 * ignored). Fails closed: no POLAR_WEBHOOK_SECRET → 401, bad signature → 403.
 * Answers 202 at once and sends in after(), well inside Polar's 10 s timeout.
 * Never touches the database.
 */
export async function POST(req: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] POLAR_WEBHOOK_SECRET not set: rejecting");
    return Response.json({ error: "not_configured" }, { status: 401 });
  }

  const body = await req.text();
  const verified = verifyPolarWebhook(body, req.headers, secret);
  if ("error" in verified) {
    console.warn(`[webhook] rejected: ${verified.error}`);
    return Response.json({ error: "invalid_signature" }, { status: 403 });
  }

  const { action, type, reason } = decide(verified.payload);
  const gift = action?.email === "welcome_gift" ? ` discount="${action.discount.name ?? "?"}" code=${action.discount.code ?? "?"}` : "";
  console.info(`[webhook ${verified.id}] ${type}: ${action ? `send ${action.email}` : "ignore"} (${reason})${gift}`);
  if (action) {
    after(async () => {
      try {
        await runEmailAction(action, verified.id);
      } catch (err) {
        console.error(`[webhook ${verified.id}] ${action.email} failed`, err instanceof Error ? err.message : err);
      }
    });
  }
  return Response.json({ ok: true }, { status: 202 });
}
