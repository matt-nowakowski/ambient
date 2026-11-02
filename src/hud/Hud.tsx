import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { commands, type HudContent } from "@/bindings";
import { Orb } from "@/components/orb/Orb";
import "./hud.css";

/** Key glyphs (symbols, not words, so not translated). */
const KEY_ENTER = "⏎";
const KEY_ESC = "esc";

const TIP_KEY = "ambient.suggestionTips";
const TIPS_SHOWN = 3;

/** Seconds a suggestion stays before dismissing itself. */
const SUGGESTION_TTL = 8;

export default function Hud() {
  const { t } = useTranslation();
  const [content, setContent] = useState<HudContent | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<HudContent>("hud", (e) => {
      setCopied(false);
      setContent(e.payload);
      // The first few suggestions teach that you can answer by voice.
      if (e.payload.kind === "suggestion") {
        let seen = 0;
        try {
          seen = Number(localStorage.getItem(TIP_KEY) ?? 0);
          localStorage.setItem(TIP_KEY, String(seen + 1));
        } catch {
          // No storage: show the tip.
        }
        setShowTip(seen < TIPS_SHOWN);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Keep the native panel hugging the card as content streams in.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const report = () => commands.hudResize(Math.ceil(el.getBoundingClientRect().height) + 24);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content?.kind]);

  // Suggestions and status lines fade on their own.
  useEffect(() => {
    if (!content) return;
    const ttl =
      content.kind === "suggestion"
        ? SUGGESTION_TTL
        : content.kind === "status"
          ? content.undo
            ? 6
            : 2.5
          : null;
    if (ttl === null) return;
    const id = setTimeout(() => {
      if (content.kind === "suggestion") {
        commands.hudAction(content.id, "expire", null);
      }
      commands.hudHide();
    }, ttl * 1000);
    return () => clearTimeout(id);
  }, [content]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dismiss = () => {
    const id = content && "id" in content ? content.id : "";
    commands.hudAction(id, "dismiss", null);
  };

  return (
    <div className="hud-stage">
      <AnimatePresence>
        {content && (
          <motion.div
            key={content.kind}
            ref={cardRef}
            className="hud-card"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            {content.kind === "answer" && (
              <>
                <header className="hud-head">
                  <Orb variant={content.done ? "B1" : "S1"} size={18} />
                  <span className="hud-question">{content.question}</span>
                  <button type="button" className="hud-close" aria-label={t("hud.close")} onClick={dismiss}>
                    <X width={13} height={13} />
                  </button>
                </header>
                <div className="hud-answer">
                  {content.text || <span className="hud-faint">{t("hud.thinking")}</span>}
                </div>
                {content.sources.length > 0 && (
                  <ol className="hud-sources" aria-label={t("hud.sources")}>
                    {content.sources.slice(0, 4).map((s, i) => (
                      <li key={s.url}>
                        <button type="button" onClick={() => commands.hudAction("", "open", s.url)} title={s.url}>
                          <span className="hud-source-n">{i + 1}</span>
                          {s.title || s.url.replace(/^https?:\/\//, "").split("/")[0]}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {content.done && (
                  <footer className="hud-actions">
                    <button
                      type="button"
                      className="hud-primary"
                      onClick={() => commands.hudAction(content.id, "insert", content.text)}
                    >
                      {t("hud.insert")}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await writeText(content.text);
                        setCopied(true);
                      }}
                    >
                      {copied ? t("hud.copied") : t("hud.copy")}
                    </button>
                    <span className="hud-hint">{t("hud.followUpHint")}</span>
                  </footer>
                )}
              </>
            )}

            {content.kind === "suggestion" && (
              <div className="hud-suggestion">
                <Orb variant="C2" size={18} />
                <span className="hud-suggestion-title">{t(content.title, { defaultValue: content.title })}</span>
                <button
                  type="button"
                  className="hud-primary"
                  onClick={() => commands.hudAction(content.id, "accept", null)}
                >
                  {content.accept_label ? t(content.accept_label, { defaultValue: content.accept_label }) : t("hud.yes")}
                  <kbd>{KEY_ENTER}</kbd>
                </button>
                <button type="button" onClick={dismiss}>
                  {t("hud.notNow")}
                  <kbd>{KEY_ESC}</kbd>
                </button>
                {showTip && <span className="hud-tip">{t("hud.suggestionTip")}</span>}
                <motion.span
                  className="hud-timer"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: SUGGESTION_TTL, ease: "linear" }}
                />
              </div>
            )}

            {content.kind === "status" && (
              <div className="hud-status" data-tone={content.tone}>
                <Orb variant={content.tone === "error" ? "M1" : "B1"} size={16} />
                {/* Rust sends an i18n key; plain text passes through unchanged. */}
                <span>{t(content.text, { defaultValue: content.text })}</span>
                {content.undo && (
                  <button type="button" className="hud-undo" onClick={() => commands.hudAction("", "undo", null)}>
                    {t("hud.undo")}
                  </button>
                )}
              </div>
            )}

            {content.kind === "steps" && (
              <>
                <header className="hud-head">
                  <Orb variant={content.done ? "B1" : "S1"} size={18} />
                  <span className="hud-question">{content.title}</span>
                </header>
                <ol className="hud-steps">
                  {content.steps.map((s, i) => (
                    <li key={i} data-current={!content.done && i === content.steps.length - 1 ? "" : undefined}>
                      {s}
                    </li>
                  ))}
                </ol>
                {!content.done && (
                  <footer className="hud-actions">
                    <button type="button" onClick={() => commands.hudAction(content.id, "stop", null)}>
                      {t("hud.stop")}
                      <kbd>{KEY_ESC}</kbd>
                    </button>
                  </footer>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
