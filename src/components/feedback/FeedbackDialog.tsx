import React, { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import {
  commands,
  type FeedbackExample,
  type FeedbackInput,
  type FeedbackKind,
  type FeedbackSource,
} from "@/bindings";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";

const KINDS: FeedbackKind[] = ["bug", "idea", "other"];
/** A 👎 sent with no words still says something. */
const THUMBS_DOWN = "👎";

export interface FeedbackRequest {
  source: FeedbackSource;
  /** The card a 👎 was for. */
  cardId?: string | null;
}

/** Send feedback: type, message, optional reply address, and two opt-ins
 * (diagnostics; the card's example), with a preview of exactly what's sent. */
export const FeedbackDialog: React.FC<{
  request: FeedbackRequest | null;
  onClose: () => void;
}> = ({ request, onClose }) => {
  const { t } = useTranslation();
  const open = request !== null;
  const thumbs = request?.source === "thumbs";
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);
  const [example, setExample] = useState<FeedbackExample | null>(null);
  const [withExample, setWithExample] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ids = {
    diag: useId(),
    example: useId(),
    message: useId(),
    email: useId(),
  };

  // A fresh form for each request, prefilled with the signed-in email and
  // the 👎'd card (attached only if ticked).
  useEffect(() => {
    if (!request) return;
    setKind("bug");
    setMessage("");
    setDiagnostics(false);
    setWithExample(false);
    setPreview(null);
    setExample(null);
    setEmail("");
    commands.feedbackDraft(request.cardId ?? null).then((d) => {
      setEmail(d.email ?? "");
      setExample(d.example);
    });
  }, [request]);

  const input = (): FeedbackInput => ({
    kind,
    source: request?.source ?? "dialog",
    message: message.trim() || (thumbs ? THUMBS_DOWN : ""),
    email: email.trim() || null,
    include_diagnostics: diagnostics,
    example: withExample ? example : null,
  });

  // Keep an open preview in step with the form.
  useEffect(() => {
    if (preview === null) return;
    const id = setTimeout(
      () => commands.feedbackPreview(input()).then(setPreview),
      250,
    );
    return () => clearTimeout(id);
  }, [kind, message, email, diagnostics, withExample]);

  const togglePreview = async () => {
    if (preview !== null) return setPreview(null);
    setPreview(await commands.feedbackPreview(input()));
  };

  const send = async () => {
    const body = input();
    if (!body.message) {
      toast.error(t("feedback.errors.empty"));
      return;
    }
    setSending(true);
    const r = await commands.sendFeedback(body);
    setSending(false);
    if (r.status === "ok") {
      toast.success(t("feedback.sent"));
      onClose();
    } else {
      toast.error(t(r.error, { defaultValue: t("feedback.errors.failed") }));
    }
  };

  const check = (
    id: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    label: string,
    description: string,
  ) => (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] size-3.5 shrink-0 cursor-pointer accent-[var(--color-logo-primary)]"
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-small text-text">{label}</span>
        <span className="block text-meta text-ink-3">{description}</span>
      </label>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      closeLabel={t("feedback.close")}
      title={thumbs ? t("feedback.titleThumbs") : t("feedback.title")}
      description={t("feedback.description")}
      className="max-w-[520px]!"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            {t("feedback.cancel")}
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={sending || (!thumbs && !message.trim())}
            onClick={send}
          >
            {sending ? t("feedback.sending") : t("feedback.send")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!thumbs && (
          <div role="radiogroup" aria-label={t("feedback.kind.label")}>
            <p className="text-small text-ink-2">{t("feedback.kind.label")}</p>
            <div className="mt-1.5 flex gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border-[0.5px] px-3 py-1 text-small transition-colors ${
                    kind === k
                      ? "border-transparent bg-background-ui text-on-primary"
                      : "border-glass-edge bg-glass text-ink-2 hover:bg-glass-hover"
                  }`}
                >
                  {t(`feedback.kind.${k}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor={ids.message} className="text-small text-ink-2">
            {t("feedback.message.label")}
          </label>
          {thumbs ? (
            <Input
              id={ids.message}
              className="mt-1.5 w-full"
              value={message}
              maxLength={4000}
              placeholder={t("feedback.message.placeholderThumbs")}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          ) : (
            <Textarea
              id={ids.message}
              className="mt-1.5 w-full"
              value={message}
              maxLength={4000}
              placeholder={t("feedback.message.placeholder")}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <div>
          <label htmlFor={ids.email} className="text-small text-ink-2">
            {t("feedback.email.label")}
          </label>
          <Input
            id={ids.email}
            type="email"
            className="mt-1.5 w-full"
            value={email}
            placeholder={t("feedback.email.placeholder")}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2.5">
          {check(
            ids.diag,
            diagnostics,
            setDiagnostics,
            t("feedback.diagnostics.label"),
            t("feedback.diagnostics.description"),
          )}
          {example &&
            check(
              ids.example,
              withExample,
              setWithExample,
              t("feedback.example.label"),
              t("feedback.example.description"),
            )}
        </div>

        <div>
          <button
            type="button"
            aria-expanded={preview !== null}
            onClick={togglePreview}
            className="flex items-center gap-1.5 text-small text-ink-2 hover:text-text"
          >
            {preview !== null
              ? t("feedback.hidePreview")
              : t("feedback.preview")}
            <ChevronDown
              width={13}
              height={13}
              className={`transition-transform ${preview !== null ? "rotate-180" : ""}`}
            />
          </button>
          {preview !== null && (
            <>
              <p className="mt-2 text-meta text-ink-3">
                {t("feedback.previewTitle")}
              </p>
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-card bg-glass-press p-3 text-meta leading-relaxed text-ink-2 select-text">
                {preview}
              </pre>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
};
