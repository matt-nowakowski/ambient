"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { BANNER_FORMATS, HEADLINES, bannerName, bannerUrl, type HeadlineId, type LogoTheme } from "@/lib/marketing/catalog";

/** A small copy button for snippets and links. */
export function CopyText({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" onClick={copy} className={buttonClass("glass", "sm", `min-w-16 ${className}`)}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="mk-seg">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Every banner format for one headline and theme. Previews are the real PNGs
 * (lazy, and cached forever at the edge), so what you see is what downloads.
 */
export function BannerGallery() {
  const [headline, setHeadline] = useState<HeadlineId>("colleague");
  const [theme, setTheme] = useState<LogoTheme>("light");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Headline" value={headline} options={HEADLINES.map((h) => ({ id: h.id, label: h.text }))} onChange={setHeadline} />
        <Seg
          label="Theme"
          value={theme}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
          onChange={setTheme}
        />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BANNER_FORMATS.map((f) => {
          const src = bannerUrl(f.id, headline, theme);
          const name = bannerName(f.id, headline, theme);
          return (
            <figure key={f.id} className="mk-card flex flex-col">
              <a href={src} target="_blank" rel="noreferrer" className="mk-preview relative block overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the exact PNG that downloads, cached at the edge */}
                <img src={src} alt={`${f.group} ${f.label}`} loading="lazy" width={f.w} height={f.h} className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] object-contain" />
              </a>
              <figcaption className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-foreground">
                    {f.group} · {f.label}
                  </div>
                  <div className="text-[12px] text-muted">
                    {f.w} × {f.h}
                  </div>
                </div>
                <a href={src} download={name} className={buttonClass("glass", "sm")}>
                  PNG
                </a>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
