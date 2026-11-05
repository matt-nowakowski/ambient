"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import { CopyText, Seg } from "./client";

/**
 * The marketing suite's browser: folders (videos, campaign, logos, banners,
 * copy), one card per asset, and one Download menu per card. The Light/Dark
 * and language toggles pick which variant every preview and download shows;
 * an asset without that variant falls back to the closest one and says so.
 * Everything here is plain data built on the server (suite.tsx).
 */

export type Theme = "light" | "dark";

/** Anything that may exist per theme and per language. Unset means "any". */
type Variantish = { theme?: Theme; lang?: string };

export type FileVariant = Variantish & {
  /** Variants with the same key are one menu entry; the toggles pick between them. */
  key: string;
  label: string;
  /** e.g. "1080×1920 · 2.1 MB" */
  meta?: string;
  href: string;
  filename: string;
  /** Menu section, e.g. "Video" or "PNG". */
  section?: string;
};

export type Preview = Variantish & {
  kind: "image" | "video";
  src: string;
  poster?: string;
  /** Logo previews sit on the matching swatch, not the neutral stage. */
  swatch?: boolean;
};

export type Asset = { id: string; name: string; note?: string; previews: Preview[]; files: FileVariant[] };

export type CopyGroup = { title: string; lang?: string; items: { label: string; text: string }[] };

export type FolderId = "videos" | "campaign" | "logos" | "banners" | "copy";

export type Folder = {
  id: FolderId;
  label: string;
  sub: string;
  assets: Asset[];
  empty: string;
  /** A folder-wide action, e.g. every logo as a zip. */
  action?: { label: string; href: string };
};

const DEFAULT_LANG = "en";
const langOf = (v: Variantish) => v.lang ?? DEFAULT_LANG;

/** How well a variant fits the toggles: theme counts more than language. */
function fit(v: Variantish, theme: Theme, lang: string) {
  return (v.theme === undefined || v.theme === theme ? 2 : 0) + (v.lang === undefined || v.lang === lang ? 1 : 0);
}

function best<T extends Variantish>(list: T[], theme: Theme, lang: string): T | undefined {
  let pick: T | undefined;
  let score = -1;
  for (const v of list) {
    const s = fit(v, theme, lang);
    if (s > score) [pick, score] = [v, s];
  }
  return pick;
}

/** One entry per key, each the best fit for the toggles, in first-seen order. */
function resolveFiles(files: FileVariant[], theme: Theme, lang: string) {
  const keys = [...new Set(files.map((f) => f.key))];
  return keys.map((k) => {
    const f = best(
      files.filter((x) => x.key === k),
      theme,
      lang,
    )!;
    const note = [f.theme && f.theme !== theme ? `${f.theme} only` : null, f.lang && f.lang !== lang ? langName(f.lang) : null].filter(Boolean).join(", ");
    return { ...f, note };
  });
}

