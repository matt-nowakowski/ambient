/*
 * Global search (⌘K / Ctrl+K, or the field in the sidebar): every page,
 * Settings tab, group and setting, matched by its title, description and a
 * few synonyms. Choosing a result opens the page (and tab), scrolls the row
 * into view and briefly highlights it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import {
  CornerDownLeft,
  FileText,
  Layers,
  PanelsTopLeft,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useOsType } from "@/hooks/useOsType";
import { prefersReducedMotion } from "@/lib/utils/motion";
import { useSettings } from "../../hooks/useSettings";
import type { SidebarSection } from "../Sidebar";
import {
  buildSearchIndex,
  searchIndex,
  type SearchEntry,
  type SearchKind,
} from "./searchIndex";
import { useSearch } from "./searchStore";

const KIND_ICON: Record<SearchKind, React.ElementType> = {
  page: PanelsTopLeft,
  tab: Layers,
  group: FileText,
  setting: SlidersHorizontal,
};

/** Opens search on ⌘K / Ctrl+K while the main app is showing. */
const useSearchShortcut = () => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "k" &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const { open, setOpen } = useSearch.getState();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
};

export const GlobalSearch: React.FC<{
  onNavigate: (section: SidebarSection) => void;
}> = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const os = useOsType();
  const { getSetting } = useSettings();
  const open = useSearch((s) => s.open);
  const setOpen = useSearch((s) => s.setOpen);
  const jump = useSearch((s) => s.jump);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useSearchShortcut();

  const postProcessEnabled = getSetting("post_process_enabled") ?? false;
  const experimentalEnabled = getSetting("experimental_enabled") ?? false;
  // Built when opened, in the current language, from what's visible now.
  const index = useMemo(
    () =>
      open
        ? buildSearchIndex(t, {
            isMac: os === "macos",
            isLinux: os === "linux",
            postProcessEnabled,
            experimentalEnabled,
          })
        : [],
    [open, i18n.language, os, postProcessEnabled, experimentalEnabled],
  );

  const results = useMemo(() => {
    if (query.trim()) return searchIndex(index, query);
    // Nothing typed yet: the pages, to jump straight to one.
    return index.filter((e) => e.kind === "page");
  }, [index, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    jump({
      section: entry.section,
      tab: entry.tab,
      label:
        entry.kind === "group" || entry.kind === "setting"
          ? entry.label
          : undefined,
    });
    onNavigate(entry.section);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="search"
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/25 px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("search.label")}
            className="glass-strong flex max-h-[min(520px,76vh)] w-full max-w-[560px] flex-col overflow-hidden rounded-panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2.5 border-b-[0.5px] border-glass-edge px-4">
              <Search
                width={15}
                height={15}
                strokeWidth={1.75}
                className="shrink-0 text-ink-3"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                aria-label={t("search.label")}
                role="combobox"
                aria-expanded="true"
                aria-controls="global-search-results"
                aria-activedescendant={
                  results[active] ? `search-${results[active].id}` : undefined
                }
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] font-light tracking-[-0.01em] text-text outline-none placeholder:text-ink-3"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className="shrink-0 rounded-chip border-[0.5px] border-glass-edge px-1.5 py-0.5 text-meta font-medium text-ink-3">
                {t("search.escape")}
              </kbd>
            </div>

            {results.length === 0 ? (
              <p className="px-4 py-8 text-center text-small text-ink-3">
                {t("search.empty", { query: query.trim() })}
              </p>
            ) : (
              <>
                {!query.trim() && (
                  <p className="px-4 pt-3 pb-1 text-meta font-medium text-ink-3">
                    {t("search.jumpTo")}
                  </p>
                )}
                <ul
                  ref={listRef}
                  id="global-search-results"
                  role="listbox"
                  className="min-h-0 flex-1 overflow-y-auto p-1.5"
                >
                  {results.map((entry, i) => {
                    const Icon = KIND_ICON[entry.kind];
                    const selected = i === active;
                    return (
                      <li
                        key={entry.id}
                        id={`search-${entry.id}`}
                        data-index={i}
                        role="option"
                        aria-selected={selected}
                        onMouseMove={() => setActive(i)}
                        onClick={() => choose(entry)}
                        className={`flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 ${
                          selected ? "bg-glass-press" : ""
                        }`}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-hover text-ink-2">
                          <Icon width={14} height={14} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ui text-text">
                            {entry.label}
                          </span>
                          {(entry.trail || entry.description) && (
                            <span className="block truncate text-meta text-ink-3">
                              {entry.trail}
                              {entry.trail && entry.description && " · "}
                              {entry.description}
                            </span>
                          )}
                        </span>
                        {selected && (
                          <CornerDownLeft
                            width={13}
                            height={13}
                            strokeWidth={1.75}
                            className="shrink-0 text-ink-3"
                            aria-hidden="true"
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** The trimmed text of an element without its child elements' text. */
const ownText = (el: Element) =>
  Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();

/** The element showing `label` inside `root`: a heading or title first. */
const findLabel = (root: HTMLElement, label: string): HTMLElement | null => {
  const candidates = root.querySelectorAll<HTMLElement>(
    "h1, h2, h3, h4, p, span, label, button",
  );
  let loose: HTMLElement | null = null;
  for (const el of candidates) {
    if (ownText(el) === label) return el;
    if (!loose && el.textContent?.trim() === label) loose = el;
  }
  return loose;
};

/**
 * After a search jump lands on its page, scroll the chosen row into view and
 * highlight it. Retries while the page transition settles.
 */
export const useSearchJump = (
  section: SidebarSection,
  container: React.RefObject<HTMLElement | null>,
) => {
  const target = useSearch((s) => s.target);
  const nonce = useSearch((s) => s.nonce);

  useEffect(() => {
    if (!target || target.section !== section) return;
    const { clear } = useSearch.getState();
    const label = target.label;
    // A page or tab result: the page has already opened it.
    if (!label) {
      clear();
      return;
    }
    const timers: number[] = [];
    let tries = 0;
    const attempt = () => {
      const root = container.current;
      const el = root ? findLabel(root, label) : null;
      if (!el) {
        if (++tries < 15) timers.push(window.setTimeout(attempt, 100));
        else {
          clear();
          // Keeps the index honest: a row it lists that the page no longer
          // shows is reported here in development.
          if (import.meta.env.DEV)
            console.warn(
              `[search] "${label}" is in the search index but not on the ${section} page`,
            );
        }
        return;
      }
      clear();
      const row =
        el.closest<HTMLElement>("[data-search-row], section, .glass") ?? el;
      row.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      row.classList.remove("search-hit");
      void row.offsetWidth; // restart the animation
      row.classList.add("search-hit");
      // Not cancelled with the effect: clearing the target re-runs it.
      window.setTimeout(() => row.classList.remove("search-hit"), 2200);
    };
    // Let the page (and tab) transition put the new content in place.
    timers.push(window.setTimeout(attempt, 260));
    return () => timers.forEach(clearTimeout);
  }, [target, nonce, section, container]);
};
