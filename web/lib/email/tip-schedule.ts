/**
 * When each tips email is due. Pure, so scripts/tips-schedule-test.ts can
 * check it without a database or Resend.
 *
 * The first tip is due a day after the address is confirmed, then one every
 * TIP_GAP_DAYS after the previous one actually went out (so a missed cron
 * run delays the rest instead of bunching them up). The tips cron runs once
 * a day at a fixed time, so each delay is shortened by SLACK_HOURS: a tip
 * confirmed or sent a little after the run is still picked up by the run a
 * day (or three weeks) later, not the one after.
 */
export const TIP_FIRST_DELAY_DAYS = 1;
export const TIP_GAP_DAYS = 21;
export const SLACK_HOURS = 6;
/**
 * Email quota. Resend's free plan allows 100 emails a day for the whole
 * account, shared by everything we send. Sign-in codes, billing links,
 * welcome emails and meeting notes can't wait; tips can. So tips only use
 * what's left after keeping EMAIL_RESERVE free for the rest of the day, and
 * never more than TIPS_PER_RUN in a run. Anything not sent stays due and goes
 * out on a later run. Raise these when the Resend plan grows.
 */
export const DAILY_EMAIL_LIMIT = 100;
export const EMAIL_RESERVE = 60;
/** At most this many tips per cron run, well under the daily limit. */
export const TIPS_PER_RUN = 20;

/**
 * How many tips this run may send, given the emails sent in the last 24
 * hours. Unknown (Resend couldn't be read) sends none: tips can wait a day.
 */
export function tipsBudget(sentLast24h: number | null): number {
  if (sentLast24h === null || !Number.isFinite(sentLast24h)) return 0;
  return Math.max(0, Math.min(TIPS_PER_RUN, DAILY_EMAIL_LIMIT - EMAIL_RESERVE - sentLast24h));
}

const DAY_MS = 86_400_000;
const after = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS - SLACK_HOURS * 3_600_000);

/** When the first tip is due for an address confirmed at `confirmedAt`. */
export const firstTipAt = (confirmedAt: Date) => after(confirmedAt, TIP_FIRST_DELAY_DAYS);

/**
 * Progress after tip number `sent` (0-based) went out at `sentAt`, in a
 * sequence of `total`: the next step, and when it's due (null once done).
 */
export function afterTip(sent: number, sentAt: Date, total: number): { step: number; nextAt: Date | null } {
  const step = sent + 1;
  return { step, nextAt: step >= total ? null : after(sentAt, TIP_GAP_DAYS) };
}

export type TipRow = { email: string; step: number; nextAt: Date | null };

/** Rows due at `now`, earliest first, at most `cap`; rows past the end of the sequence are never due. */
export function dueTips<T extends TipRow>(rows: T[], now: Date, total: number, cap = TIPS_PER_RUN): T[] {
  return rows
    .filter((r) => r.nextAt !== null && r.nextAt.getTime() <= now.getTime() && r.step >= 0 && r.step < total)
    .sort((a, b) => (a.nextAt as Date).getTime() - (b.nextAt as Date).getTime())
    .slice(0, Math.max(0, cap));
}

/** Languages the tips are written in. Everything else gets English. */
export const TIP_LANGUAGES = ["en"] as const;
export type TipLanguage = (typeof TIP_LANGUAGES)[number];

/** The tips language for an app language ("pt-BR" → "pt" if we had it), else English. */
export function tipLanguage(appLanguage: string | null | undefined): TipLanguage {
  const base = (appLanguage ?? "").toLowerCase().split("-")[0];
  return (TIP_LANGUAGES as readonly string[]).includes(base) ? (base as TipLanguage) : "en";
}
