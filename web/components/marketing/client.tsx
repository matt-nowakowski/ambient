"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { BANNER_FORMATS, HEADLINES, bannerName, bannerUrl, type HeadlineId, type LogoTheme } from "@/lib/marketing/catalog";

/** A small copy button for snippets and links. */
export function CopyText({ value, label = "Copy", className = "" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button type="button" onClick={copy} className={buttonClass("glass", "sm", `min-w-16 ${className}`)}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="mk-seg">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Every banner format for one headline and theme. Previews are the real PNGs
 * (lazy, and cached forever at the edge), so what you see is what downloads.
 */
export function BannerGallery() {
  const [headline, setHeadline] = useState<HeadlineId>("colleague");
  const [theme, setTheme] = useState<LogoTheme>("light");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Headline" value={headline} options={HEADLINES.map((h) => ({ id: h.id, label: h.text }))} onChange={setHeadline} />
        <Seg
          label="Theme"
          value={theme}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
          ]}
          onChange={setTheme}
        />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BANNER_FORMATS.map((f) => {
          const src = bannerUrl(f.id, headline, theme);
          const name = bannerName(f.id, headline, theme);
          return (
            <figure key={f.id} className="mk-card flex flex-col">
              <a href={src} target="_blank" rel="noreferrer" className="mk-preview relative block overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the exact PNG that downloads, cached at the edge */}
                <img src={src} alt={`${f.group} ${f.label}`} loading="lazy" width={f.w} height={f.h} className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] object-contain" />
              </a>
              <figcaption className="flex items-center justify-between gap-3 px-3.5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-foreground">
                    {f.group} · {f.label}
                  </div>
                  <div className="text-[12px] text-muted">
                    {f.w} × {f.h}
                  </div>
                </div>
                <a href={src} download={name} className={buttonClass("glass", "sm")}>
                  PNG
                </a>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin only: uploads
// ---------------------------------------------------------------------------

type StartFn = (input: {
  filename: string;
  size: number;
  contentType: string;
  title: string;
  notes: string;
  kind: string;
  orientation: string;
}) => Promise<{ ok: true; id: string; url: string; contentType: string } | { ok: false; error: string }>;
type DoneFn = (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;

/** Guess from the file name when the browser gives no type (some .mov, .mkv). */
function guessType(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", mkv: "video/x-matroska", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  return (ext && map[ext]) || "application/octet-stream";
}

/**
 * Picks a file, asks the server for a presigned PUT (which reserves room in
 * the budget), uploads straight to R2 with progress, then confirms.
 */
export function UploadForm({
  start,
  done,
  maxBytes,
  remainingBytes,
  kinds,
  orientations,
}: {
  start: StartFn;
  done: DoneFn;
  maxBytes: number;
  remainingBytes: number;
  kinds: readonly { id: string; label: string }[];
  orientations: readonly { id: string; label: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const busy = progress !== null;

  async function submit(form: HTMLFormElement) {
    if (!file) return;
    setError(null);
    if (file.size > maxBytes) return setError(`That file is ${mb(file.size)}; the limit is ${mb(maxBytes)}.`);
    if (file.size > remainingBytes) return setError(`That file is ${mb(file.size)}; only ${mb(remainingBytes)} is left in the budget.`);
    const data = new FormData(form);
    setProgress(0);
    const started = await start({
      filename: file.name,
      size: file.size,
      contentType: guessType(file),
      title: String(data.get("title") ?? ""),
      notes: String(data.get("notes") ?? ""),
      kind: String(data.get("kind") ?? "clip"),
      orientation: String(data.get("orientation") ?? "horizontal"),
    });
    if (!started.ok) {
      setProgress(null);
      return setError(started.error);
    }
    const put = await new Promise<{ ok: boolean; status: number }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", started.url);
      xhr.setRequestHeader("Content-Type", started.contentType);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
      xhr.onerror = () => resolve({ ok: false, status: 0 });
      xhr.send(file);
    });
    // Confirm either way: on failure the server sees no object and frees the reservation.
    const confirmed = await done(started.id);
    setProgress(null);
    if (!put.ok) {
      return setError(put.status === 0 ? "The upload was blocked. Check the R2 bucket's CORS rules (see the note below)." : `R2 refused the upload (HTTP ${put.status}).`);
    }
    if (!confirmed.ok) return setError(confirmed.error);
    form.reset();
    setFile(null);
    startTransition(() => router.refresh());
  }

  return (
    <form
      className="mk-card grid gap-3 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(e.currentTarget);
      }}
    >
      <label className="sm:col-span-2">
        <span className="mk-label">File (video or image, up to {mb(maxBytes)})</span>
        <input
          type="file"
          name="file"
          accept="video/*,image/*"
          required
          disabled={busy}
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          className="mk-field mt-1 py-1.5"
        />
      </label>
      <label>
        <span className="mk-label">Title</span>
        <input name="title" maxLength={120} placeholder={file?.name ?? "e.g. Ana's day-in-the-life cut"} disabled={busy} className="mk-field mt-1" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="mk-label">Type</span>
          <select name="kind" defaultValue="clip" disabled={busy} className="mk-field mt-1">
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mk-label">Orientation</span>
          <select name="orientation" defaultValue="horizontal" disabled={busy} className="mk-field mt-1">
            {orientations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="sm:col-span-2">
        <span className="mk-label">Notes (shown in the media kit)</span>
        <textarea name="notes" rows={2} maxLength={2000} placeholder="Credit, where it can be used, anything creators should know" disabled={busy} className="mk-field mt-1 h-auto py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={!file || busy} className={buttonClass("primary", "sm")}>
          {busy ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : "Upload"}
        </button>
        {busy ? (
          <div className="mk-meter w-48" aria-hidden>
            <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-[12.5px] text-[#dc2626] dark:text-[#f87171]">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteUpload({ id, title, remove }: { id: string; title: string; remove: (id: string) => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("ghost", "sm")}
      onClick={() => {
        if (!confirm(`Delete “${title}”? It's removed from R2 and the media kit.`)) return;
        startTransition(async () => {
          await remove(id);
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

function mb(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.max(0, Math.round(bytes / 1e6))} MB`;
}
