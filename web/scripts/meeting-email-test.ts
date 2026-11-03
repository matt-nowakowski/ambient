/**
 * Tests the meeting-notes email (lib/email/templates.ts meetingNotes) and the
 * /api/meetings/email body validation (lib/meeting-email-core.ts). No network.
 *
 * Run: bun scripts/meeting-email-test.ts
 */
import { meetingNotes } from "../lib/email/templates";
import { MEETING_EMAIL_LIMITS, parseMeetingEmail } from "../lib/meeting-email-core";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

const full = meetingNotes({
  title: "Q4 launch <script>alert(1)</script>",
  date: "Monday, November 2, 2026 at 14:00",
  durationMin: 95,
  summary: "We moved the launch.",
  decisions: ["Launch on Nov 18"],
  actionItems: ["You: send the deck & notes <b>today</b>", "Priya: book the briefing"],
  questions: ["Discount for Free users?"],
  followUp: "Hi Priya,\n\nThanks for today.\nBest",
});

check("subject", full.subject === "Meeting notes: Q4 launch <script>alert(1)</script>");
check("transactional, category meeting_notes", full.kind === "transactional" && full.category === "meeting_notes");
check("headline in HTML, escaped", full.html.includes("Meeting notes: Q4 launch &lt;script&gt;alert(1)&lt;/script&gt;"));
check("no raw <script> in HTML", !full.html.includes("<script>"));
check("checklist item escaped", full.html.includes("You: send the deck &amp; notes &lt;b&gt;today&lt;/b&gt;"));
check("checklist boxes rendered", (full.html.match(/class="box"/g) ?? []).length === 2);
check("quote block with line breaks", full.html.includes('class="quote well"') && full.html.includes("Hi Priya,<br><br>Thanks for today.<br>Best"));
check("duration formatted", full.html.includes("1 h 35 min"));
check("sections titled", ["Decisions", "Action items", "Questions for you", "Follow-up draft"].every((s) => full.html.includes(`>${s}</p>`)));
check("dark mode styles present", full.html.includes("prefers-color-scheme: dark") && full.html.includes(".box{border-color"));
check("plain text checklist", full.text.includes("Action items\n\n[ ] You: send the deck & notes <b>today</b>\n[ ] Priya: book the briefing"));
check("plain text quote", full.text.includes("> Hi Priya,\n> \n> Thanks for today.\n> Best"));
check("plain text decisions as bullets", full.text.includes("Decisions\n\n- Launch on Nov 18"));
check("reason line", full.text.includes("to email you these notes."));
check("no unsubscribe on a transactional email", !/unsubscribe/i.test(full.html));

const sparse = meetingNotes({ title: "", date: "", durationMin: 0, summary: "Short call.", decisions: [" "], actionItems: [], questions: [] });
check("empty title falls back", sparse.subject === "Meeting notes: Your call");
check("empty sections omitted", !["Decisions", "Action items", "Questions for you", "Follow-up draft"].some((s) => sparse.html.includes(`>${s}</p>`)));
check("no checklist or quote when empty", !sparse.html.includes('class="box"') && !sparse.html.includes('class="quote'));

// Body validation
const ok = parseMeetingEmail({ title: "T", date: "d", duration_min: 30, summary: "s", decisions: [], action_items: ["a"], questions: [], follow_up: "f" });
check("valid body parses", ok?.title === "T" && ok.actionItems.length === 1 && ok.durationMin === 30 && ok.session === null);
check("session kept", parseMeetingEmail({ title: "T", summary: "s", session: "abc.def" })?.session === "abc.def");
check("missing title rejected", parseMeetingEmail({ summary: "s" }) === null);
check("long title rejected", parseMeetingEmail({ title: "x".repeat(MEETING_EMAIL_LIMITS.title + 1), summary: "s" }) === null);
check("long summary rejected", parseMeetingEmail({ title: "T", summary: "x".repeat(MEETING_EMAIL_LIMITS.summary + 1) }) === null);
check("too many items rejected", parseMeetingEmail({ title: "T", summary: "s", action_items: Array(31).fill("a") }) === null);
check("long item rejected", parseMeetingEmail({ title: "T", summary: "s", decisions: ["x".repeat(501)] }) === null);
check("non-string item rejected", parseMeetingEmail({ title: "T", summary: "s", questions: [1] }) === null);
check("bad duration rejected", parseMeetingEmail({ title: "T", summary: "s", duration_min: 1.5 }) === null && parseMeetingEmail({ title: "T", summary: "s", duration_min: 5000 }) === null);
check("long follow-up rejected", parseMeetingEmail({ title: "T", summary: "s", follow_up: "x".repeat(6001) }) === null);
check("nothing to send rejected", parseMeetingEmail({ title: "T", summary: " ", decisions: [] }) === null);
check("a recipient field is ignored, never used", !("to" in (parseMeetingEmail({ title: "T", summary: "s", to: "x@y.z" }) ?? {})));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
