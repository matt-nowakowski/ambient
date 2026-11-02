import React from "react";
import { useTranslation } from "react-i18next";
import { isPaid, trialDaysLeft, usePlan } from "./usePlan";

/** Sidebar footer: plan name, and the weekly allowance on Free. */
export const PlanBadge: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t, i18n } = useTranslation();
  const { status } = usePlan();
  if (!status) return null;
  const days = trialDaysLeft(status);

  const limit = status.weekly_word_limit;
  const used = Math.min(status.words_this_week, limit ?? Infinity);
  const fmt = new Intl.NumberFormat(i18n.language);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-card glass p-3 text-start transition-[transform,background-color] duration-200 hover:bg-glass-strong active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/25"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-small font-medium">
          {t(`account.plans.${status.plan}`)}
        </span>
        {days !== null ? (
          <span className="text-meta text-ink-2">
            {t("account.trial.daysLeft", { count: days })}
          </span>
        ) : (
          !isPaid(status) && (
            <span className="text-meta font-medium text-ink-2">
              {t("account.upgrade")}
            </span>
          )
        )}
      </div>
      {limit !== null && (
        <>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-glass-press">
            <div
              className={`h-full rounded-full ${used >= limit ? "bg-error" : "bg-logo-primary"}`}
              style={{ width: `${(used / limit) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-meta leading-none text-ink-3 tabular-nums">
            {t("account.usageShort", {
              used: fmt.format(used),
              limit: fmt.format(limit),
            })}
          </p>
        </>
      )}
    </button>
  );
};
