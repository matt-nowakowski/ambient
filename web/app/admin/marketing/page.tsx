import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/chrome";
import { CopyText } from "@/components/marketing/client";
import { MarketingSuite, SECTIONS, bytes } from "@/components/marketing/suite";
import { requireAdmin } from "@/lib/admin/guard";
import { BUDGET_BYTES, PREFIX, creatorVideos } from "@/lib/marketing/creator";
import { KIT_MIN_TOKEN_LENGTH, kitUrl } from "@/lib/marketing/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing", robots: { index: false, follow: false, nocache: true } };

const UPLOAD_COMMAND = 'bun scripts/marketing-upload.ts <file> --title "…" --kind clip --orientation vertical';
/** Re-run after a new render: same keys, so it replaces what's there. */
const CAMPAIGN_COMMAND = "bun scripts/marketing-upload.ts --campaign video/out/campaign";

/** No sample-data mode: everything here is either fixed brand material or the real manifest. */
export default async function MarketingPage() {
  const email = await requireAdmin();
  const creator = await creatorVideos();
  const share = kitUrl();
  const updated = creator.updated ? new Date(creator.updated) : null;

  return (
    <div data-admin-root className="admin px-3 py-3 sm:px-4 sm:py-4">
      <div className="admin-window glass mx-auto max-w-[1360px] px-5 pb-10 pt-4 sm:px-8">
        <AdminHeader email={email} demo={false} title="Marketing" meta="Media kit, brand assets, creator videos" tab="marketing" refreshTitle="Reload">
          {share ? (
            <a className="admin-btn" href={share} target="_blank" rel="noreferrer">
              Open media kit
            </a>
          ) : null}
        </AdminHeader>

        <nav className="mk-nav mt-4 flex gap-1 overflow-x-auto" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="admin-btn flex-none">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="admin-panel p-4">
            <div className="admin-section-title">Share with creators</div>
            {share ? (
              <>
                <p className="mt-1 text-[12.5px] text-[var(--a-ink-2)]">
                  A read-only page with everything below except these controls. Unlisted and never indexed; anyone with the link can open it.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <input readOnly value={share} aria-label="Media kit link" className="h-8 min-w-0 flex-1 truncate rounded-[9px] border border-[var(--a-line-strong)] bg-[var(--a-panel)] px-3 text-[12.5px]" />
                  <CopyText value={share} label="Copy link" />
                </div>
                <p className="mt-2 text-[12px] text-[var(--a-ink-3)]">
                  To revoke every shared link: set a new MEDIA_KIT_TOKEN in Vercel (e.g. <code>openssl rand -base64 32 | tr -d &apos;/+=&apos;</code>) and redeploy.
                </p>
              </>
            ) : (
              <p className="mt-1 text-[12.5px] text-[var(--a-ink-2)]">
                The media kit is off. Set MEDIA_KIT_TOKEN in Vercel to a random string of at least {KIT_MIN_TOKEN_LENGTH} characters (e.g.{" "}
                <code>openssl rand -base64 32 | tr -d &apos;/+=&apos;</code>) and redeploy; the link appears here.
              </p>
            )}
          </div>

          <div className="admin-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="admin-section-title">Creator videos</div>
              <div className="admin-meta">
                {creator.videos.length}
                {creator.campaign.length ? ` + ${creator.campaign.length} campaign` : ""} · {bytes(creator.usedBytes)} of {bytes(BUDGET_BYTES)}
              </div>
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--a-ink-2)]">
              Added from your machine with the R2 key in ~/.ambient/r2-ambient.env. The site only reads {PREFIX}manifest.json, so a change shows here and in the kit within five
              minutes.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[9px] bg-[var(--a-wash)] px-3 py-1.5 text-[12px]">{UPLOAD_COMMAND}</code>
              <CopyText value={UPLOAD_COMMAND} />
            </div>
            <p className="mt-2 text-[12px] text-[var(--a-ink-3)]">
              Also <code>--list</code> and <code>--remove &lt;id&gt;</code>.
              {updated && !Number.isNaN(updated.getTime()) ? ` Manifest updated ${updated.toISOString().slice(0, 16).replace("T", " ")} UTC.` : ""}
            </p>
          </div>
        </div>

        <div className="mt-10">
          <MarketingSuite
            videos={creator.videos}
            campaign={creator.campaign}
            campaignNote={
              <div className="mt-4 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-[9px] bg-[var(--a-wash)] px-3 py-1.5 text-[12px]">{CAMPAIGN_COMMAND}</code>
                <CopyText value={CAMPAIGN_COMMAND} />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
