"use client";

import { Liquid } from "liquid-gooey";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { brand, emails, mailto } from "@/lib/brand";
import { tiers } from "@/lib/content";
import { Stagger } from "./motion";
import { OrbIcon } from "./orb-icon";
import type { OrbVariant } from "./orb/Orb";
import { Toast } from "./toast";
import { Check, buttonClass } from "./ui";

type Interval = "month" | "year";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Pricing({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const [interval, setBillingInterval] = useState<Interval>("year");
  const [toast, setToast] = useState<string | null>(null);
  const H = headingLevel;
  const p = brand.pricing;
  const savePct = Math.round((1 - p.proYearlyPerMonth / p.proMonthly) * 100);

  return (
    <div>
      <div className="flex justify-center">
        <IntervalToggle value={interval} onChange={setBillingInterval} savePct={savePct} />
      </div>

      <Stagger className="mt-10 grid gap-4 lg:grid-cols-3">
        <Tier
          H={H}
          name="Free"
          orb="G5"
          price={0}
          unit="forever"
          note={tiers.free.note}
          features={tiers.free.features}
          cta={
            <Link href="/download" className={buttonClass("glass", "md", "w-full")}>
              Download
            </Link>
          }
        />
        <Tier
          H={H}
          featured
          name="Pro"
          orb="B2"
          price={interval === "year" ? p.proYearlyPerMonth : p.proMonthly}
          unit="per month"
          note={
            interval === "year"
              ? `Billed annually ($${p.proYearlyTotal}/yr).`
              : `Billed monthly. Or $${p.proYearlyPerMonth}/mo billed annually.`
          }
          features={tiers.pro.features}
          cta={<CheckoutButton interval={interval} onError={setToast} />}
        />
        <Tier
          H={H}
          name="Team"
          orb="S2"
          price="Custom"
          unit="for 5+ people"
          note="Pricing that fits your team. Talk to us."
          features={tiers.team.features}
          cta={
            <a href={mailto(`${brand.name} for teams`, emails.sales)} className={buttonClass("glass", "md", "w-full")}>
              Contact sales
            </a>
          }
        />
      </Stagger>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

/** Monthly / annual switch: transitions.dev "tabs sliding" + a liquid-gooey "move" pill. */
function IntervalToggle({
  value,
  onChange,
  savePct,
}: {
  value: Interval;
  onChange: (v: Interval) => void;
  savePct: number;
}) {
  const refs = useRef<Record<Interval, HTMLButtonElement | null>>({ month: null, year: null });
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useIsoLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  return (
    <div className="glass rounded-full">
      <Liquid
        blur={6}
        contrast={18}
        fill="var(--toggle-pill)"
        shadow="0 1px 2px rgba(0,0,0,0.08), 0 6px 14px -6px rgba(0,0,0,0.18)"
        className="t-tabs"
        role="radiogroup"
        aria-label="Billing interval"
      >
        {pill ? (
          <Liquid.Item effect="move" move={{ springiness: 0.55, wobble: 0.45, trail: 0.5 }}>
            <div
              className="absolute left-0 top-[3px] h-[30px] rounded-full transition-[transform,width] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
            />
          </Liquid.Item>
        ) : null}
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === i}
            onClick={() => onChange(i)}
            className={`t-tab text-[13px] ${!pill && value === i ? "bg-[var(--toggle-pill)]" : ""}`}
          >
            {i === "month" ? "Monthly" : "Annual"}
            {i === "year" ? <span className="ml-1.5 text-[10.5px] text-subtle">−{savePct}%</span> : null}
          </button>
        ))}
      </Liquid>
    </div>
  );
}

/** transitions.dev "number pop-in": digits re-enter with blur when the price changes. */
function PopNumber({ value }: { value: number }) {
  const [anim, setAnim] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = requestAnimationFrame(() => setAnim(true));
    return () => {
      cancelAnimationFrame(id);
      setAnim(false);
    };
  }, [value]);
  const chars = `$${value}`.split("");
  return (
    <span key={value} className={`t-digit-group ${anim ? "is-animating" : ""}`}>
      {chars.map((c, i) => (
        <span
          key={i}
          className="t-digit"
          data-stagger={i === 0 ? undefined : String(Math.min(i, 2))}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

function Tier({
  H,
  name,
  orb,
  price,
  unit,
  note,
  features,
  cta,
  featured = false,
}: {
  H: "h2" | "h3";
  name: string;
  orb: OrbVariant;
  /** A number animates; text (e.g. "Custom") is shown as is. */
  price: number | string;
  unit: string;
  note: string;
  features: string[];
  cta: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <motion.div
      id={name.toLowerCase()}
      variants={{
        hidden: { opacity: 0, y: 14 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={`${featured ? "glass-strong ring-[0.5px] ring-border-strong" : "glass"} flex scroll-mt-28 flex-col rounded-[24px] p-6 sm:p-7`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <OrbIcon variant={orb} footprint={13} />
          <H className="text-[15px] font-normal">{name}</H>
        </div>
        {featured ? <span className="eyebrow">Most popular</span> : null}
      </div>
      <p className="mt-8 flex items-baseline gap-2">
        <span className="text-[48px] font-extralight leading-none tracking-[-0.05em] tabular-nums">
          {typeof price === "number" ? <PopNumber value={price} /> : price}
        </span>
        <span className="text-[13px] text-muted">{unit}</span>
      </p>
      <p className="mt-3 min-h-10 text-[13px] text-subtle">{note}</p>
      <div className="mt-6">{cta}</div>
      <ul className="mt-7 space-y-2.5 border-t border-border pt-6 text-[13.5px]">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-foreground/70" />
            <span className="text-muted">{f}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function CheckoutButton({ interval, onError }: { interval: Interval; onError: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The app opens /pricing?email=… when signed in, so checkout is prefilled
        // with the address it will look the purchase up by.
        body: JSON.stringify({ plan: "pro", interval, email: new URLSearchParams(window.location.search).get("email") ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      onError(
        res.status === 503
          ? `Checkout isn’t open yet. Email ${brand.supportEmail} and we’ll set you up.`
          : data.message || "Something went wrong. Please try again.",
      );
    } catch {
      onError("Network error. Check your connection and try again.");
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading}
      aria-busy={loading}
      className={buttonClass("primary", "md", "w-full")}
    >
      {loading ? "Opening checkout…" : "Start Pro"}
    </button>
  );
}
