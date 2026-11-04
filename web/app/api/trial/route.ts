import { countDaily, noteActive, requestCountry } from "@/lib/activity";
import { brand } from "@/lib/brand";
import { db, isDatabaseConfigured } from "@/lib/db";
import { LicenseConfigError, isLicenseSigningConfigured, mintLicense } from "@/lib/license";
import { machineKey, parseMachine } from "@/lib/machine";
import { notConfigured, readJson } from "@/lib/polar";

/**
 * Starts (or resumes) the no-card Pro trial for a machine. One trial per
 * machine, ever: the app sends a hash of its hardware UUID, which survives
 * reinstalls. Returns a signed license with plan "trial" that expires when the
 * trial does, so the app verifies it offline like any other license.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  const machine = parseMachine(body?.machine);
  if (!machine) return Response.json({ error: "invalid_machine" }, { status: 400 });
  if (!isDatabaseConfigured() || !isLicenseSigningConfigured()) return notConfigured("Trials");

  const subject = machineKey(machine);
  const sql = await db();
  const inserted = await sql`insert into trials (machine) values (${subject}) on conflict (machine) do nothing returning 1`;
  // The app asks once, on first launch: a new row is a new install. Only the
  // country is counted, never stored against the device.
  if (inserted.length) {
    const country = requestCountry(req);
    countDaily([["first_launch", "all"], ...(country ? [["first_launch_country", country] as [string, string]] : [])]);
  }
  const [row] = await sql`select extract(epoch from started_at)::bigint as started from trials where machine = ${subject}`;
  const started = Number(row.started);
  const exp = started + brand.trialDays * 24 * 3600;
  const trialOver = exp <= Math.floor(Date.now() / 1000);
  noteActive(trialOver ? subject : `trial_${subject.slice(0, 24)}`, trialOver ? "free" : "trial");
  if (trialOver) {
    return Response.json({ error: "trial_used", endedAt: exp }, { status: 409 });
  }

  try {
    const key = mintLicense({ sub: `trial_${subject.slice(0, 24)}`, email: "", plan: "trial", exp, iat: started });
    return Response.json({ key, plan: "trial", exp });
  } catch (err) {
    if (err instanceof LicenseConfigError) return notConfigured("License signing");
    throw err;
  }
}
