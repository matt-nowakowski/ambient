#!/usr/bin/env bun
/**
 * The scenario suite: every scenario in testing/scenarios goes through the
 * app's hidden test mode (the real pipeline, nothing on screen), and what it
 * did is graded. See testing/README.md.
 *
 *   bun testing/run.ts [--dry] [--only tag,tag] [--id text] [--budget 0.5]
 *                      [--bin path] [--jobs 6] [--gate] [--layer 1|2] [--out dir]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { DEFAULT_MODEL, Model } from "./lib/model";
import { type CallLog, type Registry, startServer } from "./lib/server";
import {
  applies,
  hostOs,
  type Os,
  loadAll,
  resolve,
  type Loaded,
} from "./lib/scenarios";
import {
  type AppReport,
  exactChecks,
  judge,
  needsJudge,
  outcomeOf,
  type Verdict,
} from "./lib/grade";
import { writeReports, type Row } from "./lib/report";

const ROOT = resolvePath(import.meta.dir, "..");
const HERE = join(ROOT, "testing");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const dry = flag("dry");
const gate = flag("gate");
const layer = arg("layer") ?? "1";
const only = (arg("only") ?? "").split(",").filter(Boolean);
const idFilter = arg("id");
const jobs = Number(arg("jobs") ?? 6);
const budget = Number(arg("budget") ?? process.env.TESTING_BUDGET_USD ?? 0.5);
const minPass = Number(arg("min-pass") ?? process.env.TESTING_MIN_PASS ?? 0.95);
const host = hostOs();
/**
 * Whose app ids the screens use. `--as-os windows` on a Mac runs the Windows
 * fixtures through the Mac build: a cheap early signal only, since the app's
 * per-OS code (screen readers, focus rules) is still the Mac's. CI runs each
 * OS for real.
 */
const os = (arg("as-os") as Os | undefined) ?? host;
const exe = host === "windows" ? ".exe" : "";
const targetDir =
  process.env.CARGO_TARGET_DIR ?? join(ROOT, "src-tauri", "target");
const bin = arg("bin") ?? join(targetDir, "debug", `ambient${exe}`);

/**
 * The key: CI's secret (TESTING_BASETEN_API_KEY), else (locally) the web
 * app's own env file, read quietly, else BASETEN_API_KEY from the shell.
 */
function apiKey(): string | undefined {
  if (process.env.TESTING_BASETEN_API_KEY)
    return process.env.TESTING_BASETEN_API_KEY;
  const envFile = join(ROOT, "web", ".env.local");
  const main = join(ROOT, "..", "..", "..", "web", ".env.local"); // a worktree's main checkout
  for (const f of [envFile, main]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split("\n")
      .find((l) => l.startsWith("BASETEN_API_KEY="));
    const v = line
      ?.slice("BASETEN_API_KEY=".length)
      .trim()
      .replace(/^"|"$/g, "");
    if (v) return v;
  }
  return process.env.BASETEN_API_KEY || undefined;
}

