import "server-only";
import { freeAiPerWeek } from "./agent/config-store";
import { currentWeek, db, isDatabaseConfigured } from "./db";
import { verifyLicense, type LicensePayload } from "./license";
import { machineKey, parseMachine } from "./machine";
import { tokensFrom, type UsageKind, type UsagePlan } from "./usage";

/**
 * Hosted AI polish (Pro). The desktop app talks to this OpenAI-compatible
 * endpoint with the user's signed Pro token as the bearer token; we hold the model
 * provider's key (Baseten) and never ship it in the app.
 *
 * No database: a request is allowed only for a valid, unexpired paid license,
 * every request is size-capped and pinned to our model with thinking off, and a
 * per-license rate limit (per server instance) stops runaway loops.
 */
export const POLISH_MODEL_ID = "polish";

const BASETEN_URL = "https://inference.baseten.co/v1/chat/completions";
const UPSTREAM_MODEL = process.env.AI_MODEL ?? "deepseek-ai/DeepSeek-V4-Flash-0731";

export const LIMITS = {
  maxMessages: 8,
  maxInputChars: 16_000,
  maxOutputTokens: 2_048,
  perMinute: 60,
} as const;

export type Authorized =
  | { ok: true; kind: "paid"; subject: string; license: LicensePayload }
  | { ok: true; kind: "free"; subject: string }
  | { ok: false; status: number; error: string };

/** Prefix of the bearer token Free users send: `free_<sha256 of machine id>`. */
export const FREE_TOKEN_PREFIX = "free_";

/**
 * `Authorization: Bearer <license key>` for Pro, Team and the trial (valid,
 * unexpired, verified offline), or `Bearer free_<machine>` for Free's weekly
 * polish allowance.
 */
export function authorize(req: Request): Authorized {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "missing_license" };
  if (token.startsWith(FREE_TOKEN_PREFIX)) {
    const machine = parseMachine(token.slice(FREE_TOKEN_PREFIX.length));
    if (!machine) return { ok: false, status: 401, error: "invalid_machine" };
    return { ok: true, kind: "free", subject: machineKey(machine) };
  }
  const result = verifyLicense(token);
  if (!result.ok) return { ok: false, status: 401, error: "invalid_license" };
  if (result.expired) return { ok: false, status: 402, error: "license_expired" };
  return { ok: true, kind: "paid", subject: result.payload.sub, license: result.payload };
}

/**
 * Takes one of Free's weekly AI uses (polish, answers, actions, summaries);
 * false when the week's allowance (`free.ai_per_week`) is used.
 */
export async function consumeFreePolish(subject: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const [sql, limit] = await Promise.all([db(), freeAiPerWeek()]);
  const { week } = currentWeek();
  const rows = await sql`
    insert into polish_usage (machine, week, count) values (${subject}, ${week}, 1)
    on conflict (machine, week) do update set count = polish_usage.count + 1
    where polish_usage.count < ${limit}
    returning count`;
  // First polish of a new week: drop older weeks, so only the current count is
  // ever kept (the privacy policy relies on this).
  if (rows[0]?.count === 1) {
    await sql`delete from polish_usage where machine = ${subject} and week < ${week}`;
  }
  return rows.length > 0;
}

/** Gives a polish back when the model call failed. */
export async function refundFreePolish(subject: string) {
  const sql = await db();
  const { week } = currentWeek();
  await sql`update polish_usage set count = greatest(count - 1, 0) where machine = ${subject} and week = ${week}`;
}

const windows = new Map<string, number[]>();

/** Sliding one-minute window per license, in this instance's memory. */
export function rateLimited(subject: string, now = Date.now()): boolean {
  const recent = (windows.get(subject) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMITS.perMinute) {
    windows.set(subject, recent);
    return true;
  }
  recent.push(now);
  windows.set(subject, recent);
  if (windows.size > 10_000) windows.clear(); // bound memory
  return false;
}

