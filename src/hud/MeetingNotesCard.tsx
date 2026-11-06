import { useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { X } from "lucide-react";
import { commands, type NotesCard } from "@/bindings";
import { Orb } from "@/components/orb/Orb";
import "./extras.css";

/** "Your notes are ready": the meeting's title (or its time) and how many
 * action items, with Open, Copy and, when signed in, Email to me. */
export function MeetingNotesCard({
  card,
  onDismiss,
}: {
  card: NotesCard;
  onDismiss: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const when = new Date(card.started * 1000).toLocaleString(i18n.language, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const sending = card.email === "sending";
  return (
    <>
      <header className="hud-head">
        <Orb variant="B1" size={18} />
        <span className="hud-question">{t("hud.notes.ready")}</span>
        <button
          type="button"
          className="hud-close"
          aria-label={t("hud.close")}
          onClick={onDismiss}
        >
          <X width={13} height={13} />
        </button>
      </header>
      <div className="hud-answer">{card.title || when}</div>
      <p className="hud-notes-meta">
        {card.title ? `${when} · ` : ""}
        {t("hud.notes.actionItems", { n: card.action_items })}
      </p>
      <footer className="hud-actions">
        <button
          type="button"
          className="hud-primary"
          onClick={() => commands.hudAction(card.id, "open_notes", null)}
        >
          {t("hud.notes.open")}
        </button>
        <button
          type="button"
          onClick={async () => {
            await writeText(card.text);
            setCopied(true);
          }}
        >
          {copied ? t("hud.copied") : t("hud.copy")}
        </button>
        {card.can_email && card.email !== "sent" && (
          <button
            type="button"
            disabled={sending}
            aria-busy={sending}
            onClick={() => commands.hudAction(card.id, "email_notes", null)}
          >
            {sending ? t("hud.notes.sending") : t("hud.notes.email")}
          </button>
        )}
        {(card.email === "sent" || card.email === "failed") && (
          <span className="hud-notes-state" data-state={card.email}>
            {card.email === "sent"
              ? t("hud.notes.sent")
              : t("hud.notes.failed")}
          </span>
        )}
      </footer>
    </>
  );
}
