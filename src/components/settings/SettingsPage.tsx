import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { PageTransition } from "../ui/Motion";
import { LiquidIndicatorGroup } from "../ui/LiquidIndicator";
import { GeneralSettings } from "./general/GeneralSettings";
import { AdvancedSettings } from "./advanced/AdvancedSettings";
import { PostProcessingSettings } from "./post-processing/PostProcessingSettings";
import { AboutSettings } from "./about/AboutSettings";

type Tab = "general" | "advanced" | "postprocessing" | "about";

const TABS: { id: Tab; labelKey: string; component: React.ComponentType }[] = [
  { id: "general", labelKey: "sidebar.general", component: GeneralSettings },
  { id: "advanced", labelKey: "sidebar.advanced", component: AdvancedSettings },
  {
    id: "postprocessing",
    labelKey: "sidebar.postProcessing",
    component: PostProcessingSettings,
  },
  { id: "about", labelKey: "sidebar.about", component: AboutSettings },
];

/** All settings on one page, split by a segmented control. */
export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("general");

  const tabs = TABS.filter(
    (x) =>
      x.id !== "postprocessing" || (settings?.post_process_enabled ?? false),
  );
  const active = tabs.find((x) => x.id === tab) ?? tabs[0];
  const Active = active.component;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-section flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-title font-light">{t("sidebar.settings")}</h1>
        <LiquidIndicatorGroup
          role="tablist"
          className="glass flex rounded-full p-[3px]"
          aria-label={t("sidebar.settings")}
          activeKey={active.id}
          fill="var(--color-background-ui)"
          shadow="0 1px 3px rgba(0,0,0,0.2)"
          radius={14}
        >
          {tabs.map((x) => {
            const selected = x.id === active.id;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-liquid-active={selected ? "" : undefined}
                onClick={() => setTab(x.id)}
                className={`relative h-control-sm cursor-pointer rounded-full px-3.5 text-small font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                  selected ? "text-on-primary" : "text-ink-2 hover:text-text"
                }`}
              >
                {t(x.labelKey)}
              </button>
            );
          })}
        </LiquidIndicatorGroup>
      </header>
      <PageTransition id={active.id}>
        <Active />
      </PageTransition>
    </div>
  );
};
