import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { friendlyMessage, logError } from "@/lib/errors";
import { SettingContainer } from "../ui/SettingContainer";
import { PathDisplay } from "../ui/PathDisplay";

interface AppDataDirectoryProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const AppDataDirectory: React.FC<AppDataDirectoryProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const [appDirPath, setAppDirPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAppDirectory = async () => {
      try {
        const result = await commands.getAppDirPath();
        if (result.status === "ok") {
          setAppDirPath(result.data);
        } else {
          logError("settings", result.error);
          setError(friendlyMessage(result.error));
        }
      } catch (err) {
        logError("settings", err);
        setError(friendlyMessage(err));
      } finally {
        setLoading(false);
      }
    };

    loadAppDirectory();
  }, []);

  const handleOpen = async () => {
    if (!appDirPath) return;
    try {
      await commands.openAppDataDir();
    } catch (openError) {
      console.error("Failed to open app data directory:", openError);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-line rounded-chip w-1/3 mb-2"></div>
        <div className="h-8 bg-wash rounded-control"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-item-x py-item-y bg-error-wash border border-transparent rounded-card">
        <p className="text-error text-small">
          {t("errors.loadDirectory", { error })}
        </p>
      </div>
    );
  }

  return (
    <SettingContainer
      title={t("settings.about.appDataDirectory.title")}
      description={t("settings.about.appDataDirectory.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="stacked"
    >
      <PathDisplay
        path={appDirPath}
        onOpen={handleOpen}
        disabled={!appDirPath}
      />
    </SettingContainer>
  );
};
