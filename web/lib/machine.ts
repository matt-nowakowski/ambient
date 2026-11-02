import "server-only";
import { createHmac } from "node:crypto";

/**
 * The app sends SHA-256 of its hardware UUID (it survives reinstalls, so a
 * trial can't be restarted by reinstalling). We store only an HMAC of that,
 * keyed with a server secret, so the stored value can't be linked back to a
 * device even with the database.
 */
export function parseMachine(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function machineKey(machine: string) {
  const secret = process.env.LICENSE_PRIVATE_KEY ?? "";
  return createHmac("sha256", `machine:${secret}`).update(machine).digest("hex");
}
