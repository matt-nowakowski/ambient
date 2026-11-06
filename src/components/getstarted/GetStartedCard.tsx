import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { useOsType } from "@/hooks/useOsType";
import { hasScreenAgent } from "@/lib/agentPlatform";
import { STEPS, useGetStarted, type Step } from "./store";
import { TrySaying, type TrySayingGroup } from "./TrySaying";

/** Steps that need screen reading or call audio (macOS and Windows). */
const SCREEN_AGENT_ONLY: Step[] = ["about_screen", "suggestion", "meeting"];

/** Which examples each item opens on. */
const GROUP_FOR: Record<Exclude<Step, "privacy">, TrySayingGroup> = {
  answer: "answer",
  reminder: "act",
  about_screen: "answer",
  suggestion: "suggestions",
  meeting: "meetings",
};

/** Home: learn by doing. Each step ticks itself off when done for real. */
export const GetStartedCard: React.FC<{ onOpenPrivacy: () => void }> = ({
  onOpenPrivacy,
}) => {
  const { t } = useTranslation();
  const os = useOsType();
  const { done, dismissed, dismiss, openTour } = useGetStarted();
  const [sayOpen, setSayOpen] = useState(false);
  const [sayGroup, setSayGroup] = useState<TrySayingGroup>("answer");
  const openSay = (group: TrySayingGroup) => {
    setSayGroup(group);
    setSayOpen(true);
  };
  const steps = STEPS.filter(
    (s) => hasScreenAgent(os) || !SCREEN_AGENT_ONLY.includes(s),
  );
  const finished = steps.every((s) => done.includes(s));
  if (dismissed || finished)
    return (
      <TrySaying
        open={sayOpen}
        onOpenChange={setSayOpen}
        group={sayGroup}
        onOpenPrivacy={onOpenPrivacy}
      />
    );

  const count = steps.filter((s) => done.includes(s)).length;
  return (
    <section className="glass rounded-panel p-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-section font-medium text-ink-3">
            {t("getStarted.title")}
          </p>
          <p className="mt-1 text-small text-ink-2">
            {t("getStarted.progress", { done: count, total: steps.length })}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("getStarted.hide")}
          onClick={dismiss}
          className="shrink-0 rounded-control p-1 text-ink-3 hover:bg-glass-hover hover:text-text"
        >
          <X width={13} height={13} />
        </button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {steps.map((s) => {
          const isDone = done.includes(s);
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  if (s === "privacy") {
                    useGetStarted.getState().mark("privacy");
                    onOpenPrivacy();
                  } else {
                    openSay(GROUP_FOR[s]);
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-control px-1 py-1 text-start text-ui hover:bg-glass-hover"
              >
                <motion.span
                  initial={false}
                  animate={{ scale: isDone ? [1.25, 1] : 1 }}
                  className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[0.5px] ${
                    isDone
                      ? "border-transparent bg-text text-background"
                      : "border-line-strong"
                  }`}
                >
                  {isDone && <Check width={11} height={11} strokeWidth={2.5} />}
                </motion.span>
                <span
                  className={
                    isDone ? "text-ink-3 line-through decoration-ink-3/40" : ""
                  }
                >
                  {t(`getStarted.steps.${s}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-3 border-t-[0.5px] border-glass-edge pt-3 text-small">
        <button
          type="button"
          onClick={() => openSay("answer")}
          className="text-text underline decoration-line-strong underline-offset-4"
        >
          {t("getStarted.whatToSay")}
        </button>
        <button
          type="button"
          onClick={openTour}
          className="text-ink-2 hover:text-text"
        >
          {t("getStarted.replayTour")}
        </button>
      </div>
      <TrySaying
        open={sayOpen}
        onOpenChange={setSayOpen}
        group={sayGroup}
        onOpenPrivacy={onOpenPrivacy}
      />
    </section>
  );
};
