import { brand, siteUrl } from "./brand";
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

const offers = [
  { "@type": "Offer", name: tiers.free.name, price: "0", priceCurrency: "USD", url: `${siteUrl}/download` },
  {
    "@type": "Offer",
    name: `${tiers.pro.name} (monthly)`,
    price: String(tiers.pro.monthly),
    priceCurrency: "USD",
    url: `${siteUrl}/pricing`,
    priceSpecification: { "@type": "UnitPriceSpecification", price: String(tiers.pro.monthly), priceCurrency: "USD", billingDuration: "P1M" },
  },
  {
    "@type": "Offer",
    name: `${tiers.pro.name} (annual)`,
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
