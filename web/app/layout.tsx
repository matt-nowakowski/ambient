import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MotionProvider } from "@/components/motion";
import { ThemeFavicon } from "@/components/theme-favicon";
import { brand, siteUrl } from "@/lib/brand";
import { description } from "@/lib/content";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.name} · ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description,
  applicationName: brand.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: brand.name,
    locale: "en_US",
    url: "/",
    title: `${brand.name} · ${brand.tagline}`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} · ${brand.tagline}`,
    description,
  },
  icons: {
    // rel="icon" links come from <ThemeFavicon />, which picks by theme and motion.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { title: brand.name, capable: true, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <ThemeFavicon />
        <div className="ambient-backdrop" aria-hidden="true" />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-inverse focus:px-4 focus:py-2 focus:text-sm focus:text-inverse-fg"
        >
          Skip to content
        </a>
        <MotionProvider>
          <SiteHeader />
          <main id="main" className="flex-1 pt-20 sm:pt-24">
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
