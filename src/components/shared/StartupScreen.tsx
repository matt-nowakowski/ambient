import React from "react";
import { useTranslation } from "react-i18next";
import { Orb } from "../orb/Orb";

/** Shown while the app checks settings, permissions and models at launch. */
export const StartupScreen: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-text">
      <Orb variant="B1" size={34} />
      <p className="text-small text-ink-3">{t("app.starting")}</p>
    </div>
  );
};
