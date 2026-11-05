"use client";

import { useState, type KeyboardEvent } from "react";
import { buttonClass } from "@/components/ui";

/** A small copy button for snippets and links. */
export function CopyText({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" onClick={copy} className={buttonClass("glass", "sm", `min-w-16 ${className}`)}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

/**
 * A segmented control (radiogroup). Arrow keys move the choice, as a native
 * radio group would; only the chosen option is in the tab order.
 */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void }) {
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const group = e.currentTarget;
    const i = options.findIndex((o) => o.id === value);
    onChange(options[(i + step + options.length) % options.length].id);
    requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }
  return (
    <div role="radiogroup" aria-label={label} className="mk-seg" onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} tabIndex={value === o.id ? 0 : -1} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
