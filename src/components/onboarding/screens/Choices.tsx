import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartNoAxesColumn, Mail, WandSparkles } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { usePressAway } from "@/hooks/usePressAway";
import { Button } from "../../ui/Button";
import { Switch } from "../../ui/Switch";
import { TipsSignup } from "../../account/TipsSignup";
import { WhatsShared } from "../../telemetry/WhatsShared";
import { OnboardingShell, ScreenHeader, ScreenMain } from "../OnboardingShell";
import { useOnboardingStore } from "../onboardingStore";

// Provider ids from settings.rs (as in AiPolishCard).
const HOSTED = "ambient";
const ON_DEVICE = "apple_intelligence";

type Icon = typeof Mail;

interface ChoicesProps {
  progress: { index: number; count: number };
  onBack: () => void;
  onContinue: () => void;
}

/** One choice, one card: a small icon beside the title, the words under it
 * on the same left edge, and a switch level with the title. */
const ChoiceCard: React.FC<{
  icon: Icon;
  id: string;
  title: string;
  /** Clicking the title flips the switch. */
  onTitle?: () => void;
  control?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({
  icon: Icon,
  id,
  title,
  onTitle,
  control,
  className = "",
  children,
}) => (
  <section
    aria-labelledby={id}
    className={`onb-glass relative rounded-panel px-[22px] py-[18px] text-start ${className}`}
  >
    <div className="flex items-center gap-4">
      <h2
        id={id}
        onClick={onTitle}
        className={`m-0 flex min-w-0 flex-1 items-center gap-[8px] font-display text-row font-normal leading-[1.3] text-text ${onTitle ? "cursor-pointer" : ""}`}
      >
        <Icon
          aria-hidden="true"
          size={15}
          strokeWidth={1.75}
          className="shrink-0 text-ink-2"
        />
        {title}
      </h2>
      {control}
    </div>
    <div className="mt-[4px]">{children}</div>
  </section>
);

const Line: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="m-0 text-small text-ink-2 text-pretty">{children}</p>
);

/** AI polish, off for new installs (dictation types instantly; smart writing
 * still drafts when asked). Saved the moment it's switched (not in a
 * preview), like Account's switch. Turning it on picks our hosted model if
 * none is chosen; it runs on this computer where the AI choice says so. Not
 * offered with no AI at all. */
const PolishChoice: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, setPostProcessProvider } = useSettings();
  const preview = useOnboardingStore((s) => s.preview);
  const provider = getSetting("post_process_provider_id") ?? "";
  const chosen = provider === HOSTED || provider === ON_DEVICE;
  const saved = (getSetting("post_process_enabled") ?? false) && chosen;
  const intelligence = getSetting("agent")?.intelligence;
  const [on, setOn] = useState(saved);
  useEffect(() => setOn(saved), [saved]);

  if (intelligence === "none") return null;

  const toggle = async (next: boolean) => {
    setOn(next);
    if (preview) return;
    if (next && !chosen) await setPostProcessProvider(HOSTED);
    await updateSetting("post_process_enabled", next);
  };

  return (
    <ChoiceCard
      icon={WandSparkles}
      id="choice-polish"
      title={t("onboarding.choices.polish.title")}
      onTitle={() => toggle(!on)}
      control={
        <Switch checked={on} onChange={toggle} ariaLabelledBy="choice-polish" />
      }
    >
      <Line>
        {t(
          intelligence === "device"
            ? "onboarding.choices.polish.bodyDevice"
            : "onboarding.choices.polish.body",
        )}
      </Line>
    </ChoiceCard>
  );
};

/** Anonymous usage counts, off by default, with "What's shared" opening the
 * short list over the cards above. Saved as soon as it's switched (not in a
 * preview); the same switch lives in Privacy. */
const TelemetryChoice: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const preview = useOnboardingStore((s) => s.preview);
  const saved = getSetting("telemetry") ?? false;
  const [on, setOn] = useState(saved);
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  usePressAway(open, pop, () => setOpen(false));
  useEffect(() => setOn(saved), [saved]);

  const toggle = (next: boolean) => {
    setOn(next);
    if (!preview) updateSetting("telemetry", next);
  };

  return (
    <ChoiceCard
      icon={ChartNoAxesColumn}
      id="choice-telemetry"
      title={t("privacy.telemetry.title")}
      onTitle={() => toggle(!on)}
      // Over the next card while the list is open.
      className={open ? "z-20" : ""}
      control={
        <Switch
          checked={on}
          onChange={toggle}
          ariaLabelledBy="choice-telemetry"
        />
      }
    >
      {/* Pressing anywhere but the link and the list closes it. */}
      <div ref={pop}>
        <Line>
          {t("onboarding.choices.telemetry")}{" "}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="cursor-pointer rounded-[3px] text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25"
          >
            {t("telemetry.whatsShared")}
          </button>
        </Line>
        {/* Over the card above, the card's width. */}
        {open && (
          <div
            role="dialog"
            aria-label={t("telemetry.whatsShared")}
            className="glass animate-rise absolute inset-x-[12px] bottom-[calc(100%-8px)] z-20 rounded-card border-[0.5px] border-glass-edge bg-glass-strong p-4 text-start shadow-card"
          >
            <WhatsShared />
          </div>
        )}
      </div>
    </ChoiceCard>
  );
};

/** The optional settings that don't need a demo: AI polish, usage counts and
 * tips by email. All skippable: Continue moves on whatever is set. */
export const Choices: React.FC<ChoicesProps> = ({
  progress,
  onBack,
  onContinue,
}) => {
  const { t } = useTranslation();
  const preview = useOnboardingStore((s) => s.preview);
  // The cards rise in on arrival only.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setArriving(false), 800);
    return () => clearTimeout(id);
  }, []);

  return (
    <OnboardingShell
      progress={progress}
      onBack={onBack}
      hint={t("onboarding.ai.hint")}
      primary={
        <Button variant="primary" size="lg" onClick={onContinue}>
          {t("onboarding.shell.continue")}
        </Button>
      }
    >
      <ScreenMain
        align="stretch"
        header={
          <ScreenHeader
            title={t("onboarding.choices.title")}
            sub={t("onboarding.choices.sub")}
          />
        }
      >
        <div
          className={`${arriving ? "onb-stagger" : ""} flex w-full flex-col gap-[10px]`}
        >
          <PolishChoice />
          <TelemetryChoice />
          <ChoiceCard
            icon={Mail}
            id="choice-tips"
            title={t("account.tips.label")}
          >
            <TipsSignup labelledBy="choice-tips" short preview={preview} />
          </ChoiceCard>
        </div>
      </ScreenMain>
    </OnboardingShell>
  );
};
