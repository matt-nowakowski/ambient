import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { type as osType } from "@tauri-apps/plugin-os";
import { commands } from "@/bindings";
import { AppDataDirectory } from "../AppDataDirectory";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ShowWhatsNewOnUpdate } from "../ShowWhatsNewOnUpdate";
import { ThemeSelector } from "../ThemeSelector";
import { LogDirectory } from "../debug";
import { BRAND } from "@/lib/brand";
import { openFeedback } from "../../feedback/FeedbackGate";

// Shown in-app so the notices ship with the app, as their licenses require.
import thirdPartyNotices from "../../../../THIRD_PARTY_NOTICES.md?raw";

export const AboutSettings: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [showLicenses, setShowLicenses] = useState(false);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="max-w-3xl w-full mx-auto space-y-section">
      <SettingsGroup title={t("settings.about.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <ThemeSelector descriptionMode="tooltip" grouped={true} />
        <SettingContainer
          title={t("settings.about.version.title")}
          description={t("settings.about.version.description")}
          grouped={true}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-small tabular-nums text-ink-2">v{version}</span>
        </SettingContainer>

        <ShowWhatsNewOnUpdate descriptionMode="tooltip" grouped={true} />

        <SettingContainer
          title={t("settings.about.sourceCode.title")}
          description={t("settings.about.sourceCode.description")}
          grouped={true}
        >
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl(BRAND.website)}
          >
            {t("settings.about.sourceCode.button")}
          </Button>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.feedback.title")}
          description={t("settings.about.feedback.description")}
          grouped={true}
        >
          <Button variant="secondary" size="md" onClick={() => openFeedback()}>
            {t("settings.about.feedback.button")}
          </Button>
        </SettingContainer>

        {osType() !== "linux" && (
          <SettingContainer
            title={t("settings.about.intro.title")}
            description={t("settings.about.intro.description")}
            grouped={true}
          >
            <Button
              variant="secondary"
              size="md"
              onClick={() => commands.replayIntro()}
            >
              {t("settings.about.intro.button")}
            </Button>
          </SettingContainer>
        )}

        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
        <LogDirectory grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.about.acknowledgments.title")}>
        <SettingContainer
          title={t("settings.about.acknowledgments.ggml.title")}
          description={t("settings.about.acknowledgments.ggml.description")}
          grouped={true}
          layout="stacked"
        >
          <div className="text-small text-ink-3">
            {t("settings.about.acknowledgments.ggml.details")}
          </div>
        </SettingContainer>
        <SettingContainer
          title={t("settings.about.acknowledgments.licenses.title")}
          description={t("settings.about.acknowledgments.licenses.description")}
          grouped={true}
          layout="stacked"
        >
          <button
            type="button"
            aria-expanded={showLicenses}
            onClick={() => setShowLicenses((shown) => !shown)}
            className="text-small text-ink-3 text-start underline decoration-line-strong underline-offset-2 hover:text-text cursor-pointer"
          >
            {t(
              showLicenses
                ? "settings.about.acknowledgments.licenses.hide"
                : "settings.about.acknowledgments.licenses.show",
            )}
          </button>
          {showLicenses && (
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-card bg-wash p-3 text-meta text-ink-2">
              {thirdPartyNotices}
            </pre>
          )}
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};
