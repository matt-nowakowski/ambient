"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { LaunchVideo, VideoPoster } from "@/lib/content";
import { Orb } from "./orb/Orb";

/*
 * The site's own video player: no native controls, a smoked-glass control bar
 * (.glass-dark, the site's floating pill), and posters that follow the colour
 * scheme. Loads nothing until it is near the viewport and never autoplays.
 */

/** Phone width: the 9:16 cut, when there is one. Matches the CSS below. */
const PHONE = "(max-width: 640px)";
const DARK = "(prefers-color-scheme: dark)";
const IDLE_MS = 2400;
const STEP = 5;

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

function useMedia(query: string, enabled: boolean) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) return () => {};
      const mq = matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query, enabled],
  );
  return useSyncExternalStore(
    subscribe,
    () => enabled && matchMedia(query).matches,
    () => false,
  );
}

/** Either poster stands in for the other. */
function posters(p?: VideoPoster) {
  const light = p?.light ?? p?.dark;
  const dark = p?.dark ?? p?.light;
  return light && dark ? { light, dark } : null;
}

function clock(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function spoken(s: number) {
  const t = Math.floor(Number.isFinite(s) ? s : 0);
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return m ? `${m} minute${m === 1 ? "" : "s"} ${sec} second${sec === 1 ? "" : "s"}` : `${sec} second${sec === 1 ? "" : "s"}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function fullscreenElement() {
  const d = document as WebkitDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function VideoPlayer({ video, className = "" }: { video: LaunchVideo; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wantPlay = useRef(false);
  const lastTime = useRef(0);
  const resume = useRef<{ t: number; play: boolean } | null>(null);
  const pointerKind = useRef("mouse");
  const helpId = useId();

  const phone = useMedia(PHONE, Boolean(video.vertical));
  const cut = phone && video.vertical ? video.vertical : video.horizontal;
  const hPoster = posters(video.horizontal.poster);
  const vPoster = video.vertical ? (posters(video.vertical.poster) ?? hPoster) : null;

  const [near, setNear] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<[number, number][]>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [keyFocus, setKeyFocus] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [cue, setCue] = useState("");

  const showControls = started && (!playing || !idle || scrubbing || keyFocus);
  const buffering = started && playing && waiting;

  /* ---- Lazy load: attach the source only when the player is close. ---- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ---- Switching cut (phone ⇄ desktop): pick up where it was. ---- */
  const firstCut = useRef(cut.url);
  useEffect(() => {
    if (firstCut.current === cut.url) return;
    firstCut.current = cut.url;
    if (lastTime.current > 0) resume.current = { t: lastTime.current, play: wantPlay.current };
  }, [cut.url]);

  /* ---- Progress drawn every frame via a CSS variable, not React state. ---- */
  const paint = useCallback((t: number, d: number) => {
    rootRef.current?.style.setProperty("--vp-progress", d > 0 ? String(clamp(t / d, 0, 1)) : "0");
  }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) paint(v.currentTime, v.duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint]);

  /* ---- Fullscreen state. ---- */
  useEffect(() => {
    const onChange = () => setFullscreen(fullscreenElement() === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  /* ---- Captions: keep the track hidden and draw cues ourselves. ---- */
  useEffect(() => {
    const v = videoRef.current;
    if (!near || !video.captions || !v) return;
    const track = v.textTracks[0];
    if (!track) return;
    track.mode = "hidden";
    const onCue = () => {
      const cues = track.activeCues;
      const lines: string[] = [];
      for (let i = 0; cues && i < cues.length; i++) {
        const c = cues[i] as VTTCue;
        lines.push(c.text.replace(/<[^>]+>/g, ""));
      }
      setCue(lines.join("\n"));
    };
    track.addEventListener("cuechange", onCue);
    return () => track.removeEventListener("cuechange", onCue);
  }, [near, video.captions, cut.url]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  /* ---- Actions. ---- */
  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  const play = useCallback(() => {
    wantPlay.current = true;
    const v = videoRef.current;
    if (!v || !v.getAttribute("src")) {
      setNear(true); // played before it was near: onLoadedMetadata picks this up
      return;
    }
    setStarted(true);
    setEnded(false);
    v.play().catch(() => {
      wantPlay.current = false;
      setPlaying(false);
    });
  }, []);

  const pause = useCallback(() => {
    wantPlay.current = false;
    videoRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (v && !v.paused) pause();
    else play();
    poke();
  }, [play, pause, poke]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      v.currentTime = clamp(t, 0, v.duration);
      setTime(v.currentTime);
      paint(v.currentTime, v.duration);
    },
    [paint],
  );
  const seekBy = useCallback((d: number) => seekTo((videoRef.current?.currentTime ?? 0) + d), [seekTo]);

  const setVol = useCallback((n: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = clamp(n, 0, 1);
    v.muted = v.volume === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || v.volume === 0) {
      v.muted = false;
      if (v.volume === 0) v.volume = 0.6;
    } else v.muted = true;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current as WebkitElement | null;
    const v = videoRef.current as WebkitVideo | null;
    const d = document as WebkitDocument;
    if (!frame) return;
    if (fullscreenElement()) {
      if (d.exitFullscreen) void d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else if (frame.requestFullscreen) {
      void frame.requestFullscreen().catch(() => {});
    } else if (frame.webkitRequestFullscreen) {
      frame.webkitRequestFullscreen();
    } else {
      v?.webkitEnterFullscreen?.(); // iPhone: only the video itself can go fullscreen
    }
  }, []);

  /* ---- Keyboard: space/k, ←/→ ±5 s, m, f, c. ---- */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const onButton = (e.target as HTMLElement).closest("button");
    switch (e.key) {
      case " ":
      case "Enter":
        if (onButton || e.key === "Enter") return; // let the button click itself
        toggle();
        break;
      case "k":
      case "K":
        toggle();
        break;
      case "ArrowLeft":
        seekBy(-STEP);
        break;
      case "ArrowRight":
        seekBy(STEP);
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "c":
      case "C":
        if (!video.captions) return;
        setCaptionsOn((on) => !on);
        break;
      default:
        return;
    }
    e.preventDefault();
    poke();
  };

  /* Keep the bar up while a keyboard user is inside it, not after a mouse click. */
  const onBarFocus = (e: FocusEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).matches(":focus-visible")) setKeyFocus(true);
  };
  const onBarBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyFocus(false);
  };

  /* ---- Media events. ---- */
  const syncBuffered = () => {
    const v = videoRef.current;
    if (!v) return;
    const out: [number, number][] = [];
    for (let i = 0; i < v.buffered.length; i++) out.push([v.buffered.start(i), v.buffered.end(i)]);
    setBuffered(out);
  };

  const media = {
    onLoadedMetadata: () => {
      const v = videoRef.current;
      if (!v) return;
      setDuration(v.duration);
      const r = resume.current;
      resume.current = null;
      if (r) v.currentTime = Math.min(r.t, v.duration);
      if (wantPlay.current) play();
    },
    onDurationChange: () => setDuration(videoRef.current?.duration ?? 0),
    onTimeUpdate: () => {
      const v = videoRef.current;
      if (!v) return;
      lastTime.current = v.currentTime;
      setTime(v.currentTime);
      paint(v.currentTime, v.duration);
    },
    onSeeking: () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
    },
    onProgress: syncBuffered,
    onPlay: () => {
      setPlaying(true);
      setStarted(true);
      poke();
    },
    onPause: () => {
      setPlaying(false);
      setWaiting(false);
    },
    onWaiting: () => setWaiting(true),
    onPlaying: () => setWaiting(false),
    onCanPlay: () => setWaiting(false),
    onEnded: () => {
      wantPlay.current = false;
      setPlaying(false);
      setEnded(true);
      setStarted(false);
      setCue("");
    },
    onVolumeChange: () => {
      const v = videoRef.current;
      if (!v) return;
      setVolume(v.volume);
      setMuted(v.muted);
    },
  };

  /* ---- Surface: click toggles; a tap on touch first brings the controls back. ---- */
  const onSurfaceClick = () => {
    if (pointerKind.current !== "mouse" && started && playing && !showControls) {
      poke();
      return;
    }
    toggle();
  };

  const vertical = Boolean(video.vertical);
  const level = muted ? 0 : volume;

  return (
    <div
      className={`glass mx-auto rounded-[26px] p-1.5 sm:p-2 ${
        vertical ? "[@media(max-width:640px)]:w-[min(100%,calc(78svh*9/16))]" : ""
      } ${className}`}
    >
      <div
        ref={(el) => {
          frameRef.current = el;
          rootRef.current = el;
        }}
        role="region"
        aria-label={video.title}
        aria-describedby={helpId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") poke();
        }}
        onPointerLeave={() => {
          if (playing && !scrubbing) setIdle(true);
        }}
        data-fullscreen={fullscreen ? "" : undefined}
        style={{ "--vp-progress": "0" } as CSSProperties}
        className={`group/vp relative isolate overflow-hidden rounded-[20px] bg-background outline-none ${
          vertical ? "aspect-video [@media(max-width:640px)]:aspect-[9/16]" : "aspect-video"
        } data-[fullscreen]:aspect-auto data-[fullscreen]:rounded-none data-[fullscreen]:bg-black ${
          started && playing && !showControls ? "cursor-none" : ""
        }`}
      >
        <p id={helpId} className="sr-only">
          Keyboard shortcuts: space or K to play and pause, left and right arrows to skip 5 seconds, M to mute, F for
          full screen{video.captions ? ", C for captions" : ""}.
        </p>

        <video
          ref={videoRef}
          src={near ? cut.url : undefined}
          preload={near ? "metadata" : "none"}
          playsInline
          crossOrigin={video.captions ? "anonymous" : undefined}
          aria-hidden="true"
          tabIndex={-1}
          className={`absolute inset-0 size-full ${fullscreen ? "object-contain" : "object-cover"}`}
          {...media}
        >
          {video.captions ? (
            <track
              kind="captions"
              src={video.captions.src}
              srcLang={video.captions.srcLang ?? "en"}
              label={video.captions.label ?? "English"}
            />
          ) : null}
        </video>

        {/* Poster: a <picture>, so it follows the colour scheme (and the cut)
            live, with no JavaScript and no flash. Hidden once playback starts. */}
        {hPoster ? (
          <picture
            className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ease-soft motion-reduce:transition-none ${
              started ? "opacity-0" : "opacity-100"
            }`}
          >
            {vPoster ? <source media={`${PHONE} and ${DARK}`} srcSet={vPoster.dark} /> : null}
            {vPoster ? <source media={PHONE} srcSet={vPoster.light} /> : null}
            <source media={DARK} srcSet={hPoster.dark} />
            <img
              src={hPoster.light}
              alt=""
              decoding="async"
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          </picture>
        ) : null}

        {/* Click surface. Not a button: the play button and the bar are the
            accessible controls; this is a convenience for pointer users. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          onPointerDown={(e) => {
            pointerKind.current = e.pointerType;
          }}
          onClick={onSurfaceClick}
        />

        {/* Captions, drawn above the bar. */}
        {captionsOn && cue ? (
          <div
            className={`pointer-events-none absolute inset-x-4 flex justify-center text-center transition-[bottom] duration-300 ease-soft motion-reduce:transition-none ${
              showControls ? "bottom-[4.5rem]" : "bottom-6"
            }`}
          >
            <p className="whitespace-pre-line rounded-[8px] bg-black/65 px-2.5 py-1 text-[14px] leading-snug text-white sm:text-[17px]">
              {cue}
            </p>
          </div>
        ) : null}

        {/* Buffering. */}
        <div
          aria-hidden={!buffering}
          className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-300 motion-reduce:transition-none ${
            buffering ? "opacity-100 delay-300" : "opacity-0"
          }`}
        >
          <span className="glass-dark grid size-14 place-items-center rounded-full">
            {buffering ? (
              <Orb variant="C3" size={30} label="Loading video" style={{ "--orb-fg": "#fff" } as CSSProperties} />
            ) : null}
          </span>
        </div>

        {/* Big play button over the poster (and again at the end). */}
        <div
          className={`absolute inset-0 grid place-items-center transition-[opacity,transform] duration-500 ease-soft motion-reduce:transition-none ${
            started ? "pointer-events-none scale-[0.96] opacity-0" : "scale-100 opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={play}
            tabIndex={started ? -1 : 0}
            aria-hidden={started}
            aria-label={`${ended ? "Replay" : "Play"} ${video.title}`}
            className="glass-dark group/play flex items-center gap-3 rounded-full p-1.5 pr-5 transition-transform duration-300 ease-spring hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none motion-reduce:hover:scale-100 sm:p-2 sm:pr-6"
          >
            <span className="grid size-11 place-items-center rounded-full bg-white text-[#0a0a0a] shadow-[0_2px_10px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-spring group-hover/play:scale-[1.06] motion-reduce:transition-none sm:size-14">
              {ended ? <ReplayIcon className="size-5 sm:size-6" /> : <PlayGlyph className="ml-0.5 size-5 sm:size-6" />}
            </span>
            <span className="flex flex-col items-start text-left leading-tight">
              <span className="text-[14px] font-normal tracking-[-0.01em] sm:text-[15px]">
                {ended ? "Watch again" : "Watch the film"}
              </span>
              <span className="text-[12px] tabular-nums text-white/60">
                {duration > 0 ? clock(duration) : "Launch video"}
              </span>
            </span>
          </button>
        </div>

        {/* Control bar. */}
        <div
          onFocus={onBarFocus}
          onBlur={onBarBlur}
          onPointerMove={poke}
          aria-hidden={!started}
          inert={!started}
          className={`glass-dark absolute inset-x-2 bottom-2 flex h-11 items-center gap-0.5 rounded-full px-1 transition-[opacity,transform] duration-300 ease-soft motion-reduce:transition-none sm:inset-x-3 sm:bottom-3 sm:gap-1 sm:px-1.5 ${
            showControls ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          <BarButton label={playing ? "Pause" : "Play"} shortcut="k" onClick={toggle}>
            <PlayPauseIcon playing={playing} />
          </BarButton>

          <span className="w-[4.5ch] shrink-0 text-right text-[12px] tabular-nums text-white/85 sm:w-[5ch]">
            {clock(time)}
          </span>

          <Scrubber
            time={time}
            duration={duration}
            buffered={buffered}
            scrubbing={scrubbing}
            onScrubStart={() => {
              setScrubbing(true);
              videoRef.current?.pause();
            }}
            onScrub={seekTo}
            onScrubEnd={() => {
              setScrubbing(false);
              if (wantPlay.current) void videoRef.current?.play().catch(() => {});
              poke();
            }}
            onStep={seekBy}
          />

          <span className="w-[4.5ch] shrink-0 text-[12px] tabular-nums text-white/55 sm:w-[5ch]">{clock(duration)}</span>

          {video.captions ? (
            <BarButton
              label={captionsOn ? "Turn captions off" : "Turn captions on"}
              shortcut="c"
              pressed={captionsOn}
              onClick={() => setCaptionsOn((on) => !on)}
            >
              <CaptionsIcon on={captionsOn} />
            </BarButton>
          ) : null}

          <div className="group/vol flex items-center">
            <BarButton label={level === 0 ? "Unmute" : "Mute"} shortcut="m" onClick={toggleMute}>
              <VolumeIcon level={level} />
            </BarButton>
            <div className="w-0 overflow-hidden transition-[width] duration-300 ease-soft group-focus-within/vol:w-[72px] group-hover/vol:w-[72px] motion-reduce:transition-none max-sm:hidden">
              <VolumeSlider level={level} onChange={setVol} />
            </div>
          </div>

          <BarButton label={fullscreen ? "Exit full screen" : "Full screen"} shortcut="f" onClick={toggleFullscreen}>
            <FullscreenIcon on={fullscreen} />
          </BarButton>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Controls
   ========================================================================== */

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/90";

function BarButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-full text-white/85 transition-[background-color,color,transform] duration-200 ease-spring hover:bg-white/10 hover:text-white active:scale-[0.9] motion-reduce:transition-none motion-reduce:active:scale-100 ${focusRing}`}
    >
      {children}
    </button>
  );
}

