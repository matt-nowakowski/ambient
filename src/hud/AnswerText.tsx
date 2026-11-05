import { useMemo, type KeyboardEvent } from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { parseAnswer } from "./parseAnswer";

/** Text selected in the card: a drag that ends on a code block selects,
 * it doesn't copy the whole block. */
const selecting = () => (window.getSelection()?.toString() ?? "").length > 0;

const onEnter = (run: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    run();
  }
};

/** An answer's text: code copies on click (blocks and `inline`), links open
 * in the browser and copy from the small button beside them. */
export function AnswerText({
  text,
  onCopy,
  onOpen,
}: {
  text: string;
  onCopy: (text: string) => void;
  onOpen: (url: string) => void;
}) {
  const { t } = useTranslation();
  const segments = useMemo(() => parseAnswer(text), [text]);
  return (
    <>
      {segments.map((s, i) => {
        if (s.kind === "text") return <span key={i}>{s.text}</span>;
        if (s.kind === "code") {
          const copy = () => {
            if (!selecting()) onCopy(s.text);
          };
          return s.block ? (
            <pre
              key={i}
              className="hud-code-block"
              role="button"
              tabIndex={0}
              title={t("hud.clickToCopy")}
              onClick={copy}
              onKeyDown={onEnter(() => onCopy(s.text))}
            >
              <code>{s.text}</code>
              <span className="hud-code-hint" aria-hidden="true">
                <Copy width={11} height={11} />
              </span>
            </pre>
          ) : (
            <code
              key={i}
              className="hud-inline-code"
              role="button"
              tabIndex={0}
              title={t("hud.clickToCopy")}
              onClick={copy}
              onKeyDown={onEnter(() => onCopy(s.text))}
            >
              {s.text}
            </code>
          );
        }
        return (
          <span key={i} className="hud-link-wrap">
            <a
              className="hud-link"
              href={s.url}
              title={s.url}
              onClick={(e) => {
                e.preventDefault();
                if (!selecting()) onOpen(s.url);
              }}
            >
              {s.url.replace(/^https?:\/\//, "")}
            </a>
            <button
              type="button"
              className="hud-link-copy"
              aria-label={t("hud.offer.copyLink")}
              title={t("hud.offer.copyLink")}
              onClick={() => onCopy(s.url)}
            >
              <Copy width={10} height={10} />
            </button>
          </span>
        );
      })}
    </>
  );
}
