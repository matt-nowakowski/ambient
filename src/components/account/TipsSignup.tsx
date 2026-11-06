import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { commands } from "@/bindings";
import { Button } from "../ui/Button";
import { DoneMark } from "../shared/DoneMark";

const looksLikeEmail = (input: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());

type State = "idle" | "busy" | "done" | "error";

/**
 * "Email me tips": optional, empty until filled in, and separate from signing
 * in (most Free users never sign in). The website emails a link to confirm
 * and stores nothing until it's clicked, so success here means "check your
 * inbox". The heading is the caller's (Account's section, setup's card);
 * this is the line under it, the field and Send side by side, and the
 * confirmation that replaces them. Send fills in once the address looks
 * right.
 */
export const TipsSignup: React.FC<{
  /** Labels the field: the caller's heading. */
  labelledBy: string;
  /** Setup's card: the short line; Account: the longer one. */
  short?: boolean;
  /** Setup's debug preview: nothing is sent. */
  preview?: boolean;
  className?: string;
}> = ({ labelledBy, short = false, preview = false, className = "" }) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const id = useId();
  const sent = state === "done";
  const ready = looksLikeEmail(email);

  const send = async () => {
    if (!ready || state === "busy" || sent) return;
    setState("busy");
    if (preview) {
      setState("done");
      return;
    }
    const result = await commands.subscribeTips(email.trim());
    setState(result.status === "ok" ? "done" : "error");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  const row = (
    <motion.div
      key="row"
      exit={reduce ? undefined : { opacity: 0, y: -2 }}
      transition={{ duration: 0.16 }}
      className="flex items-center gap-2"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === "error") setState("idle");
        }}
        placeholder={t("account.signIn.emailPlaceholder")}
        spellCheck={false}
        autoComplete="email"
        aria-labelledby={labelledBy}
        aria-describedby={`${id}-about`}
        aria-invalid={state === "error" || undefined}
        className={`h-9 min-w-0 flex-1 rounded-control border bg-background px-3 text-ui text-text transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:outline-none focus:ring-4 ${
          state === "error"
            ? "border-error focus:ring-error/10"
            : "border-line-strong hover:border-ink-3 focus:border-ink-3 focus:ring-logo-primary/[0.07]"
        }`}
      />
      <Button
        type="submit"
        variant={ready ? "primary" : "secondary"}
        className="h-9 shrink-0 px-4"
        disabled={state === "busy"}
      >
        {t("account.tips.button")}
      </Button>
    </motion.div>
  );

  const done = (
    <motion.p
      key="done"
      role="status"
      initial={reduce ? false : { opacity: 0, y: 4, filter: "blur(3px)" }}
      animate={{
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transitionEnd: { filter: "none" },
      }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="m-0 flex h-9 items-center gap-2 text-ui font-medium text-moss"
    >
      <DoneMark />
      {t("account.tips.checkInbox")}
    </motion.p>
  );

  return (
    <form onSubmit={submit} className={`flex flex-col ${className}`}>
      {/* The error takes the line's place. */}
      <p
        id={`${id}-about`}
        className={`m-0 text-small text-pretty ${state === "error" ? "text-error" : "text-ink-2"}`}
        role={state === "error" ? "alert" : undefined}
      >
        {state === "error"
          ? t("account.tips.error")
          : t(short ? "account.tips.short" : "account.tips.description")}
      </p>
      <div className="mt-3">
        <AnimatePresence mode="wait" initial={false}>
          {sent ? done : row}
        </AnimatePresence>
      </div>
    </form>
  );
};
