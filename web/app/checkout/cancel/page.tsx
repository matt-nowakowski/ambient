import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { ButtonLink, Container } from "@/components/ui";
import { brand, mailto } from "@/lib/brand";

export const metadata: Metadata = pageMetadata({ title: "Checkout canceled", description: "No charge was made.", path: "/checkout/cancel", noindex: true });

export default function CancelPage() {
  return (
    <Container className="py-24 sm:py-32">
      <div className="glass mx-auto max-w-md rounded-[24px] px-6 py-12 text-center">
        <h1 className="text-[32px] font-light tracking-[-0.04em]">Checkout canceled</h1>
        <p className="mt-4 text-[14px] text-muted">
          No charge was made. You can keep using {brand.name} Free, or pick up where you left off any time.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/pricing">Back to pricing</ButtonLink>
          <ButtonLink href="/download" variant="glass">
            Download {brand.name}
          </ButtonLink>
        </div>
        <p className="mt-8 text-[13px] text-subtle">
          Something go wrong?{" "}
          <a href={mailto("Checkout help")} className="text-foreground underline underline-offset-4">
            {brand.supportEmail}
          </a>
        </p>
      </div>
    </Container>
  );
}
