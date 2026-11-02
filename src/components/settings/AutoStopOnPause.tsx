import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { Slider } from "../ui/Slider";
import { useSettings } from "../../hooks/useSettings";

interface AutoStopOnPauseProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Tap/toggle dictation stops by itself after a long pause that follows
 * speech. Push-to-talk ends when the key comes up, so it's hidden there.
 */
export const AutoStopOnPause: React.FC<AutoStopOnPauseProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, resetSetting, isUpdating } =
      useSettings();

    if (
      (getSetting("shortcut_activation") ?? "hold_or_toggle") === "push_to_talk"
    ) {
      return null;
    }
    const enabled = getSetting("auto_stop_on_pause") ?? true;
    const pauseMs = getSetting("auto_stop_pause_ms") ?? 2500;

    return (
      <>
        <ToggleSwitch
          checked={enabled}
          onChange={(value) => updateSetting("auto_stop_on_pause", value)}
          isUpdating={isUpdating("auto_stop_on_pause")}
          label={t("settings.general.autoStop.label")}
          description={t("settings.general.autoStop.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />
        {enabled && (
          <Slider
            value={pauseMs}
            onChange={(value) => updateSetting("auto_stop_pause_ms", value)}
            onReset={() => resetSetting("auto_stop_pause_ms")}
            isResetting={isUpdating("auto_stop_pause_ms")}
            min={1500}
            max={6000}
            step={500}
            label={t("settings.general.autoStop.delay.label")}
            description={t("settings.general.autoStop.delay.description")}
            descriptionMode={descriptionMode}
            grouped={grouped}
            formatValue={(v) =>
              t("settings.general.autoStop.delay.seconds", {
                seconds: (v / 1000).toFixed(1),
              })
            }
          />
        )}
      </>
    );
  },
);
