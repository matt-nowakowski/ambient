/**
 * The cloud suggestion judge's prompt and verdict parsing, shared by
 * /api/agent/suggest and its test (scripts/suggest-verdict-test.ts). Pure: no
 * server-only imports. Mirrors the app's on-device judge
 * (src-tauri/src/agent/judge.rs), so both produce the same verdict.
 */

import { CONTEXT_FRAME, tagged } from "./prompt-rules";
import { stripReasoning } from "./reasoning";

/** Same bound as the app's on-device judge. */
export const MAX_TEXT = 3_500;
export const MAX_OFFER_TITLE = 60;

/** Kinds the judge may name; keep in sync with JUDGE_KINDS in judge.rs. */
export const KINDS = [
  "summarise_thread",
  "draft_reply",
  "add_to_calendar",
  "summarise_page",
  "explain_error",
  "fix_formula",
  "review_code",
  "translate_page",
  "fill_form",
  "add_reminder",
  "meeting_prep",
  "other",
] as const;
export type Kind = (typeof KINDS)[number];

const KIND_HINTS: Record<Kind, string> = {
  draft_reply: "someone asked or told them something and is waiting (email, chat, a comment). When the latest message asks them something, this beats a summary",
  summarise_thread: "a long email thread or a busy chat to catch up on",
  summarise_page: "a long article, document, report or PDF",
  add_to_calendar: "a meeting, call or event with a day and time being arranged, or an invitation",
  add_reminder: 'they\'re asked to do something by a date ("send it by Friday", "due Nov 12")',
  explain_error: "an error, crash, failed build or failing test",
  translate_page: "text in a language they don't read (see Reads)",
  meeting_prep: "a meeting about to start, or its agenda on screen: a brief from their notes and past messages",
  fix_formula: "spreadsheet errors",
  review_code: "a pull request or diff",
  fill_form: "a form they're filling in",
  other:
    "anything else you can do with the text on screen or a web search: explain a dense paragraph or a contract clause, compare options or prices, pull out the numbers or action items, find a file or message it mentions, answer the question on screen",
};

/** The moment lines the app sends (site, typing, local time, languages). */
export const MAX_CONTEXT = 400;

export type Verdict = { help: boolean; kind: Kind; title: string; confidence: number };
export const NO_HELP: Verdict = { help: false, kind: "other", title: "", confidence: 0 };

/** The kinds a request allows, in canonical order; all of them when not given. */
export function allowedKinds(requested: unknown): Kind[] {
  if (!Array.isArray(requested)) return [...KINDS];
  return KINDS.filter((k) => requested.includes(k));
}

/** A BCP 47-ish language code, else English. */
export function safeLocale(locale: unknown): string {
  return typeof locale === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(locale) ? locale : "en";
}

/**
 * Mirrors `instructions` in src-tauri/src/agent/judge.rs (the on-device
 * judge): change both together.
 */
export function systemPrompt(kinds: readonly Kind[], locale: string) {
  return `You're a capable colleague glancing at the user's screen. They've just stayed on this window. Ask yourself: is there ONE concrete thing I could do for them right now, from what's on screen? If there is, offer it; a good offer saves them a few minutes. Say no when nothing on screen gives you something specific to do.
${CONTEXT_FRAME} The lines before it (Site, Typing, Now, Reads) describe the moment.
Reply with JSON only, no prose:
{"help":true,"kind":"${kinds.join("|")}","title":"...","confidence":0.0}
What you can do, as kind:
${kinds.map((k) => `- ${k}: ${KIND_HINTS[k]}.`).join("\n")}
Offer, for example, for: a message ending "can you send the deck?" (draft_reply); a 20-message thread (summarise_thread); "Thursday 3pm works?" (add_to_calendar); a stack trace (explain_error); a German article when Reads is en (translate_page); a lease with dense clauses (other); a table comparing three plans (other). Use only the kinds listed.
Don't offer for: an inbox or feed list, a home or search page, settings, a login, a video or music player, a game, code they're typing that has no error, a short message already answered, their own half-written draft, or filler and placeholder text. Never name a thread, error or person that isn't in the window.
- title: the offer as one short, concrete question in the language with code "${locale}", at most ${MAX_OFFER_TITLE} characters, naming the real specifics from this window (who, what, which error, which language, how many). Shapes like these, filled in from the window, never copied, with every <…> replaced by the real thing: "Want me to summarise this thread about <topic>?", "This page is in <language>. Translate it?", "That test failed on <cause>. Want the fix?", "Reply to <name> about <topic>?", "Remind you to <task> by <day>?".
- confidence: 0 to 1, how likely they'd say yes.`;
}

/** What the judge reads: the app, the window, the moment's lines, then the text. */
export function userMessage(app: string, title: string, context: string, text: string) {
  const moment = context.trim() ? `${context.slice(0, MAX_CONTEXT)}\n` : "";
  return `App: ${app}\nWindow: ${title}\n${moment}${tagged("window_text", text)}`;
}

/**
 * The model's reply as a strict verdict, tolerating prose around the JSON, a
 * confidence given as a string or a percentage, and kinds outside `allowed`
 * (→ "other"). Null when there's no JSON object to read.
 */
export function parseVerdict(reply: string, allowed: readonly Kind[]): Verdict | null {
  // Braces inside a leaked reasoning block are not the verdict.
  reply = stripReasoning(reply);
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  let confidence =
    typeof r.confidence === "number"
      ? r.confidence
      : typeof r.confidence === "string"
        ? parseFloat(r.confidence.trim().replace(/%$/, ""))
        : 0;
  if (!Number.isFinite(confidence)) confidence = 0;
  if (confidence > 1) confidence /= 100; // "85" or "85%"
  confidence = Math.min(Math.max(confidence, 0), 1);
  const kindRaw = typeof r.kind === "string" ? r.kind.trim().toLowerCase() : "";
  const kind: Kind = (allowed as readonly string[]).includes(kindRaw) ? (kindRaw as Kind) : "other";
  // The app shows the title as text: one line, no markup, bounded.
  let title = (typeof r.title === "string" ? r.title : "")
    .replace(/[\n\r*`#:]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  const chars = [...title];
  if (chars.length > MAX_OFFER_TITLE) title = chars.slice(0, MAX_OFFER_TITLE - 1).join("").trimEnd() + "…";
  return { help: r.help === true, kind, title, confidence: Math.round(confidence * 100) / 100 };
}
