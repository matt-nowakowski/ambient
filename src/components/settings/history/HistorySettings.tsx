import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { AnimatePresence, motion } from "motion/react";
import {
  FilePlus,
  FolderOpen,
  History as HistoryIcon,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type HistoryUpdatePayload,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { useTranscriptionJobsStore } from "@/stores/transcriptionJobsStore";
import { AudioPlayerGroup } from "../../ui/AudioPlayer";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { softSpring, spring } from "../../ui/Motion";
import { Skeleton } from "../../ui/Skeleton";
import { Spinner } from "../../ui/Spinner";
import { SkeletonReveal } from "../../ui/Transitions";
import { copyToClipboard } from "./clipboard";
import { HistoryEntryRow } from "./HistoryEntryRow";
import { groupByDay, matchesQuery } from "./historyGroups";
import { pickAndTranscribeFiles } from "./transcribeFiles";

const PAGE_SIZE = 30;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25";

const SearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <Search
        width={13}
        height={13}
        strokeWidth={2}
        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={t("settings.history.searchPlaceholder")}
        aria-label={t("settings.history.searchPlaceholder")}
        spellCheck={false}
        className="h-control w-52 rounded-full border-[0.5px] border-glass-edge bg-glass-strong ps-8 pe-8 text-ui shadow-card transition-[width,border-color,box-shadow] duration-200 ease-[var(--ease-out-soft)] placeholder:text-ink-3 hover:border-line-strong focus:w-64 focus:border-ink-3 focus:outline-none focus:ring-4 focus:ring-logo-primary/[0.07] [&::-webkit-search-cancel-button]:appearance-none"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            type="button"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={spring}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            title={t("settings.history.clearSearch")}
            aria-label={t("settings.history.clearSearch")}
            className={`absolute end-1.5 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-glass-press text-ink-2 hover:text-text ${focusRing}`}
          >
            <X width={11} height={11} strokeWidth={2.4} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

const LoadingSkeleton: React.FC<{ label: string }> = ({ label }) => (
  <div aria-busy="true" aria-label={label} className="flex flex-col gap-label">
    <Skeleton className="h-5 w-16 rounded-full" />
    <div className="glass flex flex-col gap-5 rounded-panel p-card">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-3.5" style={{ width: `${88 - i * 11}%` }} />
          {i % 2 === 0 && (
            <Skeleton className="h-3.5" style={{ width: `${46 + i * 6}%` }} />
          )}
        </div>
      ))}
    </div>
  </div>
);

