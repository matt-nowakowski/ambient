"use client";

import { useSyncExternalStore } from "react";

/**
 * The favicon, following the system theme. Chrome ignores `media` on icon
 * links, so the choice is made here and this component owns every rel="icon"
 * link (the root metadata declares none; only the apple-touch-icon).
 *
 * - Server render / no JavaScript: icon.svg (theme-aware through its own media
 *   query), then favicon.ico last for browsers without SVG favicons.
 * - Once hydrated: the animated GIF for the current theme in Firefox (the only
 *   browser that animates favicons), otherwise the static PNGs for the theme:
 *   Chrome and Safari show a GIF's first frame, which is rougher than the PNG.
 *   Reduced motion also gets the PNGs. Both start on the same
 *   static pose as the SVG, so the swap doesn't flicker.
 *
 * Each icon is keyed by its href, so a theme change inserts a fresh link:
 * browsers reliably pick up an inserted icon, less so an edited href.
 */
const DARK = "(prefers-color-scheme: dark)";
const REDUCE = "(prefers-reduced-motion: reduce)";

type Pick = "light" | "dark" | "light-static" | "dark-static";

function subscribe(onChange: () => void) {
  const queries = [matchMedia(DARK), matchMedia(REDUCE)];
  for (const q of queries) q.addEventListener("change", onChange);
  return () => {
    for (const q of queries) q.removeEventListener("change", onChange);
  };
}

function snapshot(): Pick {
  const theme = matchMedia(DARK).matches ? "dark" : "light";
  const animates = /firefox/i.test(navigator.userAgent);
  return animates && !matchMedia(REDUCE).matches ? theme : `${theme}-static`;
}

const serverSnapshot = () => null;

export function ThemeFavicon() {
  const pick = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  if (pick === null) {
    return (
      <>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
      </>
    );
  }
  if (pick === "light" || pick === "dark") {
    const href = pick === "dark" ? "/favicon-dark.gif" : "/favicon.gif";
    return <link key={href} rel="icon" href={href} type="image/gif" />;
  }
  const base = pick === "dark-static" ? "/favicon-dark" : "/favicon";
  return (
    <>
      <link key={`${base}-32`} rel="icon" href={`${base}-32.png`} type="image/png" sizes="32x32" />
      <link key={`${base}-48`} rel="icon" href={`${base}-48.png`} type="image/png" sizes="48x48" />
    </>
  );
}
