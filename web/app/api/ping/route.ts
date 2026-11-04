import { noteCheckin, type ActivePlan } from "@/lib/activity";
import { ipAllowed } from "@/lib/auth";
import { machineKey, parseMachine } from "@/lib/machine";

/**
 * The app's anonymous daily check-in, so every install is counted, including
 * Free users who only dictate on the device and never call anything else.
 * The body is exactly `{machine, version, os, arch, plan}`: the same one-way
 * machine hash the trial uses, and nothing about what anyone does. It adds to
 * device_activity (lib/activity.ts) as a keyed hash per day, week and month.
 * The IP address is only used for an in-memory flood limit and never stored.
 */
const MAX_BODY_BYTES = 1024;
/** Per 15 minutes (lib/auth.ts ipAllowed's window); many devices can share an office IP. */
const PER_IP = 300;
const OS = ["macos", "windows", "linux"] as const;
const ARCH = ["aarch64", "x86_64", "other"] as const;
const PLANS: readonly ActivePlan[] = ["free", "trial", "pro", "team"];

const clientIp = (req: Request) =>
  req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;

export async function POST(req: Request) {
  if (!ipAllowed("ping-ip", clientIp(req), PER_IP)) return Response.json({ error: "rate_limited" }, { status: 429 });
  let body: Record<string, unknown> | null;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const machine = parseMachine(body?.machine);
  const os = oneOf(OS, body?.os);
  const arch = oneOf(ARCH, body?.arch);
  const plan = oneOf(PLANS, body?.plan);
  const version = typeof body?.version === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(body.version) ? body.version : null;
  if (!machine || !os || !arch || !plan || !version) return Response.json({ error: "invalid" }, { status: 400 });
  noteCheckin(machineKey(machine), plan, { os, arch, version });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
