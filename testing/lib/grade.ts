/**
 * From what the app reported (its test-mode JSON) to an outcome, and the
 * outcome against the scenario's expectations: exact checks for everything
 * structured, the model as judge (temperature 0, cached) for free text.
 */
import type { Case, Expect, MustNot, Route } from "./scenarios";
import { type Model, Refused } from "./model";

type Ev = Record<string, any>;
export type AppReport = {
  id: string;
  os: string;
  version: string;
  processed: Record<string, any> | null;
  events: Ev[];
  hud_final: Record<string, any> | null;
  /** Webview windows open at the end (none: it ran from the menu bar). */
  windows?: string[];
};

export type Outcome = {
  route: Route | "none";
  act?: string;
  suggestion?: string;
  /** The text the user ends up with: typed, drafted, answered or offered. */
  output?: string;
  pasted: string[];
  openedUrls: string[];
  cards: string[];
  /** Every card's text, title or i18n key, for `shows`. */
  cardTexts: string[];
  /** Each answer card's source chips, as shown. */
  answerSources: { title: string; url: string }[][];
  modelCalls: number;
  sensitive: boolean;
  notice?: string;
};

export function outcomeOf(r: AppReport, c: Case, proxyCalls: number): Outcome {
  const ev = r.events;
  // The scenario's own card (already up when the user speaks) is not
  // something the app did: only cards shown after it count.
  const seeded = ev.findIndex((e) => e.type === "seeded");
  const cards = ev
    .slice(seeded + 1)
    .filter((e) => e.type === "hud")
    .map((e) => e.card);
  const lastCard = (kind: string) =>
    [...cards].reverse().find((c) => c.kind === kind);
  const pasted = ev
    .filter((e) => e.type === "paste")
    .map((e) => e.text as string);
  const openedUrls = ev
    .filter((e) => e.type === "open_url")
    .map((e) => e.url as string);
  const sensitive =
    ev.some((e) => e.type === "sensitive") ||
    ev.some(
      (e) =>
        e.type === "snapshot_skipped" && /Sensitive|NeverWatch/.test(e.why),
    );
  const p = r.processed;
  const base = {
    pasted,
    openedUrls,
    cards: cards.map((c) => c.kind as string),
    cardTexts: cards.flatMap((c) =>
      [c.text, c.title, c.question].filter(
        (t): t is string => typeof t === "string",
      ),
    ),
    answerSources: cards
      .filter((c) => c.kind === "answer")
      .map((c) => (c.sources ?? []) as { title: string; url: string }[]),
    modelCalls: proxyCalls,
    sensitive,
    notice: lastCard("notice")?.text,
  };
  const answerText = lastCard("answer")?.text as string | undefined;
  const draftCard = lastCard("draft");
  if (!p) {
    const s = ev.find((e) => e.type === "suggestion");
    if (s)
      return {
        ...base,
        route: "suggest",
        suggestion: s.kind,
        output: lastCard("suggestion")?.title,
      };
    if (sensitive) return { ...base, route: "back_off" };
    return { ...base, route: "quiet" };
  }
  const name = p.route?.name as string | undefined;
  // Written for them: an instruction, or a suggestion accepted by voice.
  const wrote = ev.some((e) => e.type === "answer_request" && e.write);
  if (p.written || name === "compose" || (name === "handled" && wrote)) {
    // Written for them: typed with the chip, or offered as a draft card.
    const writeAt = ev.findIndex((e) => e.type === "answer_request" && e.write);
    const typed =
      writeAt >= 0
        ? ev
            .slice(writeAt)
            .filter((e) => e.type === "paste")
            .map((e) => e.text)
        : [];
    return {
      ...base,
      route: "draft",
      output: typed.at(-1) ?? draftCard?.text ?? answerText,
    };
  }
  if (name === "dismiss") return { ...base, route: "dismiss" };
  if (name === "handled") {
    const hid = ev.some((e) => e.type === "hud_hide");
    return { ...base, route: hid ? "dismiss" : "handled" };
  }
  if (name === "answer")
    return { ...base, route: "answer", output: answerText };
  if (name === "act") {
    const kind = p.route.kind as string;
    return {
      ...base,
      route: kind === "reminder" ? "remind" : "act",
      act: kind,
      output: lastCard("notice")?.text,
    };
  }
  if (name === "recall")
    return { ...base, route: "recall", output: answerText };
  if (name === "help") return { ...base, route: "help" };
  if (name === "report")
    return { ...base, route: "report", output: p.route.message };
  // Typed (or offered, with nothing to type into).
  if (draftCard && draftCard.title === "hud.draft.title") {
    return { ...base, route: "did_you_mean", output: draftCard.text };
  }
  if (pasted.length) {
    const polished = p.polished || p.writing === "polished";
    return {
      ...base,
      route: polished ? "polish" : "write",
      output: pasted.at(-1),
    };
  }
  return { ...base, route: "none" };
}