/** Horizontal fraction of a pointer over an element, 0–1. */
function fractionAt(el: HTMLElement, clientX: number) {
  const r = el.getBoundingClientRect();
  return r.width ? clamp((clientX - r.left) / r.width, 0, 1) : 0;
}

function Scrubber({
  time,
  duration,
  buffered,
  scrubbing,
  onScrubStart,
  onScrub,
  onScrubEnd,
  onStep,
}: {
  time: number;
  duration: number;
  buffered: [number, number][];
  scrubbing: boolean;
  onScrubStart: () => void;
  onScrub: (t: number) => void;
  onScrubEnd: () => void;
  onStep: (d: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ready = duration > 0 && Number.isFinite(duration);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onScrubStart();
    onScrub(fractionAt(e.currentTarget, e.clientX) * duration);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    const f = fractionAt(e.currentTarget, e.clientX);
    if (e.pointerType === "mouse" || scrubbing) setHover(f);
    if (scrubbing) onScrub(f * duration);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onScrubEnd();
    if (e.pointerType !== "mouse") setHover(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const big = duration / 10;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => onStep(-STEP),
      ArrowDown: () => onStep(-STEP),
      ArrowRight: () => onStep(STEP),
      ArrowUp: () => onStep(STEP),
      PageDown: () => onStep(-big),
      PageUp: () => onStep(big),
      Home: () => onScrub(0),
      End: () => onScrub(duration),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    e.stopPropagation();
    move();
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={ready ? Math.floor(duration) : 0}
      aria-valuenow={Math.floor(time)}
      aria-valuetext={`${spoken(time)} of ${spoken(duration)}`}
      aria-disabled={!ready}
      data-scrubbing={scrubbing ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => !scrubbing && setHover(null)}
      onKeyDown={onKeyDown}
      className={`group/scrub relative mx-1 flex h-9 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-full sm:mx-1.5 ${focusRing} focus-visible:outline-offset-2`}
    >
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-200 ease-soft group-hover/scrub:h-[5px] group-data-[scrubbing]/scrub:h-[5px] motion-reduce:transition-none">
        {ready
          ? buffered.map(([a, b]) => (
              <span
                key={`${a}-${b}`}
                className="absolute inset-y-0 bg-white/25"
                style={{ left: `${(a / duration) * 100}%`, width: `${((b - a) / duration) * 100}%` }}
              />
            ))
          : null}
        {hover !== null ? (
          <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${hover * 100}%` }} />
        ) : null}
        <span
          className="absolute inset-y-0 left-0 w-full origin-left bg-white"
          style={{ transform: "scaleX(var(--vp-progress))" }}
        />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-spring group-hover/scrub:scale-100 group-focus-visible/scrub:scale-100 group-data-[scrubbing]/scrub:scale-100 motion-reduce:transition-none"
        style={{ left: "calc(var(--vp-progress) * 100%)" }}
      />
      {hover !== null && ready ? (
        <span
          aria-hidden="true"
          className="glass-dark pointer-events-none absolute bottom-full mb-2.5 -translate-x-1/2 rounded-full px-2 py-0.5 text-[11.5px] tabular-nums text-white"
          style={{ left: `clamp(1.5rem, ${hover * 100}%, calc(100% - 1.5rem))` }}
        >
          {clock(hover * duration)}
        </span>
      ) : null}
    </div>
  );
}

function VolumeSlider({ level, onChange }: { level: number; onChange: (n: number) => void }) {
  const [drag, setDrag] = useState(false);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 };
    let next: number | null = null;
    if (e.key in moves) next = level + moves[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(next);
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-valuetext={level === 0 ? "Muted" : `${Math.round(level * 100)}%`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        onChange(fractionAt(e.currentTarget, e.clientX));
      }}
      onPointerMove={(e) => drag && onChange(fractionAt(e.currentTarget, e.clientX))}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onKeyDown={onKeyDown}
      className={`group/volume relative mx-2 flex h-9 w-14 cursor-pointer touch-none items-center rounded-full ${focusRing} focus-visible:outline-offset-2`}
    >
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/20">
        <span className="absolute inset-y-0 left-0 bg-white" style={{ width: `${level * 100}%` }} />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
        style={{ left: `${level * 100}%` }}
      />
    </div>
  );
}

/* ==========================================================================
   Icons: 16px grid, 1.25 strokes with round caps, like components/ui.tsx.
   ========================================================================== */

const PLAY = ["M4.5 2.75 L8.75 5.375 L8.75 10.625 L4.5 13.25 Z", "M8.75 5.375 L13 8 L13 8 L8.75 10.625 Z"];
const PAUSE = ["M4 3 L6.75 3 L6.75 13 L4 13 Z", "M9.25 3 L12 3 L12 13 L9.25 13 Z"];

/** Play ⇄ pause morph: each half of the triangle becomes a bar (CSS `d`
    transition; browsers without it swap instantly). */
function PlayPauseIcon({ playing }: { playing: boolean }) {
  const shapes = playing ? PAUSE : PLAY;
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
      {shapes.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="transition-[d] duration-300 ease-soft motion-reduce:transition-none"
          style={{ d: `path("${d}")` } as CSSProperties}
        />
      ))}
    </svg>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        d="M5 3.1v9.8a.6.6 0 0 0 .9.52l8.1-4.9a.6.6 0 0 0 0-1.03L5.9 2.58A.6.6 0 0 0 5 3.1z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReplayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M3.25 8a4.75 4.75 0 1 0 1.4-3.37M3.25 2.75v2.5h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VolumeIcon({ level }: { level: number }) {
  const wave = "transition-opacity duration-200 motion-reduce:transition-none";
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M2.75 6.25h1.9L7.5 3.9v8.2L4.65 9.75h-1.9a.5.5 0 0 1-.5-.5v-2.5a.5.5 0 0 1 .5-.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M10 6.1a2.6 2.6 0 0 1 0 3.8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className={wave}
        opacity={level > 0 ? 1 : 0}
      />
      <path
        d="M11.85 4.3a5.1 5.1 0 0 1 0 7.4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className={wave}
        opacity={level > 0.5 ? 1 : 0}
      />
      <path
        d="M10.5 6.25l3.25 3.5m0-3.5l-3.25 3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className={wave}
        opacity={level === 0 ? 1 : 0}
      />
    </svg>
  );
}

function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
      <path
        d={
          on
            ? "M6 2.75V5a1 1 0 0 1-1 1H2.75M13.25 6H11a1 1 0 0 1-1-1V2.75M10 13.25V11a1 1 0 0 1 1-1h2.25M2.75 10H5a1 1 0 0 1 1 1v2.25"
            : "M2.75 6V3.75a1 1 0 0 1 1-1H6M10 2.75h2.25a1 1 0 0 1 1 1V6M13.25 10v2.25a1 1 0 0 1-1 1H10M6 13.25H3.75a1 1 0 0 1-1-1V10"
        }
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CaptionsIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
      <rect
        x="2"
        y="3.25"
        width="12"
        height="9.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.25"
        fill={on ? "currentColor" : "none"}
        className="transition-[fill] duration-200 motion-reduce:transition-none"
      />
      <path
        d="M4.75 8.25h2.5M8.75 8.25h2.5M4.75 10.25h4.5"
        stroke={on ? "#0a0a0a" : "currentColor"}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
