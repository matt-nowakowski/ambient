import React, { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Globe } from "lucide-react";
import { commands, type Intelligence } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import type { OSType } from "@/lib/utils/keyboard";
import { Orb, type OrbVariant } from "../../orb/Orb";
import { Button } from "../../ui/Button";
import { Keycaps } from "../../shared/Keycaps";
import { DrawnCheck } from "../DrawnCheck";
import { OnboardingShell, ScreenHeader, ScreenMain } from "../OnboardingShell";
import "./agent.css";

/** The four things you can ask for, each with its examples: the second (if
 * any) plays on the tile's next turn. Orbs as in the tour's modes. */
const POWERS = [
  { key: "ask", orb: "S1", examples: ["weather"] },
  { key: "screen", orb: "C4", examples: ["thread", "error"] },
  { key: "write", orb: "B1", examples: ["reply"] },
  { key: "act", orb: "C2", examples: ["remind", "open"] },
] as const satisfies readonly {
  key: string;
  orb: OrbVariant;
  examples: readonly string[];
}[];
type Power = (typeof POWERS)[number]["key"];

/** The answer card's web source: a domain, as the real chip shows it. */
const SOURCE = "ipma.pt";

/** Each tile's turn: it listens, then its result arrives and stays. */
const FIRST_MS = 700;
const LISTEN_MS = 1000;
const TURN_MS = 2400;

/** The HUD card arriving top right, like the real one. */
const cardMotion = {
  initial: { opacity: 0, y: -6, scale: 0.97, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.98, filter: "blur(2px)" },
  transition: {
    type: "spring",
    stiffness: 380,
    damping: 30,
    opacity: { duration: 0.22 },
    filter: { duration: 0.22 },
  },
} as const;

/** The recording pill, small: you're talking. */
const LivePill: React.FC<{ shown: boolean }> = ({ shown }) => (
  <AnimatePresence>
    {shown && (
      <motion.span
        className="agt-pill"
        initial={{ opacity: 0, y: 6, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        <i className="agt-pill-dot" />
        <span className="agt-pill-bars">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} />
          ))}
        </span>
      </motion.span>
    )}
  </AnimatePresence>
);

/** Types `text` in once on mount, at a talking pace; whole when still. */
const Typed: React.FC<{ text: string; still: boolean }> = ({ text, still }) => {
  const chars = Array.from(text);
  const [n, setN] = useState(still ? chars.length : 0);
  useEffect(() => {
    if (still) return;
    const step = Math.max(16, Math.min(34, 900 / chars.length));
    const id = setInterval(
      () =>
        setN((x) => {
          if (x >= chars.length) clearInterval(id);
          return Math.min(chars.length, x + 1);
        }),
      step,
    );
    return () => clearInterval(id);
  }, []);
  return <>{chars.slice(0, n).join("")}</>;
};

/** What a tile's drawn screen shows for one example. */
const Scene: React.FC<{
  power: Power;
  example: string;
  /** Listening: the pill is up, the result not yet. */
  listening: boolean;
  /** The result is in. */
  done: boolean;
  /** Bumped each turn, so the result arrives afresh. */
  run: number;
  still: boolean;
}> = ({ power, example, listening, done, run, still }) => {
  const { t } = useTranslation();
  const base = `onboarding.agent.powers.${power}.${example}`;
  const card = (children: React.ReactNode, className = "") => (
    <AnimatePresence>
      {done && (
        <motion.div
          key={`${example}-${run}`}
          className={`agt-card ${className}`}
          {...(still ? { initial: false } : cardMotion)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="agt-strip" data-listening={listening || undefined}>
      {power === "screen" && (
        // The window being asked about: a thread, or a log with an error.
        <div className="agt-window agt-window-side">
          <span className="agt-dots">
            <i />
            <i />
            <i />
          </span>
          <span
            className="agt-lines"
            data-error={example === "error" || undefined}
          >
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="agt-scan" />
        </div>
      )}
      {power === "write" && (
        // A chat: their question, and the reply typed into your field.
        <div className="agt-window agt-window-wide">
          <p className="agt-them">{t(`${base}.them`)}</p>
          <p className="agt-field">
            {done && (
              <Typed key={run} text={t(`${base}.reply`)} still={still} />
            )}
            <span className="agt-caret" />
          </p>
        </div>
      )}

      {power === "ask" &&
        card(
          <>
            <motion.p
              className="agt-reply agt-one-line"
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12, duration: 0.3 }}
            >
              {t(`${base}.reply`)}
            </motion.p>
            <motion.span
              className="agt-chip"
              initial={still ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.32,
                type: "spring",
                stiffness: 500,
                damping: 26,
              }}
            >
              <Globe size={10} strokeWidth={2} aria-hidden="true" />
              {SOURCE}
            </motion.span>
          </>,
        )}
      {power === "screen" &&
        card(
          <p className="agt-reply agt-two-lines">{t(`${base}.reply`)}</p>,
          "agt-card-narrow",
        )}
      {power === "act" &&
        card(
          <p className="agt-notice">
            <DrawnCheck size={14} />
            <span className="agt-two-lines">{t(`${base}.reply`)}</span>
          </p>,
        )}

      <LivePill shown={listening} />
    </div>
  );
};

