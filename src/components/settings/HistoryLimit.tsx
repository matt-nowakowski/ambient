import React from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { Minus, Plus } from "lucide-react";
import { SettingContainer } from "../ui/SettingContainer";

interface HistoryLimitProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const HistoryLimit: React.FC<HistoryLimitProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const historyLimit = getSetting("history_limit") ?? 5;

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      updateSetting("history_limit", value);
    }
  };

  const busy = isUpdating("history_limit");
  const step = (delta: number) =>
    updateSetting(
      "history_limit",
      Math.min(1000, Math.max(0, historyLimit + delta)),
    );
  const stepButton =
    "grid size-control-sm shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-glass-hover hover:text-text active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25";

  return (
    <SettingContainer
      title={t("settings.debug.historyLimit.title")}
      description={t("settings.debug.historyLimit.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
    >
      <div className="flex items-center gap-inline">
        <div
          className={`inline-flex h-control items-center gap-0.5 rounded-full border-[0.5px] border-glass-edge bg-glass-strong px-0.5 shadow-card ${busy ? "opacity-60" : ""}`}
        >
          <button
            type="button"
            className={stepButton}
            onClick={() => step(-1)}
            disabled={busy || historyLimit <= 0}
            aria-label="−"
          >
            <Minus width={13} height={13} />
          </button>
          <input
            type="number"
            min="0"
            max="1000"
            value={historyLimit}
            onChange={handleChange}
            disabled={busy}
            aria-label={t("settings.debug.historyLimit.title")}
            className="no-spinners w-10 bg-transparent text-center text-ui tabular-nums outline-none"
          />
          <button
            type="button"
            className={stepButton}
            onClick={() => step(1)}
            disabled={busy || historyLimit >= 1000}
            aria-label="+"
          >
            <Plus width={13} height={13} />
          </button>
        </div>
        <span className="text-small text-ink-2">
          {t("settings.debug.historyLimit.entries")}
        </span>
      </div>
    </SettingContainer>
  );
};
