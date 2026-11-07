import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Cpu, Download, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  commands,
  type AgentSettings,
  type OnDeviceAiStatus,
  type OnDeviceModel,
  type ReasoningModelInfo,
} from "@/bindings";
import { showError } from "@/lib/errors";
import { formatModelSize } from "@/lib/utils/format";
import { useModelStore } from "@/stores/modelStore";
import { SpeedBars } from "@/components/shared/SpeedBars";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Radio } from "../ui/Radio";
import { expand } from "../ui/Motion";
import { useSearch } from "../search/searchStore";
import { useModelsTab } from "../settings/models/modelsTab";

/** Download id of on-device AI (`ON_DEVICE_AI_ID` in Rust). */
export const ON_DEVICE_AI_ID = "on-device-ai";

const ENGINES: OnDeviceModel[] = ["apple", "downloaded"];

/** A catalog model id as an i18n key ("qwen3-1.7b" → "qwen3_1_7b"): dots
 * would split the key. */
export const reasoningModelKey = (id: string) => id.replace(/[.-]/g, "_");

/** A score as 1–4 bars, relative to the best of the list: the scores only
 * compare these models with each other. */
const bars = (score: number | null, best: number) =>
  score === null || best <= 0 ? 0 : Math.max(1, Math.round((score / best) * 4));

/** On-device AI is downloading: started here, or progress is arriving. */
export const useOnDeviceAiDownloading = (
  starting: boolean,
  models: ReasoningModelInfo[],
) => {
  const progress = useModelStore(
    (state) => state.downloadProgress[ON_DEVICE_AI_ID],
  );
  return {
    progress,
    downloading:
      starting || progress !== undefined || models.some((m) => m.downloading),
  };
};

/** On-device AI's status and models, and starting a download. Privacy and
 * Models › Reasoning models both read it, so the two never disagree. */
export const useOnDeviceAi = () => {
  const [status, setStatus] = useState<OnDeviceAiStatus | null>(null);
  const [models, setModels] = useState<ReasoningModelInfo[]>([]);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await commands.getOnDeviceAiStatus());
    setModels(await commands.getReasoningModels());
  }, []);

  // Download on-device AI (a model, or None for the one that would run).
  // Failure toasts come from the model store's download-failed listener.
  const download = useCallback(
    async (modelId: string | null) => {
      setStarting(true);
      try {
        const done = commands.downloadOnDeviceAi(modelId);
        // The picker shows which model is downloading as soon as it starts.
        setTimeout(refresh, 300);
        await done;
      } finally {
        setStarting(false);
      }
      await refresh();
    },
    [refresh],
  );

  return { status, models, starting, refresh, download };
};

/** Opens Models on its Reasoning models tab. */
const openReasoningModels = () => {
  useModelsTab.getState().setTab("reasoning");
  useSearch.getState().jump({ section: "models" });
};

/** "Download on-device AI": a small model run on this computer, offered
 * everywhere, and on a Mac with Apple Intelligence as an alternative to it.
 * With `list` (Models › Reasoning models), the catalog's models to choose
 * from, each removable on its own; without it (Privacy, beside the
 * Intelligence setting) a short summary that links there. */
