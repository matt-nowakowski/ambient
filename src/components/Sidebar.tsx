import React, { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Orb, type OrbVariant } from "./orb/Orb";
import { platform } from "@tauri-apps/plugin-os";
import { BrandWordmark } from "./icons/BrandMark";
import { useSettings } from "../hooks/useSettings";
import { AccountSettings, PlanBadge } from "./account";
import { HistorySettings, ModelsSettings, SettingsPage } from "./settings";
import { PrivacyCenter } from "./privacy/PrivacyCenter";
import { MeetingsPage } from "./meetings/MeetingsPage";
import { LiquidIndicatorGroup } from "./ui/LiquidIndicator";
import { Search } from "lucide-react";
import { useSearch, useSearchShortcutLabel } from "./search/searchStore";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

// Orb families fill different amounts of their box (on the 28px stage a
// lattice spans ~15px, a ring ~19px, a lens ~20px), so each is sized to the
// same optical footprint (~13px) rather than the same box.
const ORB_FOOTPRINT: Record<string, number> = {
  S: 20, // lattice: 3x3 dots, 15/28 of the stage, but dense, so it reads big
  C: 19, // ring: radius 8
  M: 21, // morph: radius 7
  B: 18, // lens: three circles on a 6.5px track
  G: 22, // globe: radius 8.5, but its back dots are faint, so it reads small
};

// Vertical optical correction (px). The globe's bright front dots sit in its
// lower half (it's tilted toward you), so it reads low unless lifted.
const ORB_NUDGE: Record<string, number> = { G: -1.5 };

// Orbs are tuned as activity indicators, so their resting dots are faint.
// As icons they must read at rest, so lift the resting inks.
const ORB_ICON_STYLE = {
  "--orb-fg": "currentColor",
  "--orb-rest-ink": "0.5",
  "--orb-dim-ink": "0.35",
  "--orb-ring-rest-ink": "0.55",
} as CSSProperties;

interface SectionConfig {
  labelKey: string;
  /** Each section's icon is an orb from the same family as the logo. */
  orb: OrbVariant;
  /** `null` when App renders the section itself (it needs App's handlers). */
  component: React.ComponentType | null;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  home: {
    labelKey: "sidebar.home",
    orb: "G5",
    component: null,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    orb: "C3",
    component: HistorySettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    orb: "S2",
    component: ModelsSettings,
    enabled: () => true,
  },
  settings: {
    labelKey: "sidebar.settings",
    orb: "M1",
    component: SettingsPage,
    enabled: () => true,
  },
  meetings: {
    labelKey: "sidebar.meetings",
    orb: "B3",
    component: MeetingsPage,
    enabled: () => true,
  },
  privacy: {
    labelKey: "sidebar.privacy",
    orb: "C5",
    component: PrivacyCenter,
    enabled: () => true,
  },
  account: {
    labelKey: "sidebar.account",
    orb: "B2",
    component: AccountSettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    orb: "S3",
    component: null,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
} as const satisfies Record<string, SectionConfig>;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const openSearch = useSearch((s) => s.setOpen);
  const searchShortcut = useSearchShortcutLabel();

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <aside className="relative z-10 flex h-full w-[184px] shrink-0 flex-col px-2.5">
      {/* On macOS the top margin clears the traffic lights, which float over
          the window; elsewhere the window has its own title bar. */}
      <BrandWordmark
        size={20}
        className={`${platform() === "macos" ? "mt-[46px]" : "mt-5"} mb-5 ps-[13px] text-[16px]`}
      />
      {/* Global search: a field-shaped button that opens the ⌘K palette. */}
      <button
        type="button"
        onClick={() => openSearch(true)}
        aria-keyshortcuts="Meta+K Control+K"
        className="group mb-4 flex h-[32px] w-full cursor-pointer items-center gap-2 rounded-control border-[0.5px] border-glass-edge bg-glass px-[10px] text-start text-ink-3 transition-colors hover:bg-glass-hover hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25"
      >
        <Search
          width={13}
          height={13}
          strokeWidth={1.75}
          className="shrink-0"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-small">
          {t("search.button")}
        </span>
        <kbd className="shrink-0 rounded-chip px-1 text-meta font-medium tracking-[0.02em] text-ink-3">
          {searchShortcut}
        </kbd>
      </button>
      {/* The active pill is liquid: it stretches as it flows between items. */}
      <LiquidIndicatorGroup
        role="navigation"
        className="flex w-full flex-col gap-[6px]"
        activeKey={activeSection}
        fill="var(--glass-strong)"
        shadow="0 0.5px 1.5px rgba(0,0,0,0.08), 0 6px 18px -10px rgba(0,0,0,0.22)"
        radius={9}
      >
        {availableSections.map((section) => {
          const isActive = activeSection === section.id;

          return (
            <button
              type="button"
              key={section.id}
              aria-current={isActive ? "page" : undefined}
              data-liquid-active={isActive ? "" : undefined}
              className={`group relative flex h-[36px] w-full cursor-pointer items-center gap-[11px] rounded-control px-[11px] text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                isActive ? "text-text" : "text-ink-2 hover:text-text"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              {!isActive && (
                <span className="absolute inset-0 rounded-control opacity-0 transition-opacity duration-150 group-hover:bg-glass-hover group-hover:opacity-100" />
              )}
              {/* The orb idles (paused) until hovered; the active one plays. */}
              <span
                aria-hidden="true"
                style={{
                  translate: `0 ${ORB_NUDGE[section.orb[0]] ?? 0}px`,
                }}
                className={`relative grid size-5 shrink-0 place-items-center transition-transform duration-200 group-active:scale-90 ${
                  isActive
                    ? ""
                    : "[&_*]:[animation-play-state:paused]! group-hover:[&_*]:[animation-play-state:running]!"
                }`}
              >
                <Orb
                  variant={section.orb}
                  size={ORB_FOOTPRINT[section.orb[0]] ?? 18}
                  label={t(section.labelKey)}
                  style={ORB_ICON_STYLE}
                />
              </span>
              <span
                className="relative truncate text-ui font-medium"
                title={t(section.labelKey)}
              >
                {t(section.labelKey)}
              </span>
            </button>
          );
        })}
      </LiquidIndicatorGroup>
      <div className="mt-auto mb-3">
        <PlanBadge onClick={() => onSectionChange("account")} />
      </div>
    </aside>
  );
};
