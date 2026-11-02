import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plug } from "lucide-react";
import { toast } from "sonner";
import { commands, type AgentSettings } from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
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
 * does, a live try with the Ask shortcut, and what it may do, chosen with
 * each capability's privacy promise in view. Two steps; skippable.
 */
export const AgentTour: React.FC = () => {
  const { t } = useTranslation();
  const os = useOsType();
  const { tourOpen, closeTour, done } = useGetStarted();
  const { getSetting, refreshSettings } = useSettings();
  const { status } = usePlan();
  const paid = status ? isPaid(status) : false;
  const isMac = os === "macos";
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

  const askKeys = keycapLabel(
    getSetting("bindings")?.ask_agent?.current_binding ?? "",
    os,
  );
  const tried = done.includes("answer") || done.includes("reminder");

  const finish = async () => {
    if (agent && isMac && paid) {
      const next: AgentSettings = { ...agent, ...picked };
      const r = await commands.setAgentSettings(next);
      if (r.status === "error") toast.error(r.error);
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
              onClick={() => (isMac ? setStep(1) : finish())}
            >
              {isMac ? t("tour.next") : t("tour.done")}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={finish}>
              {t("tour.start")}
            </Button>
          )}
        </div>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 0 ? (
          <motion.div
            key="meet"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <div key={m.key} className="rounded-card bg-glass-press p-3">
                  <p className="flex items-center gap-2 text-ui font-medium">
                    <Orb variant={m.orb} size={16} />
                    {t(`tour.modes.${m.key}.title`)}
                  </p>
                  <p className="mt-1 text-small text-ink-2">
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
        ) : (
          <motion.div
            key="choose"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="space-y-1"
          >
            {CAPABILITIES.map((cap) => (
              <div
                key={cap}
                className="flex items-start justify-between gap-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-ui">
                    {t(`privacy.capabilities.${cap}.title`)}
                  </p>
                  <p className="mt-0.5 text-small text-ink-2">
                    {t(`privacy.capabilities.${cap}.reads`)}
                  </p>
                  <p className="mt-0.5 text-small text-ink-3">
                    {t(`privacy.capabilities.${cap}.leaves`)}
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
            <p className="pt-2 text-small text-ink-3">
              {paid ? t("tour.choose.footnote") : t("tour.choose.proOnly")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
};
