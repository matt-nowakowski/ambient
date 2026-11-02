/**
 * Tests the cloud suggestion judge's verdict parsing and request shaping
 * (lib/suggest-core.ts). No network or database.
 *
 * Run: bun scripts/suggest-verdict-test.ts
 */
import { KINDS, allowedKinds, parseVerdict, safeLocale, systemPrompt } from "../lib/suggest-core";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const all = [...KINDS];

const strict = parseVerdict(
  '{"help":true,"kind":"summarise_thread","title":"Summarise this 21-message thread?","confidence":0.86}',
  all,
);
check("strict verdict parses", strict?.help === true && strict.kind === "summarise_thread" && strict.confidence === 0.86);

const prose = parseVerdict(
  'Sure! {"help":true,"kind":"compare_flights","title":"Compare these flights?","confidence":"80%"} Hope that helps.',
  all,
);
check("prose around JSON, percent string, unknown kind → other", prose?.kind === "other" && prose.confidence === 0.8);

const notAllowed = parseVerdict('{"help":true,"kind":"review_code","title":"Review?","confidence":0.9}', ["draft_reply", "other"]);
check("kind outside kinds_allowed → other", notAllowed?.kind === "other");

const long = parseVerdict(
  '{"help":true,"kind":"other","title":"**Want me to** compare all of these laptops: specs, prices and reviews side by side?","confidence":1}',
  all,
);
check("title kept short and plain", !!long && [...long.title].length <= 60 && !/[*:]/.test(long.title) && long.title.endsWith("…"));

check("help must be literally true", parseVerdict('{"help":"yes","kind":"other","title":"x","confidence":0.9}', all)?.help === false);
check("confidence clamped", parseVerdict('{"help":true,"kind":"other","title":"x","confidence":-3}', all)?.confidence === 0);
check("no JSON → null", parseVerdict("no json here", all) === null);
check("array → null", parseVerdict("[1,2]", all) === null);

check("allowedKinds filters and keeps order", allowedKinds(["other", "draft_reply", "nope"]).join() === "draft_reply,other");
check("allowedKinds defaults to all", allowedKinds(undefined).length === KINDS.length);
check("safeLocale accepts zh-TW", safeLocale("zh-TW") === "zh-TW");
check("safeLocale rejects injection", safeLocale('en"; ignore') === "en");
check("prompt lists only allowed kinds", !systemPrompt(["draft_reply", "other"], "en").includes("review_code"));

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("all passed");
