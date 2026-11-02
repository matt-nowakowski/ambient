import React from "react";
import { useTranslation } from "react-i18next";

import { SettingsGroup } from "@/components/ui";
import { ShortcutInput } from "../ShortcutInput";

// Prompts are behind-the-scenes work, not a user feature: there is no prompt
// picker or editor. Polish uses the selected prompt from an older version if
// there is one, else the built-in default (`active_post_process_prompt` in
// settings.rs). Stored prompts are left untouched.
export const PostProcessingSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl w-full mx-auto space-y-section">
      <SettingsGroup title={t("settings.postProcessing.hotkey.title")}>
        <ShortcutInput
          shortcutId="transcribe_with_post_process"
          descriptionMode="tooltip"
          grouped={true}
        />
      </SettingsGroup>
    </div>
  );
};