interface AgentProps {
  progress: { index: number; count: number };
  os: OSType;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Before the shortcut's demo: what you can ask for, not only dictation. Four
 * tiles (ask, about your screen, write, do), each with a phrase to say and
 * its result drawn on a small screen as the HUD shows it. The tiles take
 * turns: the pill listens, the result arrives; on a tile's next turn its
 * other example plays. Under reduced motion, every result is shown still.
 */
export const Agent: React.FC<AgentProps> = ({
  progress,
  os,
  onBack,
  onContinue,
}) => {
  const { t } = useTranslation();
  const still = useReducedMotion() ?? false;
  const { getSetting } = useSettings();
  const askBinding = getSetting("bindings")?.ask_agent?.current_binding ?? "";

  // Read fresh: the AI choice two screens back saves without the store.
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  useEffect(() => {
    let live = true;
    commands.getAppSettings().then((r) => {
      const agent = r.status === "ok" ? r.data.agent : undefined;
      if (live && agent) setIntelligence(agent.intelligence);
    });
    return () => {
      live = false;
    };
  }, []);

  // The tiles rise in on arrival only.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setArriving(false), 800);
    return () => clearTimeout(id);
  }, []);

  // Turns taken so far (the tile on turn n is (n - 1) % 4), and whether the
  // current one has its result yet.
  const [turns, setTurns] = useState(0);
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    if (still) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const turn = (n: number) => {
      setTurns(n);
      setHeard(false);
      timers = [
        setTimeout(() => setHeard(true), LISTEN_MS),
        setTimeout(() => turn(n + 1), TURN_MS),
      ];
    };
    timers = [setTimeout(() => turn(1), FIRST_MS)];
    return () => timers.forEach(clearTimeout);
  }, [still]);

  const count = POWERS.length;

  return (
    <OnboardingShell
      progress={progress}
      onBack={onBack}
      hintTone={intelligence === "none" ? "warning" : "quiet"}
      hint={
        intelligence === "none" ? (
          t("onboarding.agent.noAi")
        ) : askBinding ? (
          <span className="inline-flex items-center gap-[8px] whitespace-nowrap">
            <Trans
              i18nKey="onboarding.agent.askKey"
              components={{
                keys: (
                  <Keycaps binding={askBinding} osType={os} size="screen" />
                ),
              }}
            />
          </span>
        ) : null
      }
      primary={
        <Button variant="primary" size="lg" onClick={onContinue}>
          {t("onboarding.shell.continue")}
        </Button>
      }
    >
      <ScreenMain
        align="stretch"
        header={
          <ScreenHeader
            title={t("onboarding.agent.title")}
            sub={t("onboarding.agent.sub")}
          />
        }
      >
        <div
          role="img"
          aria-label={t("onboarding.agent.screenLabel")}
          className={`${arriving ? "onb-stagger" : ""} grid w-full auto-rows-fr grid-cols-2 gap-[10px]`}
        >
          {POWERS.map((p, i) => {
            // How many turns this tile has had, and which example is up.
            const runs = still
              ? 1
              : turns > i
                ? Math.floor((turns - 1 - i) / count) + 1
                : 0;
            const active = !still && turns > 0 && (turns - 1) % count === i;
            const listening = active && !heard;
            const done = runs > 0 && !listening;
            const example =
              p.examples[(Math.max(runs, 1) - 1) % p.examples.length];
            return (
              <section
                key={p.key}
                aria-hidden="true"
                className="onb-glass flex min-w-0 flex-col rounded-panel p-[12px] text-start"
              >
                <h2 className="m-0 flex items-center gap-[8px] px-[2px] font-display text-row font-normal leading-[1.3] text-text">
                  <Orb variant={p.orb} size={14} />
                  {t(`onboarding.agent.powers.${p.key}.title`)}
                </h2>
                {/* Every example in one cell, so a turn never moves the
                    screen below; the one up is lit while it's said. */}
                <p className="m-0 mt-[4px] grid px-[2px] text-small">
                  {p.examples.map((ex) => (
                    <span
                      key={ex}
                      className={`agt-said col-start-1 row-start-1 ${ex === example ? "" : "invisible"}`}
                      data-on={(active && ex === example) || undefined}
                    >
                      {t("onboarding.agent.quote", {
                        said: t(`onboarding.agent.powers.${p.key}.${ex}.said`),
                      })}
                    </span>
                  ))}
                </p>
                <div className="mt-auto pt-[10px]">
                  <Scene
                    power={p.key}
                    example={example}
                    listening={listening}
                    done={done}
                    run={runs}
                    still={still}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </ScreenMain>
    </OnboardingShell>
  );
};
