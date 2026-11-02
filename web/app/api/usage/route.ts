import { brand } from "@/lib/brand";
import { currentWeek, db, isDatabaseConfigured } from "@/lib/db";
import { machineKey, parseMachine } from "@/lib/machine";

/** Free's AI polish usage this week, for the app's Home and Account screens. */
export async function GET(req: Request) {
  const machine = parseMachine(new URL(req.url).searchParams.get("machine"));
  if (!machine) return Response.json({ error: "invalid_machine" }, { status: 400 });
  const { week, resetsAt } = currentWeek();
  const limit = brand.freePolishPerWeek;
  if (!isDatabaseConfigured()) return Response.json({ used: 0, limit, resetsAt });

  const sql = await db();
  const [row] = await sql`select count from polish_usage where machine = ${machineKey(machine)} and week = ${week}`;
  return Response.json({ used: row ? Number(row.count) : 0, limit, resetsAt });
}
