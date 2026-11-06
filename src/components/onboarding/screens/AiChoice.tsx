import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import { Cloud, Laptop, Type } from "lucide-react";
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

const CHOICES: { id: Intelligence; Icon: typeof Cloud }[] = [
  { id: "cloud", Icon: Cloud },
  { id: "device", Icon: Laptop },
  { id: "none", Icon: Type },
];

/** Where the AI part of Ambient runs: what polishes, drafts, answers and
 * suggests. Speech recognition is on this computer whatever is picked, so the
 * screen says so: right after choosing a speech model, "cloud" read as if it
 * were about the voice. Asked once, in setup; Settings › Privacy changes it. */
export const AiChoice: React.FC<AiChoiceProps> = ({
  progress,
  onBack,
  onContinue,
}) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [onDevice, setOnDevice] = useState<OnDeviceAiStatus | null>(null);
  // With no on-device model here: the one "On this computer" downloads.
  const [model, setModel] = useState<ReasoningModelInfo | null>(null);
  const [choice, setChoice] = useState<Intelligence | null>(null);
  const [saving, setSaving] = useState(false);
  // The rows rise in on arrival only.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setArriving(false), 800);
    return () => clearTimeout(id);
  }, []);

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

  /** Each option's one line. */
  const line = (id: Intelligence) => {
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
      hint={t("onboarding.ai.hint")}
      primary={
        <Button
          variant="primary"
          size="lg"
          onClick={save}
          disabled={saving || !agent || !choice}
        >
          {choice === "device" && needsDownload
            ? t("onboarding.ai.continueDownload")
            : t("onboarding.shell.continue")}
        </Button>
      }
    >
      <ScreenMain
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
          className={`${arriving ? "onb-stagger" : ""} onb-glass flex w-full flex-col rounded-panel p-[6px] text-start`}
        >
          {CHOICES.map(({ id, Icon }) => {
            const on = choice === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(id)}
                className={`grid cursor-pointer grid-cols-[40px_1fr_auto] items-center gap-[16px] rounded-card px-[14px] py-[12px] text-start transition-colors duration-200 ease-glide focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25 ${
                  on ? "bg-wash" : "hover:bg-wash/60"
                }`}
              >
                <motion.span
                  aria-hidden="true"
                  animate={
                    on && !reduce ? { scale: [1, 1.1, 1] } : { scale: 1 }
                  }
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className={`grid size-[40px] place-items-center rounded-card transition-colors duration-300 ${
                    on
                      ? "bg-background-ui text-on-primary"
                      : "bg-wash text-ink-2"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </motion.span>
                <span className="min-w-0">
                  <b className="block font-display text-row font-normal leading-[1.3] text-text">
                    {t(`onboarding.ai.${id}.title`)}
                  </b>
                  <span className="mt-[2px] block text-small text-ink-2 text-pretty">
                    {line(id)}
                  </span>
                </span>
                <Radio checked={on} />
              </button>
            );
          })}
        </div>
      </ScreenMain>
    </OnboardingShell>
  );
};
