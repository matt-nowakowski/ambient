/**
 * Validation for /api/feedback, shared with the admin inbox and the test
 * (scripts/feedback-test.ts). Pure: no server-only imports.
 *
 * The app sends feedback only when the user chooses to (the dialog, a 👎 on a
 * card, or a report by voice), after showing exactly what will be sent.
 * Diagnostics and the example card are opt-in and already redacted on the
 * device. Anything outside these shapes and sizes is rejected.
 */
export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export const FEEDBACK_SOURCES = ["dialog", "voice", "thumbs"] as const;
export const FEEDBACK_OS = ["macos", "windows", "linux"] as const;
export const FEEDBACK_PLANS = ["free", "pro", "trial"] as const;
export const FEEDBACK_STATUSES = ["open", "triaged", "done"] as const;
export const EXAMPLE_CARDS = ["answer", "suggestion"] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
export type FeedbackOs = (typeof FEEDBACK_OS)[number];
export type FeedbackPlan = (typeof FEEDBACK_PLANS)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_LIMITS = {
  message: 4_000,
  email: 254,
  version: 20,
  /** Serialized JSON, in bytes. */
  diagnostics: 64 * 1024,
  exampleKind: 40,
  question: 4_000,
  answer: 8_000,
  note: 2_000,
} as const;

export type FeedbackExample = { card: (typeof EXAMPLE_CARDS)[number]; kind: string; question: string; answer: string };

export type FeedbackInput = {
  install: string | null;
  kind: FeedbackKind;
  source: FeedbackSource;
  message: string;
  email: string | null;
  version: string;
  os: FeedbackOs;
  plan: FeedbackPlan;
  diagnostics: Record<string, unknown> | null;
  example: FeedbackExample | null;
};

export type FeedbackParse = { ok: true; value: FeedbackInput } | { ok: false; error: string };

const L = FEEDBACK_LIMITS;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;
const VERSION = /^[0-9A-Za-z.+-]{1,20}$/;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Bytes of `v` as JSON (UTF-8). */
export function jsonBytes(v: unknown) {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

export function parseFeedback(body: unknown): FeedbackParse {
  if (!isObject(body)) return { ok: false, error: "body" };
  const b = body;

  let install: string | null = null;
  if (b.install !== undefined && b.install !== null) {
    if (typeof b.install !== "string" || !/^[0-9a-f]{32}$/.test(b.install)) return { ok: false, error: "install" };
    install = b.install;
  }
  if (!oneOf(FEEDBACK_KINDS, b.kind)) return { ok: false, error: "kind" };
  if (!oneOf(FEEDBACK_SOURCES, b.source)) return { ok: false, error: "source" };
  if (typeof b.message !== "string" || !b.message.trim() || b.message.length > L.message) return { ok: false, error: "message" };

  let email: string | null = null;
  if (b.email !== undefined && b.email !== null && b.email !== "") {
    if (typeof b.email !== "string") return { ok: false, error: "email" };
    const e = b.email.trim().toLowerCase();
    if (e.length > L.email || !EMAIL.test(e)) return { ok: false, error: "email" };
    email = e;
  }
  if (typeof b.version !== "string" || !VERSION.test(b.version)) return { ok: false, error: "version" };
  if (!oneOf(FEEDBACK_OS, b.os)) return { ok: false, error: "os" };
  if (!oneOf(FEEDBACK_PLANS, b.plan)) return { ok: false, error: "plan" };

  let diagnostics: Record<string, unknown> | null = null;
  if (b.diagnostics !== undefined && b.diagnostics !== null) {
    if (!isObject(b.diagnostics) || jsonBytes(b.diagnostics) > L.diagnostics) return { ok: false, error: "diagnostics" };
    diagnostics = b.diagnostics;
  }

  let example: FeedbackExample | null = null;
  if (b.example !== undefined && b.example !== null) {
    const x = b.example;
    if (
      !isObject(x) ||
      !oneOf(EXAMPLE_CARDS, x.card) ||
      typeof x.kind !== "string" ||
      x.kind.length > L.exampleKind ||
      typeof x.question !== "string" ||
      x.question.length > L.question ||
      typeof x.answer !== "string" ||
      x.answer.length > L.answer ||
      Object.keys(x).some((k) => !["card", "kind", "question", "answer"].includes(k))
    ) {
      return { ok: false, error: "example" };
    }
    example = { card: x.card, kind: x.kind, question: x.question, answer: x.answer };
  }

  return {
    ok: true,
    value: { install, kind: b.kind, source: b.source, message: b.message.trim(), email, version: b.version, os: b.os, plan: b.plan, diagnostics, example },
  };
}
