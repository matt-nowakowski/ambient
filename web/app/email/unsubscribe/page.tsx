import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, Container, buttonClass } from "@/components/ui";
import { brand } from "@/lib/brand";
import { unsubscribeFromToken } from "@/lib/email/subscriptions";
import { verifyToken } from "@/lib/email/tokens";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Unsubscribe", description: "Stop email updates.", path: "/email/unsubscribe", noindex: true });

/**
 * The footer "Unsubscribe" link. One button press (POST), so link scanners
 * can't unsubscribe anyone. Mail apps' own unsubscribe button uses the
 * one-click endpoint instead (/api/email/unsubscribe).
 * Only marketing stops: license and billing emails still arrive.
 */
async function unsubscribe(formData: FormData) {
  "use server";
  const ok = await unsubscribeFromToken(formData.get("t"));
  redirect(ok ? "/email/unsubscribe?done=1" : "/email/unsubscribe?error=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string; error?: string }> }) {
  const { t, done, error } = await searchParams;
  const valid = Boolean(t && verifyToken(t, "unsub"));

  const [title, body] = done
    ? ["You’re unsubscribed.", `No more updates from ${brand.name}. Emails about your license or billing still arrive, because you need them.`]
    : error || !valid
      ? ["That link didn’t work.", `Reply to any of our emails or write to ${brand.supportEmail} and we’ll take you off by hand.`]
      : ["Unsubscribe from updates?", `You’ll stop getting ${brand.name} updates. Emails about your license or billing still arrive.`];

  return (
    <Container className="page-balanced py-10">
      <div className="glass mx-auto max-w-md rounded-[24px] px-6 py-12 text-center">
        <h1 className="text-[30px] font-light tracking-[-0.04em]">{title}</h1>
        <p className="mt-4 text-[14px] text-muted">{body}</p>
        <div className="mt-8 flex justify-center">
          {!done && valid && !error ? (
            <form action={unsubscribe}>
              <input type="hidden" name="t" value={t} />
              <button type="submit" className={buttonClass("primary", "md")}>Unsubscribe</button>
            </form>
          ) : (
            <ButtonLink href="/" variant="glass">Back to {brand.name}</ButtonLink>
          )}
        </div>
      </div>
    </Container>
  );
}
