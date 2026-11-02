"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { detectPlatform, guessPlatform, type Platform, type ReleaseId } from "@/lib/platform";
import { osLabel, releases, releasesByOS, type OS, type Release } from "@/lib/releases";
import { SuccessCheck } from "./success-check";
import { buttonClass } from "./ui";

const ORDER: OS[] = ["mac", "windows", "linux"];

const INSTALL_STEPS: Record<OS, string[]> = {
  mac: ["Open the .dmg from your Downloads", "Drag Ambient into Applications", "Open Ambient from Applications"],
  windows: ["Open the installer from your Downloads", "Follow the steps, then Ambient opens", "Find it in the system tray"],
  linux: ["Open or install the file you downloaded", "Start Ambient from your apps menu", "See Linux setup below if the shortcut doesn’t work"],
};

const noopSubscribe = () => () => {};
let guessed: Platform | undefined;
const guessSnapshot = () => (guessed ??= guessPlatform());

/** null on the server, then the synchronous guess, then the refined answer
 * from client hints. */
export function usePlatform(): Platform | null {
  const guess = useSyncExternalStore(noopSubscribe, guessSnapshot, () => null);
  const [refined, setRefined] = useState<Platform | null>(null);
  useEffect(() => {
    let live = true;
    detectPlatform().then((p) => live && setRefined(p));
    return () => {
      live = false;
    };
  }, []);
  return refined ?? guess;
}

// The ?get=<id> a visitor arrived with, read once: the URL is cleaned right after.
let arrivedWith: Release | null | undefined;
let fired = false;
const getSnapshot = () => {
  if (arrivedWith === undefined) {
    const id = new URLSearchParams(window.location.search).get("get");
    arrivedWith = id && id in releases ? releases[id as ReleaseId] : null;
    fired = false;
  }
  return arrivedWith;
};

/**
 * The download button: the main part gets the build for this machine, the
 * arrow opens every build. `direct` links straight to the installer (the
 * download page); otherwise links go to /download?get=<id>, which starts the
 * download and shows the setup steps.
 */
export function DownloadButton({ direct = false, className = "" }: { direct?: boolean; className?: string }) {
  const platform = usePlatform();
  const href = (r: Release) => (direct ? r.url : `/download?get=${r.id}`);

  if (!platform?.release) {
    // Server render, phones and unknown systems: the download page has every build.
    return (
      <a href="/download" className={buttonClass("primary", "lg", className)}>
        <DownloadIcon />
        <span>{platform ? "Download" : "Download for free"}</span>
      </a>
    );
  }

  const current = releases[platform.release];
  return (
    <SplitButton
      className={className}
      main={
        <a href={href(current)} className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 pl-5 pr-3.5 sm:pl-6">
          <DownloadIcon />
          <span className="truncate">
            Download<span className="hidden min-[400px]:inline"> for {osLabel[platform.os]}</span>
          </span>
        </a>
      }
      current={platform.release}
      href={href}
    />
  );
}

function SplitButton({
  main,
  current,
  href,
  className,
}: {
  main: React.ReactNode;
  current: ReleaseId;
  href: (r: Release) => string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLAnchorElement>("[role=menuitem]") ?? []);
    items().find((a) => a.dataset.current === "true")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLAnchorElement);
        list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative inline-flex ${className}`}>
      <div className="flex h-11 w-full select-none items-stretch overflow-hidden rounded-full bg-inverse text-[13px] font-medium tracking-[-0.005em] text-inverse-fg shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_16px_-8px_rgba(0,0,0,0.35)] [&>*]:transition-colors [&>*:hover]:bg-inverse-fg/10">
        {main}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Choose another build"
          onClick={() => setOpen((o) => !o)}
          className="flex w-11 shrink-0 items-center justify-center border-l border-inverse-fg/15 pr-0.5 outline-none focus-visible:bg-inverse-fg/15"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="All downloads"
          className="absolute left-1/2 top-full z-50 mt-2 w-[min(300px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-border bg-glass-strong p-1.5 text-left shadow-[var(--shadow-pop)] backdrop-blur-xl"
        >
          {ORDER.map((os) => (
            <div key={os} role="group" aria-label={osLabel[os]} className="py-0.5">
              <p className="eyebrow px-3 pb-1 pt-2 !text-subtle">{osLabel[os]}</p>
              {releasesByOS[os].map((r) => (
                <a
                  key={r.id}
                  href={href(r)}
                  role="menuitem"
                  data-current={r.id === current}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 outline-none transition-colors hover:bg-glass-hover focus-visible:bg-glass-hover"
                >
                  <span className="min-w-0">
                    <span className="block text-[13.5px] text-foreground">{r.short}</span>
                    <span className="block text-[12px] text-subtle">{r.detail}</span>
                  </span>
                  {r.id === current ? (
                    <span className="shrink-0 text-[11px] text-subtle">This device</span>
                  ) : null}
                </a>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The hero of the download page. Arriving from /download?get=<id> starts that
 * download once and says so. */
export function DownloadPicker() {
  const platform = usePlatform();
  const started = useSyncExternalStore(noopSubscribe, getSnapshot, () => null);

  useEffect(() => {
    if (started && !fired) {
      fired = true;
      // Drop the parameter so a refresh doesn't download again.
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      window.location.assign(started.url);
    }
    // Leaving the page forgets it, so a later visit reads the (clean) URL afresh.
    return () => {
      arrivedWith = undefined;
    };
  }, [started]);

  if (started) {
    return (
      <div role="status" className="glass mx-auto w-full max-w-[440px] rounded-[26px] p-6 text-left sm:p-7">
        <div className="flex items-center gap-4">
          <SuccessCheck size={44} />
          <div className="min-w-0">
            <p className="text-[16px] font-normal tracking-[-0.015em]">Downloading for {osLabel[started.os]}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-subtle">
              {started.short} · {started.file}
            </p>
          </div>
        </div>
        <ol className="mt-6 space-y-2.5 border-t border-border pt-5">
          {INSTALL_STEPS[started.os].map((step, i) => (
            <li key={step} className="flex items-baseline gap-3 text-[13.5px] text-muted">
              <span className="w-4 shrink-0 text-[12px] tabular-nums text-subtle">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4 text-[12.5px] text-subtle">
          Didn’t start?
          <a href={started.url} className={buttonClass("glass", "sm")}>
            Download again
          </a>
        </p>
      </div>
    );
  }

  if (platform === null) {
    // Server render / pre-hydration: reserve space to avoid layout shift.
    return <div className="h-[132px]" aria-hidden="true" />;
  }

  if (!platform.release) {
    return (
      <div className="flex h-[132px] flex-col items-center justify-center text-center">
        <p className="text-[14px] text-muted">
          Desktop app for macOS, Windows and Linux. Pick your platform below.
        </p>
      </div>
    );
  }

  const current = releases[platform.release];
  return (
    <div className="flex h-[132px] flex-col items-center justify-start text-center">
      <DownloadButton direct className="w-full max-w-[300px] sm:w-auto sm:max-w-none" />
      <p className="eyebrow mt-5">
        {current.short} · {current.file}
      </p>
      <p className="mt-2.5 text-[13px] text-muted">Another computer? Use the arrow, or see all downloads below.</p>
    </div>
  );
}

export function DownloadIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 2.5v8m0 0L4.5 7M8 10.5 11.5 7M3 13.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