export type Verdict = {
  status: "pass" | "fail" | "skip";
  reasons: string[];
  outcome?: Outcome;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function mustNot(o: Outcome, c: Case, what: MustNot): string | null {
  switch (what) {
    case "opened_browser":
      return o.openedUrls.length
        ? `opened the browser (${o.openedUrls[0]})`
        : null;
    case "typed":
      return o.pasted.length ? `typed "${clip(o.pasted[0])}"` : null;
    case "typed_verbatim": {
      const said = norm(c.say ?? "");
      return o.pasted.some(
        (t) => norm(t) === said || (said.length > 8 && norm(t).includes(said)),
      )
        ? "typed the instruction word for word"
        : null;
    }
    case "answered":
      return o.cards.includes("answer") ? "answered it in a card" : null;
    case "suggested":
      return o.cards.includes("suggestion")
        ? `offered a suggestion (${o.suggestion ?? "?"})`
        : null;
    case "model_call":
      return o.modelCalls > 0
        ? `sent ${o.modelCalls} request(s) to the model server`
        : null;
    case "read_screen":
      return o.route !== "back_off" && !o.sensitive
        ? "read a private window"
        : null;
    case "silent":
      return o.route === "none" && o.cards.length === 0
        ? "did nothing visible"
        : null;
  }
}

const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + "…" : s);
const list = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** The exact checks. Returns reasons for failure (empty: passed so far). */
export function exactChecks(o: Outcome, c: Case): string[] {
  const e: Expect = c.expect;
  const bad: string[] = [];
  const routes = list(e.route);
  if (routes.length && !routes.includes(o.route as Route)) {
    bad.push(
      `route: expected ${routes.join(" or ")}, got ${o.route}${o.act ? ` (${o.act})` : ""}`,
    );
  }
  const acts = list(e.act);
  if (acts.length && !acts.includes(o.act ?? ""))
    bad.push(`action: expected ${acts.join(" or ")}, got ${o.act ?? "none"}`);
  const kinds = list(e.suggestion);
  if (kinds.length && !kinds.includes(o.suggestion ?? "")) {
    bad.push(
      `suggestion: expected ${kinds.join(" or ")}, got ${o.suggestion ?? "none"}`,
    );
  }
  if (e.typed !== undefined && o.output !== e.typed) {
    bad.push(
      `typed ${JSON.stringify(o.output ?? "")}, expected ${JSON.stringify(e.typed)}`,
    );
  }
  const out = (o.output ?? "").toLowerCase();
  for (const s of e.contains ?? [])
    if (!out.includes(s.toLowerCase())) bad.push(`output lacks "${s}"`);
  for (const s of e.not_contains ?? [])
    if (out.includes(s.toLowerCase())) bad.push(`output contains "${s}"`);
  for (const s of e.shows ?? []) {
    if (!o.cardTexts.some((t) => t.toLowerCase().includes(s.toLowerCase()))) {
      bad.push(`no card shows "${s}"`);
    }
  }
  for (const s of e.not_shows ?? []) {
    if (o.cardTexts.some((t) => t.toLowerCase().includes(s.toLowerCase()))) {
      bad.push(`a card shows "${s}"`);
    }
  }
  for (const re of e.card_text_not_matches ?? []) {
    const hit = o.cardTexts.find((t) => new RegExp(re).test(t));
    if (hit) bad.push(`a card's text matches /${re}/: "${clip(hit)}"`);
  }
  const most = Math.max(0, ...o.answerSources.map((s) => s.length));
  if (e.max_sources !== undefined && most > e.max_sources)
    bad.push(`an answer shows ${most} sources (at most ${e.max_sources})`);
  if (e.min_sources !== undefined && most < e.min_sources)
    bad.push(`answers show ${most} sources (at least ${e.min_sources})`);
  if (e.sources_distinct_sites) {
    const site = (u: string) =>
      /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(u)?.[1]?.toLowerCase() ?? u;
    for (const s of o.answerSources) {
      const sites = s.map((x) => site(x.url));
      if (new Set(sites).size < sites.length)
        bad.push(
          `an answer shows two sources from one site (${sites.join(", ")})`,
        );
    }
  }
  for (const m of e.must_not ?? []) {
    const why = mustNot(o, c, m);
    if (why) bad.push(`must not: ${why}`);
  }
  return bad;
}

