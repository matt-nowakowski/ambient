import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { arch, platform } from "@tauri-apps/plugin-os";
import { Sparkles } from "lucide-react";
import { commands } from "@/bindings";
import {
  HOSTED_PROVIDER as HOSTED,
  ON_DEVICE_PROVIDER as ON_DEVICE,
  polishRoute,
} from "@/lib/whereItRuns";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { DependencyNote } from "../ui/SettingLink";
import { Switch } from "../ui/Switch";
import { openUpgrade, usePlan, usePolishUsage } from "./usePlan";

// settings.rs offers Apple Intelligence only on Apple silicon Macs.
const onDeviceAvailable = platform() === "macos" && arch() === "aarch64";

/** AI polish: one switch, plus "keep it on this Mac" where Apple
 * Intelligence is available. On Free each polish, hosted or on this Mac, is
 * one of the week's AI uses. */
export const AiPolishCard: React.FC<{ paid: boolean }> = ({ paid }) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, setPostProcessProvider } = useSettings();
  const { status } = usePlan();
  const usage = usePolishUsage(status);

  const enabled = getSetting("post_process_enabled") ?? false;
  const provider = getSetting("post_process_provider_id") ?? "";
  const prompts = getSetting("post_process_prompts") ?? [];
  const selectedPrompt = getSetting("post_process_selected_prompt_id");
  const on = enabled && (provider === HOSTED || provider === ON_DEVICE);
  const local = provider === ON_DEVICE;
  const agent = getSetting("agent");
  const intelligence = agent?.intelligence ?? "auto";

  // Whether Apple Intelligence is usable right now (settings can't tell).
  const [onDeviceReady, setOnDeviceReady] = useState(false);
  useEffect(() => {
    commands
      .getAgentStatus()
      .then((s) => setOnDeviceReady(s.on_device_ready))
      .catch(() => {});
  }, []);
  const route = polishRoute(
    on,
    provider,
    intelligence,
    agent?.on_device_when_possible ?? false,
    onDeviceReady,
  );
  const intelligenceLink = {
    section: "privacy" as const,
    label: t("privacy.intelligence.title"),
    children: t("privacy.intelligence.title"),
  };

  const turnOn = async (useDevice: boolean) => {
    await setPostProcessProvider(useDevice ? ON_DEVICE : HOSTED);
    if (!selectedPrompt && prompts[0]) {
      await updateSetting("post_process_selected_prompt_id", prompts[0].id);
    }
    if (!enabled) await updateSetting("post_process_enabled", true);
  };

  return (
    <section className="glass rounded-panel p-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-card bg-glass-press">
            <Sparkles width={15} height={15} strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-ui font-medium">{t("account.polish.title")}</h2>
            <p className="mt-0.5 max-w-md text-small text-ink-2">
              {t("account.polish.description")}
            </p>
            {/* What it doesn't touch: the question people actually ask. */}
            <p className="mt-1 max-w-md text-meta text-ink-3">
              {t("account.polish.scope")}
            </p>
            {route !== "off" && (
              <DependencyNote
                tone={route === "blocked" ? "warn" : "info"}
                className="mt-2 max-w-md"
                link={intelligenceLink}
              >
                {t(`account.polish.where.${route}`)}
              </DependencyNote>
            )}
            {!paid && usage && (
              <p className="mt-2 text-small font-medium tabular-nums">
                {t("account.polish.freeUsesLeft", {
                  left: Math.max(0, usage.limit - usage.used),
                  limit: usage.limit,
                })}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!paid && (
            <Button variant="secondary" size="sm" onClick={openUpgrade}>
              {t("account.polish.unlock")}
            </Button>
          )}
          <Switch
            checked={on}
            ariaLabel={t("account.polish.title")}
            onChange={(next) =>
              next
                ? turnOn(local)
                : updateSetting("post_process_enabled", false)
            }
          />
        </div>
      </div>

      {onDeviceAvailable && (
        <div className="mt-4 flex items-center justify-between gap-4 border-t-[0.5px] border-glass-edge pt-4">
          <div>
            <p className="text-ui">{t("account.polish.onDevice")}</p>
            <p className="mt-0.5 text-small text-ink-2">
              {t("account.polish.onDeviceDescription")}
            </p>
            {/* Automatic follows the polish provider for answers too. */}
            {intelligence === "auto" && (
              <p className="mt-0.5 text-meta text-ink-3">
                {t("account.polish.onDeviceAnswers")}
              </p>
            )}
          </div>
          <Switch
            checked={local}
            disabled={!on}
            onChange={(next) => turnOn(next)}
          />
        </div>
      )}
    </section>
  );
};
