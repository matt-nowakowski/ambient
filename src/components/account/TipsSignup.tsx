import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { commands } from "@/bindings";
import { EmailField, looksLikeEmail } from "./EmailField";
import { DoneMark } from "../shared/DoneMark";

type State = "idle" | "busy" | "done" | "error";

/**
 * "Email me tips": optional, empty until filled in, and separate from signing
 * in (most Free users never sign in). The website emails a link to confirm
 * and stores nothing until it's clicked, so success here means "check your
 * inbox". The heading is the caller's (Account's section, setup's card);
 * this is the line under it, the field with Send inside it, and the
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

  // The same pill as signing in, Send inside it.
  const row = (
    <motion.div
      key="row"
      exit={reduce ? undefined : { opacity: 0, y: -2 }}
      transition={{ duration: 0.16 }}
    >
      <EmailField
        value={email}
        onChange={(v) => {
          setEmail(v);
          if (state === "error") setState("idle");
        }}
        onSubmit={send}
        placeholder={t("account.signIn.emailPlaceholder")}
        aria-labelledby={labelledBy}
        aria-describedby={`${id}-about`}
        invalid={state === "error"}
        busy={state === "busy"}
        button={t("account.tips.button")}
      />
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
      className="m-0 flex h-10 items-center gap-2 text-ui font-medium text-moss"
    >
      <DoneMark />
      {t("account.tips.checkInbox")}
    </motion.p>
  );

  return (
    <div className={`flex flex-col ${className}`}>
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
    </div>
  );
};
