import "server-only";
import { planFor } from "../polar";
import type { EmailAction } from "./polar-webhook";
import { addContactIfNew, sendEmail } from "./resend";
import { cancelScheduled, ended, friendsWelcome, planChanged, welcome } from "./templates";

type Meta = Parameters<typeof planFor>[0]["metadata"];

/**
 * Sends the email for one webhook decision. Idempotent per Polar event:
 * the Resend Idempotency-Key is the webhook-id, which Polar keeps the same on
 * every retry, so a retried delivery never sends twice (Resend keeps keys 24 h).
 * Logs carry the event id and category only, never the address.
 */
export async function runEmailAction(action: EmailAction, webhookId: string) {
  const idempotencyKey = `polar/${webhookId}`;
  const sub = action.sub;
  const plan = planFor({ metadata: sub.metadata as Meta }) === "team" ? "team" : "pro";

  switch (action.email) {
    case "welcome":
    case "welcome_gift":
    case "plan_changed": {
      if (!sub.currentPeriodEnd) return console.warn(`[webhook ${webhookId}] ${action.email}: no current_period_end, skipped`);
      // No key: customers sign in in the app with the email they bought with.
      const email =
        action.email === "welcome"
          ? welcome({ plan, interval: sub.interval, email: action.to, renewsAt: sub.currentPeriodEnd })
          : action.email === "welcome_gift"
            ? friendsWelcome({ plan, email: action.to })
            : planChanged({ plan, interval: sub.interval, renewsAt: sub.currentPeriodEnd });
      await sendEmail({ to: action.to, email, idempotencyKey, tags: { plan } });
      // Customers get the monthly highlight by soft opt-in (existing customer,
      // similar product, one-click opt-out in every email). Never re-opts-in.
      if (action.email !== "plan_changed") await addContactIfNew("customers", action.to, false);
      return;
    }
    case "cancel_scheduled": {
      const endsAt = sub.endsAt ?? sub.currentPeriodEnd;
      if (!endsAt) return console.warn(`[webhook ${webhookId}] cancel_scheduled: no end date, skipped`);
      await sendEmail({ to: action.to, email: cancelScheduled({ plan, endsAt }), idempotencyKey, tags: { plan } });
      return;
    }
    case "ended":
      await sendEmail({ to: action.to, email: ended({ plan }), idempotencyKey, tags: { plan } });
      return;
  }
}
