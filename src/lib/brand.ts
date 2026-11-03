import config from "../../brand.config.json";

/** Product brand, from `brand.config.json` at the repo root. Never hardcode the name. */
export const BRAND = {
  name: config.name,
  slug: config.slug,
  domain: config.domain,
  website: `https://${config.domain}`,
  supportEmail: config.supportEmail,
  company: config.company,
  githubRepo: config.githubRepo,
  tagline: config.tagline,
  apiBaseUrl: config.apiBaseUrl,
  freeWordsPerWeek: config.freeWordsPerWeek,
  /** Defaults of Free's limits; the live values come from the backend. */
  freeMeetingsPerMonth: config.freeMeetingsPerMonth,
  pricing: config.pricing,
} as const;
