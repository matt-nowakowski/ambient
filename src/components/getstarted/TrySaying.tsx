import React from "react";
import { useTranslation } from "react-i18next";
import { useOsType } from "@/hooks/useOsType";
import { keycapLabel } from "@/lib/utils/keyboard";
import { useSettings } from "../../hooks/useSettings";
import { Dialog } from "../ui/Dialog";

/** Example phrases per capability, with how to say them. */
const GROUPS = [
  { key: "talking", count: 3, macOnly: false },
  { key: "answer", count: 4, macOnly: false },
  { key: "act", count: 4, macOnly: false },
  { key: "recall", count: 2, macOnly: false },
  { key: "suggestions", count: 4, macOnly: true },
  { key: "meetings", count: 3, macOnly: true },
] as const;

export const TrySaying: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const os = useOsType();
  const { getSetting } = useSettings();
  const bindings = getSetting("bindings");
  const ask = keycapLabel(bindings?.ask_agent?.current_binding ?? "", os);
  const dictate = keycapLabel(bindings?.transcribe?.current_binding ?? "", os);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      closeLabel={t("trySaying.close")}
      title={t("trySaying.title")}
      description={t("trySaying.description", { ask, dictate })}
      contentClassName="max-w-[560px]"
    >
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pe-1">
        {GROUPS.filter((g) => os === "macos" || !g.macOnly).map((g) => (
          <section key={g.key}>
            <h3 className="text-section font-medium text-ink-3">
              {t(`trySaying.groups.${g.key}.title`)}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {Array.from({ length: g.count }, (_, i) => (
                <li key={i} className="text-ui leading-relaxed">
                  {t(`trySaying.groups.${g.key}.examples.${i}`, {
                    ask,
                    dictate,
                  })}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-small text-ink-3">{t("trySaying.footnote")}</p>
      </div>
    </Dialog>
  );
};
