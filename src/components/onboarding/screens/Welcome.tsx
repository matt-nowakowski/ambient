import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Radio } from "../../ui/Radio";
import { motion, useReducedMotion } from "motion/react";
import { Orb } from "../../orb/Orb";
import {
  LanguageOptions,
  LanguageSearchField,
  useLanguagePicker,
} from "../../shared/LanguagePicker";
import { OnboardingShell, ScreenHeader } from "../OnboardingShell";
import { AppLanguageMenu } from "../AppLanguageMenu";
import { useOnboardingStore } from "../onboardingStore";
import { CHINESE_SCRIPTS, isChinese } from "@/lib/utils/languageSuggestions";
import { CURATED_ASR, isWeakLanguage } from "@/lib/models/catalog";
import { modelMatchesLanguage } from "@ambient/models";
import { getSupportedLanguage } from "@/i18n";
import { languageList } from "@/lib/constants/languages";
import { useSettings } from "@/hooks/useSettings";

// The mark assembles itself on the first visit only.
let waved = false;

interface WelcomeProps {
  progress: { index: number; count: number };
  onContinue: () => void;
}

/** Screen 1: greeting, spoken languages, and Chinese script. */
export const Welcome: React.FC<WelcomeProps> = ({ progress, onContinue }) => {
  const { t, i18n } = useTranslation();
  const { updateSetting } = useSettings();
  const { languages, script, modelId, preview, set } = useOnboardingStore();
  const picker = useLanguagePicker({
    languages,
    onChange: (next) => {
      // A model picked for other languages no longer counts as the pick.
      const picked = CURATED_ASR.find((m) => m.id === modelId);
      const stillFits =
        !picked || next.every((l) => modelMatchesLanguage(picked, l));
      set({
        languages: next,
        ...(stillFits ? {} : { modelId: null }),
      });
    },
  });
  const [wave] = useState(() => !waved);
  // The staged entrance; reduced motion shows everything at once.
  const reduce = useReducedMotion();
  const intro = wave && !reduce;
  // The grid cascades in on arrival only, not on every search.
  const [cascade, setCascade] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setCascade(false), wave ? 1200 : 800);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    waved = true;
    const id = setTimeout(
      () => picker.inputRef.current?.focus({ preventScroll: true }),
      50,
    );
    return () => clearTimeout(id);
  }, []);

  const ui = i18n.language;
  const chinese = languages.filter(isChinese);
  const weak = languages.filter(isWeakLanguage);

  const hint = !languages.length
    ? t("onboarding.welcome.hint.pickOne")
    : weak.length
      ? t("onboarding.welcome.hint.weak", {
          count: weak.length,
          languages: languageList(weak, ui),
        })
      : "";

  // What the menus are in right now (a preview never writes the setting).
  const uiLanguage = getSupportedLanguage(ui) || "en";
  const changeUiLanguage = (code: string) => {
    i18n.changeLanguage(code);
    if (!preview) updateSetting("app_language", code);
  };

  return (
    <OnboardingShell
      progress={progress}
      pill={<AppLanguageMenu value={uiLanguage} onChange={changeUiLanguage} />}
      hint={hint}
      hintTone={weak.length ? "warning" : "quiet"}
      primary={
        <Button
          variant="primary"
          size="lg"
          disabled={!languages.length}
          onClick={onContinue}
        >
          {t("onboarding.shell.continue")}
        </Button>
      }
    >
      {/* ScreenMain's spacing (pt-onb-top, mt-lead), with the motion
          wrappers ScreenMain can't take. */}
      <div className="flex h-full min-h-0 flex-col items-center px-gutter pt-onb-top pb-[4px] text-center">
        <motion.div
          className="w-full"
          initial={intro ? { opacity: 0, y: 12, filter: "blur(6px)" } : false}
          animate={{
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            transitionEnd: { filter: "none" },
          }}
          transition={{
            type: "spring",
            stiffness: 240,
            damping: 26,
            delay: 0.15,
          }}
        >
          <ScreenHeader
            above={
              // The intro just showed the full lockup: here, only the mark,
              // out of flow so the title sits where every step's does.
              <motion.span
                className="flex justify-center"
                initial={intro ? { opacity: 0, scale: 0.6 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 18 }}
              >
                <Orb variant="B1" size={22} />
              </motion.span>
            }
            title={t("onboarding.welcome.title")}
            sub={t("onboarding.welcome.subtitle")}
          />
        </motion.div>

        <motion.div
          initial={intro ? { opacity: 0, y: 22, scale: 0.98 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 26,
            delay: 0.3,
          }}
          className="onb-glass mt-lead flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-panel"
        >
          <LanguageSearchField
            picker={picker}
            className="onb-chips border-b border-line"
            inputClassName="min-w-[120px] text-body"
          />
          <div
            role="group"
            aria-label={t("onboarding.welcome.languagesLabel")}
            style={
              {
                "--onb-cascade-at": intro ? "0.35s" : "0s",
              } as React.CSSProperties
            }
            className={`${cascade ? "onb-cascade" : ""} grid min-h-0 flex-1 grid-cols-3 content-start gap-[2px] overflow-y-auto p-[6px] pb-[14px] text-start [mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent_calc(100%-6px))]`}
          >
            <LanguageOptions
              picker={picker}
              noMatch={t("onboarding.welcome.noMatch", {
                query: picker.query,
              })}
              emptyClassName="p-[24px]"
            />
          </div>
        </motion.div>

        {chinese.length > 0 && (
          <div className="w-full animate-rise pt-[12px] text-start">
            <p className="mt-0 mb-[8px] text-small font-medium text-text">
              {t("onboarding.welcome.chinese.question", {
                languages: languageList(chinese, ui),
              })}
            </p>
            <div
              role="radiogroup"
              aria-label={t("onboarding.welcome.chinese.label")}
              className="flex flex-wrap gap-[8px]"
            >
              {CHINESE_SCRIPTS.map((s) => {
                const picked = script === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    onClick={() => set({ script: s.id })}
                    className={`inline-flex h-[34px] cursor-pointer items-center gap-[8px] rounded-control border-[1.5px] bg-background ps-[10px] pe-[14px] text-small font-medium text-text transition-[border-color,transform,scale] duration-200 ease-glide hover:-translate-y-px active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                      picked
                        ? "border-plum-pick"
                        : "border-line-strong hover:border-ink-3"
                    }`}
                  >
                    <Radio checked={picked} />
                    <span>
                      <span lang={s.lang} className="font-cjk-subset">
                        {s.native}
                      </span>{" "}
                      {t(`onboarding.welcome.chinese.${s.id}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
};
