import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";

/** Home: what Ambient may read right now, one click from the Privacy Center. */
export const PrivacySummary: React.FC<{ onOpenPrivacy: () => void }> = ({
  onOpenPrivacy,
}) => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const agent = getSetting("agent");
  if (!agent) return null;

  const on = (
    ["screen_context", "screen_memory", "proactive", "meetings"] as const
  ).filter((k) => agent[k]);
  const paused =
    agent.paused_until !== null && agent.paused_until * 1000 > Date.now();
  const line = paused
    ? t("home.privacy.paused")
    : on.length === 0
      ? t("home.privacy.off")
      : t("home.privacy.on", {
          list: on.map((k) => t(`privacy.capabilities.${k}.title`)).join(" · "),
        });

  return (
    <button
      type="button"
      onClick={onOpenPrivacy}
      className="glass flex w-full items-center gap-3 rounded-panel px-card py-[14px] text-start transition-colors hover:bg-glass-hover"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-card bg-glass-press">
        <ShieldCheck width={15} height={15} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-medium">
          {t("home.privacy.title")}
        </span>
        <span className="block truncate text-small text-ink-2">{line}</span>
      </span>
      <ChevronRight width={14} height={14} className="shrink-0 text-ink-3" />
    </button>
  );
};
