import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Just enough of the S3 API to talk to Cloudflare R2 from a Vercel function:
 * SigV4 presigned URLs (the browser uploads and downloads straight from R2,
 * never through a function) and a few signed HEAD / DELETE / LIST calls.
 * node:crypto only, no AWS SDK.
 *
 * Env (same names as the GitHub release secrets):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   R2_BUCKET   optional, default "ambient-builds"
 */
const REGION = "auto";
const SERVICE = "s3";

export const R2_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as const;

export function r2Configured() {
  return R2_ENV.every((k) => Boolean(process.env[k]));
}
export const r2MissingEnv = () => R2_ENV.filter((k) => !process.env[k]);

function config() {
  return {
    host: `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    bucket: process.env.R2_BUCKET || "ambient-builds",
    keyId: process.env.R2_ACCESS_KEY_ID as string,
    secret: process.env.R2_SECRET_ACCESS_KEY as string,
  };
}

/** RFC 3986 encoding, as SigV4 wants it. */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s).digest();

function stamp(now: Date) {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, day: amzDate.slice(0, 8) };
}

function signature(secret: string, day: string, toSign: string) {
  const k = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), REGION), SERVICE), "aws4_request");
  return createHmac("sha256", k).update(toSign).digest("hex");
}

const objectPath = (bucket: string, key: string) => `/${bucket}/${key.split("/").map(enc).join("/")}`;
const canonicalQuery = (q: Record<string, string>) =>
  Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join("&");

/**
 * A presigned URL for GET or PUT. `headers` are signed and must be sent as
 * given (a PUT's Content-Type); `query` adds response overrides such as
 * response-content-disposition.
 */
export function presign(
  method: "GET" | "PUT",
  key: string,
  { expires = 3600, headers = {}, query = {} }: { expires?: number; headers?: Record<string, string>; query?: Record<string, string> } = {},
) {
  const c = config();
  const { amzDate, day } = stamp(new Date());
  const scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const hdrs: Record<string, string> = { host: c.host };
  for (const [k, v] of Object.entries(headers)) hdrs[k.toLowerCase()] = v.trim();
  const names = Object.keys(hdrs).sort();
  const q: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.keyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(expires, 604800)),
    "X-Amz-SignedHeaders": names.join(";"),
  };
  const path = objectPath(c.bucket, key);
  const canonical = [method, path, canonicalQuery(q), names.map((n) => `${n}:${hdrs[n]}\n`).join(""), names.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  const sig = signature(c.secret, day, ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n"));
  return `https://${c.host}${path}?${canonicalQuery(q)}&X-Amz-Signature=${sig}`;
}

/** A header-signed request with an empty body (HEAD, DELETE, GET of a listing). */
async function signedFetch(method: "HEAD" | "DELETE" | "GET", key: string | null, query: Record<string, string> = {}) {
  const c = config();
  const { amzDate, day } = stamp(new Date());
  const scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const payload = sha256("");
  const hdrs: Record<string, string> = { host: c.host, "x-amz-content-sha256": payload, "x-amz-date": amzDate };
  const names = Object.keys(hdrs).sort();
  const path = key === null ? `/${c.bucket}` : objectPath(c.bucket, key);
  const qs = canonicalQuery(query);
  const canonical = [method, path, qs, names.map((n) => `${n}:${hdrs[n]}\n`).join(""), names.join(";"), payload].join("\n");
  const sig = signature(c.secret, day, ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n"));
  return fetch(`https://${c.host}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      "x-amz-content-sha256": payload,
      "x-amz-date": amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${c.keyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`,
    },
    cache: "no-store",
  });
}

/** The object's size in bytes, or null when it doesn't exist. */
export async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const res = await signedFetch("HEAD", key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${res.status}`);
  return { size: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") };
}

export async function deleteObject(key: string) {
  const res = await signedFetch("DELETE", key);
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`);
}

/** Total bytes and object count under a prefix (ListObjectsV2, 1000 keys a page). */
export async function prefixUsage(prefix: string): Promise<{ bytes: number; objects: number }> {
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await signedFetch("GET", null, { "list-type": "2", prefix, ...(token ? { "continuation-token": token } : {}) });
    if (!res.ok) throw new Error(`R2 LIST ${res.status}`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Size>(\d+)<\/Size>/g)) {
      bytes += Number(m[1]);
      objects++;
    }
    token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1];
    if (!token) break;
  }
  return { bytes, objects };
}

/** `attachment` with a plain ASCII fallback name and the UTF-8 one. */
export function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${enc(filename)}`;
}
