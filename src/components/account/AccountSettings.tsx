import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { showError } from "@/lib/errors";
import { Check } from "lucide-react";
import { commands } from "@/bindings";
import { Button } from "../ui/Button";
import { Stagger, StaggerItem } from "../ui/Motion";
import { AccountCard } from "./AccountCard";
import { AiPolishCard } from "./AiPolishCard";
import { BillingCard } from "./BillingCard";
import { WritingCard } from "./WritingCard";
import { WritingStylesCard } from "./WritingStylesCard";
import { isPaid, openUpgrade, usePlan } from "./usePlan";

const PRO_FEATURES = ["noLimits", "meetings", "memory", "priority"] as const;

export const AccountSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { status, setStatus } = usePlan();
  const [busy, setBusy] = useState(false);

  if (!status) return null;

  const fmt = new Intl.NumberFormat(i18n.language);
  const date = (secs: number) =>
    new Date(secs * 1000).toLocaleDateString(i18n.language, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  const paid = isPaid(status);
  const limit = status.weekly_word_limit;
  const used = Math.min(status.words_this_week, limit ?? Infinity);

  const manageBilling = async () => {
    setBusy(true);
    const result = await commands.billingPortalUrl();
    setBusy(false);
    if (result.status === "ok") openUrl(result.data);
    else showError("billing", result.error, { retry: manageBilling });
  };

  return (
    <Stagger className="max-w-3xl w-full mx-auto">
      <StaggerItem>
        <header className="mb-section">
          <h1 className="text-title font-light">{t("sidebar.account")}</h1>
        </header>
      </StaggerItem>
      <div className="space-y-section">
        <StaggerItem>
          <div className="glass relative overflow-hidden rounded-panel p-hero">
            {/* The glow is painted as this layer's own background rather than
              as a blurred child: WebKit composites a filtered child and lets
              it escape the card's rounded overflow clip (the top-right corner
              showed a square gradient). A background always follows the
              layer's border-radius, and the clip-path rounds it again in
              case a 3D or backdrop-filter context drops the radius. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[inherit] [clip-path:inset(0_round_var(--radius-panel))] bg-[radial-gradient(circle_190px_at_calc(100%-64px)_32px,var(--ambient-a),color-mix(in_srgb,var(--ambient-a)_35%,transparent)_45%,transparent)] rtl:bg-[radial-gradient(circle_190px_at_64px_32px,var(--ambient-a),color-mix(in_srgb,var(--ambient-a)_35%,transparent)_45%,transparent)]"
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-section font-medium text-ink-3">
                    {t("account.currentPlan")}
                  </p>
                  <h2 className="mt-1 text-display font-extralight">
                    {t(`account.plans.${status.plan}`)}
                  </h2>
                  {(status.account_email ?? status.email) && (
                    <p className="mt-1 text-small text-ink-2">
                      {status.account_email ?? status.email}
                    </p>
                  )}
                </div>
                {!paid && (
                  <Button
                    variant="primary"
                    className="shrink-0"
                    onClick={openUpgrade}
                  >
                    {t("account.upgradeTo", { plan: t("account.plans.pro") })}
                  </Button>
                )}
              </div>

              {limit !== null && (
                <div className="mt-6">
                  <div className="flex items-baseline justify-between gap-4 text-ui">
                    <span className="font-medium tabular-nums">
                      {t("account.usage", {
                        used: fmt.format(used),
                        limit: fmt.format(limit),
                      })}
                    </span>
                    <span className="shrink-0 text-meta text-ink-3">
                      {t("account.resets", {
                        date: date(status.week_resets_at),
                      })}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-glass-press">
                    <div
                      className={`h-full rounded-full transition-[width] ${used >= limit ? "bg-error" : "bg-logo-primary"}`}
                      style={{ width: `${(used / limit) * 100}%` }}
                    />
                  </div>
                  {used >= limit && (
                    <p className="mt-3 text-small text-error">
                      {t("account.limitReached")}
                    </p>
                  )}
                </div>
              )}

              {!paid && (
                <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 border-t-[0.5px] border-glass-edge pt-card">
                  {PRO_FEATURES.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-inline text-ui text-ink-2"
                    >
                      <Check
                        width={14}
                        height={14}
                        className="shrink-0 text-text"
                      />
                      {t(`account.proFeatures.${f}`)}
                    </li>
                  ))}
                </ul>
              )}

              {status.license_problem && (
                <p className="mt-4 text-small text-warning">
                  {status.license_problem}
                </p>
              )}
            </div>
          </div>
        </StaggerItem>

        <StaggerItem>
          <BillingCard
            status={status}
            onManageBilling={manageBilling}
            busy={busy}
          />
        </StaggerItem>

        <StaggerItem>
          <AiPolishCard paid={paid} />
        </StaggerItem>
        <StaggerItem>
          <WritingCard />
        </StaggerItem>
        <StaggerItem>
          <WritingStylesCard />
        </StaggerItem>

        <StaggerItem>
          <section className="space-y-label">
            <h2 className="px-hero text-section font-medium text-ink-3">
              {t("account.signIn.sectionTitle")}
            </h2>
            <AccountCard
              status={status}
              onStatus={setStatus}
              onManageBilling={manageBilling}
              billingBusy={busy}
            />
          </section>
        </StaggerItem>
      </div>
    </Stagger>
  );
};
