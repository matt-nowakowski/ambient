import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
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
import { Radio } from "../ui/Radio";

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

/** "Download on-device AI": a small model run on this computer, offered
 * everywhere, and on a Mac with Apple Intelligence as an alternative to it.
 * Lists the catalog's models to choose from, each removable on its own. */
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
}> = ({ status, models, settings, save, refresh, starting, download }) => {
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
    <div className="px-row-x py-row-y">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-ui">
            {status.downloaded
              ? t("privacy.onDeviceAi.title")
              : t("privacy.onDeviceAi.download", { size })}
          </p>
          <p className="mt-0.5 max-w-lg text-small text-ink-2">
            {status.downloaded
              ? t("privacy.onDeviceAi.ready", { size })
              : status.apple_available
                ? t("privacy.onDeviceAi.descriptionMac")
                : t("privacy.onDeviceAi.description")}
          </p>
        </div>
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
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={removeAll}
          >
            <Trash2 width={12} height={12} aria-hidden="true" />
            {t("privacy.onDeviceAi.remove")}
          </Button>
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
      {downloading && (
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
      )}
      {models.length > 1 && (
        <div className="mt-3">
          <p className="text-small text-ink-2">
            {t("privacy.onDeviceAi.models")}
          </p>
          <div
            role="radiogroup"
            aria-label={t("privacy.onDeviceAi.models")}
            className="mt-1 flex flex-col"
          >
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-control hover:bg-glass-hover"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={m.selected}
                  disabled={downloading}
                  onClick={() => choose(m)}
                  className="flex min-w-0 flex-1 items-start gap-2.5 px-2 py-1.5 text-start disabled:cursor-default disabled:opacity-60"
                >
                  <Radio checked={m.selected} className="mt-px" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui">
                      {m.name}
                      <span className="text-meta tabular-nums text-ink-3">
                        {formatModelSize(m.size_mb)}
                      </span>
                      {m.recommended && (
                        <span className="rounded-full bg-glass-hover px-2 py-0.5 text-meta text-ink-2">
                          {t("privacy.onDeviceAi.recommended")}
                        </span>
                      )}
                      {m.basic && (
                        <span className="rounded-full bg-glass-hover px-2 py-0.5 text-meta text-ink-2">
                          {t("privacy.onDeviceAi.basic")}
                        </span>
                      )}
                      {m.downloading ? (
                        <span className="rounded-full bg-glass-hover px-2 py-0.5 text-meta text-ink-2">
                          {t("privacy.onDeviceAi.downloadingTag")}
                        </span>
                      ) : (
                        m.downloaded && (
                          <span className="rounded-full bg-glass-hover px-2 py-0.5 text-meta text-ink-2">
                            {t("privacy.onDeviceAi.onThisComputer")}
                          </span>
                        )
                      )}
                    </span>
                    <span className="mt-0.5 block text-small text-ink-2">
                      {description(m)}
                    </span>
                    {m.accuracy !== null && m.speed !== null && (
                      <span className="mt-1 flex items-center gap-4 text-meta text-ink-3">
                        <span className="flex items-center gap-1.5">
                          {t("privacy.onDeviceAi.quality")}
                          <SpeedBars
                            level={bars(m.accuracy, bestAccuracy)}
                            className="h-[10px]!"
                          />
                        </span>
                        <span className="flex items-center gap-1.5">
                          {t("privacy.onDeviceAi.speed")}
                          <SpeedBars
                            level={bars(m.speed, bestSpeed)}
                            className="h-[10px]!"
                          />
                        </span>
                      </span>
                    )}
                  </span>
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
                    className="mt-1 grid size-7 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-glass-press hover:text-text"
                  >
                    <Trash2 width={12} height={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-meta text-ink-3">
            {t("privacy.onDeviceAi.scoresNote")}
          </p>
        </div>
      )}
      {/* A Mac with both: which one runs on-device tasks. */}
      {status.downloaded && status.apple_available && (
        <div
          role="radiogroup"
          aria-label={t("privacy.onDeviceAi.use")}
          className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"
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
                className="flex items-center gap-2 text-small"
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
