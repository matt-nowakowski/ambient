/**
 * Validation for /api/meetings/email, shared with its test
 * (scripts/meeting-email-test.ts). Pure: no server-only imports.
 *
 * The app sends the notes of one call, already redacted on the device. Every
 * field is capped; anything malformed is rejected rather than trimmed, so the
 * route never emails half of what the user saw.
 */
export const MEETING_EMAIL_LIMITS = {
  title: 200,
  date: 80,
  summary: 4_000,
  listItems: 30,
  itemChars: 500,
  followUp: 6_000,
  maxDurationMin: 1_440,
} as const;

export type MeetingEmailInput = {
  session: string | null;
  title: string;
  date: string;
  durationMin: number;
  summary: string;
  decisions: string[];
  actionItems: string[];
  questions: string[];
  followUp: string;
};

const L = MEETING_EMAIL_LIMITS;

function str(v: unknown, max: number, required = false): string | null {
  if (v === undefined || v === null) return required ? null : "";
  if (typeof v !== "string" || v.length > max) return null;
  return v;
}

function list(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > L.listItems) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || x.length > L.itemChars) return null;
    if (x.trim()) out.push(x);
  }
  return out;
}

/** The parsed body, or null when anything is missing, the wrong type or too long. */
export function parseMeetingEmail(body: unknown): MeetingEmailInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const title = str(b.title, L.title, true);
  const date = str(b.date, L.date);
  const summary = str(b.summary, L.summary);
  const followUp = str(b.follow_up, L.followUp);
  const session = b.session === undefined || b.session === null ? null : typeof b.session === "string" && b.session.length <= 4_096 ? b.session : undefined;
  const duration = b.duration_min ?? 0;
  const decisions = list(b.decisions);
  const actionItems = list(b.action_items);
  const questions = list(b.questions);
  if (title === null || date === null || summary === null || followUp === null || session === undefined) return null;
  if (decisions === null || actionItems === null || questions === null) return null;
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 0 || duration > L.maxDurationMin) return null;
  // Nothing to send: an empty email helps nobody.
  if (!summary.trim() && !decisions.length && !actionItems.length && !questions.length && !followUp.trim()) return null;
  return { session, title, date, durationMin: duration, summary, decisions, actionItems, questions, followUp };
}
