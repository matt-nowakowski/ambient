import { randomInt } from "node:crypto";
import { ADJECTIVES, NOUNS } from "./license-words";

/**
 * Human-readable license codes: `<adjective>-<noun>-<4 digits>`, e.g.
 * `red-grizzly-4320`. A code is only a lookup handle: the app trades it once
 * at /api/license/activate for the signed token it verifies offline, so the
 * signed-token contract (lib/license.ts) is unchanged.
 *
 * Entropy: log2(ADJECTIVES × NOUNS × 10,000) ≈ 33.3 bits (1,071 × 1,000 ×
 * 10,000 ≈ 1.07e10 codes). That's guessable in bulk, so activation is rate
 * limited (lib/license-code.ts) and only works while the subscription behind
 * the code is active in Polar.
 *
 * Pure (no database, no server-only) so scripts/license-code-test.ts can run it.
 */

const ADJ_SET = new Set(ADJECTIVES);
const NOUN_SET = new Set(NOUNS);
export const CODE_SPACE = ADJECTIVES.length * NOUNS.length * 10_000;
export const CODE_ENTROPY_BITS = Math.log2(CODE_SPACE);

export type CodeRecord = { sub: string; email: string; plan: string };

/** A fresh random code from the CSPRNG. */
export function generateCode(rand: (max: number) => number = randomInt): string {
  const adj = ADJECTIVES[rand(ADJECTIVES.length)];
  const noun = NOUNS[rand(NOUNS.length)];
  const digits = String(rand(10_000)).padStart(4, "0");
  return `${adj}-${noun}-${digits}`;
}

/**
 * Canonical form of something a person typed or pasted, or null if it can't be
 * a code. Forgiving about case, surrounding whitespace, spaces/underscores/dots
 * or repeated hyphens between the parts, and an optional `<slug>-` prefix
 * ("Ambient Red Grizzly 4320" → "red-grizzly-4320"). Both words must be on the
 * lists, so garbage never reaches the database.
 */
export function normalizeCode(input: unknown, slug = "ambient"): string | null {
  if (typeof input !== "string" || input.length > 100) return null;
  let parts = input
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 4 && parts[0] === slug) parts = parts.slice(1);
  if (parts.length !== 3) return null;
  const [adj, noun, digits] = parts;
  if (!ADJ_SET.has(adj) || !NOUN_SET.has(noun) || !/^\d{4}$/.test(digits)) return null;
  return `${adj}-${noun}-${digits}`;
}

/** What getOrCreateCode needs from storage; lib/license-code.ts backs it with Neon. */
export type CodeStore = {
  /** The code already issued to this subject, if any, and whether it's revoked. */
  findBySubject(sub: string): Promise<{ code: string; revoked: boolean } | null>;
  /**
   * Insert a new row; false when either the code (primary key) or the subject
   * (unique) already exists.
   */
  insert(code: string, rec: CodeRecord): Promise<boolean>;
  /** Give a revoked subject a new code; false if the code is taken. */
  replace(code: string, rec: CodeRecord): Promise<boolean>;
};

export const MAX_MINT_ATTEMPTS = 8;

/**
 * One code per subject, idempotent: returns the subject's existing code, or
 * mints one, retrying on the (rare: ~N/1e10) primary-key collision. A revoked
 * subject gets a fresh code so the old one stays dead.
 */
export async function getOrCreateCode(
  store: CodeStore,
  rec: CodeRecord,
  generate: () => string = () => generateCode(),
): Promise<string> {
  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    const existing = await store.findBySubject(rec.sub);
    if (existing && !existing.revoked) return existing.code;
    const code = generate();
    const ok = existing ? await store.replace(code, rec) : await store.insert(code, rec);
    if (ok) return code;
    // Either the code collided (retry with a new one) or another request
    // created this subject's code first (the next findBySubject returns it).
  }
  throw new Error("Couldn't mint a unique license code");
}
