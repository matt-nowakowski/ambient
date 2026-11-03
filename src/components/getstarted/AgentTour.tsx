import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plug } from "lucide-react";
import { showError } from "@/lib/errors";
import { commands, type AgentSettings } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { hasScreenAgent } from "@/lib/agentPlatform";
import { keycapLabel } from "@/lib/utils/keyboard";
import { useSettings } from "../../hooks/useSettings";
import { isPaid, usePlan } from "../account/usePlan";
import { Orb } from "../orb/Orb";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Switch } from "../ui/Switch";
import { useGetStarted } from "./store";

const MODES = [
  { key: "write", orb: "B1" },
  { key: "answer", orb: "S1" },
  { key: "act", orb: "C2" },
  { key: "recall", orb: "G5" },
] as const;

type Capability =
  | "screen_context"
  | "proactive"
  | "meetings"
  | "wake_word"
  | "screen_memory";
const CAPABILITIES: Capability[] = [
  "screen_context",
  "proactive",
  "meetings",
  "wake_word",
  "screen_memory",
];

/**
 * Introduces the agent after setup (and to anyone updating into it): what it
 * does, a live try with the Ask shortcut, and what it may do, each with its
 * privacy promise in a line. Two steps of the same height; skippable.
 */
export const AgentTour: React.FC = () => {
  const { t } = useTranslation();
  const os = useOsType();
  const { tourOpen, closeTour, done } = useGetStarted();
  const { getSetting, refreshSettings } = useSettings();
  const { status } = usePlan();
  const paid = status ? isPaid(status) : false;
  const screenAgent = hasScreenAgent(os);
  const [step, setStep] = useState<0 | 1>(0);
  const agent = getSetting("agent");
  const [picked, setPicked] = useState<Record<Capability, boolean>>({
    screen_context: true,
    proactive: true,
    meetings: true,
    wake_word: false,
    screen_memory: false,
  });

  useEffect(() => {
    if (tourOpen) setStep(0);
  }, [tourOpen]);

  // While "Try it now" is up, Ambient's own window is in front: tell the
  // backend, so either shortcut asks the agent instead of typing into nothing.
  const trying = tourOpen && step === 0;
  useEffect(() => {
    if (!trying) return;
    commands.setAgentTourTry(true).catch(console.error);
    return () => {
      commands.setAgentTourTry(false).catch(console.error);
    };
  }, [trying]);

  // Both steps share one cell, so the dialog keeps the taller one's height;
  // the hidden one is out of the tab order.
  const meetRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    meetRef.current?.toggleAttribute("inert", step !== 0);
    chooseRef.current?.toggleAttribute("inert", step !== 1);
  }, [step, tourOpen]);

  const askKeys = keycapLabel(
    getSetting("bindings")?.ask_agent?.current_binding ?? "",
    os,
  );
  const tried = done.includes("answer") || done.includes("reminder");

  const finish = async () => {
    if (agent && screenAgent && paid) {
      const next: AgentSettings = { ...agent, ...picked };
      const r = await commands.setAgentSettings(next);
      if (r.status === "error") showError("settings", r.error);
      await refreshSettings();
    }
    closeTour();
  };

  return (
    <Dialog
      open={tourOpen}
      onOpenChange={(open) => !open && closeTour()}
      closeLabel={t("tour.skip")}
      title={step === 0 ? t("tour.meet.title") : t("tour.choose.title")}
      description={
        step === 0 ? t("tour.meet.description") : t("tour.choose.description")
      }
      contentClassName="max-w-[560px]"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex gap-1.5">
            {[0, 1].map((i) => (
              <span
                key={i}
                className={`h-1 w-5 rounded-full ${i === step ? "bg-text" : "bg-glass-press"}`}
              />
            ))}
          </span>
          {step === 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => (screenAgent ? setStep(1) : finish())}
            >
              {screenAgent ? t("tour.next") : t("tour.done")}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={finish}>
              {t("tour.start")}
            </Button>
          )}
        </div>
      }
    >
      <div className="grid">
        <motion.div
          ref={meetRef}
          aria-hidden={step !== 0}
          initial={false}
          animate={step === 0 ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
          className={`col-start-1 row-start-1 space-y-4 ${step === 0 ? "" : "pointer-events-none"}`}
        >
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <div
                key={m.key}
                className="min-w-0 rounded-card bg-glass-press p-3"
              >
                <p className="flex items-center gap-2 text-ui font-medium">
                  <Orb variant={m.orb} size={16} />
                  {t(`tour.modes.${m.key}.title`)}
                </p>
                {/* One line in every language; the full line on hover. */}
                <p
                  className="mt-1 truncate text-small text-ink-2"
                  title={t(`tour.modes.${m.key}.example`)}
                >
                  “{t(`tour.modes.${m.key}.example`)}”
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-card border-[0.5px] border-glass-edge p-3">
            <Plug
              width={15}
              height={15}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
            />
            <p className="text-small text-ink-2">
              <span className="font-medium text-text">
                {t("tour.nothingToConnect.title")}
              </span>{" "}
              {t("tour.nothingToConnect.body")}
            </p>
          </div>
          <div className="rounded-card bg-glass-press p-3">
            <p className="text-ui font-medium">{t("tour.try.title")}</p>
            <p className="mt-1 text-small text-ink-2">
              {t("tour.try.body", { keys: askKeys })}
            </p>
            <AnimatePresence>
              {tried && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-center gap-1.5 text-small font-medium"
                >
                  <Check width={13} height={13} strokeWidth={2.25} />
                  {t("tour.try.done")}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        <motion.div
          ref={chooseRef}
          aria-hidden={step !== 1}
          initial={false}
          animate={step === 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 12 }}
          className={`col-start-1 row-start-1 flex flex-col ${step === 1 ? "" : "pointer-events-none"}`}
        >
          {CAPABILITIES.map((cap) => (
            <div
              key={cap}
              className="flex items-center justify-between gap-5 py-[7px]"
            >
              <div className="min-w-0">
                <p className="truncate text-ui">
                  {t(`privacy.capabilities.${cap}.title`)}
                </p>
                <p className="truncate text-small text-ink-3">
                  {t(`tour.choose.caps.${cap}`)}
                </p>
              </div>
              <Switch
                checked={picked[cap]}
                disabled={!paid}
                ariaLabel={t(`privacy.capabilities.${cap}.title`)}
                onChange={(on) => setPicked({ ...picked, [cap]: on })}
              />
            </div>
          ))}
          <p className="mt-auto pt-2 text-small text-ink-3">
            {paid ? t("tour.choose.footnote") : t("tour.choose.proOnly")}
          </p>
        </motion.div>
      </div>
    </Dialog>
  );
};
