import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { check } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { arch, platform } from "@tauri-apps/plugin-os";
import { useSettings } from "../../hooks/useSettings";
import { commands, events, type UpdateStatus } from "../../bindings";
import { logError, showError } from "../../lib/errors";
import {
  resolvePortableInstallerUrl,
  PORTABLE_RELEASES_URL,
} from "./portableInstaller";

interface UpdateCheckerProps {
  className?: string;
}

/**
 * The update flow itself lives in Rust (it has to keep running with this window
 * closed), so this reflects it: the phase arrives on the update-status event,
 * plus one snapshot on mount for the first paint. Clicking restarts into the
 * version Rust already downloaded and verified, or, for an install that can't
 * replace itself, opens the installer link.
 */
const UpdateChecker: React.FC<UpdateCheckerProps> = ({ className = "" }) => {
  const { t } = useTranslation();
  const [isInstalling, setIsInstalling] = useState(false);
  const [showUpToDate, setShowUpToDate] = useState(false);
  // Null until the first snapshot arrives.
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [showPortableUpdateDialog, setShowPortableUpdateDialog] =
    useState(false);
  const [portableInstallerUrl, setPortableInstallerUrl] = useState<string>(
    PORTABLE_RELEASES_URL,
  );

  const { settings, updateChecksLocked } = useSettings();
  // Forced-off by system configuration (AMBIENT_DISABLE_UPDATER) overrides the
  // stored preference without persisting it, mirroring the backend's effective
  // updater state.
  const updateChecksEnabled =
    (settings?.update_checks_enabled ?? false) && updateChecksLocked === false;

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;

    // A background check stays quiet unless a version is ready; only a check
    // the user asked for reports "up to date" or why it failed.
    const announce = (next: UpdateStatus) => {
      if (cancelled) return;
      if (!next.manual) return;
      if (next.phase === "error") {
        showError("update", next.error ?? "errors.friendly.unknown", {
          retry: () => void commands.triggerUpdateCheck(),
        });
      }
      if (next.phase === "upToDate") {
        setShowUpToDate(true);
        if (upToDateTimeoutRef.current) {
          clearTimeout(upToDateTimeoutRef.current);
        }
        upToDateTimeoutRef.current = setTimeout(() => {
          setShowUpToDate(false);
        }, 3000);
      }
    };

    const unlisten = events.updateStatus.listen((event) => {
      if (cancelled) return;
      setStatus(event.payload);
      announce(event.payload);
    });
    // The first paint. Not announced: a stale "up to date" from an earlier
    // check shouldn't pop on mount.
    commands
      .updateStatus()
      .then((snapshot) => {
        if (!cancelled) setStatus(snapshot);
      })
      .catch((error) => logError("update", error));

    return () => {
      cancelled = true;
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current);
      }
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleManualUpdateCheck = () => {
    if (!updateChecksEnabled) return;
    commands.triggerUpdateCheck().catch((error) => showError("update", error));
  };

  const installUpdate = async () => {
    setIsInstalling(true);
    // Success never returns: the app restarts itself (on Windows the installer
    // takes over). Only a refusal — recording, a meeting, an agent task — or a
    // failed install comes back.
    const result = await commands.installReadyUpdate();
    setIsInstalling(false);
    if (result.status === "error") {
      showError("update", result.error, { retry: () => void installUpdate() });
    }
  };

  // An install that can't replace itself: portable builds get the installer
  // (and keep their Data/ folder), while a .deb/.rpm belongs to the package
  // manager, so it just goes to the releases page.
  const openManualUpdate = async () => {
    if (!(await commands.isPortable())) {
      openUrl(PORTABLE_RELEASES_URL);
      return;
    }
    try {
      // Same per-endpoint limit as the Rust checker (updates.rs CHECK_TIMEOUT).
      const update = await check({ timeout: 20_000 });
      if (update) {
        setPortableInstallerUrl(
          resolvePortableInstallerUrl(update.rawJson, platform(), arch()),
        );
      }
    } catch (error) {
      logError("update", error);
    }
    setShowPortableUpdateDialog(true);
  };

  // Update status functions
  const getUpdateStatusText = () => {
    if (!updateChecksEnabled) {
      return t("footer.updateCheckingDisabled");
    }
    if (isInstalling) return t("footer.installing");
    if (status?.phase === "ready") return t("footer.restartToUpdate");
    if (status?.phase === "available") return t("footer.updateAvailableShort");
    if (status?.phase === "checking") return t("footer.checkingUpdates");
    if (status?.phase === "downloading") return t("footer.downloadingUpdate");
    if (showUpToDate) return t("footer.upToDate");
    return t("footer.checkForUpdates");
  };

  const getUpdateStatusAction = () => {
    if (!updateChecksEnabled) return undefined;
    if (isInstalling) return undefined;
    if (status?.phase === "ready") return installUpdate;
    if (status?.phase === "available") return openManualUpdate;
    if (status?.phase === "checking" || status?.phase === "downloading")
      return undefined;
    if (showUpToDate) return undefined;
    return handleManualUpdateCheck;
  };

  const isUpdateDisabled =
    !updateChecksEnabled ||
    isInstalling ||
    status?.phase === "checking" ||
    status?.phase === "downloading";
  // A version waiting for a restart, or an installer link, is the one thing
  // here worth a click.
  const isUpdateClickable =
    !isUpdateDisabled && getUpdateStatusAction() !== undefined;
  const restartReady = status?.phase === "ready";

  // When no installer could be resolved for this target the button falls back to
  // the releases index, so the dialog has to say "browse" rather than "download".
  const hasDirectInstaller = portableInstallerUrl !== PORTABLE_RELEASES_URL;

  return (
    <>
      {showPortableUpdateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-line rounded-panel p-hero max-w-md w-full mx-4 space-y-4">
            <h2 className="text-heading font-normal">
              {t("footer.portableUpdateTitle")}
            </h2>
            <p className="text-small text-ink-2">
              {hasDirectInstaller
                ? t("footer.portableUpdateMessage")
                : t("footer.portableUpdateBrowseMessage")}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-small rounded-full border border-line hover:bg-wash transition-colors"
                onClick={() => setShowPortableUpdateDialog(false)}
              >
                {t("common.close")}
              </button>
              <button
                className="px-3 py-1.5 text-small rounded-full bg-logo-primary text-on-primary hover:bg-logo-primary/85 transition-colors"
                onClick={() => {
                  openUrl(portableInstallerUrl);
                  setShowPortableUpdateDialog(false);
                }}
              >
                {hasDirectInstaller
                  ? t("footer.portableUpdateButton")
                  : t("footer.portableUpdateBrowseButton")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`flex items-center gap-3 ${className}`}>
        {isUpdateClickable ? (
          <button
            onClick={getUpdateStatusAction()}
            disabled={isUpdateDisabled}
            className={`transition-colors disabled:opacity-50 tabular-nums ${
              restartReady
                ? "text-logo-primary hover:text-logo-primary font-medium"
                : "text-ink-2 hover:text-text"
            }`}
          >
            {getUpdateStatusText()}
          </button>
        ) : (
          <span className="text-ink-2 tabular-nums">
            {getUpdateStatusText()}
          </span>
        )}
      </div>
    </>
  );
};

export default UpdateChecker;
