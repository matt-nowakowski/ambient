/**
 * The one way the suite reaches a model: the hosted model our server uses
 * (Baseten, web/lib/ai.ts), called directly with temperature 0 and thinking
 * off, behind a disk cache and a spending cap.
 *
 * - Cache: testing/.cache/<sha256 of model + messages + max_tokens>.json.
 *   A re-run of an unchanged prompt costs nothing.
 * - Budget: tokens are counted from the reply's `usage`; once the run's
 *   spend reaches the budget, every further call is refused (the scenario
 *   is reported as skipped, never as passed or failed).
 * - Dry: only the cache answers; a miss is refused the same way.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

const BASETEN_URL = "https://inference.baseten.co/v1/chat/completions";
/** The model web/lib/ai.ts uses unless AI_MODEL overrides it there. */
export const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731";

export class Refused extends Error {
  constructor(readonly why: "dry" | "budget" | "no_key") {
    super(`model call refused: ${why}`);
  }
}

export type Spend = {
  calls: number;
  cached: number;
  refused: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
};

export class Model {
  readonly spend: Spend = {
    calls: 0,
    cached: 0,
    refused: 0,
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
  };
  private reserved = 0;

  constructor(
    private readonly opts: {
      cacheDir: string;
      budgetUsd: number;
      dry: boolean;
      model: string;
      /** USD per million tokens. */
      priceIn: number;
      priceOut: number;
      apiKey?: string;
    },
  ) {
    mkdirSync(opts.cacheDir, { recursive: true });
  }

  get model() {
    return this.opts.model;
  }

  private key(messages: Message[], maxTokens: number) {
    return createHash("sha256")
      .update(
        JSON.stringify({ model: this.opts.model, messages, maxTokens, t: 0 }),
      )
      .digest("hex");
  }

  /** The reply's text. Throws `Refused` when it can't be had for free or within budget. */
  async complete(messages: Message[], maxTokens: number): Promise<string> {
    const maxOut = Math.min(Math.max(maxTokens || 2048, 1), 2048);
    const file = join(this.opts.cacheDir, `${this.key(messages, maxOut)}.json`);
    if (existsSync(file)) {
      this.spend.cached++;
      return JSON.parse(readFileSync(file, "utf8")).content as string;
    }
    if (this.opts.dry) {
      this.spend.refused++;
      throw new Refused("dry");
    }
    if (!this.opts.apiKey) {
      this.spend.refused++;
      throw new Refused("no_key");
    }
    // Reserve a pessimistic estimate so parallel calls can't overrun much.
    const inChars = messages.reduce((n, m) => n + m.content.length, 0);
    const estimate =
      ((inChars / 3) * this.opts.priceIn + maxOut * this.opts.priceOut) / 1e6;
    if (this.spend.usd + this.reserved + estimate > this.opts.budgetUsd) {
      this.spend.refused++;
      throw new Refused("budget");
    }
    this.reserved += estimate;
    try {
      const data = await this.call(messages, maxOut);
      const content: string = stripReasoning(
        data?.choices?.[0]?.message?.content ?? "",
      );
      const usage = data?.usage ?? {};
      const input = Number(usage.prompt_tokens ?? Math.ceil(inChars / 3));
      const output = Number(
        usage.completion_tokens ?? Math.ceil(content.length / 3),
      );
      this.spend.calls++;
      this.spend.inputTokens += input;
      this.spend.outputTokens += output;
      this.spend.usd +=
        (input * this.opts.priceIn + output * this.opts.priceOut) / 1e6;
      writeFileSync(
        file,
        JSON.stringify({ model: this.opts.model, content, usage }),
      );
      return content;
    } finally {
      this.reserved -= estimate;
    }
  }

  private async call(messages: Message[], maxTokens: number) {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(BASETEN_URL, {
          method: "POST",
          headers: {
            Authorization: `Api-Key ${this.opts.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.opts.model,
            messages,
            max_tokens: maxTokens,
            temperature: 0,
            chat_template_kwargs: { thinking: false },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) return await res.json();
        last = new Error(`upstream ${res.status}`);
        if (res.status < 500 && res.status !== 429) break;
      } catch (e) {
        last = e;
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
    throw last;
  }
}

/** The answer without any <think>…</think> deliberation. */
function stripReasoning(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
