import { trust } from "@/lib/content";
import { LiftCard, Stagger, StaggerItem } from "./motion";
import { type OrbVariant } from "./orb/Orb";
import { OrbIcon } from "./orb-icon";

/** The strongest privacy guarantees, as a grid of cards. */
export function TrustHighlights() {
  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {trust.highlights.map((h) => (
        <LiftCard key={h.k} className="glass flex flex-col rounded-[22px] p-6">
          <div className="flex h-6 items-center">
            <OrbIcon variant={h.orb as OrbVariant} footprint={18} />
          </div>
          <h3 className="mt-8 text-[15px] font-normal tracking-[-0.01em]">{h.k}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{h.v}</p>
        </LiftCard>
      ))}
    </Stagger>
  );
}

/** The rest of the privacy promise as a two-column list of short rules. */
export function TrustList() {
  return (
    <Stagger className="glass grid rounded-[22px] px-6 py-2 sm:grid-cols-2 sm:gap-x-10 sm:px-8">
      {trust.points.map((p, i) => (
        <StaggerItem
          key={p.k}
          className={`flex flex-col gap-1 py-4 ${i > 0 ? "border-t border-border" : ""} ${i === 1 ? "sm:border-t-0" : ""}`}
        >
          <span className="text-[14px] text-foreground">{p.k}</span>
          <span className="text-[13.5px] leading-relaxed text-muted">{p.v}</span>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
