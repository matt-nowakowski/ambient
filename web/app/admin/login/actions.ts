"use server";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  adminConfigured,
  checkCredentials,
  clearLoginFailures,
  loginBlocked,
  recordLoginFailure,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/admin/session";

export type LoginState = { error?: string; email?: string };

async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!adminConfigured()) notFound();
  const ip = await clientIp();
  if (loginBlocked(ip)) return { error: "Too many attempts. Try again in 15 minutes.", email: String(form.get("email") ?? "") };

  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const ok = email && password ? await checkCredentials(email, password) : null;
  if (!ok) {
    recordLoginFailure(ip);
    return { error: "That email and password don't match.", email };
  }
  clearLoginFailures(ip);
  const { value, exp } = signSession(ok);
  (await cookies()).set(SESSION_COOKIE, value, sessionCookieOptions(exp));
  redirect("/admin");
}

export async function logout() {
  const jar = await cookies();
  // Only a signed-in admin can act here; a stray POST does nothing.
  if (verifySession(jar.get(SESSION_COOKIE)?.value)) jar.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