function langName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function MarketingBrowser({ folders, copy, dos, donts, notes }: { folders: Folder[]; copy: CopyGroup[]; dos: string[]; donts: string[]; notes?: Partial<Record<FolderId, ReactNode>> }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [open, setOpen] = useState<FolderId | "all">("all");
  const langs = [
    ...new Set([
      ...folders.flatMap((f) => f.assets.flatMap((a) => [...a.previews, ...a.files].map(langOf))),
      ...copy.map(langOf),
    ]),
  ].sort((a, b) => (a === DEFAULT_LANG ? -1 : b === DEFAULT_LANG ? 1 : a.localeCompare(b)));
  const [lang, setLang] = useState(DEFAULT_LANG);

  const copyGroups = copy.filter((g) => langOf(g) === lang).length ? copy.filter((g) => langOf(g) === lang) : copy.filter((g) => langOf(g) === DEFAULT_LANG);
  const copyCount = copyGroups.reduce((n, g) => n + g.items.length, 0);
  const all: { id: FolderId; label: string; count: number; unit: string }[] = [
    ...folders.map((f) => ({ id: f.id, label: f.label, count: f.assets.length, unit: "asset" })),
    { id: "copy", label: "Copy", count: copyCount, unit: "snippet" },
  ];
  const show = (id: FolderId) => open === "all" || open === id;

  function choose(id: FolderId) {
    const next = open === id ? "all" : id;
    setOpen(next);
    if (next !== "all") requestAnimationFrame(() => document.getElementById(`mk-${next}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Folders">
        {all.map((f) => (
          <button key={f.id} type="button" aria-pressed={open === f.id} onClick={() => choose(f.id)} className="mk-folder">
            <FolderIcon id={f.id} />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] text-foreground">{f.label}</span>
              <span className="block text-[12px] text-muted">
                {f.count} {f.unit}
                {f.count === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mk-toolbar sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-2 p-1.5">
        <Seg
          label="Theme"
          value={theme}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
          onChange={setTheme}
        />
        {langs.length > 1 ? <Seg label="Language" value={lang} options={langs.map((l) => ({ id: l, label: langName(l) }))} onChange={setLang} /> : null}
        {open !== "all" ? (
          <button type="button" onClick={() => setOpen("all")} className={buttonClass("glass", "sm", "!h-[30px]")}>
            Show all folders
          </button>
        ) : null}
      </div>

      <div className="mt-6 space-y-14">
        {folders.map((f) =>
          show(f.id) ? (
            <FolderSection key={f.id} id={f.id} title={f.label} sub={f.sub} action={f.action ? <a href={f.action.href} download className={buttonClass("glass", "sm")}>{f.action.label}</a> : null}>
              {f.assets.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {f.assets.map((a) => (
                    <AssetCard key={a.id} asset={a} theme={theme} lang={lang} />
                  ))}
                </div>
              ) : (
                <div className="mk-card px-4 py-6 text-center text-[13px] text-muted">{f.empty}</div>
              )}
              {notes?.[f.id]}
            </FolderSection>
          ) : null,
        )}

        {show("copy") ? (
          <FolderSection id="copy" title="Copy" sub="Approved words to use as they are, or to put in your own voice.">
            <div className="grid gap-4 lg:grid-cols-2">
              {copyGroups.map((group) => (
                <div key={group.title} className="mk-card p-4">
                  <div className="text-[13px] font-medium text-foreground">{group.title}</div>
                  <ul className="mt-2 divide-y divide-[color-mix(in_srgb,#8f8f8f_18%,transparent)]">
                    {group.items.map((s) => (
                      <li key={s.label} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[12px] text-muted">{s.label}</div>
                          <div className="mt-0.5 break-words text-[13.5px] leading-[1.5] text-foreground">{s.text}</div>
                        </div>
                        <CopyText value={s.text} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[
                { title: "Do", mark: "+", list: dos },
                { title: "Don't", mark: "–", list: donts },
              ].map((g) => (
                <div key={g.title} className="mk-card p-4">
                  <div className="text-[13px] font-medium text-foreground">{g.title}</div>
                  <ul className="mt-2 space-y-1.5 text-[13.5px] leading-[1.5]">
                    {g.list.map((d) => (
                      <li key={d} className="flex gap-2">
                        <span aria-hidden className="text-muted">
                          {g.mark}
                        </span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </FolderSection>
        ) : null}
      </div>
    </div>
  );
}

function FolderSection({ id, title, sub, action, children }: { id: FolderId; title: string; sub: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={`mk-${id}`} className="mk-section" aria-labelledby={`mk-${id}-title`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[720px]">
          <h2 id={`mk-${id}-title`} className="flex items-center gap-2 text-[22px] font-light tracking-[-0.025em] text-foreground">
            <FolderIcon id={id} small />
            {title}
          </h2>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-muted">{sub}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AssetCard({ asset, theme, lang }: { asset: Asset; theme: Theme; lang: string }) {
  const preview = best(asset.previews, theme, lang);
  const files = resolveFiles(asset.files, theme, lang);
  const swatch = preview?.swatch ? (theme === "dark" ? "mk-swatch-dark" : "mk-swatch-light") : "mk-preview";
  const fellBack = preview && preview.theme && preview.theme !== theme;
  return (
    <div className="mk-asset flex flex-col">
      <div className={`${swatch} relative overflow-hidden rounded-t-[14px]`} style={{ aspectRatio: "4 / 3" }}>
        {preview?.kind === "video" ? (
          <video controls playsInline muted preload="none" poster={preview.poster} src={preview.src} className="absolute inset-0 h-full w-full object-contain" />
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- the exact file that downloads
          <img src={preview.src} alt={asset.name} loading="lazy" className={`absolute object-contain ${preview.swatch ? "inset-[18%] h-[64%] w-[64%]" : "inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]"}`} />
        ) : null}
        {fellBack ? <span className="mk-badge absolute left-2.5 top-2.5">{preview.theme} only</span> : null}
      </div>
      <div className="flex flex-1 items-end justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[13px] text-foreground">{asset.name}</div>
          {asset.note ? <div className="text-[12px] leading-[1.45] text-muted">{asset.note}</div> : null}
        </div>
        {files.length ? <DownloadMenu name={asset.name} files={files} /> : null}
      </div>
    </div>
  );
}

type MenuFile = FileVariant & { note: string };

/**
 * One Download button. A single file is a plain link; several open a menu
 * (button + role="menu"): arrows, Home/End move, Escape or Tab closes and
 * focus returns to the button, a click outside closes it.
 */
function DownloadMenu({ name, files }: { name: string; files: MenuFile[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (files.length === 1) {
    const f = files[0];
    return (
      <a href={f.href} download={f.filename} className={buttonClass("glass", "sm", "flex-none")} aria-label={`Download ${name}, ${f.label}`}>
        Download
      </a>
    );
  }

  const focusItem = (i: number) => {
    const n = files.length;
    items.current[((i % n) + n) % n]?.focus();
  };
  const openAt = (i: number) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(i));
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const i = items.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") focusItem(i + 1);
    else if (e.key === "ArrowUp") focusItem(i - 1);
    else if (e.key === "Home") focusItem(0);
    else if (e.key === "End") focusItem(files.length - 1);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") return close(false);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className="relative flex-none">
      <button
        ref={button}
        type="button"
        id={`${id}-btn`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`Download ${name}`}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          openAt(e.key === "ArrowDown" ? 0 : files.length - 1);
        }}
        className={buttonClass("glass", "sm", "gap-1.5")}
      >
        Download
        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div id={`${id}-menu`} role="menu" aria-labelledby={`${id}-btn`} onKeyDown={onMenuKey} className="mk-menu absolute right-0 top-full z-30 mt-1.5">
          {files.map((f, i) => {
            const head = f.section && f.section !== files[i - 1]?.section ? f.section : null;
            return (
              <div key={f.key} role="none">
                {head ? (
                  <div role="presentation" className="mk-menu-head">
                    {head}
                  </div>
                ) : null}
                <a
                  ref={(el) => {
                    items.current[i] = el;
                  }}
                  role="menuitem"
                  tabIndex={-1}
                  href={f.href}
                  download={f.filename}
                  onClick={() => close()}
                  className="mk-menu-item"
                >
                  <span className="truncate">{f.label}</span>
                  <span className="flex-none text-[11.5px] text-muted">{[f.meta, f.note].filter(Boolean).join(" · ")}</span>
                </a>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Small line icons, one per folder (currentColor, 1.4 stroke like the site's). */
function FolderIcon({ id, small }: { id: FolderId; small?: boolean }) {
  const s = small ? 18 : 22;
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <span aria-hidden className={small ? "text-muted" : "mk-folder-icon"}>
      <svg width={s} height={s} viewBox="0 0 24 24">
        {id === "videos" ? (
          <>
            <rect x="3" y="5.5" width="13" height="13" rx="2.5" {...p} />
            <path d="M16 10.2 21 7.5v9l-5-2.7" {...p} />
          </>
        ) : id === "campaign" ? (
          <>
            <rect x="3" y="3.5" width="18" height="17" rx="3" {...p} />
            <circle cx="9.5" cy="9.5" r="1.4" {...p} />
            <circle cx="14.5" cy="9.5" r="1.4" {...p} />
            <circle cx="9.5" cy="14.5" r="1.4" {...p} />
            <circle cx="14.5" cy="14.5" r="1.4" {...p} />
          </>
        ) : id === "logos" ? (
          <>
            <circle cx="12" cy="12" r="8.5" {...p} />
            <path d="M8.5 15.5 12 7.5l3.5 8M9.8 12.8h4.4" {...p} />
          </>
        ) : id === "banners" ? (
          <>
            <rect x="2.5" y="6.5" width="19" height="11" rx="2.5" {...p} />
            <path d="M6 10.5h7M6 13.5h4.5" {...p} />
          </>
        ) : (
          <path d="M5 6.5h14M5 10.5h14M5 14.5h9M5 18.5h6" {...p} />
        )}
      </svg>
    </span>
  );
}
