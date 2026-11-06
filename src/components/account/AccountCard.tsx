import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Check,
  ClipboardPaste,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  LogOut,
  Trash2,
} from "lucide-react";
import { commands, type PlanStatus } from "@/bindings";
import { BRAND } from "@/lib/brand";
import { prefersReducedMotion } from "@/lib/utils/motion";
import { Orb } from "../orb/Orb";
import { Button } from "../ui/Button";
import { TextLink } from "../ui/TextLink";
import { MoreMenu, type MoreMenuItem } from "../ui/MoreMenu";
import { SuccessCheck, TextSwap } from "../ui/Transitions";
import { spring } from "../ui/Motion";
import { openUpgrade } from "./usePlan";
import { TipsSignup } from "./TipsSignup";
import { friendlyMessage, logError } from "@/lib/errors";
import { useOsType } from "@/hooks/useOsType";
import { primaryShortcut } from "@/lib/utils/keyboard";

const BURST = 18;
const CODE_LENGTH = 6;

type Phase = "idle" | "busy" | "error" | "done";
/** What the front of the card asks for while signed out. */
type Step = "email" | "code" | "redeem";

/** A gift or support code (`red-grizzly-4320`, any case or separators). */
const looksLikeCode = (input: string) => {
  const parts = input
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (parts.length === 4 && parts[0] === BRAND.slug) parts.shift();
  return (
    parts.length === 3 &&
    /^[a-z]{2,9}$/.test(parts[0]) &&
    /^[a-z]{2,9}$/.test(parts[1]) &&
    /^\d{4}$/.test(parts[2])
  );
};

const looksLikeEmail = (input: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());

const AUTH_PREFIX = "auth_error:";
const AUTH_ERRORS = [
  "network",
  "invalid_email",
  "rate_limited",
  "invalid_code",
  "expired",
  "too_many_attempts",
  "server",
] as const;
const REDEEM_PREFIX = "license_error:";
const REDEEM_ERRORS = [
  "network",
  "inactive",
  "rate_limited",
  "server",
] as const;

interface AccountCardProps {
  status: PlanStatus;
  onStatus: (status: PlanStatus) => void;
  onManageBilling: () => void;
  billingBusy: boolean;
}

/** The account as a physical glass card: it tilts toward the pointer, signs
 * you in on its face, and flips over to the paid card once Pro is on. */
