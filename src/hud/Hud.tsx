import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type HudAnswerAction,
  type HudContent,
  type HudSource,
} from "@/bindings";
import { Orb } from "@/components/orb/Orb";
import "./hud.css";

/** Key glyphs (symbols, not words, so not translated). */
const KEY_ENTER = "⏎";
const KEY_ESC = "esc";

const TIP_KEY = "ambient.suggestionTips";
const TIPS_SHOWN = 3;

/** Seconds a suggestion stays before dismissing itself. */
const SUGGESTION_TTL = 8;

/** A safety net: "Thinking…" is always replaced by a result well before this. */
const LISTENING_TTL = 45;

/** Example groups from the help sheet ("What can I say?"), with counts. */
const HELP_GROUPS = [
  { key: "answer", count: 4 },
  { key: "act", count: 4 },
  { key: "recall", count: 2 },
  { key: "suggestions", count: 2 },
] as const;

/** Action kinds that act on the user's app and so lead the row. */
const PRIMARY = new Set(["insert", "replace", "reply"]);

const ACTION_LABEL: Record<string, string> = {
  insert: "hud.insert",
  replace: "hud.replace",
  reply: "hud.actions.reply",
  copy: "hud.copy",
  copy_code: "hud.actions.copyCode",
  open_link: "hud.actions.openLink",
  add_to_calendar: "hud.actions.addToCalendar",
};

