import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { LiquidIndicatorGroup } from "@/components/ui/LiquidIndicator";
import { PageTransition } from "@/components/ui/Motion";
import { useModelStore } from "@/stores/modelStore";
import {
  ModelTable,
  Note,
  useModelFilters,
  type TableSection,
} from "@/components/shared/modelTable/ModelTable";
import RetiredModelsNotice from "./RetiredModelsNotice";
import { ModelRow } from "./ModelRow";
import { Legend } from "./Legend";
import { useModelEntries } from "./modelEntries";
import { ReasoningModels } from "./ReasoningModels";
import { useModelsTab, type ModelsTab } from "./modelsTab";

const TABS: { id: ModelsTab; labelKey: string }[] = [
  { id: "voice", labelKey: "settings.models.tabs.voice" },
  { id: "reasoning", labelKey: "settings.models.tabs.reasoning" },
];

/** Past this many models on disk, the rest fold under "Show N more". */
const YOURS_LIMIT = 5;

/** Look for model files added outside Ambient: quiet, beside its section's name. */
const Rescan: React.FC = () => {
  const { t } = useTranslation();
  const rescanning = useModelStore((s) => s.isRescanning);
  return (
    <Tooltip text={t("settings.models.rescan.tooltip")}>
      <button
        type="button"
        onClick={() => useModelStore.getState().rescanLocalModels()}
        disabled={rescanning}
        aria-label={t("settings.models.rescan.tooltip")}
        className="ms-[6px] grid size-[22px] cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-wash hover:text-text disabled:cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
      >
        <RefreshCw
          className={`size-[12px] ${rescanning ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      </button>
    </Tooltip>
  );
};

interface ModelsSettingsProps {
  /** Where the languages are changed (General). */
  onChangeLanguages?: () => void;
}

/** The Models page: Voice models (speech recognition) and Reasoning models
 * (on-device AI), split by the same segmented control as Settings. It opens
 * on the tab used last. */
export const ModelsSettings: React.FC<ModelsSettingsProps> = ({
  onChangeLanguages,
}) => {
  const { t } = useTranslation();
  const tab = useModelsTab((s) => s.tab);
  const setTab = useModelsTab((s) => s.setTab);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
      <header className="mb-section flex flex-none flex-wrap items-end justify-between gap-4">
        <h1 className="text-title font-light">{t("settings.models.title")}</h1>
        <LiquidIndicatorGroup
          role="tablist"
          className="glass flex rounded-full p-[3px]"
          aria-label={t("settings.models.title")}
          activeKey={tab}
          fill="var(--color-background-ui)"
          shadow="0 1px 3px rgba(0,0,0,0.2)"
          radius={14}
        >
          {TABS.map((x) => {
            const selected = x.id === tab;
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
      {/* Voice's table scrolls itself; Reasoning scrolls as a page would,
          with room at the sides for the cards' shadows. */}
      <PageTransition
        id={tab}
        className={
          tab === "voice"
            ? "flex min-h-0 flex-1 flex-col"
            : "-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3"
        }
      >
        {tab === "voice" ? (
          <VoiceModels onChangeLanguages={onChangeLanguages} />
        ) : (
          <ReasoningModels />
        )}
      </PageTransition>
    </div>
  );
};

/** Voice models: onboarding's model table, filling the window. */
const VoiceModels: React.FC<ModelsSettingsProps> = ({ onChangeLanguages }) => {
  const { t } = useTranslation();
  const loading = useModelStore((s) => s.loading);
  const { facts, lists } = useModelEntries();
  const { filters, setFilters, searching, matches } = useModelFilters();
  const [more, setMore] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const keep = (xs: typeof lists.yours) => xs.filter(matches);
  const moreButton = !searching && lists.yours.length > YOURS_LIMIT && (
    <button
      type="button"
      onClick={() => setMore((m) => !m)}
      className="ms-[40px] mt-[2px] flex h-[28px] cursor-pointer items-center gap-[8px] rounded-chip px-[2px] text-small text-ink-2 hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
    >
      {more
        ? t("settings.models.showFewer")
        : t("settings.models.showMore", {
            count: lists.yours.length - YOURS_LIMIT,
          })}
      <span
        aria-hidden="true"
        className={`inline-block size-[6px] shrink-0 border-e-[1.5px] border-b-[1.5px] border-current ${more ? "mt-[3px] -rotate-[135deg]" : "-mt-[3px] rotate-45"}`}
      />
    </button>
  );

  const sections: TableSection[] = searching
    ? [
        {
          key: "yours",
          label: t("settings.models.sections.yours"),
          rows: keep(lists.yours),
        },
        {
          key: "fits",
          label: t("settings.models.sections.fits"),
          rows: keep(lists.fits),
        },
        {
          key: "partial",
          label: t("modelTable.missingLanguage"),
          rows: keep(lists.partial),
        },
        {
          key: "untested",
          label: t("settings.models.sections.untested"),
          rows: filters.query.trim() ? keep(lists.untested) : [],
          note: t("settings.models.untestedNote"),
        },
      ]
    : [
        {
          key: "yours",
          label: (
            <>
              {t("settings.models.sections.yours")}
              <Rescan />
            </>
          ),
          rows: more ? lists.yours : lists.yours.slice(0, YOURS_LIMIT),
          after: lists.yours.length ? (
            moreButton
          ) : (
            <Note>{t("settings.models.emptyYours")}</Note>
          ),
        },
        {
          key: "fits",
          label: t("settings.models.sections.fits"),
          rows: lists.fits,
        },
        {
          key: "partial",
          label: t("modelTable.missingLanguage"),
          rows: lists.partial,
        },
      ];

  return (
    <>
      {/* Where to change the languages the grades are for. */}
      {onChangeLanguages && (
        <div className="mx-[12px] mb-[12px] flex flex-none justify-end">
          <button
            type="button"
            onClick={onChangeLanguages}
            className="shrink-0 cursor-pointer text-small text-text underline decoration-line-strong underline-offset-[3px] hover:decoration-text focus:outline-none focus-visible:ring-1 focus-visible:ring-logo-primary"
          >
            {t("settings.models.changeLanguages")}
          </button>
        </div>
      )}
      <div className="mx-[12px] mb-[16px] flex-none empty:hidden">
        <RetiredModelsNotice />
      </div>
      <ModelTable
        grading={facts}
        filters={filters}
        setFilters={setFilters}
        // "Yours" always shows at rest; a search hides empty sections.
        sections={sections.filter(
          (s) => s.rows.length || (s.key === "yours" && !searching),
        )}
        renderRow={(e) => <ModelRow key={e.id} entry={e} />}
        actionsHead={<Legend tier={facts.tier} />}
        footer={
          !searching &&
          lists.untested.length > 0 && (
            <Note>
              {t("settings.models.untestedHidden", {
                count: lists.untested.length,
              })}
            </Note>
          )
        }
        thinEdge
      />
    </>
  );
};
