/**
 * Tests /api/feedback's payload validation (lib/feedback-core.ts). No network
 * or database.
 *
 * Run: bun scripts/feedback-test.ts
 */
import { FEEDBACK_LIMITS, jsonBytes, parseFeedback } from "../lib/feedback-core";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const base = { kind: "bug", source: "dialog", message: "It broke.", version: "0.1.6", os: "macos", plan: "pro" };
const err = (body: unknown) => {
  const r = parseFeedback(body);
  return r.ok ? null : r.error;
};

const min = parseFeedback(base);
check("minimal report parses", min.ok && min.value.email === null && min.value.diagnostics === null && min.value.example === null && min.value.install === null);

const full = parseFeedback({
  ...base,
  install: "0123456789abcdef0123456789abcdef",
  email: " Ana@Example.com ",
  diagnostics: { version: "0.1.6", log: ["a", "b"] },
  example: { card: "answer", kind: "web", question: "q?", answer: "a." },
});
check("full report parses, email normalised", full.ok && full.value.email === "ana@example.com" && full.value.example?.kind === "web");

check("not an object", err("hi") === "body" && err(null) === "body" && err([]) === "body");
check("unknown kind", err({ ...base, kind: "rant" }) === "kind");
check("every kind", ["bug", "idea", "other"].every((kind) => parseFeedback({ ...base, kind }).ok));
check("unknown source", err({ ...base, source: "email" }) === "source");
check("every source", ["dialog", "voice", "thumbs"].every((source) => parseFeedback({ ...base, source }).ok));
check("empty message", err({ ...base, message: "   " }) === "message");
check("message at the limit", parseFeedback({ ...base, message: "x".repeat(FEEDBACK_LIMITS.message) }).ok);
check("message over the limit", err({ ...base, message: "x".repeat(FEEDBACK_LIMITS.message + 1) }) === "message");
check("bad email", err({ ...base, email: "not an email" }) === "email" && err({ ...base, email: 5 }) === "email");
check("email too long", err({ ...base, email: `${"a".repeat(250)}@b.co` }) === "email");
check("empty email means none", parseFeedback({ ...base, email: "" }).ok);
check("bad install id", err({ ...base, install: "machine-123" }) === "install");
check("bad version", err({ ...base, version: "0.1.6; drop table" }) === "version" && err({ ...base, version: "" }) === "version");
check("unknown os / plan", err({ ...base, os: "ios" }) === "os" && err({ ...base, plan: "team" }) === "plan");

const bigLog = { log: ["x".repeat(FEEDBACK_LIMITS.diagnostics)] };
check("diagnostics over 64 KB rejected", jsonBytes(bigLog) > FEEDBACK_LIMITS.diagnostics && err({ ...base, diagnostics: bigLog }) === "diagnostics");
const fits = { log: ["x".repeat(FEEDBACK_LIMITS.diagnostics - 20)] };
check("diagnostics just under 64 KB accepted", jsonBytes(fits) <= FEEDBACK_LIMITS.diagnostics && parseFeedback({ ...base, diagnostics: fits }).ok);
check("multibyte diagnostics counted in bytes", err({ ...base, diagnostics: { log: ["é".repeat(40_000)] } }) === "diagnostics");
check("diagnostics must be an object", err({ ...base, diagnostics: ["a"] }) === "diagnostics" && err({ ...base, diagnostics: "log" }) === "diagnostics");

const ex = { card: "suggestion", kind: "summarise_thread", question: "Summarise?", answer: "" };
check("suggestion example accepted", parseFeedback({ ...base, example: ex }).ok);
check("example card unknown", err({ ...base, example: { ...ex, card: "hud" } }) === "example");
check("example extra field rejected", err({ ...base, example: { ...ex, url: "https://x" } }) === "example");
check("example question too long", err({ ...base, example: { ...ex, question: "x".repeat(4001) } }) === "example");
check("example answer too long", err({ ...base, example: { ...ex, answer: "x".repeat(8001) } }) === "example");
check("example kind too long", err({ ...base, example: { ...ex, kind: "x".repeat(41) } }) === "example");
check("example missing field", err({ ...base, example: { card: "answer", kind: "web", question: "q" } }) === "example");

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
