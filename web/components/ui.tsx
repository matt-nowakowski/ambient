import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "glass" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.005em] transition-[transform,background-color,opacity,box-shadow] duration-200 ease-spring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "bg-inverse text-inverse-fg shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_16px_-8px_rgba(0,0,0,0.35)] hover:opacity-90",
  glass: "glass text-foreground hover:bg-glass-strong",
  ghost: "text-muted hover:text-foreground",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[12px]",
  md: "h-10 px-5 text-[13px]",
  lg: "h-11 px-6 text-[13px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1080px] px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  id,
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={`max-w-xl ${className}`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id}
        className="mt-4 text-balance text-[30px] font-light leading-[1.1] tracking-[-0.035em] sm:text-[40px]"
      >
        {title}
      </h2>
      {sub ? <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}

export function Check({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Dash({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function Arrow({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3 8h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="glass inline-flex h-6 items-center rounded-[7px] px-1.5 text-[11.5px] text-foreground">
      {children}
    </kbd>
  );
}
