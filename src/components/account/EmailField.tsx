import React from "react";
import { Button } from "../ui/Button";

export const looksLikeEmail = (input: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());

/** The pill a field and its button share: quiet at rest, a soft ring once
 * the input looks right, red on an error. */
export const pillFieldClass = (tone: "idle" | "ready" | "error") =>
  `flex h-10 items-center gap-1 rounded-full border-[0.5px] bg-glass-strong ps-4 pe-1 transition-[border-color,box-shadow] ${
    tone === "error"
      ? "border-error shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-error)_12%,transparent)]"
      : tone === "ready"
        ? "border-ink-3 shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-text)_6%,transparent)]"
        : "border-glass-edge"
  }`;

/**
 * An email address and its button in one pill, the button inside on the
 * right: signing in for Pro, and "Email me tips" in Account and setup. The
 * button fills in once the address looks right.
 */
export const EmailField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** The button's text (a TextSwap while busy, say). */
  button: React.ReactNode;
  placeholder: string;
  invalid?: boolean;
  busy?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  className?: string;
}> = ({
  value,
  onChange,
  onSubmit,
  button,
  placeholder,
  invalid = false,
  busy = false,
  className = "",
  ...aria
}) => {
  const ready = looksLikeEmail(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit();
      }}
      className={`${pillFieldClass(invalid ? "error" : ready ? "ready" : "idle")} ${className}`}
    >
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="email"
        aria-invalid={invalid || undefined}
        {...aria}
        className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3"
      />
      <Button
        type="submit"
        variant="primary"
        size="sm"
        className="h-8 px-4"
        disabled={!ready || busy}
      >
        {button}
      </Button>
    </form>
  );
};
