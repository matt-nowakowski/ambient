import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { commands, type MeetingsEmail } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { SettingsGroup } from "../ui/SettingsGroup";
import { usePlan } from "../account/usePlan";

const MODES: MeetingsEmail[] = ["off", "ask", "always"];

/** The account's address, when signed in (any plan) or on a paid token. */
const useAccountEmail = () => {
  const { status } = usePlan();
  return status?.account_email ?? status?.email ?? null;
};

/** Meetings: "Email notes to me" — off, ask (the notes card's button) or
 * always. Signed-out users see how to get it. */
export const MeetingsEmailSetting: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const email = useAccountEmail();
  const mode = getSetting("meetings_email") ?? "ask";
  return (
    <SettingsGroup>
      <SettingContainer
        title={t("meetings.email.title")}
        description={
          email
            ? t("meetings.email.description", { email })
            : t("meetings.email.signedOut")
        }
        descriptionMode="inline"
        grouped
        disabled={!email}
      >
        <Dropdown
          options={MODES.map((m) => ({
            value: m,
            label: t(`meetings.email.options.${m}`),
          }))}
          selectedValue={email ? mode : "off"}
          onSelect={(v) => updateSetting("meetings_email", v as MeetingsEmail)}
          disabled={!email || isUpdating("meetings_email")}
        />
      </SettingContainer>
    </SettingsGroup>
  );
};

/** "Email to me" on a past meeting, when signed in. */
export const EmailNotesButton: React.FC<{
  id: number;
  disabled?: boolean;
}> = ({ id, disabled = false }) => {
  const { t } = useTranslation();
  const email = useAccountEmail();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [id]);
  if (!email) return null;
  const send = async () => {
    setBusy(true);
    const r = await commands.emailMeetingNotes(id);
    setBusy(false);
    if (r.status === "ok") toast.success(t("meetings.email.sent"));
    else
      toast.error(
        t(r.error, { defaultValue: t("meetings.email.errors.failed") }),
      );
  };
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled || busy}
      onClick={send}
    >
      <Send width={13} height={13} />
      {busy ? t("hud.notes.sending") : t("meetings.email.button")}
    </Button>
  );
};
