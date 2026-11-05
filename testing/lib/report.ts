/**
 * The run's reports: report.json (every scenario, with reasons) and
 * summary.md (pass rates overall, per language, per tag, the failures), and
 * the release gate's verdict.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spend } from "./model";
import type { Verdict } from "./grade";

export type Row = Omit<Verdict, "outcome"> & {
  id: string;
  about?: string;
  tags: string[];
  lang: string;
  os: string;
  critical: boolean;
  regression?: string;
  say?: string;
  ms: number;
  calls: number;
  route?: string;
  act?: string;
  output?: string;
  outcome?: unknown;
};

type Meta = {
  os: string;
  layer: string;
  dry: boolean;
  model: string;
  spend: Spend;
  budget: number;
  minPass: number;
};

function rate(rows: Row[]) {
  const graded = rows.filter((r) => r.status !== "skip");
  const pass = graded.filter((r) => r.status === "pass").length;
  return {
    pass,
    graded: graded.length,
    skip: rows.length - graded.length,
    pct: graded.length ? pass / graded.length : 1,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function writeReports(out: string, rows: Row[], meta: Meta) {
  const all = rate(rows);
  const critical = rows.filter((r) => r.critical);
  const crit = rate(critical);
  const critBad = critical.filter((r) => r.status !== "pass");
  // A critical scenario that couldn't be checked (no model) can't pass the gate.
  const gatePassed =
    all.pct >= meta.minPass && critBad.length === 0 && all.graded > 0;
  const gateWhy = gatePassed
    ? ""
    : [
        all.pct < meta.minPass
          ? `pass rate ${pct(all.pct)} < ${pct(meta.minPass)}`
          : "",
        critBad.length
          ? `${critBad.length} critical scenario(s) not passing: ${critBad.map((r) => r.id).join(", ")}`
          : "",
        all.graded === 0 ? "nothing was graded" : "",
      ]
        .filter(Boolean)
        .join("; ");

  const by = (key: (r: Row) => string[]) => {
    const m = new Map<string, Row[]>();
    for (const r of rows)
      for (const k of key(r)) m.set(k, [...(m.get(k) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const table = (groups: [string, Row[]][]) =>
    ["| | pass | graded | skipped | rate |", "|---|---|---|---|---|"]
      .concat(
        groups.map(([k, rs]) => {
          const r = rate(rs);
          return `| ${k} | ${r.pass} | ${r.graded} | ${r.skip} | ${pct(r.pct)} |`;
        }),
      )
      .join("\n");

  const s = meta.spend;
  const cost = `$${s.usd.toFixed(4)} (${s.calls} model calls, ${s.cached} cached, ${s.refused} refused; ${s.inputTokens} in / ${s.outputTokens} out tokens)`;
  const line = `${meta.os} layer ${meta.layer}: ${all.pass}/${all.graded} passed (${pct(all.pct)}), ${all.skip} skipped; critical ${crit.pass}/${critical.length}; cost ${cost}${meta.dry ? " [dry]" : ""}`;
  const failures = rows.filter((r) => r.status === "fail");
  const md = [
    `# Scenario run: ${meta.os}, layer ${meta.layer}${meta.dry ? " (dry)" : ""}`,
    "",
    `- ${line}`,
    `- Model: ${meta.model}, budget $${meta.budget}`,
    `- Release gate (≥ ${pct(meta.minPass)} overall, every critical passing): **${gatePassed ? "passed" : `failed — ${gateWhy}`}**`,
    "",
    "## By language",
    table(by((r) => [r.lang])),
    "",
    "## By tag",
    table(by((r) => r.tags)),
    "",
    `## Failures (${failures.length})`,
    ...failures.map(
      (r) =>
        `- **${r.id}**${r.critical ? " (critical)" : ""}${r.regression ? ` [regression: ${r.regression}]` : ""} — said "${r.say ?? ""}"${r.about ? ` — ${r.about}` : ""}\n  - got: ${r.route}${r.act ? ` (${r.act})` : ""}${r.output ? `: "${r.output.slice(0, 160).replace(/\n/g, " ")}"` : ""}\n  - ${r.reasons.join("\n  - ")}`,
    ),
    "",
    `## Skipped (${rows.filter((r) => r.status === "skip").length})`,
    ...rows
      .filter((r) => r.status === "skip")
      .map((r) => `- ${r.id}: ${r.reasons.join("; ")}`),
  ].join("\n");
  writeFileSync(join(out, "summary.md"), md + "\n");
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(
      {
        meta: { ...meta, gatePassed, gateWhy },
        summary: { all, critical: crit },
        rows,
      },
      null,
      2,
    ),
  );
  return { line, gatePassed, gateWhy };
}
