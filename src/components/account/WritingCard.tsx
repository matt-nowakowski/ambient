import React from "react";
import { useTranslation } from "react-i18next";
import { PenLine, Quote, Sparkles, WandSparkles } from "lucide-react";
import type { WritingMode } from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { Radio } from "../ui/Radio";
import { DependencyNote } from "../ui/SettingLink";

const MODES: { key: WritingMode; icon: React.ElementType }[] = [
  { key: "smart", icon: WandSparkles },
  { key: "as_said", icon: Quote },
  { key: "polish", icon: Sparkles },
];

/** Writing: how dictation is typed. Smart decides per utterance (as said,
 * polished, or written for you, with "Use my words" to take it back);
 * the other two always do one thing. Sits under AI polish, which it uses. */
export const WritingCard: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const mode = getSetting("writing_mode") ?? "smart";
  const polishOn = getSetting("post_process_enabled") ?? false;

  return (
    <section className="glass rounded-panel p-card">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-card bg-glass-press">
          <PenLine width={15} height={15} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-ui font-medium">{t("account.writing.title")}</h2>
          <p className="mt-0.5 max-w-md text-small text-ink-2">
            {t("account.writing.description")}
          </p>
          <p className="mt-1 max-w-md text-meta text-ink-3">
            {t("account.writing.scope")}
          </p>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label={t("account.writing.title")}
        className="mt-4 divide-y divide-glass-edge border-t-[0.5px] border-glass-edge"
      >
        {MODES.map(({ key, icon: Icon }) => {
          const picked = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={picked}
              data-search-row
              disabled={isUpdating("writing_mode")}
              onClick={() => updateSetting("writing_mode", key)}
              className="flex w-full items-start gap-3 py-row-y text-start"
            >
              <span className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
                <Icon width={14} height={14} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ui">
                  {t(`account.writing.options.${key}.title`)}
                </span>
                <span className="mt-0.5 block text-small text-ink-2">
                  {t(`account.writing.options.${key}.description`)}
                </span>
              </span>
              <Radio checked={picked} className="mt-1.5" />
            </button>
          );
        })}
      </div>
      {!polishOn && mode !== "as_said" && (
        <DependencyNote
          tone={mode === "polish" ? "warn" : "info"}
          className="mt-2"
          link={{
            section: "account",
            label: t("account.polish.title"),
            children: t("account.polish.title"),
          }}
        >
          {t("account.writing.needsPolish")}
        </DependencyNote>
      )}
    </section>
  );
};
