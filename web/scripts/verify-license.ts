/**
 * Proves the license key format end-to-end:
 *   1. mints a key with LICENSE_PRIVATE_KEY via lib/license.ts
 *   2. verifies it with an INDEPENDENT implementation that only uses the raw
 *      32-byte public key from brand.config.json — the same inputs the desktop
 *      app has — so any drift between site and app shows up here.
 *   3. checks tampering / wrong-prefix / expiry behaviour.
 *
 * Run: bun run verify-license   (bun loads .env.local automatically)
 * Never prints the private key or a full license key.
 */
import { createPublicKey, verify } from "node:crypto";
import { brand } from "../lib/brand";
import { mintLicense, verifyLicense } from "../lib/license";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

if (!process.env.LICENSE_PRIVATE_KEY) {
  console.error("LICENSE_PRIVATE_KEY is not set (put it in web/.env.local).");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 30 * 24 * 3600 + 7 * 24 * 3600;
const key = mintLicense({ sub: "cus_TEST123", email: "test@example.com", plan: "pro", exp });

// --- Independent verifier (mirrors what the app does) ----------------------
function appVerify(k: string) {
  const prefix = brand.licenseKeyPrefix;
  if (!k.startsWith(prefix)) return null;
  const [segment, sig, ...rest] = k.slice(prefix.length).split(".");
  if (!segment || !sig || rest.length) return null;
  const pub = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(brand.licensePublicKey, "base64").toString("base64url") },
    format: "jwk",
  });
  const ok = verify(null, Buffer.from(segment, "ascii"), pub, Buffer.from(sig, "base64url"));
  if (!ok) return null;
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

const [segment, sig] = key.slice(brand.licenseKeyPrefix.length).split(".");
const payload = appVerify(key);

console.log(`key: ${brand.licenseKeyPrefix}<${segment.length} chars>.<${sig.length} chars>  (total ${key.length} chars)`);
console.log("payload:", JSON.stringify(payload));

check(`starts with "${brand.licenseKeyPrefix}"`, key.startsWith(brand.licenseKeyPrefix));
check("exactly one '.' separator", key.split(".").length === 2);
check("base64url without padding", /^[A-Za-z0-9_-]+$/.test(segment) && /^[A-Za-z0-9_-]+$/.test(sig));
check("signature is 64 bytes", Buffer.from(sig, "base64url").length === 64);
check("independent verify with embedded public key", payload !== null);
check(
  "payload fields",
  payload?.v === 1 && payload.sub === "cus_TEST123" && payload.email === "test@example.com" &&
    payload.plan === "pro" && payload.exp === exp && typeof payload.iat === "number",
);
check("payload key order v,sub,email,plan,iat,exp", Object.keys(payload ?? {}).join(",") === "v,sub,email,plan,iat,exp");

const lib = verifyLicense(key);
check("lib verifyLicense ok + not expired", lib.ok && !lib.expired);

// Tamper: change plan to team without re-signing
const forged = Buffer.from(JSON.stringify({ ...payload, plan: "team" })).toString("base64url");
check("tampered payload rejected", appVerify(`${brand.licenseKeyPrefix}${forged}.${sig}`) === null);
check("lib rejects tampered payload", !verifyLicense(`${brand.licenseKeyPrefix}${forged}.${sig}`).ok);

// Flip one signature char
const badSig = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
check("bad signature rejected", !verifyLicense(`${brand.licenseKeyPrefix}${segment}.${badSig}`).ok);
check("wrong prefix rejected", !verifyLicense(`nope_${segment}.${sig}`).ok);

// Expired key: signature valid, expired flag set (refresh ignores exp)
const expiredKey = mintLicense({ sub: "cus_TEST123", email: "test@example.com", plan: "pro", exp: now - 10 });
const ex = verifyLicense(expiredKey);
check("expired key: signature valid, expired=true", ex.ok && ex.expired);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
