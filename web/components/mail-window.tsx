import type { ReactNode } from "react";

/** A message in the thread: who, when, what. The last one is open; earlier ones fold to a line. */
export type MailMessage = { from: string; email: string; time: string; lines: ReactNode[]; signoff?: string };

const icon = "size-[15px] stroke-current";
const stroke = { fill: "none", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Archive, trash, reply, forward, and a search field: the mail toolbar. */
function Toolbar() {
  return (
    <span className="ml-auto flex items-center gap-3.5 text-subtle">
      <svg viewBox="0 0 16 16" {...stroke} className={icon}>
        <rect x="2" y="3" width="12" height="3" rx="1" />
        <path d="M3 6v6.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M6.5 9h3" />
      </svg>
      <svg viewBox="0 0 16 16" {...stroke} className={icon}>
        <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2" />
      </svg>
      <span className="h-4 w-px bg-border" />
      <svg viewBox="0 0 16 16" {...stroke} className={icon}>
        <path d="M6.5 4 2.5 8l4 4M2.5 8h7a4 4 0 0 1 4 4" />
      </svg>
      <svg viewBox="0 0 16 16" {...stroke} className={`${icon} hidden sm:block`}>
        <path d="M9.5 4l4 4-4 4M13.5 8h-7a4 4 0 0 0-4 4" />
      </svg>
      <span className="ml-1 hidden h-7 w-[132px] items-center gap-1.5 rounded-[8px] bg-foreground/[0.045] px-2 text-[11.5px] sm:flex">
        <svg viewBox="0 0 16 16" {...stroke} className="size-[12px] stroke-current">
          <circle cx="7" cy="7" r="4.25" />
          <path d="m10.2 10.2 3.3 3.3" />
        </svg>
        Search
      </span>
    </span>
  );
}

/** The sender's initials, in a soft circle. */
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-foreground/[0.10] to-foreground/[0.04] font-normal text-foreground ${
        small ? "size-6 text-[9.5px]" : "size-9 text-[12px]"
      }`}
    >
      {initials}
    </span>
  );
}

/**
 * A mail window, as a mail app shows a conversation: toolbar, subject, earlier
 * messages folded to a line, the latest open with its sender, recipient and
 * date. `children` sits over the window (the HUD bubble, the reply, the pill).
 * Illustrative mock, not a screenshot.
 */
export function MailWindow({
  subject,
  messages,
  children,
  heightClass,
  narrow = false,
}: {
  subject: string;
  messages: MailMessage[];
  children?: ReactNode;
  /** The body's fixed height, so overlays never move the layout. */
  heightClass: string;
  /** Keep the thread to the left half on wide screens, clear of a card at the top right. */
  narrow?: boolean;
}) {
  const earlier = messages.slice(0, -1);
  const open = messages[messages.length - 1];
  const width = narrow ? "sm:max-w-[50%]" : "";
  return (
    <div className="glass-strong overflow-hidden rounded-[24px]">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <span className="size-[11px] rounded-full bg-foreground/10" />
        <span className="size-[11px] rounded-full bg-foreground/10" />
        <span className="size-[11px] rounded-full bg-foreground/10" />
        <span className="ml-3 flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[12.5px] text-foreground">Inbox</span>
          <span className="truncate text-[10.5px] text-subtle">2 unread</span>
        </span>
        <Toolbar />
      </div>
      <div className={`relative px-5 py-5 text-left text-[13.5px] font-light leading-[1.6] text-muted sm:px-6 ${heightClass}`}>
        <div className={width}>
          <p className="text-[17px] font-normal tracking-[-0.015em] text-foreground">{subject}</p>

          {earlier.map((m, i) => (
            <div key={i} className="mt-3 flex items-center gap-2.5 border-b border-border pb-3">
              <Avatar name={m.from} small />
              <span className="shrink-0 text-[12.5px] text-foreground">{m.from}</span>
              <span className="min-w-0 truncate text-[12.5px] text-subtle">{m.lines.join(" ")}</span>
              <span className="ml-auto shrink-0 pl-2 text-[11px] text-subtle tabular-nums">{m.time}</span>
            </div>
          ))}

          <div className="mt-3 flex items-start gap-3">
            <Avatar name={open.from} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-normal text-foreground">{open.from}</span>
                <span className="ml-auto shrink-0 text-[11px] text-subtle tabular-nums">{open.time}</span>
              </div>
              <p className="truncate text-[11.5px] text-subtle">
                {open.email} <span className="mx-1">·</span> To: Me
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-foreground/85">
            {open.lines.map((l, j) => (
              <p key={j}>{l}</p>
            ))}
            {open.signoff ? <p className="text-muted">{open.signoff}</p> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
