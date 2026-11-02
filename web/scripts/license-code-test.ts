/**
 * Tests the human license code generator, normaliser and get-or-create logic
 * (lib/license-code-core.ts) against an in-memory store. No database needed.
 *
 * Run: bun scripts/license-code-test.ts
 */
import {
  CODE_ENTROPY_BITS,
  MAX_MINT_ATTEMPTS,
  generateCode,
  getOrCreateCode,
  normalizeCode,
  type CodeRecord,
  type CodeStore,
} from "../lib/license-code-core";
import { ADJECTIVES, NOUNS } from "../lib/license-words";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}
async function rejects(fn: () => Promise<unknown>) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

// Word lists
const all = [...ADJECTIVES, ...NOUNS];
check(`${ADJECTIVES.length} adjectives, ${NOUNS.length} nouns (≥ 1000 each)`, ADJECTIVES.length >= 1000 && NOUNS.length >= 1000);
check("words are lowercase a–z, 2–9 letters", all.every((w) => /^[a-z]{2,9}$/.test(w)));
check("no duplicates within or across lists", new Set(all).size === all.length);
const blocked = ["ass", "sex", "sexy", "dead", "kill", "hate", "ugly", "fat", "dumb", "stupid", "pig", "rat", "ape", "monkey", "beaver", "cock", "tit", "booby", "free", "trial", "ambient"];
check("no blocked words", !blocked.some((w) => all.includes(w)));
check(`entropy ≈ ${CODE_ENTROPY_BITS.toFixed(1)} bits (≥ 33)`, CODE_ENTROPY_BITS >= 33);

// Generator
const codes = Array.from({ length: 2000 }, () => generateCode());
check("generated codes match <adj>-<noun>-<4 digits>", codes.every((c) => /^[a-z]+-[a-z]+-\d{4}$/.test(c)));
check("generated codes normalise to themselves", codes.every((c) => normalizeCode(c) === c));
check("2000 generated codes are (almost surely) distinct", new Set(codes).size >= 1999);
check("digits are zero-padded", generateCode((max) => (max === 10_000 ? 7 : 0)).endsWith("-0007"));

// Normaliser
const c = `${ADJECTIVES[0]}-${NOUNS[0]}-4320`;
const [a, n] = [ADJECTIVES[0], NOUNS[0]];
for (const input of [
  c,
  `  ${c.toUpperCase()}  `,
  `${a} ${n} 4320`,
  `${a}_${n}_4320`,
  `${a}--${n}---4320`,
  `${a}.${n}.4320`,
  `ambient-${c}`,
  `Ambient ${a} ${n} 4320`,
  `ambient_${c}`,
  `${a}\u2011${n}\u00a04320`, // non-breaking hyphen and space from an email client
]) {
  check(`normalises ${JSON.stringify(input)}`, normalizeCode(input) === c);
}
for (const input of [
  "",
  "hello",
  `${a}-${n}`,
  `${a}-${n}-432`,
  `${a}-${n}-43200`,
  `${n}-${a}-4320`, // swapped lists
  `zzzz-${n}-4320`,
  `${a}-${n}-4320-extra`,
  "ambient_eyJ2IjoxfQ.c2ln",
  42,
  null,
  "x".repeat(200),
]) {
  check(`rejects ${JSON.stringify(input)?.slice(0, 40)}`, normalizeCode(input) === null);
}

// get-or-create against an in-memory store
function memoryStore() {
  const byCode = new Map<string, CodeRecord & { revoked: boolean }>();
  let inserts = 0;
  const store: CodeStore = {
    async findBySubject(sub) {
      for (const [code, r] of byCode) if (r.sub === sub) return { code, revoked: r.revoked };
      return null;
    },
    async insert(code, rec) {
      inserts++;
      if (byCode.has(code)) return false;
      for (const r of byCode.values()) if (r.sub === rec.sub) return false;
      byCode.set(code, { ...rec, revoked: false });
      return true;
    },
    async replace(code, rec) {
      if (byCode.has(code)) return false;
      for (const [old, r] of byCode) {
        if (r.sub === rec.sub && r.revoked) {
          byCode.delete(old);
          byCode.set(code, { ...rec, revoked: false });
          return true;
        }
      }
      return false;
    },
  };
  return { store, byCode, inserts: () => inserts };
}

const rec = (sub: string): CodeRecord => ({ sub, email: `${sub}@example.com`, plan: "pro" });
const sequence = (...list: string[]) => {
  let i = 0;
  return () => list[Math.min(i++, list.length - 1)];
};

{
  const m = memoryStore();
  const first = await getOrCreateCode(m.store, rec("cus_1"), sequence("red-lion-0001"));
  const again = await getOrCreateCode(m.store, rec("cus_1"), sequence("blue-owl-0002"));
  check("mints a code for a new subject", first === "red-lion-0001");
  check("idempotent: same subject gets the same code", again === first && m.byCode.size === 1);
}
{
  const m = memoryStore();
  await getOrCreateCode(m.store, rec("cus_1"), sequence("red-lion-0001"));
  const code = await getOrCreateCode(m.store, rec("cus_2"), sequence("red-lion-0001", "red-lion-0001", "blue-owl-0002"));
  check("retries on a primary-key collision", code === "blue-owl-0002" && m.inserts() === 4);
}
{
  const m = memoryStore();
  await getOrCreateCode(m.store, rec("cus_1"), sequence("red-lion-0001"));
  check(
    `gives up after ${MAX_MINT_ATTEMPTS} collisions`,
    await rejects(() => getOrCreateCode(m.store, rec("cus_2"), () => "red-lion-0001")),
  );
}
{
  const m = memoryStore();
  await getOrCreateCode(m.store, rec("cus_1"), sequence("red-lion-0001"));
  m.byCode.get("red-lion-0001")!.revoked = true;
  const code = await getOrCreateCode(m.store, rec("cus_1"), sequence("blue-owl-0002"));
  check("a revoked subject gets a fresh code", code === "blue-owl-0002" && !m.byCode.has("red-lion-0001"));
}
{
  // Race: another request creates the subject's row between our lookup and insert.
  const m = memoryStore();
  let raced = false;
  const racing: CodeStore = {
    ...m.store,
    async insert(code, r) {
      if (!raced) {
        raced = true;
        await m.store.insert("green-fox-0003", r);
      }
      return m.store.insert(code, r);
    },
  };
  const code = await getOrCreateCode(racing, rec("cus_9"), sequence("red-lion-0001"));
  check("a concurrent mint for the same subject returns the winner's code", code === "green-fox-0003");
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