async function main() {
  if (!existsSync(bin)) {
    console.error(
      `No app binary at ${bin}. Build it (cd src-tauri && cargo build) or pass --bin.`,
    );
    process.exit(2);
  }
  const all = loadAll(join(HERE, "scenarios"));
  const picked = all.filter(
    (c) =>
      applies(c, os) &&
      (!only.length || only.some((t) => c.tags?.includes(t))) &&
      (!idFilter || c.id.includes(idFilter)),
  );
  if (!picked.length) {
    console.error("No scenarios match.");
    process.exit(2);
  }
  const model = new Model({
    cacheDir: join(HERE, ".cache"),
    budgetUsd: budget,
    dry,
    model: process.env.TESTING_MODEL || DEFAULT_MODEL,
    priceIn: Number(process.env.TESTING_PRICE_IN ?? 0.3),
    priceOut: Number(process.env.TESTING_PRICE_OUT ?? 1.2),
    apiKey: dry ? undefined : apiKey(),
  });
  const registry: Registry = new Map();
  const server = startServer(model, registry);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = os === host ? os : `${os}-on-${host}`;
  const out =
    arg("out") ?? join(HERE, "out", `${stamp}-${label}-layer${layer}`);
  mkdirSync(join(out, "scenarios"), { recursive: true });
  mkdirSync(join(out, "logs"), { recursive: true });
  console.log(
    `${picked.length} scenarios on ${os} (layer ${layer}${dry ? ", dry" : `, budget $${budget}`}) with ${bin}`,
  );

  const rows: Row[] = [];
  let next = 0;
  const worker = async () => {
    while (next < picked.length) {
      const c = picked[next++];
      const row = await runOne(c, model, registry, server.port, out);
      rows.push(row);
      const mark =
        row.status === "pass" ? "✓" : row.status === "skip" ? "–" : "✗";
      console.log(
        `${mark} ${c.id}${row.status === "fail" ? `: ${row.reasons.join("; ")}` : ""}`,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  server.stop(true);
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const summary = writeReports(out, rows, {
    os,
    layer,
    dry,
    model: model.model,
    spend: model.spend,
    budget,
    minPass,
  });
  console.log(`\n${summary.line}\nReports: ${out}`);
  if (gate && !summary.gatePassed) {
    console.error(`Release gate failed: ${summary.gateWhy}`);
    process.exit(1);
  }
}

/** One launch of the app in test mode; `code` is null when it had to be killed. */
async function launch(file: string) {
  // Hidden, as from the menu bar or tray: nothing may depend on the window.
  const proc = Bun.spawn([bin, "--start-hidden", "--test-scenario", file], {
    env: {
      ...process.env,
      AMBIENT_TEST_MODE: "1",
      RUST_LOG: process.env.RUST_LOG ?? "ambient_app_lib=debug,warn",
      // Never hand the app the model key: it only talks to the local server.
      BASETEN_API_KEY: "",
      TESTING_BASETEN_API_KEY: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  let killed = false;
  const killer = setTimeout(() => {
    killed = true;
    proc.kill();
  }, 60_000);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  clearTimeout(killer);
  return { stdout, stderr, code: killed ? null : proc.exitCode };
}

async function runOne(
  c: Loaded,
  model: Model,
  registry: Registry,
  port: number,
  out: string,
): Promise<Row> {
  const sid = encodeURIComponent(c.id);
  const log: CallLog = { calls: [], unexpected: [] };
  registry.set(c.id, { plan: c.plan ?? "pro", log });
  const resolved = resolve(c, os, `http://127.0.0.1:${port}/s/${sid}`);
  const file = join(out, "scenarios", `${c.id}.json`);
  writeFileSync(file, JSON.stringify(resolved, null, 2));
  const started = Date.now();
  let { stdout, stderr, code } = await launch(file);
  // A launch that hangs before reporting (rare, under load) gets one more go
  // with a fresh log; a crash is reported as is.
  if (code === null) {
    log.calls = [];
    log.refused = undefined;
    ({ stdout, stderr, code } = await launch(file));
  }
  writeFileSync(join(out, "logs", `${c.id}.log`), stderr);
  const base = {
    id: c.id,
    about: c.about,
    tags: c.tags ?? [],
    lang: c.lang ?? "en",
    os,
    critical: (c.tags ?? []).includes("critical"),
    regression: c.regression,
    say: c.say,
    ms: Date.now() - started,
    calls: log.calls.length,
  };
  const line = stdout
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .at(-1);
  if (!line) {
    return {
      ...base,
      status: "fail",
      reasons: [
        code === null
          ? "the app hung (no report after 60 s, twice)"
          : `the app exited (${code}) without a report`,
      ],
    };
  }
  const report = JSON.parse(line) as AppReport;
  writeFileSync(
    join(out, "scenarios", `${c.id}.report.json`),
    JSON.stringify(report, null, 2),
  );
  // Everything works with the window closed: a scenario that needed one
  // (or opened one) fails, whatever else it did.
  if (report.windows?.length) {
    return {
      ...base,
      status: "fail",
      reasons: [`a window was open: ${report.windows.join(", ")}`],
    };
  }
  const modelCalls = log.calls.filter(
    (x) => x.path !== "/api/ai/v1/models",
  ).length;
  const outcome = outcomeOf(report, c, modelCalls);
  const verdict = await grade(c, outcome, model, log);
  return {
    ...base,
    ...verdict,
    route: outcome.route,
    act: outcome.act,
    output: outcome.output,
  };
}

async function grade(
  c: Loaded,
  o: ReturnType<typeof outcomeOf>,
  model: Model,
  log: CallLog,
): Promise<Verdict> {
  const reasons = exactChecks(o, c);
  if (log.unexpected.length)
    reasons.push(`called the server for ${log.unexpected.join(", ")}`);
  // A model reply the suite couldn't get (dry run, budget, upstream error)
  // makes the app fall back: that's not the app's answer, so don't grade it.
  if (log.refused) {
    return {
      status: "skip",
      reasons: [`model unavailable (${log.refused})`],
      outcome: o,
    };
  }
  if (!reasons.length && needsJudge(c)) {
    const j = await judge(model, o, c, c.screenDef?.text ?? "");
    if (j === "skip")
      return {
        status: "skip",
        reasons: ["judge unavailable (dry or budget)"],
        outcome: o,
      };
    reasons.push(...j);
  }
  return { status: reasons.length ? "fail" : "pass", reasons, outcome: o };
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
