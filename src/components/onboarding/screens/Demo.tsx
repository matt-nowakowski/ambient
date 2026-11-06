import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useShortcutCapture } from "@/hooks/useShortcutCapture";
import { type OSType, spaceDoesNotClick } from "@/lib/utils/keyboard";
import { prefersReducedMotion } from "@/lib/utils/motion";
import { cjkSubsetFont } from "@/lib/utils/cjkFont";
import { Orb, type OrbVariant } from "../../orb/Orb";
import { Button } from "../../ui/Button";
import { CapturedKeys, captureHintKey, Keycaps } from "../../shared/Keycaps";
import { WindowBar } from "../WindowBar";
import { OnboardingShell, ScreenHeader, ScreenMain } from "../OnboardingShell";
import { useOnboardingStore } from "../onboardingStore";
import "./demo.css";

/** Dictation two ways, then the agent: asked, acting, remembering, and
 * last, offering help on its own (you talk to it; it suggests). */
type AgentMode = "ask" | "act" | "recall" | "offer";
type Mode = "hold" | "tap" | AgentMode;
const ORDER: Mode[] = ["hold", "tap", "ask", "act", "recall", "offer"];
const isAgent = (m: Mode): m is AgentMode =>
  m === "ask" || m === "act" || m === "recall" || m === "offer";

/** Each agent chapter's card: titled and marked like the tour's cards. */
const CARDS: Record<AgentMode, { title: string; orb: OrbVariant }> = {
  ask: { title: "tour.modes.answer.title", orb: "S1" },
  act: { title: "tour.modes.act.title", orb: "C2" },
  recall: { title: "tour.modes.recall.title", orb: "G5" },
  offer: { title: "onboarding.demo.agent.offer.head", orb: "C2" },
};
type PillState = "hidden" | "rec" | "work";
/** The pointer on the drawn screen: off to the side, on the field, gone. */
type Pointer = "rest" | "field" | "gone";
/** The sentence's lit phrase: click, press and talk, the words appear. */
type Phrase = 0 | 1 | 2;
/** `lift` is a tap's first key-up, while Ambient keeps listening. */
type Beat =
  | "reset"
  | "point"
  | "click"
  | "press"
  | "lift"
  | "release"
  | "land"
  // The offer chapter: the suggestion card arrives unasked.
  | "offer";

/**
 * Each chapter's beats, in ms from its start. `ms` is its full length (then
 * the next plays); `still` is the moment shown under reduced motion. The
 * agent works wherever you are, so its chapters skip the click.
 */
const CHAPTERS: Record<
  Mode,
  { script: [number, Beat][]; ms: number; still: number }
> = {
  hold: {
    script: [
      [0, "reset"],
      [300, "point"], //    the glide takes 850ms
      [1200, "click"],
      [2400, "press"], //   the keys held, Ambient listens: 2s
      [4400, "release"],
      [5200, "land"], //    the words stay 2s
    ],
    ms: 7200,
    still: 3400,
  },
  tap: {
    script: [
      [0, "reset"],
      [300, "point"],
      [1200, "click"],
      [2400, "press"],
      [2580, "lift"], //    a tap; Ambient keeps listening: 2.8s
      [5400, "press"],
      [5580, "release"], // the second tap
      [6180, "land"], //    the words stay 2s
    ],
    ms: 8180,
    still: 4000,
  },
  ...(Object.fromEntries(
    (["ask", "act", "recall"] as const).map((m) => [
      m,
      {
        script: [
          [0, "reset"],
          [700, "press"], //   held while asking: 2.2s
          [2900, "release"],
          [3700, "land"], //   the card stays 2.6s
        ] as [number, Beat][],
        ms: 6300,
        still: 4000,
      },
    ]),
  ) as Record<
    Exclude<AgentMode, "offer">,
    { script: [number, Beat][]; ms: number; still: number }
  >),
  // Nobody asks: it notices the date in the note and offers once; a held
  // "yes" takes it up. The still frame is the offer.
  offer: {
    script: [
      [0, "reset"],
      [900, "offer"], //   the card arrives
      [2700, "press"], //  "yes", said with the shortcut held
      [3500, "release"],
      [4000, "land"], //   done: the card says so for 2.8s
    ],
    ms: 6800,
    still: 2000,
  },
};

/** Under reduced motion: each way's still picture, in turn. */
const STILL_MS = 5000;

/* ---------------- the recording pill ---------------- */

const BARS = 9;
const STILL_BARS = [5, 9, 14, 18, 12, 16, 10, 7, 4];

