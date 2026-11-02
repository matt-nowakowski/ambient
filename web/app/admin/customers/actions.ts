"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getCustomers, segmentById, templateById } from "@/lib/admin/customers";
import { sendToCustomer, sendToSegment } from "@/lib/admin/customer-email";

/**
 * Manual sends from /admin/customers. Each action re-checks the admin session.
 * Results come back as query params (sent=… / error=…) so a reload shows them
 * and nothing is resent: the Resend idempotency key covers resubmits.
 */
const field = (f: FormData, k: string) => String(f.get(k) ?? "");
const qs = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

export async function sendCustomerEmail(form: FormData) {
  await requireAdmin();
  const id = field(form, "customerId");
  const template = templateById(field(form, "template"));
  const demo = field(form, "demo") === "1";
  const note = { subject: field(form, "subject"), body: field(form, "body") };
  const back = (r: Record<string, string>) => redirect(`/admin/customers/${encodeURIComponent(id)}?${qs({ ...r, demo: demo ? "1" : "" })}#send`);

  if (!template) return back({ error: "Pick a template." });
  if (demo) return back({ sent: "Sample data: nothing was sent." });
  const list = await getCustomers(false);
  const c = list.ok ? list.customers.find((x) => x.customerId === id) : undefined;
  if (!c) return back({ error: "Customer not found." });

  const r = await sendToCustomer(template.id, c, note);
  return r.ok ? back({ sent: `Sent “${template.label}”.` }) : back({ error: r.error, template: template.id, subject: note.subject, body: note.body });
}

export async function sendSegmentEmail(form: FormData) {
  await requireAdmin();
  const segment = segmentById(field(form, "segment"));
  const template = templateById(field(form, "template"));
  const demo = field(form, "demo") === "1";
  const expected = Number(field(form, "expected"));
  const note = { subject: field(form, "subject"), body: field(form, "body") };
  const back = (r: Record<string, string>) => redirect(`/admin/customers/send?${qs({ ...r, demo: demo ? "1" : "" })}`);

  if (!segment || !template) return back({ error: "Pick a segment and a template." });
  if (demo) return back({ sent: `Sample data: nothing was sent (would have gone to ${expected}).` });
  const list = await getCustomers(false);
  if (!list.ok) return back({ error: list.error });
  const r = await sendToSegment(template.id, segment.id, list.customers.filter(segment.test), note, expected);
  return r.ok
    ? back({ sent: `Sent “${template.label}” to ${r.sent}${r.skipped ? `, skipped ${r.skipped}` : ""}.` })
    : back({ error: r.error, segment: segment.id, template: template.id, subject: note.subject, body: note.body });
}
