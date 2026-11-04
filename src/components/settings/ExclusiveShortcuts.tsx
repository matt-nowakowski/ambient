import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface ExclusiveShortcutsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Keep Ambient's shortcut presses from reaching other apps, so another
 * dictation app on the same keys doesn't start too. Only the ambient-keys
 * backend can do this; with Tauri's backend the toggle is hidden.
 */
export const ExclusiveShortcuts: React.FC<ExclusiveShortcutsProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    if (getSetting("keyboard_implementation") !== "ambient_keys") {
      return null;
    }

    return (
      <ToggleSwitch
        checked={getSetting("exclusive_shortcuts") ?? true}
        onChange={(enabled) => updateSetting("exclusive_shortcuts", enabled)}
        isUpdating={isUpdating("exclusive_shortcuts")}
        label={t("settings.general.exclusiveShortcuts.label")}
        description={t("settings.general.exclusiveShortcuts.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
