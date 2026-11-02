"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers without async clipboard permission.
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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={buttonClass("primary", "sm", "min-w-20")}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
