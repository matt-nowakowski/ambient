import React from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Eye, X } from "lucide-react";
import { commands } from "@/bindings";
import { showError } from "@/lib/errors";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/Button";
import { easeOutSoft } from "../ui/Motion";

/**
 * Home, once after the upgrade that turned screen reading and suggestions on
 * for everyone: what changed, and the way to turn it off. Either button puts
 * it away for good (`agent.screen_notice`, set by the settings migration).
 */
export const ScreenNotice: React.FC<{ onOpenPrivacy: () => void }> = ({
  onOpenPrivacy,
}) => {
  const { t } = useTranslation();
  const { getSetting, refreshSettings } = useSettings();
  const agent = getSetting("agent");

  const seen = async () => {
    if (!agent) return;
    const r = await commands.setAgentSettings({
      ...agent,
      screen_notice: false,
    });
    if (r.status === "error") showError("settings", r.error);
    await refreshSettings();
  };

  return (
    <AnimatePresence initial={false}>
      {agent?.screen_notice && (
        <motion.section
          key="screen-notice"
          // A direct child of Home's column, so it takes no gap while it's
          // not there; leaving, it folds away together with its gap (16px,
          // --spacing-grid).
          initial={{ opacity: 0, height: 0, marginBottom: -16 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: -16 }}
          transition={{ duration: 0.26, ease: easeOutSoft }}
          className="overflow-hidden"
          aria-labelledby="screen-notice-title"
        >
          <div className="glass flex items-start gap-3 rounded-panel p-card">
            <span className="grid size-8 shrink-0 place-items-center rounded-card bg-glass-press">
              <Eye width={15} height={15} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p id="screen-notice-title" className="text-ui font-medium">
                {t("home.screenNotice.title")}
              </p>
              <p className="mt-1 text-small text-ink-2">
                {t("home.screenNotice.body")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={async () => {
                    await seen();
                    onOpenPrivacy();
                  }}
                >
                  {t("home.screenNotice.open")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={seen}
                >
                  {t("home.screenNotice.dismiss")}
                </Button>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("home.screenNotice.dismiss")}
              onClick={seen}
              className="shrink-0 rounded-control p-1 text-ink-3 hover:bg-glass-hover hover:text-text"
            >
              <X width={13} height={13} />
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
