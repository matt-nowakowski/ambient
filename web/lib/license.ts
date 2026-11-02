import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { brand } from "./brand";

/**
 * License key format (fixed contract shared with the desktop app):
 *
 *   <prefix> + base64url(payloadJsonUtf8) + "." + base64url(ed25519Signature)
 *
 * - base64url has no padding.
 * - The signature covers the ASCII bytes of the base64url payload segment
 *   (between the prefix and the "."), NOT the raw JSON.
 * - prefix comes from brand.config.json (`licenseKeyPrefix`).
 */

/** "trial" is the no-card Pro trial issued on first launch. */
export type Plan = "pro" | "team" | "trial";

export type LicensePayload = {
  v: 1;
  sub: string; // Polar customer id
  email: string;
  plan: Plan;
  iat: number; // unix seconds
  exp: number; // unix seconds
};

export const GRACE_SECONDS = 7 * 24 * 60 * 60;

export class LicenseConfigError extends Error {}

const b64url = (buf: Buffer) => buf.toString("base64url");

let cachedPrivateKey: KeyObject | null = null;
let cachedPublicKey: KeyObject | null = null;

/** Reads LICENSE_PRIVATE_KEY (PKCS8 PEM; literal "\n" escapes allowed). */
export function getPrivateKey(): KeyObject {
  if (cachedPrivateKey) return cachedPrivateKey;
  const raw = process.env.LICENSE_PRIVATE_KEY;
  if (!raw) throw new LicenseConfigError("LICENSE_PRIVATE_KEY is not set");
  const pem = raw.replace(/\\n/g, "\n").trim();
  try {
    cachedPrivateKey = createPrivateKey({ key: pem, format: "pem" });
  } catch {
    throw new LicenseConfigError("LICENSE_PRIVATE_KEY is not a valid PKCS8 PEM key");
  }
  if (cachedPrivateKey.asymmetricKeyType !== "ed25519") {
    cachedPrivateKey = null;
    throw new LicenseConfigError("LICENSE_PRIVATE_KEY must be an Ed25519 key");
  }
  return cachedPrivateKey;
}

/** Public key built from the raw 32-byte key embedded in the app (brand.licensePublicKey). */
export function getPublicKey(rawBase64: string = brand.licensePublicKey): KeyObject {
  if (cachedPublicKey && rawBase64 === brand.licensePublicKey) return cachedPublicKey;
  const raw = Buffer.from(rawBase64, "base64");
  if (raw.length !== 32) throw new LicenseConfigError("License public key must be 32 raw bytes");
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64url(raw) }, format: "jwk" });
  if (rawBase64 === brand.licensePublicKey) cachedPublicKey = key;
  return key;
}

export function isLicenseSigningConfigured() {
  return Boolean(process.env.LICENSE_PRIVATE_KEY);
}

export function mintLicense(
  input: { sub: string; email: string; plan: Plan; exp: number; iat?: number },
  privateKey: KeyObject = getPrivateKey(),
): string {
  const payload: LicensePayload = {
    v: 1,
    sub: input.sub,
    email: input.email,
    plan: input.plan,
    iat: input.iat ?? Math.floor(Date.now() / 1000),
    exp: input.exp,
  };
  const segment = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = sign(null, Buffer.from(segment, "ascii"), privateKey);
  return `${brand.licenseKeyPrefix}${segment}.${b64url(signature)}`;
}

export type VerifyResult =
  | { ok: true; payload: LicensePayload; expired: boolean }
  | { ok: false; reason: "malformed" | "bad_signature" };

const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export function verifyLicense(key: unknown, publicKey: KeyObject = getPublicKey()): VerifyResult {
  if (typeof key !== "string") return { ok: false, reason: "malformed" };
  const trimmed = key.trim();
  if (!trimmed.startsWith(brand.licenseKeyPrefix)) return { ok: false, reason: "malformed" };
  const body = trimmed.slice(brand.licenseKeyPrefix.length);
  const parts = body.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [segment, sig] = parts;
  if (!segment || !sig || !B64URL_RE.test(segment) || !B64URL_RE.test(sig)) {
    return { ok: false, reason: "malformed" };
  }

  let valid = false;
  try {
    valid = verify(null, Buffer.from(segment, "ascii"), publicKey, Buffer.from(sig, "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    payload?.v !== 1 ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    (payload.plan !== "pro" && payload.plan !== "team" && payload.plan !== "trial") ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const expired = payload.exp <= Math.floor(Date.now() / 1000);
  return { ok: true, payload, expired };
}

export function planFromMetadata(meta: Record<string, string> | null | undefined): Plan {
  return meta?.plan === "team" ? "team" : "pro";
}
