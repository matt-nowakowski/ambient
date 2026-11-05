import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Cpu, MinusCircle } from "lucide-react";
import {
  commands,
  type AgentSettings,
  type Intelligence,
  type OnDeviceAiStatus,
  type ReasoningModelInfo,
} from "@/bindings";
import { formatModelSize } from "@/lib/utils/format";
import { Button } from "../../ui/Button";
import { Radio } from "../../ui/Radio";
import { OnboardingShell, ScreenHeader, ScreenMain } from "../OnboardingShell";

interface AiChoiceProps {
  progress: { index: number; count: number };
  onBack: () => void;
  onContinue: () => void;
}

const CHOICES: { id: Intelligence; icon: React.ReactNode }[] = [
  { id: "cloud", icon: <Cloud width={15} height={15} aria-hidden="true" /> },
  { id: "device", icon: <Cpu width={15} height={15} aria-hidden="true" /> },
  {
    id: "none",
    icon: <MinusCircle width={15} height={15} aria-hidden="true" />,
  },
];

/** Where Ambient's intelligence runs. Asked once, in setup, because it is the
 * difference between the best results (text goes to our server, never audio),
 * everything staying on this computer, and no AI at all. */
export const AiChoice: React.FC<AiChoiceProps> = ({
  progress,
  onBack,
  onContinue,
}) => {
  const { t } = useTranslation();
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [onDevice, setOnDevice] = useState<OnDeviceAiStatus | null>(null);
  // With no on-device model here: the one "On this computer" downloads.
  const [model, setModel] = useState<ReasoningModelInfo | null>(null);
  const [choice, setChoice] = useState<Intelligence | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      commands.getAppSettings(),
      commands.getOnDeviceAiStatus(),
      commands.getReasoningModels(),
    ]).then(([r, status, models]) => {
      const agent = r.status === "ok" ? r.data.agent : undefined;
      if (!live || !agent) return;
      setAgent(agent);
      setOnDevice(status);
      setModel(models.find((m) => m.selected) ?? null);
      // A fresh install is "auto", which this screen doesn't offer: start
      // on this computer where Apple Intelligence is ready, else the cloud.
      setChoice(
        agent.intelligence !== "auto"
          ? agent.intelligence
          : status.apple_available
            ? "device"
            : "cloud",
      );
    });
    return () => {
      live = false;
    };
  }, []);

  // "On this computer" without Apple Intelligence or a model already here:
  // the recommended model downloads, so say which and how big.
  const needsDownload =
    !!onDevice &&
    !onDevice.apple_available &&
    !onDevice.downloaded &&
    onDevice.supported &&
    !!model;
  const unavailable =
    !!onDevice &&
    !onDevice.apple_available &&
    !onDevice.downloaded &&
    !onDevice.supported;

  const body = (id: Intelligence) => {
    if (id !== "device" || !onDevice) return t(`onboarding.ai.${id}.body`);
    if (onDevice.apple_available) return t("onboarding.ai.device.bodyApple");
    if (onDevice.downloaded) return t("onboarding.ai.device.bodyReady");
    if (needsDownload && model)
      return t("onboarding.ai.device.bodyDownload", {
        model: model.name,
        size: formatModelSize(onDevice.size_mb),
      });
    if (unavailable) return t("onboarding.ai.device.bodyUnavailable");
    return t("onboarding.ai.device.body");
  };

  const save = async () => {
    if (!agent || !choice) return;
    setSaving(true);
    await commands.setAgentSettings({ ...agent, intelligence: choice });
    // The download runs on in the background, with its progress (and any
    // failure, with Retry) in Settings › Privacy.
    if (choice === "device" && needsDownload) {
      void commands.downloadOnDeviceAi(null);
    }
    setSaving(false);
    onContinue();
  };

  return (
    <OnboardingShell
      progress={progress}
      onBack={onBack}
      primary={
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !agent || !choice}
        >
          {choice === "device" && needsDownload
            ? t("onboarding.ai.continueDownload")
            : t("onboarding.ai.continue")}
        </Button>
      }
    >
      <ScreenMain
        layout="top"
        align="stretch"
        header={
          <ScreenHeader
            title={t("onboarding.ai.title")}
            sub={t("onboarding.ai.sub")}
          />
        }
      >
        <div
          role="radiogroup"
          aria-label={t("onboarding.ai.title")}
          className="flex flex-col gap-2"
        >
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={choice === c.id}
              onClick={() => setChoice(c.id)}
              className="glass flex items-start gap-3 rounded-panel px-4 py-3 text-start"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-ui">
                  {c.icon}
                  {t(`onboarding.ai.${c.id}.title`)}
                </span>
                <span className="mt-0.5 block text-small text-ink-2">
                  {body(c.id)}
                </span>
              </span>
              <Radio checked={choice === c.id} className="mt-0.5" />
            </button>
          ))}
        </div>
      </ScreenMain>
    </OnboardingShell>
  );
};
