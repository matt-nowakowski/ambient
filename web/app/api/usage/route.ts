import { noteActive } from "@/lib/activity";
import { freeAiPerWeek } from "@/lib/agent/config-store";
import { currentWeek, db, isDatabaseConfigured } from "@/lib/db";
import { machineKey, parseMachine } from "@/lib/machine";

/** Free's AI uses this week (hosted), for the app's Home and Account screens. */
export async function GET(req: Request) {
  const machine = parseMachine(new URL(req.url).searchParams.get("machine"));
  if (!machine) return Response.json({ error: "invalid_machine" }, { status: 400 });
  const { week, resetsAt } = currentWeek();
  const limit = await freeAiPerWeek();
  if (!isDatabaseConfigured()) return Response.json({ used: 0, limit, resetsAt });

  const subject = machineKey(machine);
  noteActive(subject, "free");
  const sql = await db();
  const [row] = await sql`select count from polish_usage where machine = ${subject} and week = ${week}`;
  return Response.json({ used: row ? Number(row.count) : 0, limit, resetsAt });
}