type Message = { role: "system" | "user" | "assistant"; content: string };

/** Accepts only plain-text chat messages within the caps. */
export function parseMessages(body: unknown): Message[] | null {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > LIMITS.maxMessages) return null;
  const out: Message[] = [];
  let chars = 0;
  for (const m of raw) {
    const role = (m as Message)?.role;
    const content = (m as Message)?.content;
    if (!["system", "user", "assistant"].includes(role) || typeof content !== "string") return null;
    chars += content.length;
    out.push({ role, content });
  }
  return chars <= LIMITS.maxInputChars ? out : null;
}

export function isConfigured() {
  return Boolean(process.env.BASETEN_API_KEY);
}

/**
 * Time limits for one completion (both attempts together, and each attempt).
 * Short replies (polish asks for a few hundred tokens at most) get the tight
 * pair, inside the app's 10 s polish deadline; long ones (summaries) keep
 * room to finish.
 */
export function completionBudget(maxTokens: number) {
  return maxTokens <= SHORT_REPLY_TOKENS
    ? { totalMs: 9_000, attemptMs: 6_000 }
    : { totalMs: 16_000, attemptMs: 8_000 };
}
const SHORT_REPLY_TOKENS = 600;

/**
 * Calls the model with thinking off; returns an OpenAI-style completion.
 * `budget` overrides the time limits (e.g. the suggestion judge, which is
 * only worth anything within a few seconds).
 */
export async function complete(
  messages: Message[],
  body: Record<string, unknown>,
  budgetOverride?: { totalMs: number; attemptMs: number },
) {
  const requested = Number(body.max_tokens ?? body.max_completion_tokens);
  const maxTokens = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, LIMITS.maxOutputTokens)
    : LIMITS.maxOutputTokens;
  const temperature = typeof body.temperature === "number" ? Math.min(Math.max(body.temperature, 0), 1) : 0.2;

  const request = JSON.stringify({
    model: UPSTREAM_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    // Clean-up never benefits from reasoning; it only adds latency.
    chat_template_kwargs: { thinking: false },
  });
  // Fail fast: when polish fails the app pastes the raw transcript, which
  // beats making someone wait. One retry covers an occasional slow replica,
  // within one overall budget the app's own 10 s deadline can outlast (two
  // full 8 s attempts used to run past it, so the app gave up first).
  const budget = budgetOverride ?? completionBudget(maxTokens);
  const deadline = Date.now() + budget.totalMs;
  let upstream: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2 && !upstream; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) break;
    try {
      const res = await fetch(BASETEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${process.env.BASETEN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: request,
        signal: AbortSignal.timeout(Math.min(budget.attemptMs, remaining)),
      });
      if (res.ok) upstream = res;
      else if (res.status < 500) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 200)}`);
      else lastError = new Error(`upstream ${res.status}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("upstream 4")) throw err;
      lastError = err;
    }
  }
  if (!upstream) throw lastError ?? new Error("upstream timed out");
  const data = await upstream.json();
  // Present our own model id and drop provider-specific fields.
  for (const choice of data.choices ?? []) delete choice.message?.reasoning_content;
  return { ...data, model: POLISH_MODEL_ID };
}

/**
 * Streams the model's answer as plain text deltas (OpenAI SSE upstream).
 * Used by the voice agent's answer card, where the first words matter more
 * than the whole answer.
 */
export async function streamComplete(
  messages: Message[],
  maxTokens: number,
  /** Called once when the stream ends, with token counts (exact when upstream reports them). */
  onDone?: (tokens: { input: number; output: number }) => void,
): Promise<ReadableStream<string>> {
  const res = await fetch(BASETEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${process.env.BASETEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: UPSTREAM_MODEL,
      messages,
      max_tokens: Math.min(maxTokens, LIMITS.maxOutputTokens),
      temperature: 0.3,
      stream: true,
      chat_template_kwargs: { thinking: false },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: unknown = null;
  let outputChars = 0;
  const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed?.usage) usage = parsed.usage;
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              outputChars += delta.length;
              controller.enqueue(delta);
            }
          } catch {
            // Partial or non-JSON keep-alive line; ignore.
          }
        }
      },
      flush() {
        try {
          onDone?.(tokensFrom(usage, { inputChars, outputChars }));
        } catch {
          // Usage accounting must never break the answer.
        }
      },
    }),
  );
}

