/**
 * Tests when tips emails are due (lib/email/tip-schedule.ts), by simulating
 * the daily cron, and that every tip renders as a marketing email with an
 * unsubscribe link. No network, no database.
 *
 * Run: bun scripts/tips-schedule-test.ts
 */
import { TIP_SEQUENCES } from "../lib/email/templates";
import { TIP_GAP_DAYS, TIP_LANGUAGES, afterTip, dueTips, firstTipAt, tipLanguage, type TipRow } from "../lib/email/tip-schedule";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const DAY = 86_400_000;
const TOTAL = TIP_SEQUENCES.en.length;
const cronAt = (day: number) => new Date(Date.UTC(2026, 10, 1 + day, 15, 41)); // the daily run, 15:41 UTC

/** Runs the cron daily for `days` and returns on which run each tip went out (day index). */
function simulate(confirmedAt: Date, days: number, skip: (day: number) => boolean = () => false) {
  let row: TipRow = { email: "a@example.com", step: 0, nextAt: firstTipAt(confirmedAt) };
  const sentOn: number[] = [];
  for (let d = 0; d < days; d++) {
    if (skip(d)) continue;
    const now = cronAt(d);
    if (dueTips([row], now, TOTAL).length) {
      sentOn.push(d);
      const next = afterTip(row.step, now, TOTAL);
      row = { ...row, step: next.step, nextAt: next.nextAt };
    }
  }
  return { sentOn, row };
}

check("at least four tips in the sequence", TOTAL >= 4);
check("every language has the same number of tips", TIP_LANGUAGES.every((l) => TIP_SEQUENCES[l].length === TOTAL));

// Confirmed just after a run: the first tip goes on the next day's run, not two days later.
{
  const { sentOn, row } = simulate(new Date(cronAt(0).getTime() + 30 * 60_000), 120);
  check("first tip on the next day's run (confirmed just after a run)", sentOn[0] === 1);
  check("every tip sent exactly once", sentOn.length === TOTAL);
  check(`then one every ${TIP_GAP_DAYS} days`, sentOn.slice(1).every((d, i) => d - sentOn[i] === TIP_GAP_DAYS));
  check("done after the last tip (nothing more due)", row.step === TOTAL && row.nextAt === null);
}

// Confirmed just before a run: not on that same run, but the next.
{
  const { sentOn } = simulate(new Date(cronAt(0).getTime() - 10 * 60_000), 30);
  check("not sent minutes after confirming", sentOn[0] === 1);
}

// Missed runs delay the rest instead of bunching them up.
{
  const { sentOn } = simulate(cronAt(0), 120, (d) => d >= 14 && d <= 17);
  check("a missed run sends the tip on the next run", sentOn[1] === 18);
  check("no two tips closer than the gap after a missed run", sentOn.slice(1).every((d, i) => d - sentOn[i] >= TIP_GAP_DAYS));
}

// dueTips: order, cap, and rows that aren't due.
{
  const now = new Date(Date.UTC(2026, 10, 10));
  const rows: TipRow[] = [
    { email: "late", step: 1, nextAt: new Date(now.getTime() - 3 * DAY) },
    { email: "early", step: 0, nextAt: new Date(now.getTime() - 1 * DAY) },
    { email: "future", step: 0, nextAt: new Date(now.getTime() + DAY) },
    { email: "done", step: TOTAL, nextAt: null },
    { email: "past-end", step: TOTAL, nextAt: new Date(now.getTime() - DAY) },
  ];
  const due = dueTips(rows, now, TOTAL);
  check("only due rows, earliest first", due.map((r) => r.email).join(",") === "late,early");
  check("cap respected", dueTips(rows, now, TOTAL, 1).length === 1);
  check("cap 0 sends nothing", dueTips(rows, now, TOTAL, 0).length === 0);
}

// Language: English for now, whatever the app language.
check("English app → English tips", tipLanguage("en") === "en");
check("unknown app language → English", tipLanguage("sv") === "en" && tipLanguage(null) === "en" && tipLanguage("zh-TW") === "en");

// Every tip renders as marketing with the unsubscribe link and the tips reason.
for (const [i, tip] of TIP_SEQUENCES.en.entries()) {
  const e = tip({ audience: "tips", unsubscribeUrl: "https://example.com/unsub?t=x" });
  check(`tip ${i + 1} is marketing with an unsubscribe link`, e.kind === "marketing" && e.html.includes("https://example.com/unsub?t=x"));
  check(`tip ${i + 1} says why it was sent`, e.text.includes("you asked for tips in the"));
  check(`tip ${i + 1} never says it talks out loud`, !/out loud|speaks to you|reads aloud|voice reply/i.test(e.text));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
