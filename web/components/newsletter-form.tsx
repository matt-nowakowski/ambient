"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

/**
 * Optional email updates for people without a purchase (free users).
 * Double opt-in: this only sends a confirmation link (POST /api/subscribe).
 * Self-contained; drop it anywhere. Not placed in the layout on purpose.
 */
export function NewsletterForm({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), website: form.get("website") }),
      });
      if (res.ok) return setState("sent");
      const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      setMessage(
        data?.error === "invalid_email"
          ? "That doesn’t look like an email address."
          : data?.error === "rate_limited"
            ? "Too many tries. Give it a few minutes."
            : (data?.message ?? "Something went wrong. Try again in a moment."),
      );
      setState("error");
    } catch {
      setMessage("Something went wrong. Try again in a moment.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p className={`text-[14px] text-muted ${className}`} role="status">
        Check your inbox for a link to confirm.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={className} noValidate>
      <label className="block">
        <span className="eyebrow">Email updates, at most monthly</span>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full min-w-0 rounded-[14px] bg-foreground/[0.04] px-4 py-3 text-[14px] text-foreground outline-none ring-[0.5px] ring-border-strong transition-shadow placeholder:text-subtle focus:ring-1 focus:ring-foreground/40"
          />
          <button type="submit" disabled={state === "sending"} className={buttonClass("primary", "md", "shrink-0")}>
            {state === "sending" ? "Sending…" : "Subscribe"}
          </button>
        </div>
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <p className="mt-2 text-[12.5px] text-subtle" role={state === "error" ? "alert" : undefined}>
        {state === "error" ? message : "We’ll email a link to confirm. Unsubscribe in one click."}
      </p>
    </form>
  );
}
