import type { Metadata } from "next";
import { GiftClaim } from "@/components/gift-claim";
import { RevealLines } from "@/components/hero-copy";
import { Mark } from "@/components/logo";
import { Reveal } from "@/components/motion";
import { OrbIcon } from "@/components/orb-icon";
import { ButtonLink, Check, Container } from "@/components/ui";
import { brand } from "@/lib/brand";
import { tiers } from "@/lib/content";
import { signoff } from "@/lib/email/layout";
import { GiftLookupError, getGift, normalizeGiftCode, type GiftStatus } from "@/lib/gift";
import { pageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ from?: string | string[]; to?: string | string[] }>;
};

/** A first name from the query string: trimmed, printable, short. */
function name(raw: string | string[] | undefined): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.replace(/[\p{C}<>]/gu, "").replace(/\s+/g, " ").trim();
  return v ? v.slice(0, 40) : null;
}

const proName = `${brand.name} Pro`;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { code } = await params;
  const from = name((await searchParams).from) ?? signoff.name;
  return pageMetadata({
    title: "A gift for you",
    description: `${from} gifted you ${proName}: your desktop colleague, with no limits. On the house.`,
    path: `/gift/${encodeURIComponent(code)}`,
    noindex: true,
  });
}

type View = GiftStatus | "unavailable";

async function check(raw: string): Promise<View> {
  const code = normalizeGiftCode(raw);
  if (!code) return "invalid";
  try {
    return (await getGift(code)).status;
  } catch (err) {
    if (err instanceof GiftLookupError) return "unavailable";
    throw err;
  }
}

const problems: Record<Exclude<View, "valid">, { title: string; body: string }> = {
  invalid: {
    title: "This gift link doesn’t work.",
    body: "It may have a typo. Ask whoever sent it for a fresh link, or start with the free version.",
  },
  expired: {
    title: "This gift has expired.",
    body: "Sorry, you just missed it. Free still gets the whole colleague, and every install gets a trial of Pro.",
  },
  used_up: {
    title: "This gift has all been claimed.",
    body: "Every one of these went. Free still gets the whole colleague, and every install gets a trial of Pro.",
  },
  unavailable: {
    title: "We couldn’t open your gift.",
    body: "Something on our side didn’t answer. Try again in a minute.",
  },
};

/** What Pro gives, from the pricing card: the first three rows. */
const highlights = tiers.pro.features.slice(0, 3).map((f) => f.replace(" (fair use)", ""));

export default async function GiftPage({ params, searchParams }: Props) {
  const { code } = await params;
  const q = await searchParams;
  const view = await check(code);
  const from = name(q.from) ?? signoff.name;
  const to = name(q.to);

  if (view !== "valid") {
    const p = problems[view];
    return (
      <Container className="page-balanced py-10">
        <Reveal className="glass mx-auto flex w-full max-w-xl flex-col items-center rounded-[28px] px-6 py-16 text-center sm:py-20">
          <Mark size={48} />
          <p className="eyebrow mt-8">A gift from {from}</p>
          <h1 className="mt-4 text-balance text-[32px] font-extralight leading-[1.08] tracking-[-0.045em] sm:text-[44px]">
            {p.title}
          </h1>
          <p className="mt-5 max-w-sm text-pretty text-[15px] leading-relaxed text-muted">{p.body}</p>
          <div className="mt-9 flex w-full flex-col justify-center gap-2.5 sm:w-auto sm:flex-row">
            <ButtonLink href="/download" size="lg" className="w-full sm:w-auto">
              Download for free
            </ButtonLink>
            <ButtonLink href="/pricing" variant="glass" size="lg" className="w-full sm:w-auto">
              See {proName}
            </ButtonLink>
          </div>
        </Reveal>
      </Container>
    );
  }

  return (
    <Container className="page-balanced py-10">
      <div className="mx-auto w-full max-w-2xl text-center">
        <Reveal className="flex justify-center">
          <span className="glass inline-flex h-7 items-center gap-2 rounded-full pl-2 pr-3.5">
            <OrbIcon variant="C2" footprint={11} />
            <span className="eyebrow">{to ? `For ${to}` : "A gift for you"}</span>
          </span>
        </Reveal>
        <h1 className="mt-8 text-balance text-[44px] font-extralight leading-[1.04] tracking-[-0.05em] sm:text-[64px]">
          <RevealLines lines={[`${from} gifted you`, proName]} />
        </h1>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-md text-pretty text-[15px] leading-relaxed text-muted">
            {to ? `Hi ${to}. ` : ""}It’s on the house. Just your email, no card.
          </p>
        </Reveal>
      </div>

      <Reveal
        delay={0.3}
        className="glass-strong mx-auto mt-10 flex w-full max-w-md flex-col items-center rounded-[24px] p-6 ring-[0.5px] ring-border-strong sm:p-7"
      >
        <ul className="w-full space-y-2.5 text-left text-[13.5px]">
          {highlights.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" />
              <span className="text-muted">{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-7 w-full border-t border-border pt-6 text-center">
          <GiftClaim code={normalizeGiftCode(code) ?? ""} />
          <p className="mt-4 text-[12.5px] text-subtle">
            Then download {brand.name} and sign in with the same email.
          </p>
        </div>
      </Reveal>
    </Container>
  );
}
