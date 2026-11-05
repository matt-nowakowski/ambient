import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Button } from "../ui/Button";

const looksLikeEmail = (input: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());

type State = "idle" | "busy" | "done" | "error";

/**
 * "Email me tips": optional, empty until filled in, and separate from signing
 * in (most Free users never sign in). The website emails a link to confirm
 * and stores nothing until it's clicked, so success here means "check your
 * inbox". Account shows it with its line of explanation; setup's last screen
 * uses `compact`, one quiet row, with the same line as its description.
 */
export const TipsSignup: React.FC<{
  compact?: boolean;
  /** Setup's debug preview: nothing is sent. */
  preview?: boolean;
  className?: string;
}> = ({ compact = false, preview = false, className = "" }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const id = useId();
  const sent = state === "done";

  const send = async () => {
    if (!looksLikeEmail(email) || state === "busy" || sent) return;
    setState("busy");
    if (preview) {
      setState("done");
      return;
    }
    const result = await commands.subscribeTips(email.trim());
    setState(result.status === "ok" ? "done" : "error");
  };

  const status =
    state === "done" ? (
      <span role="status" className="text-ink-2">
        {t("account.tips.checkInbox")}
      </span>
    ) : state === "error" ? (
      <span role="alert" className="text-error">
        {t("account.tips.error")}
      </span>
    ) : null;

  const field = (
    <div className="flex min-w-0 items-center gap-2">
      <input
        id={id}
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === "error") setState("idle");
        }}
        placeholder={t("account.signIn.emailPlaceholder")}
        spellCheck={false}
        autoComplete="email"
        disabled={sent}
        aria-describedby={`${id}-about`}
        className={`min-w-0 flex-1 rounded-full border-[0.5px] border-glass-edge bg-glass-strong px-3 text-small outline-none placeholder:text-ink-3 disabled:opacity-60 ${compact ? "h-7 w-52 flex-none" : "py-1.5"}`}
      />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className={compact ? "h-7 px-3" : "h-8 px-3"}
        disabled={!looksLikeEmail(email) || state === "busy" || sent}
      >
        {sent ? t("account.tips.done") : t("account.tips.button")}
      </Button>
    </div>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  if (compact)
    return (
      <form
        onSubmit={submit}
        className={`flex items-center gap-2 text-small text-ink-2 ${className}`}
      >
        <label
          htmlFor={id}
          className="shrink-0"
          title={t("account.tips.description")}
        >
          {t("account.tips.labelOptional")}
        </label>
        {status ?? field}
        <span id={`${id}-about`} className="sr-only">
          {t("account.tips.description")}
        </span>
      </form>
    );

  return (
    <form onSubmit={submit} className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-ui font-medium text-text">
        {t("account.tips.label")}
      </label>
      <p id={`${id}-about`} className="text-small text-ink-3">
        {t("account.tips.description")}
      </p>
      {field}
      {status && <p className="text-small">{status}</p>}
    </form>
  );
};
