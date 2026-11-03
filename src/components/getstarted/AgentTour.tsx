import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Check, Info, Plug } from "lucide-react";
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
import { OffersPreview } from "./OffersPreview";
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
/** The choose step's list. Suggestions have their own step before it. */
const CAPABILITIES: Capability[] = [
  "screen_context",
  "meetings",
  "wake_word",
  "screen_memory",
];

/** Meet the agent; it offers help, too; choose what it may do. */
type TourStep = 0 | 1 | 2;
const KEYS: Record<TourStep, string> = {
  0: "tour.meet",
  1: "tour.offers",
  2: "tour.choose",
};

/**
 * Introduces the agent after setup (and to anyone updating into it): what it
 * does, a live try with the Ask shortcut, that it offers help on its own
 * (suggestions, off until switched on), and what it may do, each with its
 * privacy promise in a line. Steps of the same height; skippable.
 */
export const AgentTour: React.FC = () => {
  const { t } = useTranslation();
  const os = useOsType();
  const { tourOpen, closeTour, done } = useGetStarted();
  const { getSetting, refreshSettings } = useSettings();
  const { status } = usePlan();
  const paid = status ? isPaid(status) : false;
  const screenAgent = hasScreenAgent(os);
  const [step, setStep] = useState<TourStep>(0);
  const agent = getSetting("agent");
  const [picked, setPicked] = useState<Record<Capability, boolean>>({
    screen_context: true,
    // Suggestions stay off unless chosen (a privacy promise).
    proactive: false,
    meetings: true,
    wake_word: false,
    screen_memory: false,
  });
  const steps: TourStep[] = screenAgent ? [0, 1, 2] : [0];
  const last = steps[steps.length - 1];

  useEffect(() => {
    if (!tourOpen) return;
    setStep(0);
    // A replayed tour shows suggestions as they are now.
    setPicked((p) => ({ ...p, proactive: agent?.proactive ?? false }));
  }, [tourOpen]);

  /** "Offer suggestions" is saved the moment it's switched, so it holds
   * even if the tour is skipped after. */
  const setProactive = async (on: boolean) => {
    setPicked((p) => ({ ...p, proactive: on }));
    if (!agent) return;
    const r = await commands.setAgentSettings({ ...agent, proactive: on });
    if (r.status === "error") showError("settings", r.error);
    await refreshSettings();
  };

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

  // The steps share one cell, so the dialog keeps the tallest one's height;
  // the hidden ones are out of the tab order.
  const meetRef = useRef<HTMLDivElement>(null);
  const offersRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    meetRef.current?.toggleAttribute("inert", step !== 0);
    offersRef.current?.toggleAttribute("inert", step !== 1);
    chooseRef.current?.toggleAttribute("inert", step !== 2);
  }, [step, tourOpen]);

  /** A step in place, or off to the side it was left on. */
  const at = (s: TourStep) =>
    s === step ? { opacity: 1, x: 0 } : { opacity: 0, x: s < step ? -12 : 12 };
  const cell = (s: TourStep) =>
    `col-start-1 row-start-1 ${s === step ? "" : "pointer-events-none"}`;

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
      title={t(`${KEYS[step]}.title`)}
      // Every step's line in one cell, so a longer one never changes the
      // dialog's height between steps.
      description={
        <span className="grid">
          {steps.map((s) => (
            <span
              key={s}
              aria-hidden={s !== step}
              className={`col-start-1 row-start-1 ${s === step ? "" : "invisible"}`}
            >
              {t(`${KEYS[s]}.description`)}
            </span>
          ))}
        </span>
      }
      contentClassName="max-w-[560px]"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex gap-1.5">
            {steps.length > 1 &&
              steps.map((i) => (
                <span
                  key={i}
                  className={`h-1 w-5 rounded-full transition-colors ${i === step ? "bg-text" : "bg-glass-press"}`}
                />
              ))}
          </span>
          {step !== last ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep((step + 1) as TourStep)}
            >
              {t("tour.next")}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={finish}>
              {screenAgent ? t("tour.start") : t("tour.done")}
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
          animate={at(0)}
          className={`${cell(0)} space-y-4`}
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
        {screenAgent && (
          <motion.div
            ref={offersRef}
            aria-hidden={step !== 1}
            initial={false}
            animate={at(1)}
            className={`${cell(1)} flex flex-col gap-3`}
          >
            <OffersPreview active={tourOpen && step === 1} />
            {/* The one switch for suggestions; the choose step leaves it out. */}
            <div className="rounded-card border-[0.5px] border-glass-edge px-3 py-2.5">
              <div className="flex items-center justify-between gap-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Orb variant="C2" size={16} />
                  <div className="min-w-0">
                    <p
                      id="tour-offers-switch"
                      className="truncate text-ui font-medium"
                    >
                      {t("privacy.capabilities.proactive.title")}
                    </p>
                    <p className="truncate text-small text-ink-3">
                      {paid
                        ? t("tour.choose.caps.proactive")
                        : t("tour.choose.proOnly")}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={picked.proactive}
                  disabled={!paid || !agent}
                  ariaLabelledBy="tour-offers-switch"
                  onChange={setProactive}
                />
              </div>
              {/* No Apple Intelligence: say what decides, and when the
                  cloud would (see judge::route and the one-time offer). */}
              {paid && os !== "macos" && (
                <p className="mt-2 flex items-start gap-1.5 border-t-[0.5px] border-glass-edge pt-2 text-small text-ink-3">
                  <Info
                    width={12}
                    height={12}
                    strokeWidth={1.75}
                    className="mt-[2.5px] shrink-0"
                    aria-hidden="true"
                  />
                  {t("tour.offers.noOnDevice")}
                </p>
              )}
            </div>
          </motion.div>
        )}
        <motion.div
          ref={chooseRef}
          aria-hidden={step !== 2}
          initial={false}
          animate={at(2)}
          className={`${cell(2)} flex flex-col`}
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
