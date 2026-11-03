// Brand values for the website. Do not hardcode the product name, domain,
// prices or license prefix anywhere else in web/ — import from here.
//
// Source of truth: ../../brand.config.json (repo root). `scripts/sync-brand.mjs`
// copies it to ./brand.config.json before `dev` and `build`.
import config from "./brand.config.json";

export const brand = {
  name: config.name,
  /** Lowercase wordmark text. */
  slug: config.slug,
  identifier: config.identifier,
  domain: config.domain,
  supportEmail: config.supportEmail,
  githubRepo: config.githubRepo,
  tagline: config.tagline,
  licenseKeyPrefix: config.licenseKeyPrefix,
  /** Raw 32-byte Ed25519 public key, standard base64. */
  licensePublicKey: config.licensePublicKey,
  apiBaseUrl: config.apiBaseUrl,
  freeWordsPerWeek: config.freeWordsPerWeek,
  /** False by design: free dictation is unlimited, forever. */
  enforceFreeWordLimit: config.enforceFreeWordLimit,
  /** Days of Pro on first launch, no card. */
  trialDays: config.trialDays,
  /**
   * AI uses per week on Free, after the trial: one pool for polish, answers,
   * actions, meeting summaries and on-device Apple Intelligence. The live
   * value is the remote config's `free.ai_per_week` (default equal to this).
   */
  freePolishPerWeek: config.freePolishPerWeek,
  /** Proactive suggestions per week on Free (`free.suggestions_per_week`). */
  freeSuggestionsPerWeek: config.freeSuggestionsPerWeek,
  company: config.company,
  pricing: {
    proMonthly: config.pricing.proMonthly,
    proYearlyPerMonth: config.pricing.proYearlyPerMonth,
    proYearlyTotal: config.pricing.proYearlyPerMonth * 12,
    teamYearlyPerUser: config.pricing.teamYearlyPerUser,
  },
} as const;

/** Meetings with notes per month on Free, after the trial (the remote config's `free.meetings_per_month` defaults to this). */
export const freeMeetingsPerMonth: number = config.freeMeetingsPerMonth;

/** Fair-use limits on paid plans (Pro and Team), per account per day, reset at midnight UTC. */
export const fairUse = { aiRequestsPerDay: 1500, webSearchesPerDay: 50 } as const;

/** One-line fair-use note for pricing. */
export const fairUseNote = `Pro and Team are unlimited within fair use: ${fairUse.aiRequestsPerDay.toLocaleString("en-US")} AI requests and ${fairUse.webSearchesPerDay} web searches per account per day, reset at midnight UTC.`;

/** Canonical site origin: NEXT_PUBLIC_APP_URL if set, else https://<brand domain>. */
export const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `https://${brand.domain}`;

/** Free-tier allowance, driven by brand.config.json `enforceFreeWordLimit`. */
export const freeWordsLabel = brand.enforceFreeWordLimit
  ? `${brand.freeWordsPerWeek.toLocaleString("en-US")} words/week`
  : "Unlimited, forever";

/** Longer phrasing for feature lists. */
export const freeWordsFeature = brand.enforceFreeWordLimit
  ? `${brand.freeWordsPerWeek.toLocaleString("en-US")} words per week`
  : "Unlimited dictation, forever";

/**
 * The only three addresses. hello@ is the brand `supportEmail` (general,
 * support, contact); sales@ is Team and larger plans; legal@ is privacy and
 * data requests, terms, DPAs and legal notices.
 */
export const emails = {
  hello: brand.supportEmail,
  sales: `sales@${brand.domain}`,
  legal: `legal@${brand.domain}`,
} as const;

export const mailto = (subject?: string, to: string = emails.hello) =>
  `mailto:${to}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

export const upstream = {
  name: "Handy",
  author: "CJ Pais",
  url: "https://github.com/cjpais/handy",
  license: "MIT",
} as const;

/** Renders unset `REPLACE_…` config values as a visible bracketed placeholder. */
export function placeholder(value: string, label: string) {
  return value.startsWith("REPLACE_") ? `[${label}]` : value;
}

export const company = {
  legalName: brand.company.legalName,
  jurisdiction: brand.company.jurisdiction,
  freeZoneAuthority: placeholder(brand.company.freeZoneAuthority, "Free zone authority"),
};
