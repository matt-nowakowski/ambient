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
    : `Free gets the whole colleague, with weekly limits: unlimited dictation, ${brand.freePolishPerWeek} AI uses a week, up to ${brand.freeSuggestionsPerWeek} suggestions a week and ${freeMeetingsPerMonth} meetings a month. Pro removes the limits for $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually. Every install starts with ${brand.trialDays} days of Pro, no card. Cancel anytime.`,
};

/** The full general FAQ, on /pricing and in llms-full.txt. */
export const faqs: FaqItem[] = [
  {
    q: `What is ${brand.name}?`,
    a: `A live agent on your desktop, like a colleague. Hold a key and talk: it answers with sources, acts (calendar, reminders, apps, your shortcuts), recalls what you said or saw, or writes where your cursor is: your words as said, polished, or written for you. When it can help, it nudges you with one suggestion on screen. It takes meeting notes with no bot. Nothing to connect.`,
  },
  {
    q: "What leaves my computer?",
    a: `Never your audio. Speech recognition runs on your device. When an AI feature needs a model, only the text it needs is sent, with passwords, card numbers, API keys and one-time codes removed first. To understand what you mean it reads the window you’re in, where your system allows, with secrets removed and never on private pages; turn that off in Privacy. Screen memory stays off until you turn it on, and password managers, private windows and crypto wallets are never read. Set Intelligence to “On this computer only” or “No AI” and nothing is sent for AI at all. Anonymous usage counts (never what you say, type or see) are shared only if you opt in, and feedback only when you send it. Every request is listed in the app’s Privacy Center.`,
  },
  plans,
  {
    q: "Which platforms does it run on?",
    a: "Everything runs on macOS, Windows and Linux: dictation and the whole agent (answers, actions, recall, meetings and suggestions). The agent is in beta on Windows and Linux. What changes between computers is where the AI runs: on the device where it can, or in the cloud if you choose.",
  },
  {
    q: "Does it work offline?",
    a: "Dictation does. Once a model is downloaded, it works with no connection: on a plane, behind a strict firewall. AI features use our server unless you choose otherwise. Download the optional on-device AI (about 1.1 GB, any computer), or use Apple Intelligence on a Mac, and polish, smart writing and suggestions run offline too. Web answers need a connection.",
  },
  {
    q: `How is it different from ${competitors.join(" or ")}?`,
    a: `It’s a live agent, not only dictation or a notetaker: it answers, acts on your computer and nudges you when it can help, with nothing to connect and no bot on your calls. Your voice is transcribed on your computer, not in the cloud, and dictation is free and unlimited.`,
  },
  {
    q: "Can I use Pro on more than one computer?",
    a: `Yes. Install ${brand.name} on each computer you use and sign in with the same email (Account → Sign in). There’s no limit on the number of computers; fair use is counted per account, not per computer. Pro is for you personally: each person needs their own plan.`,
  },
  {
    q: "How do I change my email?",
    a: `Email ${brand.supportEmail} from the address you paid with and tell us the new one. We’ll move your plan to it, then sign in on each computer with the new email.`,
  },
  {
    q: "How do I delete my account and data?",
    a: `Most of your data never leaves your computer: history, meetings, screen memory and settings live there, and deleting ${brand.name}’s folders removes them (see ${brand.domain}/docs/uninstall). On our side we hold your sign-in email and plan, and your tips email if you asked for tips. To have that deleted, email ${emails.legal}; see “Your rights” in the privacy policy (${brand.domain}/privacy#rights). Cancel any subscription first. Billing records are kept as the law requires.`,
  },
  {
    q: `How do I uninstall ${brand.name}?`,
    a: `On a Mac, quit ${brand.name} and drag it from Applications to the Trash. On Windows, use Settings → Apps → Installed apps → Uninstall, and tick “Delete the application data” to remove your data too. On Linux, remove the package or delete the AppImage. Uninstalling doesn’t cancel Pro. To remove your data and downloaded models as well, follow ${brand.domain}/docs/uninstall.`,
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
    a: `After checkout, open ${brand.name} → Account → Sign in, enter the email you paid with and the 6-digit code we email you. Manage or cancel from Account → Manage billing; Pro runs to the end of the period you paid for.`,
  },
  {
    q: "How do I cancel or change my plan?",
    a: `In ${brand.name}, open Account → Manage billing. Without the app, go to ${brand.domain}/billing and enter the email you paid with: we’ll email you a secure link to your billing portal. There you can change or cancel your plan, update your card and download invoices. If you cancel, Pro stays on until the end of the period you’ve paid for, then ${brand.name} carries on as Free.`,
  },
];
