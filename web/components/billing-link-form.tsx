"use client";

import { useState } from "react";
import { SuccessCheck } from "./success-check";
import { buttonClass } from "./ui";

/**
 * Asks /api/billing/link to email a billing-portal link. The answer is the
 * same whether or not the address has a plan, so the page says so too.
 */
export function BillingLinkForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/billing/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          website: form.get("website"),
        }),
      });
      if (res.ok) return setState("sent");
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setMessage(
        data?.error === "invalid_email"
          ? "That doesn’t look like an email address."
          : data?.error === "rate_limited"
            ? "Too many tries. Give it a few minutes."
            : "Something went wrong. Try again in a moment.",
      );
      setState("error");
    } catch {
      setMessage("Something went wrong. Try again in a moment.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex items-start gap-4" role="status">
        <SuccessCheck size={44} />
        <div>
          <p className="text-[15px] text-foreground">Check your inbox.</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            If there’s a plan for that email, we’ve sent a link. It can take a
            minute; check spam too. Nothing arrived? Try the email you paid
            with.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className="block">
        <span className="eyebrow">The email you paid with</span>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full min-w-0 rounded-[14px] bg-foreground/[0.04] px-4 py-3 text-[14px] text-foreground outline-none ring-[0.5px] ring-border-strong transition-shadow placeholder:text-subtle focus:ring-1 focus:ring-foreground/40"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className={buttonClass("primary", "md", "shrink-0")}
          >
            {state === "sending" ? "Sending…" : "Email me a link"}
          </button>
        </div>
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <p
        className="mt-2 text-[12.5px] text-subtle"
        role={state === "error" ? "alert" : undefined}
      >
        {state === "error"
          ? message
          : "The link signs you in to the billing portal and works for a short while."}
      </p>
    </form>
  );
}