export const OnDeviceAi: React.FC<{
  status: OnDeviceAiStatus;
  models: ReasoningModelInfo[];
  settings: AgentSettings;
  save: (next: AgentSettings) => void;
  /** Re-read the statuses (after a download, cancel or removal). */
  refresh: () => Promise<void>;
  /** A download is being started (before its first progress event). */
  starting: boolean;
  /** Download a model (None: the one that would run). */
  download: (modelId: string | null) => Promise<void>;
  /** Show the models to choose from and remove (Models), or link to them. */
  list?: boolean;
}> = ({
  status,
  models,
  settings,
  save,
  refresh,
  starting,
  download,
  list = true,
}) => {
  const { t, i18n } = useTranslation();
  const { progress, downloading } = useOnDeviceAiDownloading(starting, models);

  useEffect(() => {
    const done = listen<string>("model-download-complete", (e) => {
      if (e.payload === ON_DEVICE_AI_ID) refresh();
    });
    return () => {
      done.then((stop) => stop());
    };
  }, [refresh]);

  if (!status.supported) return null;
  const size = formatModelSize(status.size_mb);
  const pending = models.find((m) => m.downloading);
  const bestAccuracy = Math.max(0, ...models.map((m) => m.accuracy ?? 0));
  const bestSpeed = Math.max(0, ...models.map((m) => m.speed ?? 0));

  const cancel = () => {
    useModelStore.getState().cancelDownload(ON_DEVICE_AI_ID);
  };

  const removeAll = async () => {
    const r = await commands.deleteOnDeviceAi();
    if (r.status === "error") showError("settings", r.error);
    await refresh();
  };

  const removeOne = async (model: ReasoningModelInfo) => {
    const r = await commands.deleteReasoningModel(model.id);
    if (r.status === "error") showError("settings", r.error);
    await refresh();
  };

  // A downloaded model runs at once; another one downloads first and only
  // becomes the choice once it's here (cancel it and nothing changes).
  const choose = async (model: ReasoningModelInfo) => {
    if (model.selected || downloading) return;
    if (!model.downloaded) {
      await download(model.id);
      return;
    }
    const r = await commands.setReasoningModel(model.id);
    if (r.status === "error") showError("settings", r.error);
    await refresh();
  };

  const description = (m: ReasoningModelInfo) => {
    const key = `privacy.onDeviceAi.modelInfo.${reasoningModelKey(m.id)}`;
    return i18n.exists(key) ? t(key) : "";
  };

  return (
    // One line: what it is, its size, and the action; the rest is a hover away.
    <div className="px-row-x py-3.5">
      <div className="flex items-center gap-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-glass-press text-text">
          <Cpu width={14} height={14} strokeWidth={1.75} />
        </span>
        <p className="flex min-w-0 flex-1 items-center gap-2 text-ui">
          {t("privacy.onDeviceAi.title")}
          <span className="whitespace-nowrap rounded-full bg-glass-press px-2 py-0.5 text-meta tabular-nums text-ink-2">
            {status.downloaded ? t("privacy.onDeviceAi.onThisComputer") : size}
          </span>
          <InfoTooltip
            text={
              status.downloaded
                ? t("privacy.onDeviceAi.ready", { size })
                : status.apple_available
                  ? t("privacy.onDeviceAi.descriptionMac")
                  : t("privacy.onDeviceAi.description")
            }
          />
        </p>
        {!list && models.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={openReasoningModels}
          >
            {t("privacy.onDeviceAi.manage")}
          </Button>
        )}
        {downloading ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={cancel}
          >
            {t("privacy.onDeviceAi.cancel")}
          </Button>
        ) : status.downloaded ? (
          // Removing lives with the models (Models › Reasoning models).
          list && (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={removeAll}
            >
              <Trash2 width={12} height={12} aria-hidden="true" />
              {t("privacy.onDeviceAi.remove")}
            </Button>
          )
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => download(null)}
          >
            <Download width={12} height={12} aria-hidden="true" />
            {t("privacy.onDeviceAi.downloadButton")}
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {downloading && (
          <motion.div {...expand} className="overflow-hidden">
            <div className="mt-3">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress?.percentage ?? 0)}
                className="h-1 overflow-hidden rounded-full bg-glass-press"
              >
                <div
                  className="h-full rounded-full bg-background-ui transition-[width] duration-300"
                  style={{ width: `${progress?.percentage ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-meta text-ink-3">
                {pending
                  ? t("privacy.onDeviceAi.downloadingModel", {
                      model: pending.name,
                      percent: Math.round(progress?.percentage ?? 0),
                    })
                  : t("privacy.onDeviceAi.downloading", {
                      percent: Math.round(progress?.percentage ?? 0),
                    })}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {list && models.length > 1 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-meta text-ink-3">
            {t("privacy.onDeviceAi.models")}
            <InfoTooltip text={t("privacy.onDeviceAi.scoresNote")} />
          </p>
          <div
            role="radiogroup"
            aria-label={t("privacy.onDeviceAi.models")}
            className="mt-2 divide-y divide-glass-edge overflow-hidden rounded-card bg-glass-press"
          >
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 pe-2 hover:bg-glass-hover"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={m.selected}
                  disabled={downloading}
                  onClick={() => choose(m)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-item-x py-item-y text-start disabled:cursor-default disabled:opacity-60"
                >
                  <Radio checked={m.selected} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-ui">{m.name}</span>
                      <span className="text-meta tabular-nums text-ink-3">
                        {formatModelSize(m.size_mb)}
                      </span>
                      {(
                        [
                          m.recommended && {
                            kind: "recommended",
                            label: t("privacy.onDeviceAi.recommended"),
                          },
                          m.basic && {
                            kind: "basic",
                            label: t("privacy.onDeviceAi.basic"),
                          },
                          m.downloading
                            ? {
                                kind: "downloading",
                                label: t("privacy.onDeviceAi.downloadingTag"),
                              }
                            : m.downloaded && {
                                kind: "downloaded",
                                label: t("privacy.onDeviceAi.onThisComputer"),
                              },
                        ] as const
                      )
                        .filter((tag) => tag !== false)
                        .map((tag) => (
                          <span
                            key={tag.kind}
                            className="whitespace-nowrap rounded-full bg-glass-hover px-2 py-0.5 text-meta text-ink-2"
                          >
                            {tag.label}
                          </span>
                        ))}
                      {description(m) && (
                        <InfoTooltip nested text={description(m)} />
                      )}
                    </span>
                  </span>
                  {m.accuracy !== null && m.speed !== null && (
                    <span className="ms-1 grid shrink-0 grid-cols-[auto_auto] items-center gap-x-2 gap-y-1 whitespace-nowrap text-meta text-ink-3">
                      <span className="text-end">
                        {t("privacy.onDeviceAi.quality")}
                      </span>
                      <SpeedBars
                        level={bars(m.accuracy, bestAccuracy)}
                        className="h-[10px]!"
                      />
                      <span className="text-end">
                        {t("privacy.onDeviceAi.speed")}
                      </span>
                      <SpeedBars
                        level={bars(m.speed, bestSpeed)}
                        className="h-[10px]!"
                      />
                    </span>
                  )}
                </button>
                {m.downloaded && !downloading && (
                  <button
                    type="button"
                    onClick={() => removeOne(m)}
                    aria-label={t("privacy.onDeviceAi.removeModel", {
                      name: m.name,
                    })}
                    title={t("privacy.onDeviceAi.removeModel", {
                      name: m.name,
                    })}
                    className="grid size-7 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-glass-press hover:text-text"
                  >
                    <Trash2 width={12} height={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* A Mac with both: which one runs on-device tasks. */}
      {status.downloaded && status.apple_available && (
        <div
          role="radiogroup"
          aria-label={t("privacy.onDeviceAi.use")}
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <span className="text-small text-ink-2">
            {t("privacy.onDeviceAi.use")}
          </span>
          {ENGINES.map((engine) => {
            const picked = settings.on_device_model === engine;
            return (
              <button
                key={engine}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => save({ ...settings, on_device_model: engine })}
                className="flex items-center gap-inline whitespace-nowrap text-small"
              >
                <Radio checked={picked} />
                {t(`privacy.onDeviceAi.engines.${engine}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
