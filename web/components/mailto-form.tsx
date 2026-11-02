"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

type Field = { name: string; label: string; type?: "text" | "email" | "number" | "textarea"; required?: boolean; placeholder?: string };

/** A form with no backend: it opens the visitor's mail app with a prefilled message. */
export function MailtoForm({
  to,
  subject,
  fields,
  submitLabel = "Open in your mail app",
}: {
  to: string;
  /** Subject line; `{field}` placeholders are filled from the form (empty → dropped with its separator). */
  subject: string;
  fields: Field[];
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = fields
      .filter((f) => f.type !== "textarea" && values[f.name])
      .map((f) => `${f.label}: ${values[f.name]}`)
      .concat(fields.filter((f) => f.type === "textarea" && values[f.name]).map((f) => `\n${values[f.name]}`))
      .join("\n");
    const subj = subject
      .replace(/\s*[—:-]?\s*\{(\w+)\}/g, (m, k: string) => (values[k] ? m.replace(`{${k}}`, values[k]) : ""))
      .trim();
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  }

  const input =
    "w-full rounded-[14px] bg-foreground/[0.04] px-4 py-3 text-[14px] text-foreground outline-none ring-[0.5px] ring-border-strong transition-shadow placeholder:text-subtle focus:ring-1 focus:ring-foreground/40";

  return (
    <form onSubmit={submit} className="space-y-4">
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="eyebrow">
            {f.label}
            {f.required ? "" : " (optional)"}
          </span>
          {f.type === "textarea" ? (
            <textarea
              name={f.name}
              required={f.required}
              rows={5}
              placeholder={f.placeholder}
              className={`${input} mt-2 resize-y`}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          ) : (
            <input
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              min={f.type === "number" ? 1 : undefined}
              placeholder={f.placeholder}
              className={`${input} mt-2`}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          )}
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="submit" className={buttonClass("primary", "md")}>
          {submitLabel}
        </button>
        <span className="text-[12.5px] text-subtle">Nothing is sent from this page — your mail app opens with the message ready.</span>
      </div>
    </form>
  );
}
