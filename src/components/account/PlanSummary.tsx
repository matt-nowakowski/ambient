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

/** Plan and AI polish at a glance (Home): Free shows the weekly allowance,
 * the trial its days left, Pro that polish is unlimited. */
export const PlanSummary: React.FC<{ onOpenAccount: () => void }> = ({
  onOpenAccount,
}) => {
  const { t, i18n } = useTranslation();
  const { status } = usePlan();
  const usage = usePolishUsage(status);
  const [today, setToday] = useState<UsageToday | null>(null);
  useEffect(() => {
    commands.getUsageToday().then(setToday);
  }, [status]);
  if (!status) return null;

  const paid = isPaid(status);
  const days = trialDaysLeft(status);
  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
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
            ? today
              ? t("home.plan.usageToday", {
                  ai: today.ai,
                  search: today.search,
                  aiLimit: today.ai_limit,
                })
              : t("home.plan.polishUnlimited")
            : usage
              ? t("home.plan.polishLeft", {
                  left,
                  limit: usage.limit,
                  day: resets,
                })
              : t("home.plan.polishFree")}
        </p>
        {today?.meetings_limit != null && (
          <p className="mt-0.5 text-small text-ink-2">
            {t("home.plan.meetingsLeft", {
              used: today.meetings,
              limit: today.meetings_limit,
            })}
          </p>
        )}
        {!paid && usage && (
          <div className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-glass-press">
            <div
              className={`h-full rounded-full ${left === 0 ? "bg-error" : "bg-logo-primary"}`}
              style={{ width: `${(usage.used / usage.limit) * 100}%` }}
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