const DemoPill: React.FC<{ state: PillState; still: boolean }> = ({
  state,
  still,
}) => {
  const { t } = useTranslation();
  const bars = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const set = (h: (i: number) => number) =>
      bars.current.forEach((b, i) => b && (b.style.height = `${h(i)}px`));
    if (state !== "rec") return set(() => 3);
    if (still) return set((i) => STILL_BARS[i]);
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const s = (now - t0) / 1000;
      const syllable = Math.max(
        0,
        Math.sin(s * 9.1) * 0.5 +
          Math.sin(s * 3.7 + 1) * 0.35 +
          (Math.random() - 0.3) * 0.35,
      );
      const level = Math.min(1, 0.12 + syllable * 0.95);
      set((i) => {
        const shape = 0.35 + 0.65 * Math.sin(((i + 0.5) / BARS) * Math.PI);
        return Math.max(3, level * shape * (0.65 + Math.random() * 0.35) * 18);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, still]);

  const close = (
    <span className="flex items-center justify-self-end">
      <span className="grid size-[22px] place-items-center rounded-full bg-line text-[14px] leading-none text-ink-3">
        ×
      </span>
    </span>
  );
  return (
    <div className="demo-pill" data-state={state} aria-hidden="true">
      <div className="relative h-[40px] flex-none">
        <span className="demo-pill-layer is-rec">
          <span className="flex ps-[5px]">
            <span className="demo-pill-dot" />
          </span>
          <span className="flex h-[18px] items-center gap-[3px] pe-[8px]">
            {Array.from({ length: BARS }, (_, i) => (
              <i
                key={i}
                ref={(el) => {
                  bars.current[i] = el;
                }}
                className="h-[3px] w-[4px] rounded-[2px] bg-logo-primary transition-[height] duration-[80ms] ease-linear"
              />
            ))}
          </span>
          {close}
        </span>
        <span className="demo-pill-layer is-work">
          <span className="flex ps-[5px]">
            <span className="demo-pill-spin" />
          </span>
          <span className="whitespace-nowrap px-[8px] text-ink-2">
            {t("overlay.transcribing")}
          </span>
          {close}
        </span>
      </div>
    </div>
  );
};

/* ---------------- the agent's card ---------------- */

/** The HUD, drawn: what was asked and the answer, top right like the real
 * one. The offer chapter's card is a suggestion (Yes / Not now) until
 * `answered`. */
const DemoCard: React.FC<{
  mode: AgentMode;
  shown: boolean;
  answered: boolean;
  still: boolean;
}> = ({ mode, shown, answered, still }) => {
  const { t } = useTranslation();
  const card = CARDS[mode];
  const offering = mode === "offer" && !answered;
  return (
    <div
      className="demo-card"
      data-shown={shown || undefined}
      data-still={still || undefined}
      aria-hidden="true"
    >
      <p className="demo-card-head">
        <Orb variant={card.orb} size={12} />
        {t(card.title)}
      </p>
      {offering ? (
        <>
          <p className="demo-card-reply">{t("hud.suggest.addToCalendar")}</p>
          <p className="demo-card-actions">
            <span className="is-primary">{t("hud.yes")}</span>
            <span>{t("hud.notNow")}</span>
          </p>
        </>
      ) : (
        <>
          <p className="demo-card-said">
            “
            {mode === "offer"
              ? t("hud.yes")
              : t(`onboarding.demo.agent.${mode}.said`)}
            ”
          </p>
          <p className="demo-card-reply">
            {t(`onboarding.demo.agent.${mode}.reply`)}
          </p>
        </>
      )}
    </div>
  );
};

/* ---------------- the drawn screen ---------------- */

