"use server";

import { revalidatePath } from "next/cache";
import { boundFor } from "@/lib/agent/config";
import { resetToAuto, setManual, setPaused } from "@/lib/agent/config-store";
import { requireAdmin } from "@/lib/admin/guard";

/**
 * Agent health tab: pin, override or reset one config value, and pause or
 * resume the daily auto-tuning. Every change is written to the history with
 * the admin's email. The app picks changes up within a day (edge cache 1 h,
 * app fetch at most daily and on launch).
 */
function parseValue(key: string, raw: FormDataEntryValue | null): number | boolean {
  const b = boundFor(key);
  if (b === null) throw new Error("unknown key");
  const s = String(raw ?? "").trim();
  if (b === "bool") return s === "true" || s === "on" || s === "1";
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("not a number");
  return n;
}

export async function pinValue(form: FormData) {
  const email = await requireAdmin();
  const key = String(form.get("key") ?? "");
  await setManual(key, parseValue(key, form.get("value")), { pinned: true, by: email });
  revalidatePath("/admin");
}

export async function overrideValue(form: FormData) {
  const email = await requireAdmin();
  const key = String(form.get("key") ?? "");
  await setManual(key, parseValue(key, form.get("value")), { pinned: false, by: email });
  revalidatePath("/admin");
}

export async function resetValue(form: FormData) {
  const email = await requireAdmin();
  await resetToAuto(String(form.get("key") ?? ""), email);
  revalidatePath("/admin");
}

export async function setTuningPaused(form: FormData) {
  const email = await requireAdmin();
  await setPaused(form.get("paused") === "true", email);
  revalidatePath("/admin");
}
