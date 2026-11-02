import type { Metadata } from "next";
import { brand } from "./brand";

/** Per-page metadata: title, description, canonical URL, Open Graph and Twitter. OG images come from each route's opengraph-image.tsx. */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title?: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  const fullTitle = title ? `${title} · ${brand.name}` : `${brand.name} · ${brand.tagline}`;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: brand.name,
      locale: "en_US",
      url: path,
      title: fullTitle,
      description,
    },
    twitter: { card: "summary_large_image", title: fullTitle, description },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** Serialises JSON-LD safely for a <script> tag. */
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
