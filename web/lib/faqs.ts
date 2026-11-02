import { brand, fairUse, freeMeetingsPerMonth, freeWordsLabel } from "./brand";
import { competitors } from "./content";

export type FaqItem = { q: string; a: string };

const p = brand.pricing;

/** What's free and what Pro costs. On the landing FAQ and the pricing FAQ. */
const plans: FaqItem = {
  q: "What’s free, and what does Pro cost?",
  a: brand.enforceFreeWordLimit
    ? `Free includes ${freeWordsLabel} of dictation, and every install gets ${brand.trialDays} days of everything, no card. Pro is $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually, and removes the limits. Cancel anytime.`
    : `Dictation is free and unlimited, forever. Every install gets ${brand.trialDays} days of everything, no card. After that, Free includes ${brand.freePolishPerWeek} AI uses a week and ${freeMeetingsPerMonth} meetings a month. Pro is $${p.proMonthly}/month, or $${p.proYearlyPerMonth}/month billed annually, and removes both limits. Cancel anytime.`,
};

/** The landing-page FAQ: the six questions a buyer asks. Keep it to six. */
export const faqs: FaqItem[] = [
  {
    q: `What is ${brand.name}?`,
    a: `A voice agent for your computer. Hold a key and talk: it writes polished text where your cursor is, answers with sources, acts (calendar, reminders, apps, your Shortcuts) or recalls what you said or saw. It takes meeting notes with no bot. Nothing to connect.`,
  },
  {
    q: "What leaves my computer?",
    a: `Never your audio. Speech recognition runs on your device. When an AI feature needs a model, only the text it needs is sent, with passwords, card numbers, API keys and one-time codes removed first. Screen features are off until you turn them on, and password managers, private windows and crypto wallets are never read. Turn on “Keep everything on this Mac” and nothing is sent at all.`,
  },
  plans,
  {
    q: "Which platforms does it run on?",
    a: "Dictation runs on macOS, Windows and Linux. The agent (answers, actions, recall, meetings and suggestions) is on macOS for now.",
  },
  {
    q: "Does it work offline?",
    a: "Dictation does. Once a model is downloaded, it works with no connection: on a plane, behind a strict firewall. AI features use our server by default, or Apple Intelligence on your Mac if you choose. Web answers need a connection.",
  },
  {
    q: `How is it different from ${competitors.join(" or ")}?`,
    a: `Your voice is transcribed on your computer, not in the cloud. Dictation is free and unlimited. And it doesn’t stop at writing or answering: it acts on your Mac, with nothing to connect and no bot on your calls.`,
  },
];

/** The pricing-page FAQ: billing only. */
export const billingFaqs: FaqItem[] = [
  plans,
  {
    q: "What counts as an AI use?",
    a: `Each polished dictation, answer, action, Ask or meeting summary counts as one. The ${brand.freePolishPerWeek} a week are shared and reset every Monday (UTC). Plain dictation never counts.`,
  },
  {
    q: "Is Pro really unlimited?",
    a: `For any normal use, yes. Fair use is ${fairUse.aiRequestsPerDay.toLocaleString("en-US")} AI requests and ${fairUse.webSearchesPerDay} web searches per account per day. A heavy day is a few hundred.`,
  },
  {
    q: "How do I activate Pro?",
    a: `After checkout, open ${brand.name} → Account → Sign in, enter the email you paid with and the 6-digit code we email you. Manage or cancel from Account → Manage billing; Pro runs to the end of the period you paid for.`,
  },
];
