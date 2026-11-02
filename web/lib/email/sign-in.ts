import { createHash } from "node:crypto";
import { sendEmail, type Result } from "./resend";
import { signInCode } from "./templates";

/**
 * Sends the app's 6-digit sign-in code. For the auth flow to call:
 *
 *   import { sendSignInCode } from "@/lib/email/sign-in";
 *   const r = await sendSignInCode(email, "482913");
 *   if (!r.ok) …   // r.skipped when RESEND_API_KEY isn't set (logged, never throws)
 *
 * Idempotent per (address, code), so a retried request never sends the same
 * code twice. Logs never include the address or the code.
 */
export async function sendSignInCode(email: string, code: string): Promise<Result<{ id: string }>> {
  const to = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "code must be 6 digits" };
  if (!to.includes("@") || to.length > 254) return { ok: false, error: "invalid email" };
  const key = createHash("sha256").update(`${to}:${code}`).digest("hex").slice(0, 32);
  return sendEmail({ to, email: signInCode({ code }), idempotencyKey: `signin/${key}` });
}
