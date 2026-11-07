import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { AudioLines, Info, Keyboard, Quote } from "lucide-react";
import { useOsType } from "@/hooks/useOsType";
import { hasScreenAgent } from "@/lib/agentPlatform";
import { keycapLabel } from "@/lib/utils/keyboard";
import { useSettings } from "../../hooks/useSettings";
import { Keycaps } from "../shared/Keycaps";
import { Orb, type OrbVariant } from "../orb/Orb";
import { Dialog } from "../ui/Dialog";

/** Example phrases per capability. Each group's icon is an orb, as in the tour. */
const GROUPS = [
  { key: "answer", count: 4, screenAgent: false, orb: "S1" },
  { key: "act", count: 4, screenAgent: false, orb: "C2" },
  { key: "recall", count: 2, screenAgent: false, orb: "G5" },
  { key: "suggestions", count: 4, screenAgent: true, orb: "B1" },
  { key: "meetings", count: 3, screenAgent: true, orb: "B3" },
] as const satisfies readonly {
  key: string;
  count: number;
  /** Needs screen reading or call audio (macOS and Windows). */
  screenAgent: boolean;
  orb: OrbVariant;
}[];

export type TrySayingGroup = (typeof GROUPS)[number]["key"];

/** The three ways in, from the "talking" group, each with its own icon. */
const WAYS = [
  { index: 0, icon: Keyboard, keys: "ask" },
  { index: 1, icon: Keyboard, keys: "dictate" },
  { index: 2, icon: AudioLines, keys: null },
] as const;

export const TrySaying: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The group shown first (the Get started item that opened it). */
  group?: TrySayingGroup;
  /** Where suggestions are switched on, for when they're off. */
  onOpenPrivacy?: () => void;
}> = ({ open, onOpenChange, group = "answer", onOpenPrivacy }) => {
  const { t } = useTranslation();
  const os = useOsType();
  const { getSetting } = useSettings();
  const bindings = getSetting("bindings");
  const askBinding = bindings?.ask_agent?.current_binding ?? "";
  const dictateBinding = bindings?.transcribe?.current_binding ?? "";
  const ask = keycapLabel(askBinding, os);
  const dictate = keycapLabel(dictateBinding, os);
  const groups = GROUPS.filter((g) => hasScreenAgent(os) || !g.screenAgent);
  const [active, setActive] = useState<TrySayingGroup>(group);

  // Each opening starts on the group its item asked for.
  useEffect(() => {
    if (open) setActive(groups.some((g) => g.key === group) ? group : "answer");
  }, [open, group]);

  const current = groups.find((g) => g.key === active) ?? groups[0];
  // Suggestions are off until chosen: say so where they're explained.
  const suggestionsOff =
    current.key === "suggestions" && getSetting("agent")?.proactive === false;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      closeLabel={t("trySaying.close")}
      title={t("trySaying.title")}
      description={t("trySaying.subtitle")}
      className="max-w-[600px]!"
    >
      <div className="space-y-5">
        {/* How to talk: one row per way in, with its key. */}
        <section>
          <h3 className="text-section font-medium text-ink-3">
            {t("trySaying.groups.talking.title")}
          </h3>
          <ul className="mt-2 divide-y-[0.5px] divide-glass-edge overflow-hidden rounded-card border-[0.5px] border-glass-edge bg-glass">
            {WAYS.map(({ index, icon: Icon, keys }) => {
              const binding =
                keys === "ask"
                  ? askBinding
                  : keys === "dictate"
                    ? dictateBinding
                    : "";
              return (
                <li
                  key={index}
                  className="flex items-center gap-3 px-3 py-2.5 text-small text-ink-2"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                    <Icon width={14} height={14} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    {t(`trySaying.ways.${index}`)}
                  </span>
                  {binding && (
                    <Keycaps
                      binding={binding}
                      osType={os}
                      size="screen"
                      className="shrink-0"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* What to say: pick a kind, see examples. */}
        <section>
          <div
            role="tablist"
            aria-label={t("trySaying.title")}
            className="flex flex-wrap gap-1.5"
          >
            {groups.map((g) => {
              const selected = g.key === current.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(g.key)}
                  className={`flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-[0.5px] ps-2 pe-3 text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                    selected
                      ? "border-transparent bg-text text-background"
                      : "border-glass-edge bg-glass text-ink-2 hover:bg-glass-hover hover:text-text"
                  }`}
                >
                  <Orb
                    variant={g.orb}
                    size={14}
                    label={t(`trySaying.groups.${g.key}.title`)}
                    style={
                      { "--orb-fg": "currentColor" } as React.CSSProperties
                    }
                  />
                  {t(`trySaying.groups.${g.key}.title`)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-[148px]" role="tabpanel">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <p className="text-small text-ink-3">
                  {t(`trySaying.groups.${current.key}.hint`)}
                  {suggestionsOff && (
                    <>
                      {" "}
                      {t("trySaying.groups.suggestions.off")}{" "}
                      {onOpenPrivacy && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            onOpenPrivacy();
                          }}
                          className="cursor-pointer text-text underline decoration-line-strong underline-offset-4 hover:decoration-current"
                        >
                          {t("trySaying.groups.suggestions.turnOn")}
                        </button>
                      )}
                    </>
                  )}
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-2">
                  {Array.from({ length: current.count }, (_, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-card bg-glass-press px-3 py-2.5 text-ui"
                    >
                      <Quote
                        width={11}
                        height={11}
                        strokeWidth={2}
                        className="mt-1 shrink-0 text-ink-3"
                        aria-hidden="true"
                      />
                      <span>
                        {t(`trySaying.groups.${current.key}.examples.${i}`, {
                          ask,
                          dictate,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <p className="flex items-start gap-2 border-t-[0.5px] border-glass-edge pt-3 text-small text-ink-3">
          <Info
            width={13}
            height={13}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          {t("trySaying.footnote")}
        </p>
      </div>
    </Dialog>
  );
};
