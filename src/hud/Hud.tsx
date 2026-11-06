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
  type HudOffer,
  type HudSource,
} from "@/bindings";
import { Orb } from "@/components/orb/Orb";
import "./hud.css";
import { AnswerText } from "./AnswerText";
import { stripCitations } from "./parseAnswer";
import { MeetingNotesCard } from "./MeetingNotesCard";
import { Thumbs } from "./Thumbs";
import { WritingChip } from "./WritingChip";

/** Key glyphs (symbols, not words, so not translated). */
const KEY_ENTER = "⏎";
const KEY_ESC = "esc";

const TIP_KEY = "ambient.suggestionTips";
const TIPS_SHOWN = 3;
/** Set once the first real suggestion on this install has had its hint. */
const FIRST_KEY = "ambient.firstSuggestionHint";
/** Rust's one-time "judge suggestions in the cloud?" card (proactive.rs). */
const CLOUD_OFFER_ID = "cloud-suggestions-offer";

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

/** Seconds an answer stays after Insert, saying so with Undo. */
const INSERTED_TTL = 5;

/** How long the small "Copied" confirmation shows, in ms. */
const FLASH_MS = 1200;

/** Answer actions Rust carries out while the card waits (it shows a
 * spinner until the result replaces the card). */
const SLOW_ACTIONS = new Set(["add_to_calendar", "reply"]);

/** Seconds a notice stays: plain, with Undo, with alternatives to pick. */
const NOTICE_TTL = { plain: 4, undo: 8, offers: 14 } as const;

