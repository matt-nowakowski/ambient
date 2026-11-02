"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui";
import { login, type LoginState } from "./actions";

const field =
  "mt-1.5 h-9 w-full rounded-[9px] border border-border-strong bg-glass-strong px-3 text-[13px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-foreground";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <label className="admin-label block">
        Email
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} className={field} />
      </label>
      <label className="admin-label block">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      {state.error ? (
        <p role="alert" className="text-[13px] text-rec">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "!mt-5 w-full")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
