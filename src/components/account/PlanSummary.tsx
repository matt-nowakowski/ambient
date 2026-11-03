import React, { useEffect, useState } from "react";
import { commands, type UsageToday } from "@/bindings";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import {
  isPaid,
  openUpgrade,
  trialDaysLeft,
  usePlan,
  usePolishUsage,
} from "./usePlan";

/** Plan at a glance (Home): Free shows what's left of its limits (AI uses
 * and suggestions this week, meetings this month), the trial its days left,
 * Pro its daily fair use. */
export const PlanSummary: React.FC<{ onOpenAccount: () => void }> = ({
  onOpenAccount,
}) => {
  const { t, i18n } = useTranslation();
  const { status } = usePlan();
  const usage = usePolishUsage(status);
  const [today, setToday] = useState<UsageToday | null>(null);
  useEffect(() => {
    commands.getUsageToday().then(setToday);
  }, [status, usage]);
  if (!status) return null;

  const paid = isPaid(status);
  const days = trialDaysLeft(status);
  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
  const fmt = new Intl.NumberFormat(i18n.language);
  // Paid plans have a daily fair-use ceiling; show what is left of it.
  const aiLeft = paid && today ? Math.max(0, today.ai_limit - today.ai) : null;
  const searchLeft =
    paid && today && today.search_limit > 0
      ? Math.max(0, today.search_limit - today.search)
      : null;
  const meter =
    paid && today && today.ai_limit > 0 && aiLeft !== null
      ? aiLeft / today.ai_limit
      : !paid && usage && usage.limit > 0 && left !== null
        ? left / usage.limit
        : null;
  const resets = usage
    ? new Date(usage.resets_at * 1000).toLocaleDateString(i18n.language, {
        weekday: "long",
      })
    : "";

  return (
    <section className="glass flex items-center justify-between gap-4 rounded-panel p-card">
      <button
        type="button"
        onClick={onOpenAccount}
        className="min-w-0 cursor-pointer text-start"
      >
        <p className="text-section font-medium text-ink-3">
          {t("home.plan.title")}
        </p>
        <p className="mt-1 text-ui font-medium">
          {t(`account.plans.${status.plan}`)}
          {days !== null && (
            <span className="ms-2 font-normal text-ink-2">
              {t("account.trial.daysLeft", { count: days })}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-small text-ink-2">
          {paid
            ? aiLeft !== null && today
              ? t("home.plan.aiLeft", {
                  left: fmt.format(aiLeft),
                  limit: fmt.format(today.ai_limit),
                })
              : t("home.plan.polishUnlimited")
            : usage
              ? t("home.plan.aiUsesLeft", {
                  left,
                  limit: usage.limit,
                  day: resets,
                })
              : t("home.plan.polishFree")}
          {paid && searchLeft !== null && (
            <span className="text-ink-3">
              {" · "}
              {t("home.plan.searchLeft", { count: searchLeft })}
            </span>
          )}
        </p>
        {!paid && today && (
          <p className="mt-0.5 text-small text-ink-3">
            {[
              today.suggestions_limit != null &&
                t("home.plan.suggestionsLeft", {
                  left: Math.max(
                    0,
                    today.suggestions_limit - today.suggestions,
                  ),
                  limit: today.suggestions_limit,
                }),
              today.meetings_limit != null &&
                t("home.plan.meetingsLeft", {
                  left: Math.max(0, today.meetings_limit - today.meetings),
                  limit: today.meetings_limit,
                }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {/* The meter shows what is left: full at the start of the day or
            week, draining towards the limit. */}
        {meter !== null && (
          <div
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(meter * 100)}
            aria-label={t("home.plan.meterLabel")}
            className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-glass-press"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${meter <= 0.1 ? "bg-error" : "bg-logo-primary"}`}
              style={{ width: `${meter * 100}%` }}
            />
          </div>
        )}
      </button>
      {status.plan !== "pro" && status.plan !== "team" && (
        <Button variant="primary" size="sm" onClick={openUpgrade}>
          {t("account.upgradeTo", { plan: t("account.plans.pro") })}
        </Button>
      )}
    </section>
  );
};
