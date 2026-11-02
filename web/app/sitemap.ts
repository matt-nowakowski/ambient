import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/brand";
import { publicPages } from "@/lib/routes";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map((p) => ({
    url: `${siteUrl}${p.path === "/" ? "" : p.path}`,
    changeFrequency: p.priority >= 0.9 ? "weekly" : "monthly",
    priority: p.priority,
  }));
}
