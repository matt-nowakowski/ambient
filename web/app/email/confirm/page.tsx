import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, Container, buttonClass } from "@/components/ui";
import { brand } from "@/lib/brand";
import { confirmFromToken } from "@/lib/email/subscriptions";
import { verifyToken } from "@/lib/email/tokens";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Confirm your email", description: "Confirm email updates.", path: "/email/confirm", noindex: true });

/**
 * The double opt-in link lands here. Confirming takes a button press (a POST
 * via a server action), not the GET itself, so mail scanners that prefetch
 * links can't confirm on someone's behalf.
 */
async function confirm(formData: FormData) {
  "use server";
  const ok = await confirmFromToken(formData.get("t"));
  redirect(ok ? "/email/confirm?done=1" : "/email/confirm?error=1");
}

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string; error?: string }> }) {
  const { t, done, error } = await searchParams;
  const valid = Boolean(t && verifyToken(t, "confirm"));

  const [title, body] = done
    ? ["You’re in.", `At most one email a month: one thing worth trying in ${brand.name}, and what’s new. Every one has a one-click unsubscribe.`]
    : error || !valid
      ? ["That link didn’t work.", "It may have expired (links last 7 days). Sign up again and we’ll send a fresh one."]
      : ["One click to confirm.", `Confirm and you’ll get ${brand.name} updates, at most once a month.`];

  return (
    <Container className="page-balanced py-10">
      <div className="glass mx-auto max-w-md rounded-[24px] px-6 py-12 text-center">
        <h1 className="text-[30px] font-light tracking-[-0.04em]">{title}</h1>
        <p className="mt-4 text-[14px] text-muted">{body}</p>
        <div className="mt-8 flex justify-center">
          {!done && valid && !error ? (
            <form action={confirm}>
              <input type="hidden" name="t" value={t} />
              <button type="submit" className={buttonClass("primary", "md")}>Confirm my email</button>
            </form>
          ) : (
            <ButtonLink href="/" variant="glass">Back to {brand.name}</ButtonLink>
          )}
        </div>
      </div>
    </Container>
  );
}
