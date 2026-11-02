import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { BrandMark } from "@/components/admin/chrome";
import { SESSION_COOKIE, adminConfigured, verifySession } from "@/lib/admin/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (!adminConfigured()) notFound();
  if (verifySession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/admin");
  return (
    <div data-admin-root className="admin flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[340px]">
        <div className="flex flex-col items-center text-center">
          <BrandMark size={44} />
          <h1 className="admin-title mt-4">Sign in</h1>
        </div>
        <div className="glass mt-6 rounded-[var(--radius-panel)] px-5 py-5">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
