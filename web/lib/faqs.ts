import {
  brand,
  emails,
  fairUse,
  freeMeetingsPerMonth,
  freeWordsLabel,
} from "./brand";
import { competitors } from "./content";

export type FaqItem = { q: string; a: string };

const p = brand.pricing;

/** What's free and what Pro costs. On the landing FAQ and the pricing FAQ. */
const plans: FaqItem = {
  q: "What’s free, and what does Pro cost?",
  a: brand.enforceFreeWordLimit
    ? `Free includes ${freeWordsLabel} of dictation, and every install gets ${brand.trialDays} days of everything, no card. Pro is $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually, and removes the limits. Cancel anytime.`
    : `Free: unlimited dictation, ${brand.freePolishPerWeek} AI uses and ${brand.freeSuggestionsPerWeek} suggestions a week, ${freeMeetingsPerMonth} meetings a month. Pro removes the limits: $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually. ${brand.trialDays} days of Pro free, no card.`,
};

/** The full general FAQ, on /pricing and in llms-full.txt. */
export const faqs: FaqItem[] = [
  {
    q: `What is ${brand.name}?`,
    a: `A live agent on your desktop. Hold a key and talk: it answers, acts, recalls, or writes at your cursor. It nudges you when it can help and takes meeting notes with no bot.`,
  },
  {
    q: "What leaves my computer?",
    a: `Never your audio. Only the text a feature needs, with passwords, cards, keys and codes removed first. Password managers, private windows and wallets are never read. Choose “On this computer only” or “No AI” and nothing is sent for AI. Every request is listed in the app’s Privacy Center.`,
  },
  plans,
  {
    q: "Which platforms does it run on?",
    a: "macOS, Windows and Linux, with every feature. The agent is in beta on Windows and Linux.",
  },
  {
    q: "Does it work offline?",
    a: "Dictation does. With the optional on-device AI (about 1.1 GB) or Apple Intelligence, polish and suggestions do too. Web answers need a connection.",
  },
  {
    q: `How is it different from ${competitors.join(" or ")}?`,
    a: `It’s a live agent, not just dictation or notes: it answers, acts and nudges you. Your voice stays on your computer, and dictation is free.`,
  },
  {
    q: "Can I use Pro on more than one computer?",
    a: `Yes, as many as you like. Sign in with the same email on each. Pro is per person.`,
  },
  {
    q: "How do I change my email?",
    a: `Email ${brand.supportEmail} from the address you paid with. We’ll move your plan.`,
  },
  {
    q: "How do I delete my account and data?",
    a: `Your data lives on your computer; ${brand.domain}/docs/uninstall removes it. We only hold your email and plan: email ${emails.legal} to delete them. Billing records are kept as the law requires.`,
  },
  {
    q: `How do I uninstall ${brand.name}?`,
    a: `Mac: drag it to the Trash. Windows: Settings → Apps → Uninstall. Linux: remove the package. It doesn’t cancel Pro. Steps for removing your data: ${brand.domain}/docs/uninstall.`,
  },
];

/** The landing-page FAQ: five short questions. Its JSON-LD is built from this list, so they match. */
export const homeFaqs: FaqItem[] = [
  {
    q: `What is ${brand.name}?`,
    a: `A live agent on your desktop. Talk to it and it answers or acts. It nudges you when it can help, and types for you in any app.`,
  },
  {
    q: "What leaves my computer?",
    a: `Never your audio. Only the text a feature needs, with passwords, card numbers, keys and codes removed first. Choose “On this computer only” or “No AI” and nothing is sent for AI.`,
  },
  {
    q: "What’s free, and what does Pro cost?",
    a: brand.enforceFreeWordLimit
      ? `Free gets the whole colleague, with weekly limits. Pro removes them: $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually. Try Pro free for ${brand.trialDays} days, no card.`
      : `Free gets the whole colleague, with weekly limits, and unlimited dictation. Pro removes the limits: $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually. Try Pro free for ${brand.trialDays} days, no card.`,
  },
  {
    q: "Which platforms does it run on?",
    a: "macOS, Windows and Linux, dictation and the agent. The agent is in beta on Windows and Linux.",
  },
  {
    q: `How is it different from ${competitors.join(" or ")}?`,
    a: `It’s an agent, not only dictation or notes: it acts on your computer and nudges you when it can help. Your voice is transcribed on your computer.`,
  },
];

/** The pricing-page FAQ: billing only. */
export const billingFaqs: FaqItem[] = [
  plans,
  {
    q: "What counts as an AI use?",
    a: `Each polished or written dictation, answer, action, Ask or meeting summary counts as one. The ${brand.freePolishPerWeek} a week are shared and reset every Monday (UTC). Plain dictation, and deciding how to write it, never count.`,
  },
  {
    q: "Is Pro really unlimited?",
    a: `For any normal use, yes. Fair use is ${fairUse.aiRequestsPerDay.toLocaleString("en-US")} AI requests and ${fairUse.webSearchesPerDay} web searches per account per day. A heavy day is a few hundred.`,
  },
  {
    q: "How do I activate Pro?",
    a: `Open ${brand.name} → Account → Sign in with the email you paid with. We email you a 6-digit code.`,
  },
  {
    q: "How do I cancel or change my plan?",
    a: `Account → Manage billing in the app, or ${brand.domain}/billing. Pro runs to the end of the period you paid for, then Free carries on.`,
  },
];
