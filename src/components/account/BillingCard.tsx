import React from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CreditCard, ExternalLink } from "lucide-react";
import type { PlanStatus } from "@/bindings";
import { BRAND } from "@/lib/brand";
import { Button } from "../ui/Button";
import { TextSwap } from "../ui/Transitions";

interface BillingCardProps {
  status: PlanStatus;
  onManageBilling: () => void;
  busy: boolean;
}

/** Where to change, cancel or pay for a plan, in plain sight rather than
 * only in the card's menu. Paid: opens the billing portal. Free but signed
 * in (maybe an old plan): the website's billing page, which emails a link.
 * Signed out on Free: nothing to manage. */
export const BillingCard: React.FC<BillingCardProps> = ({
  status,
  onManageBilling,
  busy,
}) => {
  const { t } = useTranslation();
  const paid = status.plan === "pro" || status.plan === "team";
  if (!paid && (status.plan !== "free" || status.account_email === null)) {
    return null;
  }

  return (
    <section data-search-row className="glass rounded-panel p-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-card bg-glass-press">
            <CreditCard width={15} height={15} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-ui font-medium">
              {paid
                ? t("account.manageBilling")
                : t("account.billing.pastTitle")}
            </h2>
            <p className="mt-0.5 max-w-md text-small text-ink-2">
              {paid
                ? t("account.billing.description")
                : t("account.billing.pastDescription")}
            </p>
          </div>
        </div>
        {paid ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={onManageBilling}
            disabled={busy}
          >
            <TextSwap
              text={
                busy ? t("account.billing.opening") : t("account.manageBilling")
              }
            />
            <ExternalLink width={12} height={12} strokeWidth={1.75} />
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => openUrl(`${BRAND.website}/billing`)}
          >
            {t("account.billing.openWeb")}
            <ExternalLink width={12} height={12} strokeWidth={1.75} />
          </Button>
        )}
      </div>
    </section>
  );
};
