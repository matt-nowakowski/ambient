import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { siteUrl } from "../brand";

/**
 * The influencer media kit lives at /kit/<MEDIA_KIT_TOKEN>. No token set (or
 * a short one) means the kit is off and /kit/* is a 404. Change the token in
 * Vercel and redeploy to revoke every link already shared.
 */
const MIN_LENGTH = 24;

export function kitToken(): string | null {
  const t = (process.env.MEDIA_KIT_TOKEN ?? "").trim();
  return t.length >= MIN_LENGTH ? t : null;
}

/** Constant-time: both sides are hashed first, so the lengths match too. */
export function kitTokenValid(given: string | undefined | null): boolean {
  const expected = kitToken();
  if (!expected || !given) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

export function kitUrl(): string | null {
  const t = kitToken();
  return t ? `${siteUrl}/kit/${encodeURIComponent(t)}` : null;
}

export const KIT_MIN_TOKEN_LENGTH = MIN_LENGTH;
