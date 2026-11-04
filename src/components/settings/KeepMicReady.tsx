import React from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";

interface KeepMicReadyProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** Matches DEFAULT_KEEP_MIC_READY_SECS in settings.rs. */
const DEFAULT_SECS = 60;

/**
 * How long the mic stays open after a dictation, so the next one starts at
 * once and keeps its first word.
 */
export const KeepMicReady: React.FC<KeepMicReadyProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const options = [
      { value: "0", label: t("settings.sound.keepMicReady.options.off") },
      { value: "30", label: t("settings.sound.keepMicReady.options.sec30") },
      { value: "60", label: t("settings.sound.keepMicReady.options.min1") },
      { value: "120", label: t("settings.sound.keepMicReady.options.min2") },
      { value: "300", label: t("settings.sound.keepMicReady.options.min5") },
    ];
    const current = String(getSetting("keep_mic_ready_secs") ?? DEFAULT_SECS);

    return (
      <SettingContainer
        title={t("settings.sound.keepMicReady.title")}
        description={t("settings.sound.keepMicReady.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={options}
          selectedValue={current}
          onSelect={(value) =>
            updateSetting("keep_mic_ready_secs", Number(value))
          }
          disabled={isUpdating("keep_mic_ready_secs")}
        />
      </SettingContainer>
    );
  },
);
