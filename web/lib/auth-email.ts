import "server-only";
import { sendSignInCode } from "./email/sign-in";

/**
 * Delivers a sign-in code through Resend (lib/email/sign-in.ts). Never logs
 * the address or the code in production.
 *
 * Without RESEND_API_KEY outside production, the code is logged server-side so
 * sign-in can be tested locally; in production that's a configuration error.
 */
export async function deliverSignInCode(email: string, code: string): Promise<"sent" | "logged" | "failed" | "not_configured"> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV) {
      console.info(`[auth] dev sign-in code for ${email}: ${code}`);
      return "logged";
    }
    return "not_configured";
  }
  try {
    const result = await sendSignInCode(email, code);
    return result.ok ? "sent" : "failed";
  } catch (err) {
    console.error("[auth] sign-in email failed", err instanceof Error ? err.message : "unknown error");
    return "failed";
  }
}