export const HistorySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const jobs = useTranscriptionJobsStore((state) => state.jobs);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const loadingRef = useRef(false);

  // Keep ref in sync for use in IntersectionObserver callback
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const loadPage = useCallback(async (cursor?: number) => {
    const isFirstPage = cursor === undefined;
    if (!isFirstPage && loadingRef.current) return;
    loadingRef.current = true;

    if (isFirstPage) setLoading(true);
    else setLoadingMore(true);

    try {
      const result = await commands.getHistoryEntries(
        cursor ?? null,
        PAGE_SIZE,
      );
      if (result.status === "ok") {
        const { entries: newEntries, has_more } = result.data;
        setEntries((prev) => {
          if (isFirstPage) return newEntries;
          const existingIds = new Set(prev.map((entry) => entry.id));
          return [
            ...prev,
            ...newEntries.filter((entry) => !existingIds.has(entry.id)),
          ];
        });
        setHasMore(has_more);
      }
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Infinite scroll via IntersectionObserver. Re-observing after each page
  // keeps loading while the bottom is still in view — e.g. when a search
  // hides most of what's loaded so far.
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (first.isIntersecting) {
          const lastEntry = entriesRef.current[entriesRef.current.length - 1];
          if (lastEntry) {
            loadPage(lastEntry.id);
          }
        }
      },
      { threshold: 0, rootMargin: "0px 0px 200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadPage, entries.length]);

  // Listen for new entries added from the transcription pipeline
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added") {
        setEntries((prev) => [
          payload.entry,
          ...prev.filter((entry) => entry.id !== payload.entry.id),
        ]);
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
      // "deleted" and "toggled" are handled by optimistic updates only,
      // so we intentionally ignore them here to avoid double-mutation.
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleSaved = async (id: number) => {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
    );
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        // Revert on failure
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    }
  };

  const getAudioUrl = useCallback(
    async (fileName: string) => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status === "ok") {
          if (osType === "linux") {
            const fileData = await readFile(result.data);
            const blob = new Blob([fileData], { type: "audio/wav" });
            return URL.createObjectURL(blob);
          }
          return convertFileSrc(result.data, "asset");
        }
        return null;
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const deleteAudioEntry = async (id: number) => {
    // Optimistically remove
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        // Reload on failure
        loadPage();
      }
    } catch (error) {
      console.error("Failed to delete entry:", error);
      loadPage();
    }
  };

  const transcribeFile = async () => {
    try {
      await pickAndTranscribeFiles();
    } catch (error) {
      console.error("Failed to pick a file to transcribe:", error);
      toast.error(t("settings.history.transcribeFailed"));
    }
  };

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  const searching = deferredQuery.trim().length > 0;
  const groups = useMemo(
    () =>
      groupByDay(
        entries.filter((entry) => matchesQuery(entry, deferredQuery)),
        i18n.language,
        t,
      ),
    [entries, deferredQuery, i18n.language, t],
  );

  let content: React.ReactNode;
  if (loading) {
    content = null;
  } else if (entries.length === 0) {
    content = (
      <EmptyState
        icon={HistoryIcon}
        title={t("settings.history.emptyTitle")}
        description={t("settings.history.emptyDescription")}
        action={
          <Button variant="secondary" onClick={transcribeFile}>
            <FilePlus width={14} height={14} />
            {t("settings.history.transcribeFile")}
          </Button>
        }
      />
    );
  } else if (groups.length === 0 && !hasMore) {
    content = (
      <EmptyState
        icon={SearchX}
        title={t("settings.history.noResultsTitle")}
        description={t("settings.history.noResultsDescription", {
          query: deferredQuery.trim(),
        })}
        action={
          <Button variant="secondary" onClick={() => setQuery("")}>
            {t("settings.history.clearSearch")}
          </Button>
        }
      />
    );
  } else {
    content = (
      <AudioPlayerGroup>
        <div className="flex flex-col gap-section">
          <AnimatePresence initial={false}>
            {groups.map((group) => (
              <motion.section
                key={group.key}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={softSpring}
                aria-label={group.label}
              >
                <h2 className="sticky top-3 z-10 mb-label flex">
                  <span
                    className="glass rounded-full px-2.5 py-[3px] text-section font-medium text-ink-2"
                    // Stronger fill so text scrolling beneath stays out of the way.
                    style={{ background: "var(--glass-strong)" }}
                  >
                    {group.label}
                  </span>
                </h2>
                <ul className="glass flex flex-col gap-list rounded-panel p-inline">
                  <AnimatePresence initial={false}>
                    {group.entries.map((entry) => (
                      <motion.li
                        key={entry.id}
                        layout="position"
                        initial={{ opacity: 0, height: 0, scale: 0.98 }}
                        animate={{ opacity: 1, height: "auto", scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.98 }}
                        transition={spring}
                        className="overflow-hidden"
                      >
                        <HistoryEntryRow
                          entry={entry}
                          job={jobs[entry.id]}
                          onToggleSaved={() => toggleSaved(entry.id)}
                          onCopyText={() =>
                            copyToClipboard(entry.transcription_text)
                          }
                          getAudioUrl={getAudioUrl}
                          deleteAudio={deleteAudioEntry}
                          retryTranscription={
                            commands.retryHistoryEntryTranscription
                          }
                          cancelTranscription={
                            commands.cancelHistoryEntryTranscription
                          }
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      </AudioPlayerGroup>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-section flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-title font-light">{t("settings.history.title")}</h1>
        <div className="flex items-center gap-inline">
          <SearchField value={query} onChange={setQuery} />
          <Button
            variant="secondary"
            onClick={transcribeFile}
            title={t("settings.history.transcribeFile")}
          >
            <FilePlus width={14} height={14} />
            {t("settings.history.transcribeFile")}
          </Button>
          <button
            type="button"
            onClick={openRecordingsFolder}
            title={t("settings.history.openFolder")}
            aria-label={t("settings.history.openFolder")}
            className={`grid size-control cursor-pointer place-items-center rounded-full border-[0.5px] border-glass-edge bg-glass-strong text-text shadow-card transition-[background-color,transform] duration-200 hover:bg-glass active:scale-[0.97] ${focusRing}`}
          >
            <FolderOpen width={14} height={14} />
          </button>
        </div>
      </header>

      <SkeletonReveal
        loading={loading}
        skeleton={<LoadingSkeleton label={t("settings.history.loading")} />}
      >
        {content}
      </SkeletonReveal>

      {!loading && hasMore && (
        <>
          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />
          <AnimatePresence>
            {loadingMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center gap-2 py-5 text-small text-ink-3"
                role="status"
              >
                <Spinner />
                {searching
                  ? t("settings.history.searchingOlder")
                  : t("settings.history.loadingMore")}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
