import React from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";

const SHARED = ["suggestions", "requests", "errors", "basics"] as const;

/** The short list behind "What's shared": what the usage counts contain,
 * and what they never do. Used on All set and in Privacy. */
export const WhatsShared: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  const { t } = useTranslation();
  return (
    <div className={`text-small text-ink-2 ${className}`}>
      <p className="font-medium text-text">{t("telemetry.sharedTitle")}</p>
      <ul className="mt-1.5 space-y-1">
        {SHARED.map((k) => (
          <li key={k} className="flex items-start gap-2">
            <Check
              width={13}
              height={13}
              className="mt-[3px] shrink-0 text-ink-3"
              aria-hidden="true"
            />
            {t(`telemetry.shared.${k}`)}
          </li>
        ))}
        <li className="flex items-start gap-2">
          <X
            width={13}
            height={13}
            className="mt-[3px] shrink-0 text-ink-3"
            aria-hidden="true"
          />
          {t("telemetry.never")}
        </li>
      </ul>
      <p className="mt-1.5 text-meta text-ink-3">{t("telemetry.ledger")}</p>
    </div>
  );
};
