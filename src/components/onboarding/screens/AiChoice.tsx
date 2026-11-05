import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Cpu, MinusCircle } from "lucide-react";
import { commands, type AgentSettings, type Intelligence } from "@/bindings";
import { Button } from "../../ui/Button";
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
  const [choice, setChoice] = useState<Intelligence>("cloud");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    commands.getAppSettings().then((r) => {
      const agent = r.status === "ok" ? r.data.agent : undefined;
      if (live && agent) {
        setAgent(agent);
        setChoice(agent.intelligence);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    if (!agent) return;
    setSaving(true);
    await commands.setAgentSettings({ ...agent, intelligence: choice });
    setSaving(false);
    onContinue();
  };

  return (
    <OnboardingShell
      progress={progress}
      onBack={onBack}
      primary={
        <Button variant="primary" onClick={save} disabled={saving || !agent}>
          {t("onboarding.ai.continue")}
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
            <label
              key={c.id}
              className="glass flex cursor-pointer items-start gap-3 rounded-panel px-4 py-3"
            >
              <input
                type="radio"
                name="ai-choice"
                className="mt-1"
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-ui">
                  {c.icon}
                  {t("onboarding.ai." + c.id + ".title")}
                </span>
                <span className="mt-0.5 block text-small text-ink-2">
                  {t("onboarding.ai." + c.id + ".body")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </ScreenMain>
    </OnboardingShell>
  );
};
