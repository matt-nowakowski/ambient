import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, adminConfigured, verifySession } from "./session";

/** For admin pages and server actions: the admin's email, or 404 / login redirect. */
export async function requireAdmin(): Promise<string> {
  if (!adminConfigured()) notFound();
  const email = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) redirect("/admin/login");
  return email;
}

/** For /api/admin route handlers: null when allowed, else the error response. */
export async function adminApiGuard(): Promise<Response | null> {
  if (!adminConfigured()) return new Response("Not found", { status: 404 });
  const email = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return email ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
