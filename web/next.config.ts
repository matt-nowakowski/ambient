import type { NextConfig } from "next";

// Installers, the updater feed, mirrored models and media (the launch video) live in Cloudflare R2. The
// app and site only ever link to our own domain, so the storage host can move
// without shipping a new app.
//
// Later, with a download domain (an R2 custom domain), set DOWNLOADS_ORIGIN to
// it to move off the rate-limited r2.dev URL, and add it to the updater's
// endpoints in src-tauri/tauri.conf.json.
const DOWNLOADS =
  process.env.DOWNLOADS_ORIGIN ?? "https://pub-511499d42040440b820494091787f427.r2.dev";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  // The repo root has its own lockfile (desktop app); pin the web app's root.
  turbopack: { root: __dirname },
  env: { DOWNLOADS_ORIGIN: DOWNLOADS },
  // The marketing logo and banner routes read the Geist fonts and the logo
  // SVGs from disk at request time; ship them with those functions.
  outputFileTracingIncludes: {
    "/api/brand/**": ["./node_modules/geist/dist/fonts/geist-sans/Geist-{Light,Regular}.ttf", "./public/brand/*.svg"],
  },
  async headers() {
    // The influencer media kit: unlisted, never indexed, and the token in its
    // URL never leaks to other sites through the Referer header.
    return [
      {
        source: "/kit/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/releases/:path*", destination: `${DOWNLOADS}/releases/:path*`, permanent: false },
      { source: "/models/:path*", destination: `${DOWNLOADS}/models/:path*`, permanent: false },
      { source: "/media/:path*", destination: `${DOWNLOADS}/media/:path*`, permanent: false },
    ];
  },
};

export default nextConfig;
