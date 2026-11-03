import type { ConfigRow, HistoryRow } from "../agent/config-store";
import type { EventRow } from "./agent-health";

/**
 * Sample analytics for /admin?tab=agent&demo=1: plausible counts for a few
 * hundred opted-in installs, so the tab can be reviewed before real data
 * exists. Never mixed with real data.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const key = (props: Record<string, string>) =>
  Object.keys(props)
    .sort()
    .map((k) => `${k}=${props[k]}`)
    .join("&");

/** Offers per day and acceptance rate per suggestion kind. */
const KINDS: [string, number, number][] = [
  ["summarise_thread", 22, 0.46],
  ["draft_reply", 18, 0.38],
  ["explain_error", 12, 0.31],
  ["add_to_calendar", 7, 0.52],
  ["review_code", 6, 0.27],
  ["summarise_page", 9, 0.12],
  ["meeting_nudge", 8, 0.22],
  ["help_here", 10, 0.09],
  ["price_check", 3, 0.04],
];

export function demoAgentRows(days: string[]): EventRow[] {
  const r = rng(11);
  const rows: EventRow[] = [];
  const common = { os: "macos", plan: "pro" };
  // Random rounding, so small daily rates still add up over the month.
  const add = (day: string, name: string, props: Record<string, string>, n: number) => {
    const whole = Math.floor(n + r());
    if (whole > 0) rows.push({ day, name, props: key({ ...props, ...common }), n: whole });
  };
  days.forEach((day, i) => {
    const t = 0.7 + 0.3 * (i / (days.length - 1));
    const v = () => t * (0.85 + r() * 0.3);
    for (const [kind, perDay, rate] of KINDS) {
      const offered = perDay * v();
      add(day, "suggestion_offered", { kind, judge: kind === "help_here" ? "device" : r() < 0.3 ? "cloud" : "rules", app_category: kind === "draft_reply" || kind === "summarise_thread" ? "mail" : "browser" }, offered);
      add(day, "suggestion_result", { kind, outcome: "accepted", by: r() < 0.3 ? "voice" : "click" }, offered * rate);
      add(day, "suggestion_result", { kind, outcome: "dismissed", by: "click" }, offered * (1 - rate) * 0.45);
      add(day, "suggestion_result", { kind, outcome: "ignored", by: "timeout" }, offered * (1 - rate) * 0.5);
      add(day, "suggestion_result", { kind, outcome: "muted", by: "voice" }, offered * (1 - rate) * 0.05);
      add(day, "card_rating", { card: "suggestion", kind, rating: "up" }, offered * rate * 0.2);
      add(day, "card_rating", { card: "suggestion", kind, rating: "down" }, offered * (1 - rate) * 0.04);
    }
    const judgeMs = ["lt500", "lt1s", "lt2s", "lt5s", "lt10s"];
    for (const [engine, runs, timeoutRate] of [["device", 40, 0.08], ["cloud", 16, 0.04]] as const) {
      const n = runs * v();
      add(day, "judge_run", { engine, outcome: "ok", ms_bucket: judgeMs[Math.floor(r() * 3) + 1] }, n * (0.86 - timeoutRate));
      add(day, "judge_run", { engine, outcome: "ok", ms_bucket: "lt1s" }, n * 0.05);
      add(day, "judge_run", { engine, outcome: "unparsable", ms_bucket: "lt2s" }, n * 0.09);
      add(day, "judge_run", { engine, outcome: "timeout", ms_bucket: engine === "device" ? "lt5s" : "lt10s" }, n * timeoutRate);
    }
    const routeMix: [string, number][] = [["write", 140], ["answer", 46], ["act", 14], ["recall", 6], ["compose", 9], ["help", 2]];
    for (const [route, n] of routeMix) {
      add(day, "route", { route, source: "dictation_key", had_focus_field: "true" }, n * 0.7 * v());
      add(day, "route", { route, source: route === "write" ? "dictation_key" : "ask_key", had_focus_field: "false" }, n * 0.25 * v());
      add(day, "route", { route, source: "wake", had_focus_field: "false" }, n * 0.05 * v());
    }
    add(day, "did_you_mean_shown", {}, 11 * v());
    add(day, "did_you_mean_result", { result: "typed" }, 4 * v());
    add(day, "did_you_mean_result", { result: "asked" }, 3 * v());
    add(day, "did_you_mean_result", { result: "dismissed" }, 3 * v());
    for (const web of ["false", "true"]) {
      const n = (web === "true" ? 18 : 30) * v();
      const first = web === "true" ? ["lt2s", "lt5s"] : ["lt1s", "lt2s"];
      const total = web === "true" ? ["lt5s", "lt10s"] : ["lt2s", "lt5s"];
      add(day, "answer_latency", { web, first_card_ms_bucket: first[0], total_ms_bucket: total[0] }, n * 0.6);
      add(day, "answer_latency", { web, first_card_ms_bucket: first[1], total_ms_bucket: total[1] }, n * 0.35);
      add(day, "answer_latency", { web, first_card_ms_bucket: "lt10s", total_ms_bucket: "lt30s" }, n * 0.05);
      add(day, "card_rating", { card: "answer", kind: web === "true" ? "web" : "answer", rating: "up" }, n * 0.12);
      add(day, "card_rating", { card: "answer", kind: web === "true" ? "web" : "answer", rating: "down" }, n * 0.03);
    }
    for (const [platform, share] of [["macos", 1], ["windows", 0.25], ["linux", 0.08]] as const) {
      for (const [kind, n] of [["reminder", 6], ["calendar", 3], ["open_app", 5], ["shortcut", 1]] as const) {
        const fb = platform === "macos" ? 0.02 : 0.25;
        add(day, "act", { kind, outcome: "ok", platform }, n * share * (0.95 - fb) * v());
        add(day, "act", { kind, outcome: "fallback", platform }, n * share * fb * v());
        add(day, "act", { kind, outcome: "failed", platform }, n * share * 0.05 * v());
      }
    }
    for (const [area, kind, n] of [["answer", "timeout", 1.6], ["judge", "unparsable", 3.2], ["download", "offline", 0.8], ["polish", "server", 0.6], ["act", "permission", 0.5]] as const) {
      add(day, "error", { area, kind }, n * v());
    }
    add(day, "meeting", { outcome: "notes", duration_bucket: r() < 0.5 ? "lt30m" : "lt60m" }, 5 * v());
    add(day, "meeting", { outcome: "empty", duration_bucket: "lt5m" }, 0.6 * v());
    add(day, "meeting", { outcome: "failed", duration_bucket: "lt15m" }, 0.2 * v());
    add(day, "meeting_email", { mode: "ask", outcome: "sent" }, 1.8 * v());
    add(day, "meeting_email", { mode: "always", outcome: "sent" }, 1.1 * v());
    add(day, "limit_hit", { kind: "ai" }, 1.4 * v());
    add(day, "limit_hit", { kind: "suggestions" }, 0.9 * v());
    add(day, "limit_hit", { kind: "meetings" }, 0.2 * v());
    add(day, "dictation", { polish: "true", ms_bucket: "lt1s" }, 16 * v());
    add(day, "dictation", { polish: "false", ms_bucket: "lt500" }, 9 * v());
    add(day, "dictation", { polish: "true", ms_bucket: "lt2s" }, 6 * v());
    // Smart writing: mostly as said, some polished, a few written for you.
    for (const [category, k] of [["chat", 1], ["mail", 0.7], ["browser", 0.6], ["editor", 0.4]] as const) {
      add(day, "write_mode", { decision: "as_said", source: "rules", app_category: category }, 60 * k * v());
      add(day, "write_mode", { decision: "polished", source: "rules", app_category: category }, 22 * k * v());
      add(day, "write_mode", { decision: "written", source: "rules", app_category: category }, 4 * k * v());
      add(day, "write_mode", { decision: "written", source: "model", app_category: category }, 1.5 * k * v());
      add(day, "write_mode", { decision: "as_said", source: "model", app_category: category }, 2 * k * v());
    }
    add(day, "write_revert", { decision: "polished", by: "click" }, 1.2 * v());
    add(day, "write_revert", { decision: "written", by: "click" }, 0.9 * v());
    add(day, "write_revert", { decision: "written", by: "voice" }, 0.4 * v());
  });
  return rows;
}

