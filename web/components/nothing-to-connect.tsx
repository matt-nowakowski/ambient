import Link from "next/link";
import { nothingToConnect } from "@/lib/guide";
import { Arrow, Eyebrow } from "./ui";

/** The “Nothing to connect” card for the landing page. */
export function NothingToConnect() {
  return (
    <div className="glass rounded-[24px] p-6 sm:p-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <Eyebrow>Setup</Eyebrow>
          <h2
            id="connect-heading"
            className="mt-4 text-balance text-[30px] font-light leading-[1.1] tracking-[-0.035em] sm:text-[40px]"
          >
            {nothingToConnect.title}
          </h2>
          <p className="mt-4 text-pretty text-[17px] font-light leading-snug text-foreground">{nothingToConnect.lead}</p>
          <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted">{nothingToConnect.body}</p>
          <Link
            href="/docs/getting-started#nothing-to-connect"
            className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-foreground underline-offset-4 hover:underline"
          >
            See what you can say <Arrow />
          </Link>
        </div>
        <dl className="grid content-start gap-x-10 sm:grid-cols-2">
          {nothingToConnect.sources.map((p, i) => (
            <div
              key={p.k}
              className={`flex flex-col gap-1 py-4 ${i > 0 ? "border-t border-border" : ""} ${i === 1 ? "sm:border-t-0" : ""}`}
            >
              <dt className="text-[14px] text-foreground">{p.k}</dt>
              <dd className="text-[13.5px] leading-relaxed text-muted">{p.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
