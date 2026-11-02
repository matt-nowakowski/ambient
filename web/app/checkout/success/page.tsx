import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { SuccessCheck } from "@/components/success-check";
import { ButtonLink, Container, Eyebrow } from "@/components/ui";
import { brand, mailto } from "@/lib/brand";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription.js";
import { findActiveSubscription, getPolar, licenseExpFor, planFor } from "@/lib/polar";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = pageMetadata({ title: "You’re Pro", description: "Sign in to the app to start using Pro.", path: "/checkout/success", noindex: true });

type Result =
  | { ok: true; email: string; plan: string; exp: number }
  | { ok: false; title: string; message: string; pending?: boolean };

async function issueLicense(checkoutId: string | undefined): Promise<Result> {
  if (!checkoutId || !/^[0-9a-f-]{32,40}$/i.test(checkoutId)) {
    return { ok: false, title: "Missing checkout", message: "This page needs a valid checkout. If you just paid, check your email for a receipt and contact us." };
  }
  const polar = getPolar();
  if (!polar) {
    return { ok: false, title: "Billing isn’t configured", message: "This deployment is missing its Polar configuration." };
  }

  let checkout: Awaited<ReturnType<typeof polar.checkouts.get>>;
  try {
    checkout = await polar.checkouts.get({ id: checkoutId });
  } catch {
    return { ok: false, title: "Checkout not found", message: "We couldn’t find that checkout." };
  }

  // "confirmed" means payment is still processing; the subscription exists once it has succeeded.
  const settingUp = { ok: false as const, pending: true, title: "Setting up your Pro", message: "Your order went through. We’re finishing your subscription, which takes a few seconds." };
  if (checkout.status === "confirmed") return settingUp;
  if (checkout.status !== "succeeded" || !checkout.customerId) {
    return { ok: false, title: "Payment not completed", message: "This checkout hasn’t been paid yet. If you were charged, contact us and we’ll sort it out." };
  }

  // Polar links the subscription to the checkout only after it's created, which
  // can trail the redirect by ~20 s, and a fully discounted ($0) checkout may
  // never get the link. Fall back to the customer's newest live subscription.
  let sub: Subscription | null = null;
  try {
    sub = checkout.subscriptionId
      ? await polar.subscriptions.get({ id: checkout.subscriptionId })
      : await findActiveSubscription(polar, checkout.customerId);
  } catch {
    sub = null;
  }
  if (!sub) {
    const ageMs = Date.now() - new Date(checkout.modifiedAt ?? checkout.createdAt).getTime();
    if (ageMs < 3 * 60_000) return settingUp;
    return { ok: false, title: "Subscription not found", message: "Your order went through, but we couldn’t find the subscription. Email us and we’ll sort it out." };
  }

  // Nothing to issue here: the app signs in with this email and picks Pro up from Polar.
  const customerEmail = checkout.customerEmail ?? sub.customer?.email ?? "";
  return { ok: true, email: customerEmail, plan: planFor(sub), exp: licenseExpFor(sub) };
}

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ checkout_id?: string | string[] }> }) {
  const { checkout_id } = await searchParams;
  const result = await issueLicense(Array.isArray(checkout_id) ? checkout_id[0] : checkout_id);

  if (!result.ok && result.pending) {
    return (
      <Container className="page-balanced py-10">
        <AutoRefresh everyMs={3000} />
        <div className="glass mx-auto max-w-md rounded-[24px] px-6 py-12 text-center" role="status">
          <span className="mx-auto block size-6 animate-spin rounded-full border-[1.5px] border-border-strong border-t-foreground motion-reduce:animate-none" aria-hidden="true" />
          <h1 className="mt-6 text-[30px] font-light tracking-[-0.04em]">{result.title}</h1>
          <p className="mt-4 text-[14px] text-muted">{result.message}</p>
        </div>
      </Container>
    );
  }

  if (!result.ok) {
    return (
      <Container className="page-balanced py-10">
        <div className="glass mx-auto max-w-md rounded-[24px] px-6 py-12 text-center">
          <h1 className="text-[30px] font-light tracking-[-0.04em]">{result.title}</h1>
          <p className="mt-4 text-[14px] text-muted">{result.message}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={mailto("Sign-in help")}>Email {brand.supportEmail}</ButtonLink>
            <ButtonLink href="/pricing" variant="glass">Back to pricing</ButtonLink>
          </div>
        </div>
      </Container>
    );
  }

  const renews = new Date((result.exp - 7 * 24 * 60 * 60) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <Container className="page-balanced py-10">
      <div className="mx-auto max-w-2xl">
        <SuccessCheck />
        <Eyebrow className="mt-8">Payment complete</Eyebrow>
        <h1 className="mt-4 text-[40px] font-extralight leading-[1.05] tracking-[-0.05em] sm:text-[52px]">
          Welcome to {brand.name} {result.plan === "team" ? "Team" : "Pro"}.
        </h1>
        <p className="mt-4 text-[15px] text-muted">
          There’s no key to copy. Sign in to the app with your email and we’ll send you a code.
        </p>

        <ol className="mt-10 space-y-4 text-[14px]">
          {[
            <>Open <strong className="font-normal text-foreground">{brand.name}</strong> and choose <strong className="font-normal text-foreground">Account</strong> in the sidebar</>,
            <>Click <strong className="font-normal text-foreground">Sign in</strong> and enter {result.email ? <strong className="font-normal text-foreground">{result.email}</strong> : "your email"}</>,
            <>Type the 6-digit code we email you. Pro turns on right away</>,
          ].map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="eyebrow leading-6 !text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-muted">{s}</span>
            </li>
          ))}
        </ol>

        <p className="mt-10 border-t border-border pt-6 text-[13px] text-subtle">
          Your subscription renews on {renews}. The app keeps your plan up to date while you’re signed in.
          Don’t have {brand.name} yet?{" "}
          <Link href="/download" className="text-foreground underline decoration-border-strong underline-offset-4">Download it</Link>.
        </p>
      </div>
    </Container>
  );
}
