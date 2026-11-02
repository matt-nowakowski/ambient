"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";

/** Drops the cached provider, Polar and database reads so the page refetches. */
export async function refresh() {
  await requireAdmin();
  updateTag("admin");
}
