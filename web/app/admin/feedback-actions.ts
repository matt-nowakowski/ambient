"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedback-core";
import { setFeedbackNote, setFeedbackStatus } from "@/lib/feedback-store";

const idOf = (form: FormData) => {
  const id = Number(form.get("id"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Inbox: open → triaged → done (or back). Sample data is never written. */
export async function updateFeedbackStatus(form: FormData) {
  await requireAdmin();
  if (form.get("demo") === "1") return;
  const id = idOf(form);
  const status = String(form.get("status") ?? "");
  if (!id || !(FEEDBACK_STATUSES as readonly string[]).includes(status)) return;
  await setFeedbackStatus(id, status as FeedbackStatus);
  revalidatePath("/admin");
}

export async function updateFeedbackNote(form: FormData) {
  await requireAdmin();
  if (form.get("demo") === "1") return;
  const id = idOf(form);
  if (!id) return;
  await setFeedbackNote(id, String(form.get("note") ?? "").trim());
  revalidatePath("/admin");
}
