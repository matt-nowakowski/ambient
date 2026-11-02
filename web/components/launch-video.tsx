import type { LaunchVideo as Video } from "@/lib/content";
import { VideoPlayer } from "./video-player";

type Source = { kind: "iframe"; src: string } | { kind: "file"; src: string };

/** Turns a YouTube, Vimeo, Mux or file URL into something embeddable. */
export function videoSource(url: string): Source | null {
  let u: URL;
  try {
    u = new URL(url, "https://example.invalid");
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return { kind: "file", src: url };
  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? path.slice(1)
        : (u.searchParams.get("v") ?? path.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? "");
    return id ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` } : null;
  }
  if (host.endsWith("vimeo.com")) {
    const id = path.match(/(\d+)/)?.[1];
    return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}?dnt=1&title=0&byline=0&portrait=0` } : null;
  }
  if (host === "stream.mux.com" || host === "player.mux.com") {
    const id = path.slice(1).replace(/\.m3u8$/, "").split("/")[0];
    return id ? { kind: "iframe", src: `https://player.mux.com/${id}` } : null;
  }
  return null;
}

/**
 * The launch video. Self-hosted files play in the site's own player (see
 * video-player.tsx); YouTube, Vimeo and Mux URLs fall back to their embed in
 * the same glass frame. Renders nothing without a usable URL, so the page has
 * no gap. Never autoplays and loads nothing until it is near the viewport.
 */
export function LaunchVideo({ video, className = "" }: { video: Video | null; className?: string }) {
  const source = video ? videoSource(video.horizontal.url) : null;
  if (!video || !source) return null;
  if (source.kind === "file") return <VideoPlayer video={video} className={className} />;
  return (
    <div className={`glass rounded-[26px] p-1.5 sm:p-2 ${className}`}>
      <div className="relative aspect-video overflow-hidden rounded-[20px] bg-background">
        <iframe
          src={source.src}
          title={video.title}
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      </div>
    </div>
  );
}
