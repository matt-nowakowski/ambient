import "server-only";
import { db } from "./db";
import { FEEDBACK_LIMITS, type FeedbackInput, type FeedbackStatus } from "./feedback-core";

/**
 * Feedback and bug reports from the app (/api/feedback), read by the admin
 * inbox. One table, created on first use (additive, never dropped).
 *
 * Retention: a report is deleted 180 days after it arrived, or 30 days after
 * it was marked done, whichever comes first. Pruned at most once a day per
 * server instance, piggybacking on a write.
 */
export const FEEDBACK_RETENTION_DAYS = 180;
export const FEEDBACK_DONE_RETENTION_DAYS = 30;

let ready: Promise<unknown> | null = null;
let lastPruneDay = "";

export async function feedbackDb() {
  const sql = await db();
  ready ??= sql`
    create table if not exists feedback (
      id bigserial primary key,
      created timestamptz not null default now(),
      kind text not null,
      source text not null default 'dialog',
      message text not null,
      email text,
      version text not null,
      os text not null,
      plan text not null,
      diagnostics jsonb,
      example jsonb,
      status text not null default 'open',
      note text not null default '',
      done_at timestamptz
    )`.then(() => sql`create index if not exists feedback_created_idx on feedback (created desc)`);
  try {
    await ready;
  } catch (err) {
    ready = null; // retry on the next call
    throw err;
  }
  return sql;
}

export async function insertFeedback(f: FeedbackInput) {
  const sql = await feedbackDb();
  await sql`
    insert into feedback (kind, source, message, email, version, os, plan, diagnostics, example)
    values (${f.kind}, ${f.source}, ${f.message}, ${f.email}, ${f.version}, ${f.os}, ${f.plan},
      ${f.diagnostics ? JSON.stringify(f.diagnostics) : null}::jsonb,
      ${f.example ? JSON.stringify(f.example) : null}::jsonb)`;
  await pruneFeedbackIfDue();
}

export async function pruneFeedbackIfDue(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (lastPruneDay === day) return;
  const sql = await feedbackDb();
  await sql`
    delete from feedback
    where created < now() - make_interval(days => ${FEEDBACK_RETENTION_DAYS}::int)
       or (status = 'done' and done_at < now() - make_interval(days => ${FEEDBACK_DONE_RETENTION_DAYS}::int))`;
  lastPruneDay = day;
}

export async function setFeedbackStatus(id: number, status: FeedbackStatus) {
  const sql = await feedbackDb();
  await sql`
    update feedback set status = ${status},
      done_at = case when ${status} = 'done' then coalesce(done_at, now()) else null end
    where id = ${id}`;
}

export async function setFeedbackNote(id: number, note: string) {
  const sql = await feedbackDb();
  await sql`update feedback set note = ${note.slice(0, FEEDBACK_LIMITS.note)} where id = ${id}`;
}