export default function Hud() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [content, setContent] = useState<HudContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlisten = listen<HudContent>("hud", (e) => {
      setContent((prev) => {
        // A new card (not the same answer streaming in) resets "Copied".
        const sameCard =
          prev &&
          prev.kind === e.payload.kind &&
          "id" in prev &&
          "id" in e.payload &&
          prev.id === e.payload.id;
        if (!sameCard) setCopied(null);
        return e.payload;
      });
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
    // Rust is closing the panel: dissolve the card first.
    const unlistenClose = listen("hud-close", () => setContent(null));
    return () => {
      unlisten.then((f) => f());
      unlistenClose.then((f) => f());
    };
  }, []);

  // Keep the native panel hugging the card as content streams in.
  const open = content !== null;
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const report = () =>
      commands.hudResize(Math.ceil(el.getBoundingClientRect().height) + 24);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Suggestions and status lines fade on their own.
  useEffect(() => {
    if (!content) return;
    const ttl =
      content.kind === "suggestion"
        ? SUGGESTION_TTL
        : content.kind === "status"
          ? content.undo
            ? 6
            : 3
          : content.kind === "listening"
            ? LISTENING_TTL
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

  /** A press on the panel's transparent margin, around the card. Rust's
   * outside-click watcher counts the whole panel as "inside", so the margin
   * is handled here, with the same rules: finished cards go, cards still
   * listening, thinking or acting stay. */
  const onStagePointerDown = (e: PointerEvent) => {
    if (!content || e.target !== e.currentTarget) return;
    switch (content.kind) {
      case "answer":
        if (content.text || content.done) dismiss();
        return;
      case "help":
      case "draft":
        return dismiss();
      case "suggestion":
        // Clicked away from, not refused: no back-off for this kind.
        commands.hudAction(content.id, "expire", null);
        commands.hudHide();
        return;
      default:
        return;
    }
  };

  const copy = async (key: string, text: string) => {
    await writeText(text);
    setCopied(key);
  };

  const runAction = (id: string, text: string, a: HudAnswerAction) => {
    switch (a.kind) {
      case "copy":
        return copy("copy", text);
      case "copy_code":
        return copy("copy_code", a.value ?? text);
      case "open_link":
        return commands.hudAction("", "open", a.value ?? null);
      default:
        // insert, replace, reply, add_to_calendar: Rust acts on the text.
        return commands.hudAction(id, a.kind, text);
    }
  };

  const actionLabel = (a: HudAnswerAction) => {
    if (copied === a.kind) return t("hud.copied");
    return t(ACTION_LABEL[a.kind] ?? "hud.copy");
  };

  /** Rust sends i18n keys for its own source titles (e.g. "Search Gmail"). */
  const sourceTitle = (s: HudSource) =>
    s.title.startsWith("hud.")
      ? t(s.title)
      : s.title || s.url.replace(/^https?:\/\//, "").split("/")[0];

  const transition = reduceMotion
    ? { duration: 0.12 }
    : { type: "spring" as const, stiffness: 420, damping: 32 };
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.97, filter: "blur(2px)" };
  // Leaving is a quick dissolve: it fades, drifts up a touch and softens,
  // with no spring. It finishes inside Rust's CLOSE_MS (200 ms), before the
  // panel is ordered out. Reduced motion: a very short fade.
  const gone = reduceMotion
    ? { opacity: 0, transition: { duration: 0.08, ease: "linear" as const } }
    : {
        opacity: 0,
        y: -6,
        filter: "blur(6px)",
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="hud-stage" onPointerDown={onStagePointerDown}>
      <AnimatePresence>
        {content && (
          <motion.div
            key="card"
            ref={cardRef}
            className="hud-card"
            initial={hidden}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={gone}
            transition={transition}
          >
            {content.kind === "answer" && (
              <>
                <header className="hud-head">
                  <Orb variant={content.done ? "B1" : "S1"} size={18} />
                  <span className="hud-question">{content.question}</span>
                  <button
                    type="button"
                    className="hud-close"
                    aria-label={t("hud.close")}
                    onClick={dismiss}
                  >
                    <X width={13} height={13} />
                  </button>
                </header>
                <div className="hud-answer">
                  {content.text || (
                    <span className="hud-faint">{t("hud.thinking")}</span>
                  )}
                </div>
                {content.note && <p className="hud-note">{t(content.note)}</p>}
                {content.sources.length > 0 && (
                  <ol className="hud-sources" aria-label={t("hud.sources")}>
                    {content.sources.slice(0, 5).map((s, i) => (
                      <li key={`${s.url}-${i}`}>
                        {s.url ? (
                          <button
                            type="button"
                            className="hud-chip"
                            onClick={() =>
                              commands.hudAction("", "open", s.url)
                            }
                            title={s.url}
                          >
                            <span className="hud-source-n">{i + 1}</span>
                            <span className="hud-chip-label">
                              {sourceTitle(s)}
                            </span>
                          </button>
                        ) : (
                          <span className="hud-chip" title={s.title}>
                            <span className="hud-source-n">{i + 1}</span>
                            <span className="hud-chip-label">
                              {sourceTitle(s)}
                            </span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {content.done && content.actions.length > 0 && (
                  <footer className="hud-actions">
                    {content.actions.map((a, i) => (
                      <button
                        key={a.kind}
                        type="button"
                        className={
                          i === 0 && PRIMARY.has(a.kind)
                            ? "hud-primary"
                            : undefined
                        }
                        onClick={() => runAction(content.id, content.text, a)}
                      >
                        {actionLabel(a)}
                      </button>
                    ))}
                    <span className="hud-hint">{t("hud.followUpHint")}</span>
                  </footer>
                )}
              </>
            )}

            {content.kind === "listening" && (
              <div className="hud-listening">
                <Orb variant="S1" size={18} />
                <div className="hud-listening-text">
                  <span className="hud-faint">
                    {content.heard
                      ? t("hud.thinking")
                      : t("hud.status.listening")}
                  </span>
                  {content.heard && (
                    <span className="hud-question">{content.heard}</span>
                  )}
                </div>
              </div>
            )}

            {content.kind === "draft" && (
              <>
                <header className="hud-head">
                  <Orb variant="B1" size={18} />
                  <span className="hud-question">{t(content.title)}</span>
                  <button
                    type="button"
                    className="hud-close"
                    aria-label={t("hud.close")}
                    onClick={dismiss}
                  >
                    <X width={13} height={13} />
                  </button>
                </header>
                <div className="hud-answer">{content.text}</div>
                <footer className="hud-actions">
                  {content.editable && (
                    <button
                      type="button"
                      className="hud-primary"
                      onClick={() =>
                        commands.hudAction(content.id, "insert", content.text)
                      }
                    >
                      {t("hud.insert")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={content.editable ? undefined : "hud-primary"}
                    onClick={() => copy("copy", content.text)}
                  >
                    {copied === "copy" ? t("hud.copied") : t("hud.copy")}
                  </button>
                  {!content.editable && (
                    <span className="hud-hint">{t("hud.draft.focusHint")}</span>
                  )}
                </footer>
              </>
            )}

            {content.kind === "help" && (
              <>
                <header className="hud-head">
                  <Orb variant="B1" size={18} />
                  <span className="hud-question">{t("trySaying.title")}</span>
                  <button
                    type="button"
                    className="hud-close"
                    aria-label={t("hud.close")}
                    onClick={dismiss}
                  >
                    <X width={13} height={13} />
                  </button>
                </header>
                <div className="hud-help">
                  {HELP_GROUPS.map((g) => (
                    <section key={g.key}>
                      <h3>{t(`trySaying.groups.${g.key}.title`)}</h3>
                      <ul>
                        {Array.from({ length: g.count }, (_, i) => (
                          <li key={i}>
                            {t(`trySaying.groups.${g.key}.examples.${i}`)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}

            {content.kind === "suggestion" && (
              <div className="hud-suggestion">
                <Orb variant="C2" size={18} />
                <span className="hud-suggestion-title">
                  {t(content.title, { defaultValue: content.title })}
                </span>
                <button
                  type="button"
                  className="hud-primary"
                  onClick={() => commands.hudAction(content.id, "accept", null)}
                >
                  {content.accept_label
                    ? t(content.accept_label, {
                        defaultValue: content.accept_label,
                      })
                    : t("hud.yes")}
                  <kbd>{KEY_ENTER}</kbd>
                </button>
                <button type="button" onClick={dismiss}>
                  {t("hud.notNow")}
                  <kbd>{KEY_ESC}</kbd>
                </button>
                {showTip && (
                  <span className="hud-tip">{t("hud.suggestionTip")}</span>
                )}
                <motion.span
                  key={content.id}
                  className="hud-timer"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: SUGGESTION_TTL, ease: "linear" }}
                />
              </div>
            )}

            {content.kind === "status" && (
              <div className="hud-status" data-tone={content.tone}>
                <Orb
                  variant={content.tone === "error" ? "M1" : "B1"}
                  size={16}
                />
                {/* Rust sends an i18n key; plain text passes through unchanged. */}
                <span>{t(content.text, { defaultValue: content.text })}</span>
                {content.undo && (
                  <button
                    type="button"
                    className="hud-undo"
                    onClick={() => commands.hudAction("", "undo", null)}
                  >
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
                    <li
                      key={i}
                      data-current={
                        !content.done && i === content.steps.length - 1
                          ? ""
                          : undefined
                      }
                    >
                      {s}
                    </li>
                  ))}
                </ol>
                {!content.done && (
                  <footer className="hud-actions">
                    <button
                      type="button"
                      onClick={() =>
                        commands.hudAction(content.id, "stop", null)
                      }
                    >
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
