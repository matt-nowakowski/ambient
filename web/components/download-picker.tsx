"use client";

import { useSyncExternalStore } from "react";
import { releasesByOS, osLabel, type OS } from "@/lib/releases";
import { buttonClass } from "./ui";

function detectOS(): OS | "unknown" {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const hint = `${nav.userAgentData?.platform ?? ""} ${nav.userAgent}`.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(hint)) return "unknown";
  if (/mac/.test(hint)) return "mac";
  if (/win/.test(hint)) return "windows";
  if (/linux|x11|cros/.test(hint)) return "linux";
  return "unknown";
}

const noopSubscribe = () => () => {};

export function useDetectedOS(): OS | "unknown" | null {
  return useSyncExternalStore(noopSubscribe, detectOS, () => null);
}

export function DownloadPicker() {
  const os = useDetectedOS();

  if (os === null) {
    // Server render / pre-hydration: reserve space to avoid layout shift.
    return <div className="h-[132px]" aria-hidden="true" />;
  }

  if (os === "unknown") {
    return (
      <div className="flex h-[132px] flex-col items-center justify-center text-center">
        <p className="text-[14px] text-muted">
          Desktop app for macOS, Windows and Linux. Pick your platform below.
        </p>
      </div>
    );
  }

  const [primary, ...others] = releasesByOS[os];
  return (
    <div className="flex h-[132px] flex-col items-center justify-start text-center">
      <a href={primary.url} className={buttonClass("primary", "lg", "h-12 px-7")}>
        <DownloadIcon />
        Download for {osLabel[os]}
      </a>
      <p className="eyebrow mt-5">
        {primary.short} · {primary.file}
      </p>
      {others.length ? (
        <p className="mt-2.5 text-[13px] text-muted">
          {others.map((r, i) => (
            <span key={r.id}>
              {i > 0 ? " · " : "Not this one? "}
              <a href={r.url} className="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground">
                {r.short}
              </a>
            </span>
          ))}
        </p>
      ) : null}
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
