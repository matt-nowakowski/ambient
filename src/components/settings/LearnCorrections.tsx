import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { DependencyNote } from "../ui/SettingLink";
import { useSettings } from "../../hooks/useSettings";

interface LearnCorrectionsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** "Learn from my corrections": a word fixed more than once after
 * dictating is offered as a custom word. Says so when text fields can't be
 * read here (no Accessibility on macOS, AT-SPI off on Linux). */
export const LearnCorrections: React.FC<LearnCorrectionsProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const enabled = getSetting("learn_corrections") ?? true;
    const [readable, setReadable] = useState(true);

    useEffect(() => {
      commands
        .canReadTextFields()
        .then(setReadable)
        .catch(() => setReadable(true));
    }, []);

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(on) => updateSetting("learn_corrections", on)}
        isUpdating={isUpdating("learn_corrections")}
        label={t("settings.advanced.learnCorrections.label")}
        description={t("settings.advanced.learnCorrections.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        note={
          enabled && !readable ? (
            <DependencyNote tone="warn">
              {t("settings.advanced.learnCorrections.unavailable")}
            </DependencyNote>
          ) : undefined
        }
      />
    );
  },
);
