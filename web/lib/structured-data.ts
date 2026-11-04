import { brand, freeMeetingsPerMonth, siteUrl } from "./brand";
import { description, platforms, tiers } from "./content";
import type { FaqItem } from "./faqs";
import { RELEASE_VERSION } from "./releases";

const organization = {
  "@type": "Organization",
  name: brand.name,
  url: siteUrl,
  email: brand.supportEmail,
  logo: `${siteUrl}/icon-512.png`,
};

/** Shipped capabilities, for SoftwareApplication.featureList. */
const featureList = [
  "Live desktop agent you talk to",
  "Answers with sources",
  "Actions: reminders, calendar events, apps, links and shortcuts",
  "Recall of what you said, saw or saved",
  "Suggestions when it can help",
  "Meeting notes with no bot",
  "Smart writing: as said, polished, or written for you, in any app and language",
  "Optional on-device AI on macOS, Windows and Linux",
  "Unlimited on-device dictation in 99 languages",
  `Hands-free “Hey ${brand.name}”`,
];

const offers = [
  {
    "@type": "Offer",
    name: tiers.free.name,
    description: `${tiers.free.tagline} Unlimited dictation, ${brand.freePolishPerWeek} AI uses a week, up to ${brand.freeSuggestionsPerWeek} suggestions a week, ${freeMeetingsPerMonth} meetings a month.`,
    price: "0",
    priceCurrency: "USD",
    url: `${siteUrl}/download`,
  },
  {
    "@type": "Offer",
    name: `${tiers.pro.name} (monthly)`,
    description: `${tiers.pro.features[0]}, within fair use.`,
    price: String(tiers.pro.monthly),
    priceCurrency: "USD",
    url: `${siteUrl}/pricing`,
    priceSpecification: { "@type": "UnitPriceSpecification", price: String(tiers.pro.monthly), priceCurrency: "USD", billingDuration: "P1M" },
  },
  {
    "@type": "Offer",
    name: `${tiers.pro.name} (annual)`,
    description: `${tiers.pro.features[0]}, within fair use.`,
    price: String(tiers.pro.yearlyTotal),
    priceCurrency: "USD",
    url: `${siteUrl}/pricing`,
    priceSpecification: { "@type": "UnitPriceSpecification", price: String(tiers.pro.yearlyTotal), priceCurrency: "USD", billingDuration: "P1Y" },
  },
];

export function softwareApplicationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    description,
    url: siteUrl,
    image: `${siteUrl}/icon-512.png`,
    operatingSystem: platforms.join(", "),
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "ProductivityApplication",
    softwareVersion: RELEASE_VERSION,
    downloadUrl: `${siteUrl}/download`,
    slogan: `${brand.tagline}.`,
    featureList: featureList.join(", "),
    offers,
    publisher: organization,
  };
}

export function productLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: brand.name,
    description,
    image: `${siteUrl}/icon-512.png`,
    brand: { "@type": "Brand", name: brand.name },
    // Team is priced on request, so it isn't listed as an offer.
    offers,
  };
}

export function faqPageLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