const DemoLaptop: React.FC<{
  os: OSType;
  shortcut: string;
  keyDown: boolean;
  mode: Mode;
  text: string;
  landed: boolean;
  landKey: number;
  lang: string;
  pill: PillState;
  still: boolean;
  dimmed: boolean;
  pointer: Pointer;
  /** Bumped on each click, to replay its ring. */
  clickKey: number;
  /** The field has the caret: it's been clicked, or you pressed the keys. */
  focused: boolean;
  /** The last agent chapter's card, and whether it's up. */
  card: AgentMode;
  cardShown: boolean;
  /** The offer chapter's suggestion was taken up. */
  cardAnswered: boolean;
}> = ({
  os,
  shortcut,
  keyDown,
  mode,
  text,
  landed,
  landKey,
  lang,
  pill,
  still,
  dimmed,
  pointer,
  clickKey,
  focused,
  card,
  cardShown,
  cardAnswered,
}) => {
  const { t } = useTranslation();
  // The agent's chapters happen in the note: no Messages, no click.
  const app = mode === "hold" ? "hold" : "tap";
  // On Linux the pointer stays put and only clicks: WebKitGTK renders the
  // glide and fade unevenly. It sits at the field's end, clear of the text.
  const settled = os === "linux";
  const place: Pointer = isAgent(mode) ? "gone" : settled ? "field" : pointer;
  // Measured: the field's position varies by app and OS.
  const screenRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const screen = screenRef.current;
    const sc = screen?.getBoundingClientRect();
    const f = fieldRef.current?.getBoundingClientRect();
    if (!screen || !sc || !f || place === "gone") return;
    setAt(
      place === "field"
        ? {
            x: settled
              ? f.right - sc.left - 22
              : f.left - sc.left + Math.min(58, f.width * 0.3),
            y: f.top - sc.top + f.height / 2,
          }
        : { x: screen.offsetWidth * 0.8, y: screen.offsetHeight * 0.86 },
    );
  }, [place, settled, mode, os]);
  return (
    <div
      role="img"
      aria-label={t("onboarding.demo.screenLabel")}
      className="demo-laptop"
    >
      <div
        ref={screenRef}
        className={`demo-screen ${dimmed ? "is-dimmed" : ""}`}
        // A suggestion arrives unasked: the window steps back behind it.
        data-suggesting={(card === "offer" && cardShown) || undefined}
      >
        <div
          className="demo-app"
          data-mode={app}
          data-focused={focused || undefined}
        >
          <WindowBar
            size="sm"
            title={t(
              app === "hold"
                ? "onboarding.demo.apps.messages"
                : "onboarding.demo.apps.notes",
            )}
          />
          <div className="demo-app-body">
            {app === "hold" ? (
              <p className="demo-them">{t("onboarding.demo.chat")}</p>
            ) : (
              <p className="demo-note-title">
                {t("onboarding.demo.noteTitle")}
              </p>
            )}
            <div ref={fieldRef} className="demo-field">
              <span
                key={landKey}
                dir="auto"
                lang={lang}
                className={`${landed ? "demo-landed" : ""} ${cjkSubsetFont(text) ?? ""}`}
              >
                {text}
              </span>
              <span className="demo-caret ms-[1px] inline-block h-[1.1em] w-[1.5px] bg-text align-[-0.18em]" />
            </div>
          </div>
        </div>
        <DemoCard
          mode={card}
          shown={cardShown}
          answered={cardAnswered}
          still={still}
        />
        <div className="demo-pill-wrap">
          <DemoPill state={pill} still={still} />
        </div>
        <div className="demo-keys">
          <Keycaps
            binding={shortcut}
            osType={os}
            size="screen"
            pressed={keyDown}
          />
        </div>
        <span
          className="demo-pointer"
          data-p={place}
          data-settled={settled || undefined}
          style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
        >
          {clickKey > 0 && <i key={clickKey} className="demo-click" />}
          <svg width="14" height="20" viewBox="0 0 11 16" aria-hidden="true">
            <path
              d="M1 1v12.2l3-2.9 1.9 4.5 2-.9-1.9-4.4h4.1z"
              fill="#111"
              stroke="#fff"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
};

/* ---------------- the sentence ---------------- */

/** One phrase of the sentence, lit while it's happening. */
const Lit: React.FC<{ on?: boolean; children?: React.ReactNode }> = ({
  on = false,
  children,
}) => <span className={`demo-phrase ${on ? "is-on" : ""}`}>{children}</span>;

/**
 * Each way's instructions, current phrase lit. All variants share one grid
 * cell so switching never shifts layout, even when a translation wraps.
 */
const DemoSentence: React.FC<{
  mode: Mode;
  phrase: Phrase;
  /** While changing the shortcut, one line in the sentence's place. */
  say: string | null;
}> = ({ mode, phrase, say }) => {
  const { t } = useTranslation();
  const cell = "col-start-1 row-start-1";
  return (
    <>
      {ORDER.map((m) => {
        const on = !say && m === mode;
        return (
          <span
            key={m}
            aria-hidden={!on}
            className={`${cell} ${on ? "demo-swap" : "invisible"}`}
          >
            <Trans
              i18nKey={
                isAgent(m)
                  ? `onboarding.demo.agent.${m}.sentence`
                  : `onboarding.demo.${m}`
              }
              components={[0, 1, 2].map((i) => (
                <Lit key={i} on={on && phrase === i} />
              ))}
            />
          </span>
        );
      })}
      {[
        t("onboarding.demo.pressKeys"),
        t("onboarding.demo.addKey"),
        t("onboarding.demo.addModifier"),
      ].map((line) => (
        <span key={line} aria-hidden="true" className={`${cell} invisible`}>
          {line}
        </span>
      ))}
      {say && (
        <span role="status" className={`${cell} font-medium text-text`}>
          {say}
        </span>
      )}
    </>
  );
};

