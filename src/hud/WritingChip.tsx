import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { commands, type HudContent } from "@/bindings";
import { Orb } from "@/components/orb/Orb";
import "./writing.css";

type WritingCard = Extract<HudContent, { kind: "writing" }>;

/** Seconds the chip stays; a note stays a little longer, Edit longer still. */
const TTL = { chip: 5, note: 6, editing: 40 } as const;
/** After the cursor leaves the chip, it fades this much later. */
const AFTER_HOVER = 2.5;

/**
 * Keyed by the card's id, so each chip starts its own countdown.
 *
 * Smart writing, after typing: "Polished · Use my words", "Written for
 * you · Use my words · Edit", or after rewriting a selection "Rewritten ·
 * Undo rewrite · Edit" (which restores the original selection). Fades on its own after about five seconds;
 * hovering keeps it (Rust also reports hover, since the panel never takes
 * focus). Reduced motion: no countdown bar, the card only fades.
 */
export function WritingChip({ card }: { card: WritingCard }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [pointerIn, setPointerIn] = useState(false);
  // Hovered at least once: from then on it fades soon after the cursor leaves.
  const [wasHovered, setWasHovered] = useState(false);

  // Rust's cursor watch: hover works even where the webview can't see it.
  useEffect(() => {
    const unlisten = listen<boolean>("hud-hover", (e) => {
      setHovered(e.payload);
      if (e.payload) setWasHovered(true);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const inside = hovered || pointerIn;
  const ttl =
    card.decision === "editing"
      ? TTL.editing
      : card.decision === "note"
        ? TTL.note
        : TTL.chip;

  useEffect(() => {
    if (inside) return;
    const secs = wasHovered ? AFTER_HOVER : ttl;
    const id = setTimeout(() => {
      commands.hudAction(card.id, "expire", null);
    }, secs * 1000);
    return () => clearTimeout(id);
  }, [inside, wasHovered, card.id, ttl]);

  const label =
    card.note !== null
      ? t(card.note)
      : card.decision === "written"
        ? t("hud.writing.written")
        : card.decision === "rewritten"
          ? t("hud.writing.rewritten")
          : t("hud.writing.polished");

  return (
    <div
      className="hud-writing"
      data-decision={card.decision}
      onPointerEnter={() => {
        setPointerIn(true);
        setWasHovered(true);
      }}
      onPointerLeave={() => setPointerIn(false)}
      role="status"
      aria-live="polite"
    >
      <Orb variant="B1" size={16} />
      <span className="hud-writing-label">{label}</span>
      {card.revert && (
        <button
          type="button"
          className="hud-primary"
          title={t("hud.writing.voiceHint")}
          onClick={() => commands.hudAction(card.id, "revert", null)}
        >
          {card.decision === "rewritten"
            ? t("hud.writing.undoRewrite")
            : t("hud.writing.useMyWords")}
        </button>
      )}
      {card.edit && (
        <button
          type="button"
          onClick={() => commands.hudAction(card.id, "edit", null)}
        >
          {t("hud.writing.edit")}
        </button>
      )}
      {card.decision === "editing" && (
        <button
          type="button"
          onClick={() => commands.hudAction(card.id, "cancel_edit", null)}
        >
          {t("hud.writing.cancel")}
        </button>
      )}
      {!reduceMotion && !inside && !wasHovered && (
        <motion.span
          key={card.id}
          className="hud-timer"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: ttl, ease: "linear" }}
        />
      )}
    </div>
  );
}
