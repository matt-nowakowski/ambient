import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type AgentSettings } from "@/bindings";
import { showError } from "@/lib/errors";
import { OnDeviceAi, useOnDeviceAi } from "@/components/privacy/OnDeviceAi";
import { SettingsGroup } from "@/components/ui/SettingsGroup";
import { DependencyNote } from "@/components/ui/SettingLink";

/** Models › Reasoning models: the on-device AI models to download, choose
 * between and remove. The same component Privacy shows beside the
 * Intelligence setting, here with the full list. */
export const ReasoningModels: React.FC = () => {
  const { t } = useTranslation();
  const ai = useOnDeviceAi();
  const refreshAi = ai.refresh;
  const [settings, setSettings] = useState<AgentSettings | null>(null);

  const refresh = useCallback(async () => {
    setSettings((await commands.getAgentStatus()).settings);
    await refreshAi();
  }, [refreshAi]);

  // Polled like Privacy, so a download started there shows here too.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const save = async (next: AgentSettings) => {
    setSettings(next);
    const r = await commands.setAgentSettings(next);
    if (r.status === "error") showError("settings", r.error);
    refresh();
  };

  if (!ai.status || !settings) return null;

  return (
    <div className="space-y-label">
      <div className="px-row-x">
        <DependencyNote
          link={{
            section: "privacy",
            label: t("privacy.intelligence.title"),
            children: t("privacy.intelligence.title"),
          }}
        >
          {t("settings.models.reasoning.note")}
        </DependencyNote>
      </div>
      <SettingsGroup>
        {ai.status.supported ? (
          <OnDeviceAi
            status={ai.status}
            models={ai.models}
            settings={settings}
            save={save}
            refresh={refresh}
            starting={ai.starting}
            download={ai.download}
          />
        ) : (
          <p className="px-row-x py-row-y text-small text-ink-2">
            {t("settings.models.reasoning.unsupported")}
          </p>
        )}
      </SettingsGroup>
    </div>
  );
};