interface DemoProps {
  progress: { index: number; count: number };
  os: OSType;
  /** The model is ready, so Try it can start. */
  ready: boolean;
  /** Its download stopped: the button retries it. */
  downloadFailed: boolean;
  /** The download's status, beside the button it's holding back. */
  download: React.ReactNode;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Screen 4, while the model downloads: an animated demo of dictation (hold,
 * then tap), then the agent answering, acting, remembering and, last,
 * offering help unasked. Its words are
 * in the interface language: it shows the app, not the user's speech.
 */
export const Demo: React.FC<DemoProps> = ({
  progress,
  os,
  ready,
  downloadFailed,
  download,
  onRetry,
  onBack,
  onContinue,
}) => {
  const { t, i18n } = useTranslation();
  const { getSetting } = useSettings();
  const { preview } = useOnboardingStore();
  const binding = getSetting("bindings")?.transcribe;
  const shortcut = binding?.current_binding ?? "";
  const [still] = useState(prefersReducedMotion);

  const [chapter, setChapter] = useState<Mode>("hold");
  const [phrase, setPhrase] = useState<Phrase>(0);
  const [pointer, setPointer] = useState<Pointer>("rest");
  const [clickKey, setClickKey] = useState(0);
  const [focused, setFocused] = useState(false);
  const [keyDown, setKeyDown] = useState(false);
  const [pillState, setPillState] = useState<PillState>("hidden");
  const [card, setCard] = useState<{
    mode: AgentMode;
    shown: boolean;
    answered: boolean;
  }>({
    mode: "ask",
    shown: false,
    answered: false,
  });
  const [text, setText] = useState({
    value: "",
    lang: "en",
    landed: false,
    key: 0,
  });

  // The engine's own bookkeeping, outside React's renders.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextMode = useRef<Mode>("hold");

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) =>
    timers.current.push(setTimeout(fn, ms));

  const apply = useCallback(
    (mode: Mode, beat: Beat, animate = true) => {
      if (beat === "reset") {
        setChapter(mode);
        setPhrase(0);
        // The agent's chapters open on the note the tap chapter wrote.
        setText((x) => ({
          ...x,
          value: isAgent(mode) ? t("onboarding.demo.lines.tap") : "",
          lang: i18n.language,
          landed: false,
        }));
        setCard((c) => ({
          mode: isAgent(mode) ? mode : c.mode,
          shown: false,
          answered: false,
        }));
        setPillState("hidden");
        setKeyDown(false);
        setPointer("rest");
        setFocused(false);
      } else if (beat === "point") {
        setPointer("field");
      } else if (beat === "click") {
        setPointer("field");
        setFocused(true);
        if (animate) setClickKey((k) => k + 1);
      } else if (beat === "press") {
        setKeyDown(true);
        // Hide while listening; the still frame keeps it to show the click.
        setPointer(animate ? "gone" : "field");
        setPillState((p) => (p === "hidden" ? "rec" : p));
        // Answering an offer is its last phrase: "say yes".
        setPhrase(mode === "offer" ? 2 : 1);
      } else if (beat === "offer" && isAgent(mode)) {
        setCard({ mode, shown: true, answered: false });
        setPhrase(1);
      } else if (beat === "lift") {
        setKeyDown(false);
      } else if (beat === "release") {
        setKeyDown(false);
        setPillState("work");
        setPhrase(2);
      } else if (isAgent(mode)) {
        setPillState("hidden");
        setCard({ mode, shown: true, answered: true });
      } else {
        setPillState("hidden");
        setText((x) => ({
          value: t(`onboarding.demo.lines.${mode}`),
          lang: i18n.language,
          landed: animate,
          key: x.key + 1,
        }));
      }
    },
    [t, i18n.language],
  );