export type { Message };

/** The plan a request is billed against, for usage aggregates. */
export function usagePlan(auth: Extract<Authorized, { ok: true }>): UsagePlan {
  return auth.kind === "free" ? "free" : auth.license.plan;
}

/**
 * Which app feature sent a chat completion. The desktop app's agent router
 * (src-tauri/src/agent/router.rs) always opens its system prompt with this
 * sentence; everything else (polish, summaries, actions) counts as polish.
 */
export function completionKind(messages: Message[]): UsageKind {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  return system.startsWith("You route a voice transcript") ? "ai_route" : "ai_polish";
}

/**
 * Fair use on paid plans (Pro, Team, trial), so a runaway script or a shared
 * key can't run up the model or search bill. Normal use never touches the
 * database: each server instance counts in memory, and only an account past
 * FAIR_USE_SOFT requests today on this instance is counted in Neon, where the
 * real daily limit is enforced across instances.
 */
export const FAIR_USE = {
  ai: 1_500, // requests a day: a very heavy dictation day is a few hundred
  search: 50, // web searches a day: the costliest call (~$0.008 each), capped so a
  // maxed-out Pro account stays near break-even
  // Cloud suggestion judgements a day (/api/agent/suggest). The app asks at
  // most once per window the user stays on, a few times an hour.
  suggest: 150,
  // Meeting notes emailed to the account (/api/meetings/email), per recipient.
  meeting_email: 20,
  // Free only: the agent router's tiny "what did they mean?" calls. They run in
  // the background, so they don't spend Free's weekly AI uses; this daily cap
  // (plus ROUTE_MAX_TOKENS) keeps them from being worth abusing.
  route: 300,
} as const;
const FAIR_USE_SOFT = { ai: 200, search: 25, suggest: 40, meeting_email: 5, route: 60 } as const;

/** Output cap for router completions: a short JSON verdict, nothing more. */
export const ROUTE_MAX_TOKENS = 120;

type FairKind = keyof typeof FAIR_USE;
const local = new Map<string, { day: string; count: number; synced: number }>();

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Count one paid request; false when the account is over today's limit. */
export async function withinFairUse(subject: string, kind: FairKind): Promise<boolean> {
  const day = today();
  const key = `${kind}:${subject}`;
  const entry = local.get(key);
  const e = entry && entry.day === day ? entry : { day, count: 0, synced: 0 };
  e.count += 1;
  local.set(key, e);
  if (local.size > 20_000) local.clear(); // bound memory

  if (e.count <= FAIR_USE_SOFT[kind] || !isDatabaseConfigured()) {
    // Without a database the in-memory count is the only guard; apply the
    // full limit to it.
    return isDatabaseConfigured() || e.count <= FAIR_USE[kind];
  }
  // Heavy account: add what this instance counted since the last sync.
  const delta = e.count - e.synced;
  e.synced = e.count;
  try {
    const sql = await db();
    const rows = await sql`
      insert into fair_use (subject, day, kind, count) values (${subject}, ${day}, ${kind}, ${delta})
      on conflict (subject, day, kind) do update set count = fair_use.count + ${delta}
      returning count`;
    const total = Number(rows[0]?.count ?? e.count);
    if (rows[0] && Number(rows[0].count) === delta) {
      // First row today for this account: drop yesterday's.
      await sql`delete from fair_use where subject = ${subject} and day < ${day}`;
    }
    return total <= FAIR_USE[kind];
  } catch {
    // Database unreachable: fall back to this instance's own count.
    return e.count <= FAIR_USE[kind];
  }
}