export const AccountCard: React.FC<AccountCardProps> = ({
  status,
  onStatus,
  onManageBilling,
  billingBusy,
}) => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState("");
  const [redeem, setRedeem] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const signedIn = status.account_email !== null;
  const paid = status.plan === "pro" || status.plan === "team";
  // Keep the front face up until "Signed in" has shown, even if the backend's
  // plan-changed event lands first.
  const flipped = paid && phase !== "busy" && phase !== "done";

  // Celebrate whenever Pro turns on while this page is open: after sign-in,
  // a redeemed code, or a purchase picked up when the window regained focus.
  const wasPaid = useRef(paid);
  useEffect(() => {
    if (paid && !wasPaid.current) {
      setCelebrate(true);
      const timer = setTimeout(() => setCelebrate(false), 1600);
      wasPaid.current = paid;
      return () => clearTimeout(timer);
    }
    wasPaid.current = paid;
  }, [paid]);

  // Pointer tilt and glare.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [5, -5]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-4, 4]), spring);
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  // The turn is a motion value so each face can hide itself once it faces
  // away: backface-visibility alone is not honoured under backdrop-filter in
  // WebKit, which let the back face show through mirrored.
  const turn = useSpring(flipped ? 180 : 0, { stiffness: 120, damping: 18 });
  useEffect(() => {
    turn.set(flipped ? 180 : 0);
  }, [flipped, turn]);
  const frontVisibility = useTransform(turn, (v): string =>
    v < 90 ? "visible" : "hidden",
  );
  const backVisibility = useTransform(turn, (v): string =>
    v >= 90 ? "visible" : "hidden",
  );
  const glare = useMotionTemplate`radial-gradient(420px circle at ${glareX} ${glareY}, var(--card-glare), transparent 45%)`;

  const onPointerMove = (e: React.PointerEvent) => {
    if (prefersReducedMotion()) return;
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onPointerLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const fail = (raw: string, prefix: string, kinds: readonly string[]) => {
    setPhase("error");
    const kind = raw.startsWith(prefix) ? raw.slice(prefix.length) : null;
    if (prefix === REDEEM_PREFIX && kind === "invalid_code") {
      setError(t("account.signIn.errors.redeem_invalid"));
    } else if (kind && kinds.includes(kind)) {
      setError(
        prefix === AUTH_PREFIX
          ? t(`account.signIn.errors.${kind}`)
          : t(`account.card.errors.${kind}`),
      );
    } else {
      logError("signIn", raw);
      setError(friendlyMessage(raw, "signIn"));
    }
  };

  const go = (next: Step) => {
    setStep(next);
    setPhase("idle");
    setError(null);
    setNotice(null);
  };

  /** Busy → "done" for a beat → idle, so the success label shows before the flip. */
  const succeed = async (next: PlanStatus) => {
    setPhase("done");
    if (!prefersReducedMotion())
      await new Promise((resolve) => setTimeout(resolve, 700));
    setPhase("idle");
    setDigits("");
    setRedeem("");
    setStep("email");
    onStatus(next);
  };

  const sendCode = async (resend = false) => {
    if (!looksLikeEmail(email) || phase === "busy") return;
    setPhase("busy");
    setError(null);
    setNotice(null);
    const result = await commands.requestSignInCode(email.trim());
    if (result.status !== "ok")
      return fail(result.error, AUTH_PREFIX, AUTH_ERRORS);
    setPhase("idle");
    setDigits("");
    setStep("code");
    if (resend) setNotice(t("account.signIn.resent"));
  };

  const verify = async (code: string) => {
    if (code.length !== CODE_LENGTH || phase === "busy") return;
    setPhase("busy");
    setError(null);
    setNotice(null);
    const result = await commands.verifySignInCode(code);
    if (result.status !== "ok") {
      setDigits("");
      return fail(result.error, AUTH_PREFIX, AUTH_ERRORS);
    }
    await succeed(result.data);
  };

  const activate = async () => {
    if (!redeem.trim() || phase === "busy") return;
    setPhase("busy");
    setError(null);
    const result = await commands.activateLicense(redeem);
    if (result.status !== "ok")
      return fail(result.error, REDEEM_PREFIX, REDEEM_ERRORS);
    await succeed(result.data);
  };

  const pasteRedeem = async () => {
    try {
      setRedeem(((await readText()) ?? "").trim());
      setError(null);
    } catch {
      setError(
        t("account.card.pasteFailed", {
          keys: primaryShortcut("v", osType),
        }),
      );
    }
  };

  const signOut = async () => {
    const result = await commands.signOut();
    if (result.status === "ok") {
      go("email");
      onStatus(result.data);
    }
  };

  const remove = async () => {
    const result = await commands.deactivateLicense();
    if (result.status === "ok") onStatus(result.data);
  };

  const checkAgain = async () => {
    setPhase("busy");
    const result = await commands.refreshAccount();
    setPhase("idle");
    if (result.status === "ok") onStatus(result.data);
    else setError(t("account.signIn.errors.network"));
  };

  // The real end of the paid period: "Ends" once cancelled, else "Renews".
  // (license_expires_at runs a week past it, for grace.)
  const renewal = status.period_end
    ? new Date(status.period_end * 1000).toLocaleDateString(i18n.language, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const menuItems: MoreMenuItem[] = [
    ...(flipped
      ? [
          {
            key: "billing",
            label: t("account.manageBilling"),
            icon: <CreditCard width={14} height={14} strokeWidth={1.75} />,
            onSelect: onManageBilling,
            disabled: billingBusy,
          },
        ]
      : []),
    ...(signedIn
      ? [
          {
            key: "signout",
            label: t("account.signIn.signOut"),
            icon: <LogOut width={14} height={14} strokeWidth={1.75} />,
            onSelect: signOut,
            danger: true,
          },
        ]
      : flipped
        ? [
            {
              key: "remove",
              label: t("account.card.remove"),
              icon: <Trash2 width={14} height={14} strokeWidth={1.75} />,
              onSelect: remove,
              danger: true,
            },
          ]
        : []),
  ];

  const fieldClass = (ready: boolean) =>
    `flex h-10 items-center gap-1 rounded-full border-[0.5px] bg-glass-strong ps-4 pe-1 transition-[border-color,box-shadow] ${
      phase === "error"
        ? "border-error shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-error)_12%,transparent)]"
        : ready
          ? "border-ink-3 shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-text)_6%,transparent)]"
          : "border-glass-edge"
    }`;

  const submitLabel = (idle: string, busy: string) => (
    <TextSwap
      text={
        phase === "busy"
          ? busy
          : phase === "done"
            ? t("account.signIn.signedInShort")
            : idle
      }
    />
  );

  let title: string;
  let description: React.ReactNode;
  let body: React.ReactNode;
  let hint: React.ReactNode = null;

  if (signedIn) {
    title = t("account.signIn.signedInTitle");
    description = t("account.signIn.noPurchase", {
      email: status.account_email,
    });
    body = (
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={openUpgrade}>
          {t("account.upgradeTo", { plan: t("account.plans.pro") })}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={phase === "busy"}
          onClick={checkAgain}
        >
          {t("account.signIn.checkAgain")}
        </Button>
      </div>
    );
  } else if (step === "email") {
    title = t("account.signIn.title");
    description = t("account.signIn.description");
    body = (
      <>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          className={fieldClass(looksLikeEmail(email))}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (phase === "error") setPhase("idle");
              setError(null);
            }}
            placeholder={t("account.signIn.emailPlaceholder")}
            spellCheck={false}
            autoComplete="email"
            aria-label={t("account.signIn.emailLabel")}
            className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="h-8 px-4"
            disabled={!looksLikeEmail(email) || phase === "busy"}
          >
            {submitLabel(
              t("account.signIn.continue"),
              t("account.signIn.sending"),
            )}
          </Button>
        </form>
        {/* Optional, and separate from signing in: most Free users never
            sign in, so this is how they can ask to hear from us. */}
        <div className="mt-4 border-t-[0.5px] border-glass-edge pt-3">
          <h3 id="account-tips" className="m-0 text-ui font-medium text-text">
            {t("account.tips.label")}
          </h3>
          <TipsSignup labelledBy="account-tips" className="mt-0.5" />
        </div>
      </>
    );
  } else if (step === "code") {
    title = t("account.signIn.codeTitle");
    description = t("account.signIn.codeDescription", { email: email.trim() });
    body = (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <CodeInput
          value={digits}
          onChange={(v) => {
            setDigits(v);
            if (phase === "error") setPhase("idle");
            setError(null);
            if (v.length === CODE_LENGTH) verify(v);
          }}
          disabled={phase === "busy" || phase === "done"}
          invalid={phase === "error"}
          done={phase === "done"}
        />
        {/* Always visible: after "expired" or "too many tries" the way on is a new code. */}
        <span className="flex items-center gap-3">
          <TextLink onClick={() => sendCode(true)} disabled={phase === "busy"}>
            {t("account.signIn.resend")}
          </TextLink>
          <TextLink onClick={() => go("email")}>
            {t("account.signIn.changeEmail")}
          </TextLink>
        </span>
      </div>
    );
  } else {
    title = t("account.signIn.redeemTitle");
    description = t("account.signIn.redeemDescription");
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          activate();
        }}
        className={fieldClass(looksLikeCode(redeem))}
      >
        <input
          value={redeem}
          onChange={(e) => {
            setRedeem(e.target.value);
            if (phase === "error") setPhase("idle");
          }}
          placeholder={t("account.signIn.redeemPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          aria-label={t("account.signIn.redeemTitle")}
          className="min-w-0 flex-1 bg-transparent text-ui tracking-wide outline-none placeholder:text-ink-3"
        />
        {!redeem && (
          <button
            type="button"
            onClick={pasteRedeem}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-small text-ink-2 transition-colors hover:bg-glass-hover hover:text-text active:scale-[0.97]"
          >
            <ClipboardPaste width={13} height={13} strokeWidth={1.75} />
            {t("account.card.paste")}
          </button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="h-8 px-4"
          disabled={!redeem.trim() || phase === "busy"}
        >
          {submitLabel(
            t("account.card.activate"),
            t("account.card.activating"),
          )}
        </Button>
      </form>
    );
    if (looksLikeCode(redeem) && phase === "idle")
      hint = t("account.signIn.redeemDetected");
  }

  return (
    <div className="flex flex-col items-start gap-grid">
      <div className="relative w-full [perspective:1400px]">
        {/* A soft burst of light when the card turns over. */}
        <AnimatePresence>
          {celebrate && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20"
            >
              {Array.from({ length: BURST }, (_, i) => {
                const a = (i / BURST) * Math.PI * 2;
                const d = 150 + (i % 3) * 40;
                return (
                  <motion.span
                    key={i}
                    className={`absolute left-1/2 top-1/2 size-1.5 rounded-full ${i % 7 === 0 ? "bg-[#ef4444]" : "bg-text"}`}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                    animate={{
                      x: Math.cos(a) * d,
                      y: Math.sin(a) * d * 0.62,
                      opacity: [0, 1, 0],
                      scale: [0.4, 1, 0.6],
                    }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                );
              })}
            </div>
          )}
        </AnimatePresence>

        <motion.div
          ref={cardRef}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
          animate={phase === "error" ? { x: [0, -10, 9, -6, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="relative h-[244px] w-full"
        >
          <motion.div
            className="absolute inset-0 [transform-style:preserve-3d]"
            style={{ rotateY: turn }}
          >
            {/* Front: sign in (or a gift code). */}
            <Face glare={glare} visibility={frontVisibility}>
              <div
                className={`flex items-start justify-between ${menuItems.length > 0 ? "pe-10" : ""}`}
              >
                <Brand busy={phase === "busy"} />
                <span className="text-meta text-ink-3">
                  {t("account.signIn.cardLabel")}
                </span>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={signedIn ? "signed-in" : step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <p className="text-title font-light">{title}</p>
                    <p className="mt-1 line-clamp-2 text-small text-ink-2">
                      {description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {body}
                    <div className="min-h-4 px-4 text-meta">
                      <AnimatePresence mode="wait" initial={false}>
                        {error ? (
                          <motion.p
                            key="error"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-error"
                          >
                            {error}
                          </motion.p>
                        ) : notice || hint ? (
                          <motion.div
                            key="hint"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-3 text-ink-2"
                          >
                            {notice && <span>{notice}</span>}
                            {hint}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* A shimmer sweeps the card while the server answers. */}
              {/* Its own rounded clip: the sweep is a moving (composited)
                  layer that would otherwise slip past the face's corners. */}
              {phase === "busy" && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [clip-path:inset(0_round_var(--radius-panel))]"
                >
                  <motion.div
                    className="absolute inset-0 bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.35)_50%,transparent_65%)]"
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{
                      duration: 1.1,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              )}
            </Face>

            {/* Back: the paid card. */}
            <Face glare={glare} visibility={backVisibility} back>
              <div className="flex items-start justify-between pe-10">
                <Brand />
                <div className="flex items-center gap-2">
                  {celebrate && <SuccessCheck show className="text-text" />}
                  {status.license_code && (
                    <GiftCode code={status.license_code} />
                  )}
                </div>
              </div>
              <div>
                <p className="text-meta text-ink-3">
                  {t("account.card.active")}
                </p>
                <p className="mt-0.5 text-display font-extralight leading-none">
                  {t(`account.plans.${status.plan}`)}
                </p>
              </div>
              <div className="flex items-end justify-between gap-4 text-small">
                <div className="min-w-0">
                  <p className="text-meta text-ink-3">
                    {/* A redeemed code isn't a sign-in: label its email plainly. */}
                    {signedIn
                      ? t("account.card.holder")
                      : t("account.signIn.cardLabel")}
                  </p>
                  <p className="truncate">
                    {status.account_email ?? status.email ?? "—"}
                  </p>
                </div>
                {renewal && (
                  <div className="shrink-0 text-end">
                    <p className="text-meta text-ink-3">
                      {status.cancel_at_period_end
                        ? t("account.card.endsLabel")
                        : t("account.card.renewsLabel")}
                    </p>
                    <p className="tabular-nums">{renewal}</p>
                  </div>
                )}
              </div>
            </Face>
          </motion.div>
        </motion.div>

        {/* Account actions live in a ⋯ menu on the card. It sits over the
            card rather than inside a face, so the face's clip can't cut the
            menu off. */}
        {menuItems.length > 0 && (
          <div className="absolute end-[16px] top-[17px] z-30">
            <MoreMenu label={t("account.card.menu")} items={menuItems} />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!signedIn && !flipped && (
          <motion.div
            key="signed-out"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-hero"
          >
            <TextLink
              onClick={() => go(step === "redeem" ? "email" : "redeem")}
            >
              {step === "redeem"
                ? t("account.signIn.backToSignIn")
                : t("account.signIn.redeemLink")}
            </TextLink>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Brand: React.FC<{ busy?: boolean }> = ({ busy = false }) => (
  <div className="flex items-center gap-[2px]">
    <Orb
      variant={busy ? "S1" : "B1"}
      size={16}
      className="translate-y-[1px]"
      label={BRAND.name}
      style={{ "--orb-fg": "currentColor" } as React.CSSProperties}
    />
    <span className="text-ui font-normal tracking-[-0.04em]">{BRAND.slug}</span>
  </div>
);

/** Six boxes for the emailed code. Typing moves on, Backspace moves back,
 * and pasting anywhere fills them all. */
const CodeInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  done: boolean;
}> = ({ value, onChange, disabled, invalid, done }) => {
  const { t } = useTranslation();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!disabled)
      refs.current[Math.min(value.length, CODE_LENGTH - 1)]?.focus();
  }, [value, disabled]);

  const fill = (text: string) =>
    onChange(text.replace(/\D/g, "").slice(0, CODE_LENGTH));

  return (
    <div
      role="group"
      aria-label={t("account.signIn.codeLabel")}
      className="flex items-center gap-2"
      onPaste={(e) => {
        e.preventDefault();
        fill(e.clipboardData.getData("text"));
      }}
    >
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const filled = i < value.length;
        return (
          <motion.input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i] ?? ""}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            aria-label={t("account.signIn.digitLabel", { n: i + 1 })}
            onChange={(e) => {
              const typed = e.target.value.replace(/\D/g, "");
              if (!typed) return;
              // Several digits at once (autofill): treat it as a paste.
              if (typed.length > 1) return fill(value.slice(0, i) + typed);
              fill(value.slice(0, i) + typed + value.slice(i + 1));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                fill(value.slice(0, Math.max(0, filled ? i : i - 1)));
              } else if (e.key === "ArrowLeft") {
                refs.current[i - 1]?.focus();
              } else if (e.key === "ArrowRight") {
                refs.current[i + 1]?.focus();
              }
            }}
            animate={
              done
                ? { scale: [1, 1.08, 1], transition: { delay: i * 0.04 } }
                : { scale: 1 }
            }
            className={`h-10 w-9 rounded-xl border-[0.5px] bg-glass-strong text-center text-ui font-medium tabular-nums outline-none transition-[border-color,box-shadow] focus:border-ink-3 focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-text)_6%,transparent)] disabled:opacity-70 ${
              invalid
                ? "border-error"
                : filled
                  ? "border-ink-3"
                  : "border-glass-edge"
            }`}
          />
        );
      })}
    </div>
  );
};

/** A redeemed gift or support code, masked until revealed, with a copy button. */
const GiftCode: React.FC<{ code: string }> = ({ code }) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const masked = code.replace(/[a-z0-9]/g, "•");

  const copy = async () => {
    try {
      await writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error("Failed to copy code:", e);
    }
  };

  const iconButton =
    "flex size-6 cursor-pointer items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-glass-hover hover:text-text active:scale-[0.94]";
  const toggleLabel = shown
    ? t("account.signIn.gift.hideCode")
    : t("account.signIn.gift.showCode");
  const copyLabel = copied
    ? t("account.card.copied")
    : t("account.signIn.gift.copyCode");

  return (
    <div className="flex items-center gap-0.5">
      <span className="sr-only">{t("account.signIn.gift.code")}</span>
      <span
        className="me-1 select-text text-meta tabular-nums tracking-wide text-ink-2"
        aria-label={shown ? code : t("account.signIn.gift.codeHidden")}
      >
        {shown ? code : masked}
      </span>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className={iconButton}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {shown ? (
          <EyeOff width={13} height={13} strokeWidth={1.75} />
        ) : (
          <Eye width={13} height={13} strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        onClick={copy}
        className={iconButton}
        aria-label={copyLabel}
        title={copyLabel}
      >
        {copied ? (
          <Check width={13} height={13} strokeWidth={1.75} />
        ) : (
          <Copy width={13} height={13} strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
};

/** One face of the card: frosted, iridescent foil, glare, rim. */
const Face: React.FC<{
  glare: ReturnType<typeof useMotionTemplate>;
  visibility: MotionValue<string>;
  back?: boolean;
  children: React.ReactNode;
}> = ({ glare, visibility, back = false, children }) => (
  <motion.div
    className="glass-strong absolute inset-0 flex flex-col justify-between overflow-hidden rounded-panel p-hero [-webkit-backface-visibility:hidden] [backface-visibility:hidden]"
    style={{ visibility, ...(back ? { rotateY: 180 } : {}) }}
  >
    {/* The foil and glare get their own clip with the card's radius: inside
        a 3D context WebKit ignores a parent's rounded overflow clip for
        composited children, so the square gradient poked out at the
        corners. A plain rectangular mask doesn't round anything, so the
        layer is clipped with a rounded clip-path instead, and every layer
        inside carries the radius itself. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [clip-path:inset(0_round_var(--radius-panel))]"
    >
      {/* Iridescent foil, very faint: the only colour in the UI besides "live". */}
      <div className="card-foil absolute inset-0 rounded-[inherit]" />
      <motion.div
        className="absolute inset-0 rounded-[inherit]"
        style={{ background: glare }}
      />
    </div>
    <div className="relative flex h-full flex-col justify-between">
      {children}
    </div>
  </motion.div>
);
