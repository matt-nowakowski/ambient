import "server-only";
import { TIPS_SOURCE } from "../activity";
import { activityDb, isDatabaseConfigured } from "../db";
import { resendApi, sendEmail } from "./resend";
import { emailHash, unsubscribeLinks } from "./subscriptions";
import { TIP_SEQUENCES } from "./templates";
import { dailyQuota } from "../admin/customers";
import { afterTip, dueTips, firstTipAt, tipLanguage, tipsBudget } from "./tip-schedule";
import type { TipsRequest } from "./tokens";

/**
 * "Email me tips" from the app, after the address is confirmed: a row in
 * `accounts` (source 'tips') for the admin, and a place in the tips sequence
 * (`tip_sequence`), which the daily cron (/api/cron/tips) works through.
 *
 * Nothing is written before the confirmation link is clicked, so a stranger's
 * address typed into the app never reaches the database. A signed-in row is
 * never changed by tips: no new device hash or language, no last_seen bump.
 */
export async function startTips(email: string, req: TipsRequest, now = new Date()): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const sql = await activityDb();
  await sql.transaction([
    sql`
      insert into accounts (email, plan, source, language, device_hash)
      values (${email}, ${req.pl}, ${TIPS_SOURCE}, ${req.g}, ${req.d})
      on conflict (email) do update set
        plan = excluded.plan,
        language = coalesce(excluded.language, accounts.language),
        device_hash = coalesce(excluded.device_hash, accounts.device_hash)
      where accounts.source = ${TIPS_SOURCE}`,
    // Confirming again never restarts or repeats the sequence.
    sql`
      insert into tip_sequence (email, language, next_at)
      values (${email}, ${req.g}, ${firstTipAt(now).toISOString()}::timestamptz)
      on conflict (email) do nothing`,
  ]);
}

/**
 * Unsubscribing from anything we send ends tips too: the sequence row goes,
 * and so does a tips-only `accounts` row. A signed-in row stays (it's how the
 * account is known), it just gets no more tips.
 */
export async function stopTips(email: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const sql = await activityDb();
  await sql.transaction([
    sql`delete from tip_sequence where email = ${email}`,
    sql`delete from accounts where email = ${email} and source = ${TIPS_SOURCE}`,
  ]);
}

type ContactState = "subscribed" | "gone" | "unknown";

/** Whether Resend still has the address opted in (an unsubscribe from a Broadcast footer lands only there). */
async function contactState(email: string): Promise<ContactState> {
  const r = await resendApi<{ unsubscribed?: boolean }>("GET", `/contacts/${encodeURIComponent(email)}`);
  if (r.ok) return r.data?.unsubscribed ? "gone" : "subscribed";
  return r.status === 404 ? "gone" : "unknown";
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every language has the same tips, so English's count is the sequence length. */
const TIP_COUNT = TIP_SEQUENCES.en.length;

export type TipsRun = { due: number; sent: number; stopped: number; failed: number; budget: number };

/**
 * Sends the tips that are due, up to today's tips budget (tipsBudget in
 * tip-schedule.ts: what's left of Resend's daily quota after a reserve for
 * sign-in codes and billing links), one at a time and spaced out for
 * Resend's rate limit. Tips over the budget stay due for a later run. A tip that fails stays due for the next run;
 * the idempotency key (address + step) stops a retry within 24 hours from
 * sending it twice.
 */
export async function runTips(now = new Date()): Promise<TipsRun> {
  const run: TipsRun = { due: 0, sent: 0, stopped: 0, failed: 0, budget: 0 };
  if (!isDatabaseConfigured()) return run;
  // Counted before anything else, so a busy day skips the run without waking Neon.
  const quota = await dailyQuota();
  if (!quota.ok) console.error("[tips] couldn't read today's email count; skipping this run");
  run.budget = tipsBudget(quota.ok ? quota.used : null);
  if (run.budget === 0) return run;
  const sql = await activityDb();
  const rows = await sql`
    select email, step, next_at, language from tip_sequence
    where next_at is not null and next_at <= ${now.toISOString()}::timestamptz
    order by next_at limit ${run.budget}`;
  const due = dueTips(
    rows.map((r: Record<string, unknown>) => ({
      email: String(r.email),
      step: Number(r.step),
      nextAt: r.next_at ? new Date(r.next_at as string) : null,
      language: typeof r.language === "string" ? r.language : null,
    })),
    now,
    TIP_COUNT,
    run.budget,
  );
  run.due = due.length;

  for (const [i, row] of due.entries()) {
    if (i > 0) await pause(1_100);
    const state = await contactState(row.email);
    if (state === "unknown") {
      run.failed++;
      continue;
    }
    if (state === "gone") {
      await stopTips(row.email);
      run.stopped++;
      continue;
    }
    const links = unsubscribeLinks(row.email, "newsletter");
    if (!links) {
      run.failed++;
      continue;
    }
    const email = TIP_SEQUENCES[tipLanguage(row.language)][row.step]({ audience: "tips", unsubscribeUrl: links.page });
    const sent = await sendEmail({
      to: row.email,
      email,
      unsubscribePostUrl: links.oneClick,
      idempotencyKey: `tip/${emailHash(row.email)}/${row.step}`,
      tags: { tip: String(row.step + 1) },
    });
    if (!sent.ok) {
      run.failed++;
      continue;
    }
    const next = afterTip(row.step, new Date(), TIP_COUNT);
    await sql`
      update tip_sequence set step = ${next.step}, next_at = ${next.nextAt?.toISOString() ?? null}::timestamptz
      where email = ${row.email} and step = ${row.step}`;
    run.sent++;
  }
  return run;
}
