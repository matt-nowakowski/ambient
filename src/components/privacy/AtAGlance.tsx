import React from "react";
import { useTranslation } from "react-i18next";
import { Cloud, ScanText, type LucideIcon } from "lucide-react";
import { useSearch, type SearchTarget } from "../search/searchStore";

export interface GlanceItem {
  key: string;
  label: string;
  /** The switch that controls it. */
  target: SearchTarget;
}

/** Right now, by result: what reads the screen and what can send text to
 * the cloud. Each item jumps to the switch behind it. */
export const AtAGlance: React.FC<{
  reads: GlanceItem[];
  cloud: GlanceItem[];
  paused: boolean;
}> = ({ reads, cloud, paused }) => {
  const { t } = useTranslation();
  const jump = useSearch((s) => s.jump);

  const row = (
    key: "reads" | "cloud",
    Icon: LucideIcon,
    items: GlanceItem[],
    empty: string,
  ) => (
    <div className="flex items-start gap-3.5 px-row-x py-4.5">
      <span className="mt-px grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
        <Icon width={14} height={14} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui">{t(`privacy.glance.${key}`)}</p>
        {items.length === 0 ? (
          <p className="mt-0.5 text-small text-ink-2">{empty}</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => jump(item.target)}
                className="whitespace-nowrap rounded-full bg-glass-press px-2.5 py-0.5 text-meta text-ink-2 transition-colors hover:text-text"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    // Its chips repeat setting names; a search jump lands on the settings.
    <section data-search-skip className="space-y-label">
      <h2 className="px-row-x text-section font-medium text-ink-3">
        {t("privacy.glance.title")}
      </h2>
      <div className="glass divide-y divide-glass-edge rounded-panel">
        {row(
          "reads",
          ScanText,
          reads,
          paused
            ? t("privacy.glance.pausedNothing")
            : t("privacy.glance.nothing"),
        )}
        {row("cloud", Cloud, cloud, t("privacy.glance.nothingCloud"))}
      </div>
    </section>
  );
};
