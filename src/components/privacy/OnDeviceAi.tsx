import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
import {
  commands,
  type AgentSettings,
  type OnDeviceAiStatus,
  type OnDeviceModel,
} from "@/bindings";
import { showError } from "@/lib/errors";
import { formatModelSize } from "@/lib/utils/format";
import { useModelStore } from "@/stores/modelStore";
import { Button } from "../ui/Button";
import { Radio } from "../ui/Radio";

/** Download id of on-device AI (`ON_DEVICE_AI_ID` in Rust). */
export const ON_DEVICE_AI_ID = "on-device-ai";

const ENGINES: OnDeviceModel[] = ["apple", "downloaded"];

/** "Download on-device AI": a small model run on this computer, offered
 * everywhere, and on a Mac with Apple Intelligence as an alternative to it. */
export const OnDeviceAi: React.FC<{
  status: OnDeviceAiStatus;
  settings: AgentSettings;
  save: (next: AgentSettings) => void;
  /** Re-read the statuses (after a download, cancel or removal). */
  refresh: () => Promise<void>;
}> = ({ status, settings, save, refresh }) => {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const progress = useModelStore(
    (state) => state.downloadProgress[ON_DEVICE_AI_ID],
  );

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
  const downloading = starting || progress !== undefined;

  const download = async () => {
    setStarting(true);
    try {
      // Failure toasts from the model store's download-failed listener.
      await commands.downloadOnDeviceAi();
    } finally {
      setStarting(false);
    }
    await refresh();
  };

  const cancel = () => {
    setStarting(false);
    useModelStore.getState().cancelDownload(ON_DEVICE_AI_ID);
  };

  const remove = async () => {
    const r = await commands.deleteOnDeviceAi();
    if (r.status === "error") showError("settings", r.error);
    await refresh();
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
        {status.downloaded ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={remove}
          >
            <Trash2 width={12} height={12} aria-hidden="true" />
            {t("privacy.onDeviceAi.remove")}
          </Button>
        ) : downloading ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={cancel}
          >
            {t("privacy.onDeviceAi.cancel")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={download}
          >
            <Download width={12} height={12} aria-hidden="true" />
            {t("privacy.onDeviceAi.downloadButton")}
          </Button>
        )}
      </div>
      {downloading && !status.downloaded && (
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
            {t("privacy.onDeviceAi.downloading", {
              percent: Math.round(progress?.percentage ?? 0),
            })}
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
