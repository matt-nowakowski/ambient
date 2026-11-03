import React from "react";
import { useTranslation } from "react-i18next";
import { showError } from "@/lib/errors";
import { commands } from "@/bindings";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

/** Hands-free "Hey Ambient" (opt-in). */
export const WakeWord: React.FC<{ grouped?: boolean }> = ({
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, refreshSettings } = useSettings();
  const agent = getSetting("agent");
  if (!agent) return null;
  return (
    <ToggleSwitch
      checked={agent.wake_word}
      onChange={async (wake_word) => {
        const r = await commands.setAgentSettings({ ...agent, wake_word });
        if (r.status === "error") showError("settings", r.error);
        await refreshSettings();
      }}
      label={t("settings.agent.wake.label")}
      description={t("settings.agent.wake.description")}
      descriptionMode="tooltip"
      grouped={grouped}
    />
  );
};

/** Route requests in ordinary dictation to the voice agent. Off: always type. */
export const AgentRouting: React.FC<{ grouped?: boolean }> = ({
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, refreshSettings } = useSettings();
  const agent = getSetting("agent");
  if (!agent) return null;

  return (
    <ToggleSwitch
      checked={agent.routing}
      onChange={async (routing) => {
        const r = await commands.setAgentSettings({ ...agent, routing });
        if (r.status === "error") showError("settings", r.error);
        await refreshSettings();
      }}
      label={t("settings.agent.routing.label")}
      description={t("settings.agent.routing.description")}
      descriptionMode="tooltip"
      grouped={grouped}
    />
  );
};
