import { verifyLicense } from "@/lib/license";
import { getPolar, notConfigured, readJson } from "@/lib/polar";

/** Returns a Polar customer-portal URL for the customer in a (signature-valid) license key. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const result = verifyLicense(body?.key);
  if (!result.ok) {
    return Response.json({ error: "invalid_key", reason: result.reason }, { status: 400 });
  }

  const polar = getPolar();
  if (!polar) return notConfigured("Billing portal");

  try {
    const session = await polar.customerSessions.create({ customerId: result.payload.sub });
    return Response.json({ url: session.customerPortalUrl });
  } catch (err) {
    console.error("[billing/portal] failed", err);
    return Response.json({ error: "portal_failed" }, { status: 502 });
  }
}
