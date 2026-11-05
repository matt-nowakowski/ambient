import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/chrome";
import { DeleteUpload, UploadForm, CopyText } from "@/components/marketing/client";
import { MarketingSuite, SECTIONS, bytes, toPublicUpload } from "@/components/marketing/suite";
import { requireAdmin } from "@/lib/admin/guard";
import { siteUrl } from "@/lib/brand";
import { KIT_MIN_TOKEN_LENGTH, kitUrl } from "@/lib/marketing/kit";
import { prefixUsage, r2Configured } from "@/lib/marketing/r2";
import { BUDGET_BYTES, KINDS, MAX_FILE_BYTES, ORIENTATIONS, PREFIX, listUploads } from "@/lib/marketing/uploads";
import { completeMarketingUpload, deleteMarketingUpload, startMarketingUpload } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing", robots: { index: false, follow: false, nocache: true } };

/** The bucket's overall cap (the release workflow's BUDGET_BYTES). */
const BUCKET_CAP_BYTES = 6_000_000_000;

/** What the founder applies once in Cloudflare → R2 → ambient-builds → Settings → CORS policy. */
const corsPolicy = JSON.stringify(
  [
    {
      AllowedOrigins: [siteUrl, "http://localhost:3000"],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["content-type"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
  null,
  2,
);

/** No sample-data mode: everything here is either fixed brand material or the real uploads. */
export default async function MarketingPage() {
  const email = await requireAdmin();
  const [state, r2] = await Promise.all([
    listUploads(),
    // One ListObjectsV2 (a Class A op) per view: R2's own count, to catch drift from the table.
    r2Configured() ? prefixUsage(PREFIX).catch(() => null) : Promise.resolve(null),
  ]);
  const share = kitUrl();
  const used = state.ok ? state.usedBytes : 0;
  const pct = Math.min(100, (used / BUDGET_BYTES) * 100);

  return (
    <div data-admin-root className="admin px-3 py-3 sm:px-4 sm:py-4">
      <div className="admin-window glass mx-auto max-w-[1360px] px-5 pb-10 pt-4 sm:px-8">
        <AdminHeader email={email} demo={false} title="Marketing" meta="Media kit, brand assets, creator uploads" tab="marketing" refreshTitle="Reload">
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
              <div className="admin-section-title">Creator storage</div>
              <div className="admin-meta">
                {bytes(used)} of {bytes(BUDGET_BYTES)}
              </div>
            </div>
            <div className="admin-meter mt-3" data-level={pct >= 90 ? "over" : pct >= 70 ? "approaching" : undefined}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-[var(--a-ink-3)]">
              R2 bucket {process.env.R2_BUCKET || "ambient-builds"}, under {PREFIX}. Up to {bytes(MAX_FILE_BYTES)} a file. The bucket is capped at {bytes(BUCKET_CAP_BYTES)} in all, shared
              with releases, models and the launch video, so this budget keeps room for the next release.
              {r2 ? ` R2 reports ${bytes(r2.bytes)} in ${r2.objects} object${r2.objects === 1 ? "" : "s"} under ${PREFIX}.` : ""}
            </p>
          </div>
        </div>

        <div className="mt-10">
          <MarketingSuite
            uploads={state.ok ? state.uploads.map(toPublicUpload) : []}
            uploadsNote={
              state.ok ? undefined : (
                <div className="admin-panel px-4 py-5 text-[12.5px] text-[var(--a-ink-2)]">
                  {state.missingEnv?.length
                    ? `Uploads are off until ${state.missingEnv.join(", ")} ${state.missingEnv.length === 1 ? "is" : "are"} set in Vercel.`
                    : `Couldn't read uploads: ${state.reason}.`}
                </div>
              )
            }
            adminUgc={
              state.ok ? (
                <>
                  <UploadForm
                    start={startMarketingUpload}
                    done={completeMarketingUpload}
                    maxBytes={MAX_FILE_BYTES}
                    remainingBytes={Math.max(0, BUDGET_BYTES - used)}
                    kinds={KINDS}
                    orientations={ORIENTATIONS}
                  />
                  <details className="mt-2 text-[12px] text-[var(--a-ink-3)]">
                    <summary className="underline underline-offset-2">Uploads blocked? The bucket needs this CORS policy</summary>
                    <p className="mt-2">Cloudflare → R2 → {process.env.R2_BUCKET || "ambient-builds"} → Settings → CORS policy → Edit, paste:</p>
                    <pre className="mt-2 overflow-x-auto rounded-[9px] bg-[var(--a-wash)] p-3 text-[11.5px] leading-[1.5]">{corsPolicy}</pre>
                    <div className="mt-2">
                      <CopyText value={corsPolicy} label="Copy policy" />
                    </div>
                  </details>
                </>
              ) : undefined
            }
            renderDelete={(u) => <DeleteUpload id={u.id} title={u.title} remove={deleteMarketingUpload} />}
          />
        </div>
      </div>
    </div>
  );
}