  const play = useCallback(
    (mode: Mode = nextMode.current) => {
      clear();
      nextMode.current = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      const { script: beats, ms, still: at } = CHAPTERS[mode];
      if (still) {
        for (const [time, beat] of beats)
          if (time <= at) apply(mode, beat, false);
        later(() => play(), STILL_MS);
        return;
      }
      for (const [time, beat] of beats) later(() => apply(mode, beat), time);
      later(() => play(), ms);
    },
    [apply, still],
  );

  useEffect(() => {
    nextMode.current = "hold";
    play();
    return clear;
    // The loop starts once; it reschedules itself.
  }, []);

  /* ---------- changing the shortcut ---------- */

  // Normally on since Permissions; this is for when that screen was skipped
  // (Windows and Linux, mostly), so Change has shortcuts to change.
  useEffect(() => {
    if (!preview) commands.initializeShortcuts().catch(console.error);
  }, [preview]);

  // The loop stops while new keys go in, and starts over after.
  const capture = useShortcutCapture("transcribe", os, {
    onDone: () => play("hold"),
    inert: preview,
    escapeCancels: true,
  });

  const startCapture = () => {
    clear();
    apply(chapter, "reset");
    capture.start().then((began) => began || play(chapter));
  };

  const say = capture.capturing
    ? t(captureHintKey(capture.partial, capture.refused))
    : null;

  // Try it turning on mid-screen (the download finished): it glows once.
  const [wasReady] = useState(ready);
  const readyNow = ready && !wasReady;

  return (
    <OnboardingShell
      progress={progress}
      onBack={onBack}
      hint={download}
      primary={
        downloadFailed ? (
          <Button variant="primary" size="lg" onClick={onRetry}>
            {t("onboarding.download.retryDownload")}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            disabled={!ready}
            onClick={onContinue}
            className={readyNow ? "onb-ready-pop" : ""}
          >
            {t("onboarding.demo.tryIt")}
          </Button>
        )
      }
    >
      <ScreenMain
        header={
          <ScreenHeader
            title={t("onboarding.demo.title")}
            sub={<DemoSentence mode={chapter} phrase={phrase} say={say} />}
            // 8px, not 4: the bold lead-in would read as the title's next line.
            subClassName="mt-[8px]! grid items-center justify-items-center"
          />
        }
      >
        <DemoLaptop
          os={os}
          shortcut={shortcut}
          keyDown={keyDown}
          mode={chapter}
          text={text.value}
          landed={text.landed}
          landKey={text.key}
          lang={text.lang}
          pill={pillState}
          still={still}
          dimmed={capture.capturing}
          pointer={pointer}
          clickKey={clickKey}
          focused={focused}
          card={card.mode}
          cardShown={card.shown}
          cardAnswered={card.answered}
        />
        {/* The shortcut and Change as one button; capture happens in place. */}
        <button
          type="button"
          // Named by what it shows: "Your shortcut is ⌥ Space, Change".
          onClick={(e) => {
            if (e.detail) e.currentTarget.blur();
            if (capture.capturing) capture.cancel();
            else startCapture();
          }}
          {...spaceDoesNotClick}
          // Shrink-wrapped, the two 1fr sides size to the wider of the two,
          // so the keys sit on the screen's centre in any language.
          className="group/keycaps mt-[26px] inline-grid cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-[14px] text-small focus-visible:outline-none"
        >
          <span className="justify-self-end whitespace-nowrap text-ink-3">
            {t("onboarding.demo.yourShortcut")}
          </span>
          {/* The resting keys hold the cell's width while new ones go in,
              so nothing beside them moves. */}
          <span className="grid rounded-control ring-offset-[6px] ring-offset-background group-focus-visible/keycaps:ring-2 group-focus-visible/keycaps:ring-logo-primary">
            <Keycaps
              binding={shortcut}
              osType={os}
              lift
              className={`col-start-1 row-start-1 justify-self-center ${capture.capturing ? "invisible" : ""}`}
            />
            {capture.capturing && (
              <CapturedKeys
                partial={capture.partial}
                osType={os}
                className="col-start-1 row-start-1"
                keysClassName="onb-keys-pop justify-self-center"
              />
            )}
          </span>
          <span className="justify-self-start whitespace-nowrap text-ink-2 underline decoration-line underline-offset-[3px] transition-colors group-hover/keycaps:text-text group-hover/keycaps:decoration-current">
            {t(
              capture.capturing
                ? "onboarding.demo.cancel"
                : "onboarding.demo.change",
            )}
          </span>
        </button>
      </ScreenMain>
    </OnboardingShell>
  );
};