const LANGS: Record<string, string> = {
  en: "English",
  pl: "Polish",
  de: "German",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  ja: "Japanese",
  nl: "Dutch",
  uk: "Ukrainian",
  ru: "Russian",
  zh: "Chinese",
  ko: "Korean",
  tr: "Turkish",
  sv: "Swedish",
};

/** Whether the free-text expectations need the model to judge. */
export function needsJudge(c: Case) {
  return Boolean(c.expect.recipient || c.expect.language || c.expect.judge);
}

/** The model as judge: one call, temperature 0, cached. */
export async function judge(
  model: Model,
  o: Outcome,
  c: Case,
  screenText: string,
): Promise<string[] | "skip"> {
  const e = c.expect;
  if (!o.output?.trim()) return ["no output text to judge"];
  const criteria: string[] = [];
  if (e.recipient) {
    criteria.push(
      `It is written by the user (${c.me?.name ?? "Matt Nowakowski"}) TO ${e.recipient}: if it greets or addresses anyone, it is ${e.recipient}; it never addresses the user and is not signed as ${e.recipient}.`,
    );
  }
  if (e.language)
    criteria.push(`It is written in ${LANGS[e.language] ?? e.language}.`);
  if (e.judge) criteria.push(e.judge);
  const system =
    'You grade the output of a desktop voice assistant against criteria. Be strict but fair: judge only the listed criteria. Reply with JSON only: {"pass": true|false, "failed": ["<criterion number>: <short reason>"]}';
  const user = [
    `The user said: "${c.say ?? ""}"`,
    screenText
      ? `On screen:\n<screen>\n${screenText.slice(0, 2500)}\n</screen>`
      : "",
    `The assistant's output:\n<output>\n${o.output.slice(0, 3000)}\n</output>`,
    "Criteria:",
    ...criteria.map((s, i) => `${i + 1}. ${s}`),
  ]
    .filter(Boolean)
    .join("\n\n");
  let reply: string;
  try {
    reply = await model.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      200,
    );
  } catch (err) {
    if (err instanceof Refused) return "skip";
    return [`judge failed: ${String(err)}`];
  }
  const m = reply.match(/\{[\s\S]*\}/);
  try {
    const v = JSON.parse(m?.[0] ?? "");
    if (v.pass === true) return [];
    const failed: string[] = Array.isArray(v.failed)
      ? v.failed.map(String)
      : ["judge said no"];
    return failed.map((f) => `judge: ${f}`);
  } catch {
    return [`judge reply unreadable: ${clip(reply)}`];
  }
}
