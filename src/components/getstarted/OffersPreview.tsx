import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import { Orb } from "../orb/Orb";
import { WindowBar } from "../onboarding/WindowBar";
import "./offers.css";

/** Key glyphs on the drawn card, as on the real HUD (not translated). */
const KEY_ENTER = "⏎";
const KEY_ESC = "esc";

/** The loop: a long thread; the offer; "yes"; the summary; again. */
type Beat = "idle" | "offer" | "yes" | "done" | "out";
const SCRIPT: [number, Beat][] = [
  [0, "idle"],
  [1100, "offer"], // the card slides in, its timer running
  [3000, "yes"], //   "Yes", said with the shortcut held
  [3800, "done"], //  the card turns into the summary
  [7000, "out"], //   it dissolves
];
const LOOP_MS = 7600;

/** Placeholder lines of the drawn thread: widths in %, no words to read. */
const ROWS = [
  [72, 46],
  [58, 64],
  [80, 38],
];

/**
 * "It offers help, too": a drawn mail thread, then the real HUD's suggestion
 * card (same dark glass, orb, Yes ⏎ / Not now esc and timer line), answered
 * with "Yes", turning into a short summary. Plays only while `active`; with
 * reduced motion it holds the last frame.
 */
export const OffersPreview: React.FC<{ active: boolean }> = ({ active }) => {
  const { t } = useTranslation();
  const still = useReducedMotion() ?? false;
  const [beat, setBeat] = useState<Beat>(still ? "done" : "idle");

  useEffect(() => {
    if (still) {
      setBeat("done");
      return;
    }
    if (!active) {
      setBeat("idle");
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const play = () => {
      timers = SCRIPT.map(([ms, b]) => setTimeout(() => setBeat(b), ms));
      timers.push(setTimeout(play, LOOP_MS));
    };
    play();
    return () => timers.forEach(clearTimeout);
  }, [active, still]);

  // The card's height follows whichever face is showing, so the offer
  // grows into the summary instead of jumping.
  const offerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState({ offer: 0, summary: 0 });
  useLayoutEffect(() => {
    const measure = () =>
      setHeights({
        offer: offerRef.current?.offsetHeight ?? 0,
        summary: summaryRef.current?.offsetHeight ?? 0,
      });
    measure();
    const ro = new ResizeObserver(measure);
    if (offerRef.current) ro.observe(offerRef.current);
    if (summaryRef.current) ro.observe(summaryRef.current);
    return () => ro.disconnect();
  }, []);

  const shown = beat === "offer" || beat === "yes" || beat === "done";
  const answered = beat === "done";
  const heard = beat === "yes" || (still && beat === "done");

  return (
    <div
      role="img"
      aria-label={t("tour.offers.screenLabel")}
      className="offers-stage"
      data-still={still || undefined}
    >
      <div className="offers-mail" aria-hidden="true">
        <WindowBar size="sm" title={t("tour.offers.app")} />
        <div className="offers-mail-body">
          <p className="offers-subject">
            <span className="truncate">{t("tour.offers.subject")}</span>
            <span className="offers-count">{t("tour.offers.count")}</span>
          </p>
          {ROWS.map(([a, b], i) => (
            <div key={i} className="offers-row">
              <i className="offers-avatar" />
              <span className="offers-lines">
                <i style={{ width: `${a}%` }} />
                <i style={{ width: `${b}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="offers-hud"
        aria-hidden="true"
        data-shown={shown || undefined}
        style={{
          height: (answered ? heights.summary : heights.offer) || undefined,
        }}
      >
        <div
          ref={offerRef}
          className="offers-face offers-offer"
          data-on={!answered || undefined}
        >
          <Orb variant="C2" size={16} />
          <span className="offers-title">
            {t("hud.suggest.summariseThreadCount", { count: 40 })}
          </span>
          <span className="offers-actions">
            <span
              className="offers-btn is-primary"
              data-pressed={heard || undefined}
            >
              {t("hud.yes")}
              <kbd>{KEY_ENTER}</kbd>
            </span>
            <span className="offers-btn">
              {t("hud.notNow")}
              <kbd>{KEY_ESC}</kbd>
            </span>
          </span>
          <span
            className="offers-timer"
            data-run={beat === "offer" || beat === "yes" || undefined}
          />
        </div>
        <div
          ref={summaryRef}
          className="offers-face offers-summary"
          data-on={answered || undefined}
        >
          <p className="offers-summary-head">
            <Orb variant="B1" size={16} />
            <span>{t("tour.offers.summaryHead")}</span>
          </p>
          <p className="offers-summary-text">{t("tour.offers.summary")}</p>
        </div>
      </div>

      <div
        className="offers-said"
        aria-hidden="true"
        data-shown={heard || undefined}
      >
        <i className="offers-dot" />“{t("hud.yes")}”
      </div>
    </div>
  );
};