export function demoInstalls(days: string[]) {
  const r = rng(5);
  return days.map((day, i) => ({ day, n: Math.round((180 + i * 4) * (day && new Date(day).getUTCDay() % 6 === 0 ? 0.7 : 1) * (0.92 + r() * 0.16)) }));
}

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export function demoConfigRows(): ConfigRow[] {
  return [
    { key: "kind.help_here.min_confidence", value: 0.8, source: "auto", pinned: false, updatedAt: ago(30) },
    { key: "kind.price_check.enabled", value: false, source: "auto", pinned: false, updatedAt: ago(54) },
    { key: "kind.summarise_page.cooldown_min", value: 90, source: "auto", pinned: false, updatedAt: ago(78) },
    { key: "judge.timeout_ms", value: 5000, source: "auto", pinned: false, updatedAt: ago(102) },
    { key: "hourly_budget", value: 4, source: "manual", pinned: true, updatedAt: ago(140) },
  ];
}

export function demoHistory(): HistoryRow[] {
  return [
    { id: 6, at: ago(30), key: "kind.help_here.min_confidence", oldValue: 0.75, newValue: 0.8, source: "auto", reason: "Accepted 9% of 262 offers (under 15%): higher minimum confidence", stats: { offered: 262, accepted: 24, rate: 0.092 } },
    { id: 5, at: ago(54), key: "kind.price_check.enabled", oldValue: true, newValue: false, source: "auto", reason: "Accepted 4% of 104 offers (under 5% over 100+): turned off", stats: { offered: 104, accepted: 4, rate: 0.038 } },
    { id: 4, at: ago(54), key: "kind.help_here.min_confidence", oldValue: 0.7, newValue: 0.75, source: "auto", reason: "Accepted 8% of 240 offers (under 15%): higher minimum confidence", stats: { offered: 240, accepted: 19, rate: 0.079 } },
    { id: 3, at: ago(78), key: "kind.summarise_page.cooldown_min", oldValue: 60, newValue: 90, source: "auto", reason: "Accepted 12% of 231 offers (under 15%), confidence at its ceiling: longer cooldown", stats: { offered: 231, accepted: 28, rate: 0.121 } },
    { id: 2, at: ago(102), key: "judge.timeout_ms", oldValue: 4000, newValue: 5000, source: "auto", reason: "The device judge timed out on 23% of 880 runs (over 20%): longer timeout", stats: { runs: 880, timeouts: 202, rate: 0.23 } },
    { id: 1, at: ago(140), key: "hourly_budget", oldValue: 3, newValue: 4, source: "manual", reason: "Pinned by matt@example.com", stats: null },
  ];
}