/** "2026-11-03T09:00" → a Date in local time. */
const parseLocal = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  return m
    ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
    : new Date(Number.NaN);
};

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
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [content, setContent] = useState<HudContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tip, setTip] = useState<"first" | "tip" | null>(null);
  /** The action running on this card ("accept", "stop", "add_to_calendar"):
   * its button shows progress until Rust replaces the card. */
  const [busy, setBusy] = useState<string | null>(null);
  /** The answer went in with Insert or Replace: "Inserted ✓" and Undo. */
  const [inserted, setInserted] = useState(false);
  /** The small "Copied" confirmation (a selection, a code block, a link). */
  const [flash, setFlash] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  /** The card on screen, for event listeners set up once. */
  const shownRef = useRef<HudContent | null>(null);
  shownRef.current = content;
  /** Follow a streaming answer down, unless the user scrolled up to read. */
  const stickRef = useRef(true);

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
        if (!sameCard) {
          setCopied(null);
          setBusy(null);
          setInserted(false);
          stickRef.current = true;
        } else if (e.payload.kind === "answer" && e.payload.done) {
          // Stopped (or finished anyway): its actions are live again.
          setBusy((b) => (b === "stop" ? null : b));
        }
        return e.payload;
      });
      // The first few suggestions teach that you can answer by voice; the
      // very first real one on this install says so, once.
      if (e.payload.kind === "suggestion") {
        let seen = 0;
        let first = false;
        try {
          seen = Number(localStorage.getItem(TIP_KEY) ?? 0);
          localStorage.setItem(TIP_KEY, String(seen + 1));
          // The one-time cloud offer is a question, not a suggestion.
          if (
            e.payload.id !== CLOUD_OFFER_ID &&
            !localStorage.getItem(FIRST_KEY)
          ) {
            localStorage.setItem(FIRST_KEY, "1");
            // Anyone who already had suggestions has met them.
            first = seen === 0;
          }
        } catch {
          // No storage: show the tip.
        }
        setTip(first ? "first" : seen < TIPS_SHOWN ? "tip" : null);
      }
    });
    // Rust is closing the panel: dissolve the card first.
    const unlistenClose = listen("hud-close", () => setContent(null));
    // Accepted without a click (⏎, or "yes" said aloud): the same progress.
    const unlistenAction = listen<{ id: string; action: string }>(
      "hud-action",
      (e) => {
        const shown = shownRef.current;
        if (
          e.payload.action === "accept" &&
          shown?.kind === "suggestion" &&
          shown.id === e.payload.id
        ) {
          setBusy("accept");
        }
      },
    );
    return () => {
      unlisten.then((f) => f());
      unlistenClose.then((f) => f());
      unlistenAction.then((f) => f());
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

  // Suggestions, status lines and notices fade on their own; an accepted
  // suggestion waits for its result; an inserted answer goes after a moment.
  useEffect(() => {
    if (!content) return;
    const ttl =
      content.kind === "suggestion"
        ? busy
          ? LISTENING_TTL
          : SUGGESTION_TTL
        : content.kind === "answer" && inserted
          ? INSERTED_TTL
          : content.kind === "status"
            ? content.undo
              ? 6
              : 3
            : content.kind === "notice"
              ? (content.offers?.length ?? 0) > 0
                ? NOTICE_TTL.offers
                : content.undo
                  ? NOTICE_TTL.undo
                  : NOTICE_TTL.plain
              : content.kind === "listening"
                ? LISTENING_TTL
                : null;
    if (ttl === null) return;
    const id = setTimeout(() => {
      if (content.kind === "suggestion" && !busy) {
        commands.hudAction(content.id, "expire", null);
      }
      commands.hudHide();
    }, ttl * 1000);
    return () => clearTimeout(id);
  }, [content, busy, inserted]);

  // The "Copied" confirmation fades by itself.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(0), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);

  // A streaming answer scrolls with its text, smoothly, until the user
  // scrolls up to read; reaching the bottom again picks it back up.
  // A web answer's text without "[1]"-style markers: its sources are the
  // chips below. Rust and the server strip them already; this is the net.
  const answerText =
    content?.kind !== "answer"
      ? ""
      : content.sources.some((s) => /^https?:/.test(s.url))
        ? stripCitations(content.text)
        : content.text;
  useEffect(() => {
    const el = answerRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [answerText, reduceMotion]);

  // Keys reach this window only where it can take focus (it usually can't:
  // Rust catches Esc and ⏎ globally while a card shows them, see hud_keys.rs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      // Cmd/Ctrl+C with nothing selected copies the whole answer.
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "c" &&
        content?.kind === "answer" &&
        answerText &&
        !window.getSelection()?.toString()
      ) {
        e.preventDefault();
        copy("copy", answerText);
      }
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
      case "report":
      case "meeting_notes":
        return dismiss();
      case "notice":
        if ((content.offers?.length ?? 0) > 0 || content.undo) dismiss();
        return;
      case "suggestion":
        // Clicked away from, not refused: no back-off for this kind.
        commands.hudAction(content.id, "expire", null);
        commands.hudHide();
        return;
      default:
        return;
    }
  };

  /** Rust's variables, made readable: `lang` ("de") → `language`
   * ("German"), `due` ("2026-11-03T09:00") → `when` ("9:00 tomorrow"). */
  const fill = (vars?: Partial<{ [key in string]: string }>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars ?? {})) {
      if (v !== undefined) out[k] = v;
    }
    if (out.lang) {
      try {
        out.language =
          new Intl.DisplayNames([i18n.language], { type: "language" }).of(
            out.lang,
          ) ?? out.lang;
      } catch {
        out.language = out.lang;
      }
    }
    if (out.due) {
      const d = parseLocal(out.due);
      if (!Number.isNaN(d.getTime())) {
        const time = d.toLocaleTimeString(i18n.language, {
          hour: "numeric",
          minute: "2-digit",
        });
        const today = new Date();
        const startOf = (x: Date) =>
          new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const days = Math.round((startOf(d) - startOf(today)) / 86_400_000);
        out.when =
          days === 0
            ? t("hud.when.today", { time })
            : days === 1
              ? t("hud.when.tomorrow", { time })
              : t("hud.when.on", {
                  time,
                  day: d.toLocaleDateString(i18n.language, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  }),
                });
      }
    }
    return out;
  };

  const runOffer = (id: string, o: HudOffer) => {
    if (o.action === "copy") return copy(`offer-${o.label}`, o.value ?? "");
    return commands.hudAction(id, o.action, o.value);
  };

  const copy = async (key: string, text: string) => {
    await writeText(text);
    setCopied(key);
  };

  /** Copy a piece of the answer (a selection, code, a link) and say so. */
  const copyPiece = async (text: string) => {
    if (!text) return;
    await writeText(text);
    setFlash(Date.now());
  };

  /** Selecting text in the answer copies it, like a terminal. */
  const onAnswerMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (text.trim() && answerRef.current?.contains(sel?.anchorNode ?? null)) {
      copyPiece(text);
    }
  };

  const onAnswerScroll = () => {
    const el = answerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const runAction = (id: string, text: string, a: HudAnswerAction) => {
    switch (a.kind) {
      case "copy":
        return copy("copy", text);
      case "copy_code":
        return copy("copy_code", a.value ?? text);
      case "open_link":
        return commands.hudAction("", "open", a.value ?? null);
      case "insert":
      case "replace":
        // The card stays to say it went in, with Undo.
        setInserted(true);
        return commands.hudAction(id, a.kind, text);
      default:
        // reply, add_to_calendar: Rust acts on the text; the card waits.
        if (SLOW_ACTIONS.has(a.kind)) setBusy(a.kind);
        return commands.hudAction(id, a.kind, text);
    }
  };

  const actionLabel = (a: HudAnswerAction) => {
    if (copied === a.kind) return t("hud.copied");
    return t(ACTION_LABEL[a.kind] ?? "hud.copy");
  };

  const acceptSuggestion = (id: string) => {
    if (busy) return;
    setBusy("accept");
    commands.hudAction(id, "accept", null);
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
  // Leaving is a dissolve: the card softens, lifts and opens a touch while the
  // dots below scatter out of it, so a dismissal reads as the card coming
  // apart rather than switching off. It finishes inside Rust's CLOSE_MS
  // (200 ms), before the panel is ordered out. Reduced motion: a short fade,
  // and no dots at all.
  const gone = reduceMotion
    ? { opacity: 0, transition: { duration: 0.08, ease: "linear" as const } }
    : {
        opacity: 0,
        y: -6,
        scale: 1.015,
        filter: "blur(9px)",
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
      };
  // The dots the card comes apart into. Angles are derived from the index
  // rather than randomised, so a re-render never reshuffles them mid-flight.
  const dissolveDots = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const reach = 30 + (i % 4) * 11;
    return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
  });

  return (
    <div className="hud-stage" onPointerDown={onStagePointerDown}>
      <AnimatePresence>
        {content && (
          <motion.div
            key="card"
            ref={cardRef}
            className="hud-card"
            style={{ position: "relative" }}
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
                <div
                  ref={answerRef}
                  className="hud-answer"
                  onMouseUp={onAnswerMouseUp}
                  onScroll={onAnswerScroll}
                >
                  {answerText ? (
                    <AnswerText
                      text={answerText}
                      onCopy={copyPiece}
                      onOpen={(url) => commands.hudAction("", "open", url)}
                    />
                  ) : (
                    <span className="hud-faint">{t("hud.thinking")}</span>
                  )}
                </div>
                <AnimatePresence>
                  {flash > 0 && (
                    <motion.span
                      key={flash}
                      className="hud-flash"
                      role="status"
                      initial={
                        reduceMotion ? { opacity: 0 } : { opacity: 0, y: -2 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.08 : 0.14 }}
                    >
                      {t("hud.copied")}
                    </motion.span>
                  )}
                </AnimatePresence>
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
                {/* Streaming: Stop keeps what has arrived. */}
                {!content.done && content.text && (
                  <footer className="hud-actions">
                    <button
                      type="button"
                      disabled={busy === "stop"}
                      aria-busy={busy === "stop"}
                      onClick={() => {
                        setBusy("stop");
                        commands.hudAction(content.id, "stop", null);
                      }}
                    >
                      {busy === "stop" && <Spinner />}
                      {t("hud.stop")}
                    </button>
                  </footer>
                )}
                {content.done && inserted && (
                  <footer className="hud-actions">
                    <button type="button" className="hud-done" disabled>
                      {t("hud.inserted")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        commands.hudAction(content.id, "undo_insert", null)
                      }
                    >
                      {t("hud.undo")}
                    </button>
                  </footer>
                )}
                {content.done && !inserted && content.actions.length > 0 && (
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
                        disabled={busy !== null}
                        aria-busy={busy === a.kind}
                        onClick={() => runAction(content.id, answerText, a)}
                      >
                        {busy === a.kind && <Spinner />}
                        {actionLabel(a)}
                      </button>
                    ))}
                    {/* The hint and the rating stay together at the end. */}
                    <span className="hud-actions-end">
                      <span className="hud-hint" title={t("hud.followUpHint")}>
                        {t("hud.followUpHint")}
                      </span>
                      <Thumbs id={content.id} />
                    </span>
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
                  {/* Dictation with nowhere to go: maybe it was for Ambient. */}
                  {content.title === "hud.draft.title" && (
                    <button
                      type="button"
                      onClick={() =>
                        commands.hudAction(content.id, "ask", content.text)
                      }
                    >
                      {t("hud.draft.askInstead")}
                    </button>
                  )}
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
                  {t(content.title, {
                    defaultValue: content.title,
                    ...fill(content.vars),
                  })}
                </span>
                {/* One group, so a narrow row moves the buttons together. */}
                <span className="hud-suggestion-buttons">
                  {/* The label says what will happen ("Draft reply"); once
                    accepted it shows progress until the result arrives. */}
                  <button
                    type="button"
                    className="hud-primary"
                    aria-busy={busy === "accept"}
                    disabled={busy !== null}
                    onClick={() => acceptSuggestion(content.id)}
                  >
                    {busy === "accept" && <Spinner />}
                    {content.accept_label
                      ? t(content.accept_label, {
                          defaultValue: content.accept_label,
                        })
                      : t("hud.yes")}
                    {!busy && <kbd>{KEY_ENTER}</kbd>}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={dismiss}
                  >
                    {t("hud.notNow")}
                    <kbd>{KEY_ESC}</kbd>
                  </button>
                  {/* The offer's own words: a new suggestion keeps the id. */}
                  <Thumbs
                    id={content.id}
                    token={JSON.stringify([
                      content.title,
                      content.accept_label,
                      content.vars,
                    ])}
                  />
                </span>
                {tip && (
                  <span className="hud-tip">
                    {t(
                      tip === "first"
                        ? "hud.firstSuggestionTip"
                        : "hud.suggestionTip",
                    )}
                  </span>
                )}
                {busy ? (
                  <span className="hud-timer hud-timer-busy" />
                ) : (
                  <motion.span
                    key={content.id}
                    className="hud-timer"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: SUGGESTION_TTL, ease: "linear" }}
                  />
                )}
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

            {content.kind === "notice" && (
              <div className="hud-notice" data-tone={content.tone}>
                <div className="hud-status" data-tone={content.tone}>
                  <Orb
                    variant={content.tone === "error" ? "M1" : "B1"}
                    size={16}
                  />
                  <span>
                    {t(content.text, {
                      defaultValue: content.text,
                      ...fill(content.vars),
                    })}
                  </span>
                  {content.undo && !(content.offers?.length ?? 0) && (
                    <button
                      type="button"
                      className="hud-undo"
                      onClick={() =>
                        commands.hudAction(content.id, "undo", null)
                      }
                    >
                      {t("hud.undo")}
                    </button>
                  )}
                </div>
                {(content.offers?.length ?? 0) > 0 && (
                  <footer className="hud-actions">
                    {content.offers?.map((o, i) => (
                      <button
                        key={`${o.action}-${o.label}`}
                        type="button"
                        className={i === 0 ? "hud-primary" : undefined}
                        disabled={busy !== null}
                        aria-busy={busy === o.action}
                        onClick={() => {
                          // Rust carries these out and replaces the card
                          // when done; Copy and Open are instant.
                          if (o.action !== "copy" && o.action !== "open") {
                            setBusy(o.action);
                          }
                          runOffer(content.id, o);
                        }}
                      >
                        {busy === o.action && <Spinner />}
                        {copied === `offer-${o.label}`
                          ? t("hud.copied")
                          : t(o.label)}
                      </button>
                    ))}
                    {content.undo && (
                      <button
                        type="button"
                        onClick={() =>
                          commands.hudAction(content.id, "undo", null)
                        }
                      >
                        {t("hud.undo")}
                      </button>
                    )}
                  </footer>
                )}
              </div>
            )}

            {content.kind === "report" && (
              <>
                <header className="hud-head">
                  <Orb variant="C2" size={18} />
                  <span className="hud-question">{t("hud.report.title")}</span>
                  <span className="hud-report-kind">
                    {t(`hud.report.kinds.${content.report_kind}`)}
                  </span>
                  <button
                    type="button"
                    className="hud-close"
                    aria-label={t("hud.close")}
                    onClick={dismiss}
                  >
                    <X width={13} height={13} />
                  </button>
                </header>
                <blockquote className="hud-report-message">
                  {content.editing ? (
                    <span className="hud-faint">
                      {t("hud.report.editHint")}
                    </span>
                  ) : (
                    content.message
                  )}
                </blockquote>
                <label className="hud-check">
                  <input
                    type="checkbox"
                    checked={content.include_diagnostics}
                    onChange={(e) => {
                      const on = e.currentTarget.checked;
                      setContent({ ...content, include_diagnostics: on });
                      commands.hudAction(
                        content.id,
                        "diagnostics",
                        on ? "true" : "false",
                      );
                    }}
                  />
                  <span>
                    {t("hud.report.diagnostics")}
                    <span className="hud-faint">
                      {" "}
                      {t("hud.report.diagnosticsHint")}
                    </span>
                  </span>
                </label>
                <footer className="hud-actions">
                  <button
                    type="button"
                    className="hud-primary"
                    disabled={content.editing}
                    onClick={() => commands.hudAction(content.id, "send", null)}
                  >
                    {t("hud.report.send")}
                  </button>
                  <button
                    type="button"
                    onClick={() => commands.hudAction(content.id, "edit", null)}
                  >
                    {t("hud.report.edit")}
                  </button>
                  <button type="button" onClick={dismiss}>
                    {t("hud.report.cancel")}
                  </button>
                  <span className="hud-hint">{t("hud.report.voiceHint")}</span>
                </footer>
              </>
            )}

            {content.kind === "writing" && (
              <WritingChip key={content.id} card={content} />
            )}

            {content.kind === "meeting_notes" && (
              <MeetingNotesCard card={content} onDismiss={dismiss} />
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
            {!reduceMotion && (
              <span className="hud-dissolve" aria-hidden="true">
                {dissolveDots.map((dot, i) => (
                  <motion.i
                    key={i}
                    className="hud-dot"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0 }}
                    exit={{
                      opacity: [0, 0.9, 0],
                      scale: [0.5, 1, 0.35],
                      x: dot.x,
                      y: dot.y,
                      transition: { duration: 0.22, ease: "easeOut" },
                    }}
                  />
                ))}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Progress inside a HUD button; a still ring under reduced motion (CSS). */
function Spinner() {
  return <span className="hud-spin" aria-hidden="true" />;
}
