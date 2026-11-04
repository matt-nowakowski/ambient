import React from "react";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import type { SidebarSection } from "../Sidebar";
import type { SettingsTab } from "../settings/settingsTabs";
import { useSearch } from "../search/searchStore";

interface SettingLinkProps {
  section: SidebarSection;
  tab?: SettingsTab;
  /** The translated title of the row or group to land on. */
  label: string;
  children: React.ReactNode;
  className?: string;
}

/** Jumps to another setting, wherever it lives: opens its page (and tab),
 * scrolls to it and highlights it, the same way a search result does. */
export const SettingLink: React.FC<SettingLinkProps> = ({
  section,
  tab,
  label,
  children,
  className = "",
}) => (
  <button
    type="button"
    data-search-skip
    onClick={() => useSearch.getState().jump({ section, tab, label })}
    className={`inline-flex items-center gap-0.5 font-medium text-text underline-offset-2 hover:underline ${className}`}
  >
    {children}
    <ArrowRight
      width={11}
      height={11}
      strokeWidth={2}
      className="shrink-0 rtl:rotate-180"
      aria-hidden="true"
    />
  </button>
);

interface DependencyNoteProps {
  children: React.ReactNode;
  /** The setting that controls this one, as a link after the text. */
  link?: Omit<SettingLinkProps, "className">;
  /** "warn" when the dependency is why this setting does nothing right now. */
  tone?: "info" | "warn";
  className?: string;
}

/** One short line under a setting: what it depends on, with a jump to it. */
export const DependencyNote: React.FC<DependencyNoteProps> = ({
  children,
  link,
  tone = "info",
  className = "",
}) => {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <p
      className={`flex items-start gap-1.5 text-meta ${tone === "warn" ? "text-warning" : "text-ink-3"} ${className}`}
    >
      <Icon
        width={11}
        height={11}
        strokeWidth={1.75}
        className="mt-[3px] shrink-0"
        aria-hidden="true"
      />
      <span className="min-w-0">
        {children}
        {link && (
          <>
            {" "}
            <SettingLink {...link} />
          </>
        )}
      </span>
    </p>
  );
};
