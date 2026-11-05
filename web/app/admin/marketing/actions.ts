"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { completeUpload, deleteUpload, startUpload, type NewUpload } from "@/lib/marketing/uploads";

/** Reserves budget and returns a presigned PUT; the browser uploads to R2 itself. */
export async function startMarketingUpload(input: NewUpload) {
  const email = await requireAdmin();
  try {
    return await startUpload(input, email);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Couldn't start the upload." };
  }
}

export async function completeMarketingUpload(id: string) {
  await requireAdmin();
  try {
    return await completeUpload(String(id));
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Couldn't confirm the upload." };
  }
}

export async function deleteMarketingUpload(id: string) {
  await requireAdmin();
  await deleteUpload(String(id));
}
