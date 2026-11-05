// Every email Ambient sends, as data → { subject, html, text }.
//
// Transactional (no opt-in needed; sent from the Polar webhook):
//   welcome (or friendsWelcome for a fully discounted first order), planChanged,
//   cancelScheduled, ended
// Transactional, sent by the app's sign-in (sendSignInCode in ./sign-in.ts):
//   signInCode
// Transactional, sent when the user asks the app to email meeting notes
// (/api/meetings/email, only ever to the account's own address):
//   meetingNotes
// Double opt-in (sent from /api/subscribe):
//   confirmNewsletter (the website's form), confirmTips (the app's "Email me tips")
// Marketing (customers via soft opt-in, free users via double opt-in; always
// with an unsubscribe link + List-Unsubscribe). Sent by hand as Resend
// Broadcasts:
//   winBack, highlightAsk, highlightMeetings
// and, to confirmed tips subscribers only, automatically and in this order by
// the tips cron (lib/email/tips.ts, TIP_SEQUENCES below):
//   tipWriting, highlightAsk, highlightMeetings, tipSuggestions, tipRecall
//
// Polar already sends receipts, invoices, renewal and payment-failure emails,
// and its own cancellation confirmation. Nothing here repeats a receipt.
// Copy only claims shipped behaviour (lib/content.ts, lib/guide.ts).
import { brand, freeMeetingsPerMonth, siteUrl } from "../brand";
import { askShortcut, defaultShortcut } from "../releases";
import { renderEmail, signoff, type Block, type Rendered } from "./layout";
import type { TipLanguage } from "./tip-schedule";

export type Plan = "pro" | "team";
export type Interval = "month" | "year";

const planName = (plan: Plan) => `${brand.name} ${plan === "team" ? "Team" : "Pro"}`;

export function formatDate(d: Date | number) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

const url = (path: string) => `${siteUrl}${path}`;

/** Email-code sign-in in the app. */
const signInSteps: Block = {
  t: "steps",
  title: "Get set up",
  items: [
    ["Open ", { b: brand.name }, "."],
    ["Go to ", { b: "Settings › Account › Sign in" }, "."],
    ["Enter the 6-digit code we email you."],
  ],
};

const threeThings: Block = {
  t: "features",
  title: "Three things to try first",
  items: [
    {
      icon: "ask",
      k: "Ask anything, from any app",
      v: ["Hold ", { b: askShortcut.mac }, " and ask “What does this error mean?” or “Summarise this.” A short answer appears with its sources."],
    },
    {
      icon: "wave",
      k: "Meeting notes, no bot",
      v: "When a call starts in Zoom, Meet, Teams or FaceTime, say yes to “Take notes for this call?” You get a summary, decisions, action items and a follow-up email. The audio is never saved.",
    },
    {
      icon: "mic",
      k: `“Hey ${brand.name}”, hands-free`,
      v: `Turn on hands-free and just ask: “Hey ${brand.name}, what’s on my calendar?” Off by default; nothing is sent until you say the phrase.`,
    },
  ],
};

const macNote: Block = {
  t: "note",
  text: `Everything works on macOS, Windows and Linux. The agent is in beta on Windows and Linux.`,
};

const guideLinks: Block = {
  t: "links",
  items: [
    { href: url("/download"), label: "Download" },
    { href: url("/docs/answers"), label: "Answers" },
    { href: url("/docs/meetings"), label: "Meetings" },
    { href: url("/changelog"), label: "What’s new" },
  ],
};

// ---------------------------------------------------------------------------
// 1. Welcome: no key to paste. You sign in with the email you bought with.
// ---------------------------------------------------------------------------
export type WelcomeData = { plan: Plan; interval: Interval | null; email: string; renewsAt: Date; assetBase?: string };

const billing = (interval: Interval | null) => (interval === "year" ? "billed yearly" : interval === "month" ? "billed monthly" : "");
const planLine = (plan: Plan, interval: Interval | null) => `${plan === "team" ? "Team" : "Pro"}${billing(interval) ? `, ${billing(interval)}` : ""}`;

export function welcome(d: WelcomeData): Rendered {
  const name = planName(d.plan);
  return renderEmail({
    subject: `Welcome to ${name}`,
    preheader: "Sign in with this email to unlock it. Three steps, under a minute.",
    hero: "welcome",
    eyebrow: name,
    kind: "transactional",
    category: "welcome",
    reason: `You’re getting this because you bought ${name}.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Welcome. You’re all set." },
      {
        t: "p",
        size: "lead",
        text: "Thank you for backing a small team building your desktop colleague. There’s no key to keep: your plan is tied to this email.",
      },
      { t: "signin", email: d.email, plan: planLine(d.plan, d.interval), renews: d.interval ? formatDate(d.renewsAt) : undefined },
      signInSteps,
      { t: "button", href: url("/download"), label: `Download ${brand.name}` },
      { t: "note", text: `Already have it? Just open ${brand.name}.` },
      {
        t: "callout",
        icon: "refresh",
        k: "Billing",
        v: ["Manage or cancel any time from ", { b: "Settings › Account" }, ". Polar, our payment provider, sends your receipt separately."],
      },
      { t: "rule" },
      threeThings,
      guideLinks,
      macNote,
      { t: "p", text: "If anything is unclear, just reply. I read every one." },
      { t: "sign" },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1b. Friends and family: a first order paid in full by a discount code.
// Sent instead of the welcome, so they get one email from us. Still carries the
// sign-in card and steps, because that's how they get Pro.
// ---------------------------------------------------------------------------
export type FriendsWelcomeData = { plan: Plan; email: string; assetBase?: string };

export function friendsWelcome(d: FriendsWelcomeData): Rendered {
  const name = planName(d.plan);
  return renderEmail({
    subject: `${name} is on us. Thank you.`,
    preheader: "You’re one of the first people we’ve shared it with. Here’s how to sign in.",
    hero: "note",
    eyebrow: `A note from ${signoff.name}`,
    kind: "transactional",
    category: "welcome_gift",
    reason: `You’re getting this because you redeemed an ${brand.name} friends-and-family code.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "You’re one of our favourite people." },
      {
        t: "p",
        size: "lead",
        text: `That’s why you’re among the first we’ve shared ${brand.name} with, and why ${name} is on us.`,
      },
      {
        t: "p",
        text: "We’d love your honest take: what feels good, what’s confusing, what you’d never use. And please tell us what breaks. Just reply to this email. It comes straight to us.",
      },
      { t: "signin", email: d.email, plan: `${d.plan === "team" ? "Team" : "Pro"}, on us` },
      signInSteps,
      { t: "button", href: url("/download"), label: `Download ${brand.name}` },
      { t: "note", text: `Already have it? Just open ${brand.name}.` },
      { t: "p", text: "Thank you, truly." },
      { t: "sign" },
    ],
  });
}

// ---------------------------------------------------------------------------
// 2. Plan change (monthly → yearly, or → Team)
// ---------------------------------------------------------------------------
export type PlanChangedData = {
  plan: Plan;
  interval: Interval | null;
  renewsAt: Date;
  assetBase?: string;
};

export function planChanged(d: PlanChangedData): Rendered {
  const name = planName(d.plan);
  const what =
    d.plan === "team" ? `You’re now on ${name}.` : d.interval === "year" ? `You’re now on ${name}, billed yearly.` : `You’re now on ${name}, billed monthly.`;
  return renderEmail({
    subject: `Your plan is now ${name}${d.plan === "pro" && d.interval === "year" ? " (yearly)" : ""}`,
    preheader: "What changed. Nothing to do in the app.",
    hero: "plan",
    eyebrow: "Plan updated",
    kind: "transactional",
    category: "plan_changed",
    reason: `You’re getting this because your ${brand.name} plan changed.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Thank you for the vote of confidence." },
      { t: "p", size: "lead", text: [what, ` Your next renewal is ${formatDate(d.renewsAt)}. Polar sends the receipt for any difference in price.`] },
      { t: "callout", icon: "refresh", k: "Nothing to do in the app", v: "Your plan follows your email, so the app picks up the change on its own." },
      d.interval === "year" && d.plan === "pro"
        ? { t: "note", text: "Yearly works out a quarter cheaper than monthly, and we get to plan further ahead. Both help." }
        : { t: "note", text: "Questions about seats or invoices for your team? Just reply." },
      { t: "sign" },
    ],
  });
}

// ---------------------------------------------------------------------------
// Sign-in code (email-code sign-in in the app). Short and calm; no hero.
// ---------------------------------------------------------------------------
export type SignInCodeData = { code: string; assetBase?: string };

export function signInCode(d: SignInCodeData): Rendered {
  return renderEmail({
    subject: `Your ${brand.name} sign-in code: ${d.code}`,
    preheader: `${d.code} is your code. It expires in 10 minutes.`,
    eyebrow: "Sign in",
    kind: "transactional",
    category: "sign_in_code",
    reason: `You’re getting this because someone asked to sign in to ${brand.name} with this email.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Your sign-in code" },
      { t: "p", text: `Enter it in ${brand.name} to finish signing in.` },
      { t: "code", code: d.code },
      { t: "note", text: "It expires in 10 minutes." },
      { t: "note", text: "Didn’t request this? You can ignore this email. Nobody can sign in without the code." },
    ],
  });
}

// ---------------------------------------------------------------------------
// 3. Cancellation scheduled (cancel_at_period_end)
// ---------------------------------------------------------------------------
export type CancelScheduledData = { plan: Plan; endsAt: Date; assetBase?: string };

export function cancelScheduled(d: CancelScheduledData): Rendered {
  const name = planName(d.plan);
  const date = formatDate(d.endsAt);
  return renderEmail({
    subject: `${name} stays on until ${date}`,
    preheader: "No more charges. Everything keeps working until then, and Free keeps going after.",
    hero: "cancel",
    eyebrow: "Subscription canceled",
    kind: "transactional",
    category: "cancel_scheduled",
    reason: `You’re getting this because you canceled ${name}.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "All set. No hard feelings." },
      { t: "p", size: "lead", text: ["Your subscription won’t renew. Everything in ", name, " keeps working until ", { b: date }, ", and you won’t be charged again."] },
      {
        t: "features",
        items: [
          { icon: "mic", k: "Then Free, with weekly limits", v: `Unlimited dictation, ${brand.freePolishPerWeek} AI uses a week and ${freeMeetingsPerMonth} meetings a month. Nothing to reinstall.` },
          { icon: "shield", k: "Your things stay on your computer", v: "History and meeting notes stay where they are, until you delete them." },
        ],
      },
      {
        t: "callout",
        icon: "refresh",
        k: "Changed your mind?",
        v: ["Open ", { b: brand.name }, " → ", { b: "Account" }, " → ", { b: "Manage billing" }, " and resume before ", date, ". Nothing else changes."],
      },
      { t: "p", text: "One question, if you have a second: what could we have done better? Just reply. Even one line helps." },
      { t: "sign" },
    ],
  });
}

// ---------------------------------------------------------------------------
// 4. Subscription ended / goodbye
// ---------------------------------------------------------------------------
export type EndedData = { plan: Plan; assetBase?: string };

export function ended(d: EndedData): Rendered {
  const name = planName(d.plan);
  return renderEmail({
    subject: `Your ${name} has ended. ${brand.name} is still yours.`,
    preheader: "Free keeps the whole colleague, with weekly limits. Here’s what stays and what changes.",
    hero: "ended",
    eyebrow: "Back on Free",
    kind: "transactional",
    category: "ended",
    reason: `You’re getting this because your ${name} subscription ended.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Thank you for the time you spent with us." },
      { t: "p", size: "lead", text: `Your ${name} subscription has ended. You don’t need to do anything: ${brand.name} keeps running on Free.` },
      {
        t: "features",
        items: [
          {
            icon: "mic",
            k: "Still yours, free",
            v: `The whole colleague, with weekly limits: unlimited dictation, ${brand.freePolishPerWeek} AI uses and up to ${brand.freeSuggestionsPerWeek} suggestions a week, and ${freeMeetingsPerMonth} meetings a month.`,
          },
          { icon: "shield", k: "Still on your computer", v: "Your dictation history and meeting notes stay where they always were, until you delete them." },
          { icon: "sparkle", k: "What changes", v: "The limits are back, cloud suggestions stop, and screen memory keeps the last 24 hours." },
        ],
      },
      { t: "button", href: url("/pricing"), label: "Pick up where you left off" },
      { t: "p", text: "And if something made you leave, I’d genuinely like to know. Just reply." },
      { t: "sign" },
    ],
  });
}

// ---------------------------------------------------------------------------
// 8a. Newsletter double opt-in confirmation
// ---------------------------------------------------------------------------
export type ConfirmData = { confirmUrl: string; assetBase?: string };

export function confirmNewsletter(d: ConfirmData): Rendered {
  return renderEmail({
    subject: `Confirm your ${brand.name} updates`,
    preheader: "One click to confirm. At most one email a month.",
    hero: "confirm",
    eyebrow: "One more step",
    kind: "transactional",
    category: "confirm",
    reason: `You’re getting this because this address was entered on ${siteUrl.replace(/^https?:\/\//, "")}. If that wasn’t you, ignore it and you won’t hear from us again.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "One click to confirm." },
      { t: "p", size: "lead", text: `Confirm and you’ll get one short email a month at most: one thing worth trying in ${brand.name}, and what’s new.` },
      { t: "button", href: d.confirmUrl, label: "Confirm my email" },
      { t: "note", text: "The link works for 7 days. Every email has a one-click unsubscribe." },
    ],
  });
}

/** 8b. Tips double opt-in, from "Email me tips" in the app (setup or Account). */
export function confirmTips(d: ConfirmData): Rendered {
  return renderEmail({
    subject: `Confirm your ${brand.name} tips`,
    preheader: "One click to confirm, and the first tip arrives tomorrow.",
    hero: "confirm",
    eyebrow: "One more step",
    kind: "transactional",
    category: "confirm_tips",
    reason: `You’re getting this because someone asked for ${brand.name} tips with this address in the app. If that wasn’t you, ignore it and you won’t hear from us again.`,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "One click to confirm." },
      {
        t: "p",
        size: "lead",
        text: `Confirm and we’ll send you a few short tips on getting more from ${brand.name}: the first tomorrow, then one about every two weeks.`,
      },
      { t: "button", href: d.confirmUrl, label: "Confirm my email" },
      { t: "note", text: "The link works for 7 days. Every tip has a one-click unsubscribe." },
    ],
  });
}

// ---------------------------------------------------------------------------
// Marketing. `unsubscribeUrl` is our signed link for one-off sends, or
// "{{{RESEND_UNSUBSCRIBE_URL}}}" when the HTML is used in a Resend Broadcast.
// ---------------------------------------------------------------------------
export type MarketingData = { unsubscribeUrl: string; audience: "customers" | "newsletter" | "tips"; assetBase?: string };

const marketingReason = (a: MarketingData["audience"]) =>
  a === "customers"
    ? `You’re getting this because you’re an ${brand.name} customer. At most one of these a month.`
    : a === "tips"
      ? `You’re getting this because you asked for tips in the ${brand.name} app. A few short emails, about two weeks apart.`
      : `You’re getting this because you asked for ${brand.name} updates. At most one a month.`;

/** 6. Win-back, ~30 days after a subscription ended. Sent by hand. */
export function winBack(d: MarketingData): Rendered {
  return renderEmail({
    subject: `A month on: how’s ${brand.name} treating you?`,
    preheader: "Free still has the whole colleague. Here’s what Pro adds, if you want it back.",
    hero: "winback",
    eyebrow: "A month on",
    kind: "marketing",
    category: "win_back",
    reason: marketingReason(d.audience),
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "A month on." },
      { t: "p", size: "lead", text: `It’s been about a month since your Pro plan ended. I hope ${brand.name} is still earning its place on Free.` },
      {
        t: "features",
        title: "What Pro adds back",
        items: [
          { icon: "ask", k: "No weekly limits", v: "Answers, actions, suggestions and smart writing, as often as you like (fair use)." },
          { icon: "wave", k: "Unlimited meeting notes", v: "Any call, no bot. Summary, decisions, action items and a follow-up email." },
          { icon: "sparkle", k: "Longer recall", v: "Screen memory for 7 days by default, up to 90, and cloud suggestions if you choose." },
        ],
      },
      { t: "button", href: url("/pricing"), label: "See Pro" },
      { t: "links", items: [{ href: url("/changelog"), label: "What’s new since you left" }] },
      { t: "p", text: "And if Pro wasn’t worth it, tell me why. Just reply. It shapes what we build next." },
      { t: "sign" },
    ],
  });
}

/** 7. Monthly highlight, draft 1. */
export function highlightAsk(d: MarketingData): Rendered {
  return renderEmail({
    subject: "One thing worth trying: ask from any app",
    preheader: `Hold ${askShortcut.mac} and ask about what’s on your screen.`,
    hero: "ask",
    eyebrow: "One thing worth trying",
    kind: "marketing",
    category: "highlight",
    reason: marketingReason(d.audience),
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Ask anything, from any app." },
      {
        t: "p",
        size: "lead",
        text: ["Hold ", { b: askShortcut.mac }, ` (${askShortcut.windows} on Windows and Linux) and talk. Whatever you say goes to ${brand.name}, never into the document.`],
      },
      {
        t: "features",
        title: "Try saying",
        items: [
          { icon: "ask", k: "“What does this error mean?”", v: "It reads the error on screen and explains it in plain words, with a likely fix." },
          { icon: "book", k: "“Summarise this.”", v: "The window in front of you: an article, a thread, a document." },
          { icon: "sparkle", k: "“Translate this into Spanish.”", v: "Press Insert to paste it where your cursor was." },
          { icon: "refresh", k: "“Make it shorter.”", v: "Within 90 seconds of an answer, it’s a follow-up. The card updates in place." },
        ],
      },
      {
        t: "callout",
        icon: "shield",
        k: "Private by default",
        v: "Answers come with their sources, and it searches the web only when it has to. Card numbers, API keys, passwords and one-time codes are removed on your computer before any text is sent.",
      },
      { t: "button", href: url("/docs/answers"), label: "More things to ask" },
      macNote,
      { t: "sign" },
    ],
  });
}

/** 7. Monthly highlight, draft 2. */
export function highlightMeetings(d: MarketingData): Rendered {
  return renderEmail({
    subject: "One thing worth trying: meeting notes, no bot",
    preheader: "Notes for any call, taken on your computer. Nobody new joins the meeting.",
    hero: "meetings",
    eyebrow: "One thing worth trying",
    kind: "marketing",
    category: "highlight",
    reason: marketingReason(d.audience),
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Meeting notes, without a bot." },
      { t: "p", size: "lead", text: "Notes for any call: Zoom, Meet, Teams, FaceTime or Slack huddles. You and them, transcribed on your computer, and no bot joins the call." },
      {
        t: "steps",
        title: "How it goes",
        items: [
          ["Start a call as usual. ", brand.name, " asks “Take notes for this call?”"],
          ["Say ", { b: "“Yes.”" }, " Rolling notes appear while you talk."],
          ["When they ask for something, or you promise something, it nudges you. “Yes” finds it or sets the reminder."],
          ["After the call: a summary, decisions, action items and a follow-up email draft."],
        ],
      },
      {
        t: "features",
        items: [
          { icon: "shield", k: "The audio is never saved", v: "Notes stay on your computer until you delete them." },
          { icon: "calendar", k: `${freeMeetingsPerMonth} a month on Free, unlimited on Pro`, v: "The Ask shortcut works during a call too: “Remind me Friday at 10 to send Priya the deck.”" },
        ],
      },
      { t: "button", href: url("/docs/meetings"), label: "How meeting notes work" },
      { t: "sign" },
    ],
  });
}

/** Tip: writing in any app (first in the tips sequence). */
export function tipWriting(d: MarketingData): Rendered {
  return renderEmail({
    subject: "One thing worth trying: say it rough, it writes it right",
    preheader: `Hold ${defaultShortcut.mac} in any app and talk.`,
    hero: "note",
    eyebrow: "One thing worth trying",
    kind: "marketing",
    category: "highlight",
    reason: marketingReason(d.audience),
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "Say it rough. It writes it right." },
      {
        t: "p",
        size: "lead",
        text: ["Hold ", { b: defaultShortcut.mac }, ` (${defaultShortcut.windows} on Windows and Linux) in any app and talk. Your words land where your cursor is, transcribed on your computer.`],
      },
      {
        t: "features",
        title: "Try saying",
        items: [
          { icon: "mail", k: "“Tell him I can’t make it, be polite.”", v: "Smart writing turns the gist into a proper message for whoever is on screen." },
          { icon: "refresh", k: "“Shorter.” or “Warmer.”", v: "Change what it just wrote. Or select text and say “make this more formal”." },
          { icon: "sparkle", k: "A style per app", v: "Casual for Slack, polished for Gmail, word for word in your code editor." },
        ],
      },
      { t: "note", text: `Dictation is unlimited on every plan. On Free, polishing and writing for you count toward ${brand.freePolishPerWeek} AI uses a week.` },
      { t: "button", href: url("/docs/writing"), label: "More on writing" },
      { t: "sign" },
    ],
  });
}

/** Tip: switch on suggestions. */
export function tipSuggestions(d: MarketingData): Rendered {
  return renderEmail({
    subject: "One thing worth trying: let it offer to help",
    preheader: "Switch on suggestions and it nudges you, once, when it can help.",
    hero: "welcome",
    eyebrow: "One thing worth trying",
    kind: "marketing",
    category: "highlight",
    reason: marketingReason(d.audience),
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "It nudges you, like a colleague." },
      {
        t: "p",
        size: "lead",
        text: "You don’t have to ask. When it notices a moment it can help, it offers once, on screen. Say “yes”, “not now”, or ignore it, and it learns what you want.",
      },
      {
        t: "steps",
        title: "Turn it on",
        items: [
          ["Open ", { b: brand.name }, " and go to ", { b: "Settings › Privacy" }, "."],
          ["Switch on ", { b: "Offer suggestions" }, "."],
          ["Carry on working. The first one shows up when it’s useful."],
        ],
      },
      {
        t: "features",
        title: "The kind of thing it offers",
        items: [
          { icon: "mail", k: "A long thread", v: "“Want me to summarise these 40 messages?”" },
          { icon: "calendar", k: "A date or a deadline", v: "Add it to your calendar, or “Remind me?”" },
          { icon: "sparkle", k: "A failing test or a stack trace", v: "The likely fix, explained." },
        ],
      },
      {
        t: "callout",
        icon: "shield",
        k: "Quiet by design",
        v: `Decided on your computer unless you choose Cloud (Pro), and nothing is sent unless you accept. Up to ${brand.freeSuggestionsPerWeek} a week on Free.`,
      },
      { t: "button", href: url("/docs/suggestions"), label: "More about suggestions" },
      { t: "sign" },
    ],
  });
}

/** Tip: ask about your own things (recall). */
export function tipRecall(d: MarketingData): Rendered {
  return renderEmail({
    subject: "One thing worth trying: ask about your own day",
    preheader: "“What did I say about pricing yesterday?” Nothing to connect.",
    hero: "plan",
    eyebrow: "One thing worth trying",
    kind: "marketing",
    category: "highlight",
    reason: marketingReason(d.audience),
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [
      { t: "h", text: "It remembers, so you don’t have to." },
      {
        t: "p",
        size: "lead",
        text: ["Hold ", { b: askShortcut.mac }, " and ask about something you said, saw or saved. It looks where your things already are, with nothing to connect."],
      },
      {
        t: "features",
        title: "Try asking",
        items: [
          { icon: "ask", k: "“What did I say about pricing yesterday?”", v: "From your dictations and meeting notes." },
          { icon: "book", k: "“Find the deck about the Q4 launch.”", v: "Your files, through Spotlight on a Mac, Windows Search, or Tracker on Linux." },
          { icon: "calendar", k: "“What’s on my calendar tomorrow?”", v: "Calendar on a Mac, Outlook on Windows, GNOME Calendar on Linux." },
        ],
      },
      {
        t: "callout",
        icon: "shield",
        k: "Screen memory, if you want it",
        v: "Switch on “Remember what you’ve seen” in Settings › Privacy and it can recall what was on screen too, saved as text and encrypted on your computer. The last 24 hours on Free; 7 days by default on Pro, up to 90.",
      },
      { t: "button", href: url("/docs/recall"), label: "Where it looks" },
      { t: "sign" },
    ],
  });
}

// ---------------------------------------------------------------------------
// Meeting notes, emailed to the signed-in account when the user asks (or
// chose "always"). The content is never stored; it's rendered and sent.
// ---------------------------------------------------------------------------
export type MeetingNotesData = {
  title: string;
  /** Already formatted in the user's locale and time zone by the app. */
  date: string;
  durationMin: number;
  summary: string;
  decisions: string[];
  actionItems: string[];
  questions: string[];
  followUp?: string;
  assetBase?: string;
};

function durationLabel(min: number) {
  if (!Number.isFinite(min) || min < 1) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function meetingNotes(d: MeetingNotesData): Rendered {
  const title = d.title.trim() || "Your call";
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const decisions = clean(d.decisions);
  const actions = clean(d.actionItems);
  const questions = clean(d.questions);
  const summary = d.summary.trim();
  const followUp = d.followUp?.trim() ?? "";
  const when = [d.date.trim(), durationLabel(d.durationMin)].filter(Boolean).join(" · ");

  const blocks: Block[] = [{ t: "h", text: `Meeting notes: ${title}` }];
  if (when) blocks.push({ t: "note", text: when });
  if (summary) blocks.push({ t: "p", size: "lead", text: summary });
  if (decisions.length) blocks.push({ t: "list", title: "Decisions", items: decisions });
  if (actions.length) blocks.push({ t: "checklist", title: "Action items", items: actions });
  if (questions.length) blocks.push({ t: "steps", title: "Questions for you", items: questions });
  if (followUp) blocks.push({ t: "quote", title: "Follow-up draft", text: followUp });
  blocks.push({ t: "rule" });
  blocks.push({
    t: "note",
    text: `The call audio was never saved, and we don’t keep a copy of this email. Your notes stay in ${brand.name} on your computer until you delete them.`,
  });

  const counts = [actions.length ? plural(actions.length, "action item") : "", decisions.length ? plural(decisions.length, "decision") : ""]
    .filter(Boolean)
    .join(", ");
  return renderEmail({
    subject: `Meeting notes: ${title}`,
    preheader: (counts ? `${counts}. ${summary}` : summary).slice(0, 110),
    hero: "meetings",
    eyebrow: "Meeting notes",
    kind: "transactional",
    category: "meeting_notes",
    reason: `You asked ${brand.name} to email you these notes.`,
    assetBase: d.assetBase,
    blocks,
  });
}

// ---------------------------------------------------------------------------
// Personal note: free text from /admin, in the branded layout. One customer →
// transactional (a reply-style note). A segment → marketing, with unsubscribe.
// ---------------------------------------------------------------------------
export type PersonalNoteData = {
  subject: string;
  /** Plain text; blank lines separate paragraphs. */
  body: string;
  /** Marketing when sent to a segment. */
  unsubscribeUrl?: string;
  audience?: MarketingData["audience"];
  assetBase?: string;
};

export function personalNote(d: PersonalNoteData): Rendered {
  const paragraphs = d.body
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const marketing = Boolean(d.unsubscribeUrl);
  return renderEmail({
    subject: d.subject,
    preheader: (paragraphs[0] ?? "").slice(0, 110),
    hero: "note",
    eyebrow: `A note from ${signoff.name}`,
    kind: marketing ? "marketing" : "transactional",
    category: "personal_note",
    reason: marketing ? marketingReason(d.audience ?? "customers") : `You’re getting this because you’re an ${brand.name} customer.`,
    unsubscribeUrl: d.unsubscribeUrl,
    assetBase: d.assetBase,
    blocks: [...paragraphs.map((text) => ({ t: "p" as const, text })), { t: "sign" }],
  });
}

// ---------------------------------------------------------------------------
// Registry, for the preview route and the scripts.
// ---------------------------------------------------------------------------
const inAMonth = () => new Date(Date.now() + 30 * 86400_000);

export const samples = {
  welcome: (o: { assetBase?: string; unsubscribeUrl?: string }) => welcome({ plan: "pro", interval: "month", email: "ana.silva@example.com", renewsAt: inAMonth(), ...o }),
  "friends-welcome": (o: { assetBase?: string; unsubscribeUrl?: string }) => friendsWelcome({ plan: "pro", email: "ana.silva@example.com", ...o }),
  "sign-in-code": (o: { assetBase?: string; unsubscribeUrl?: string }) => signInCode({ code: "482913", ...o }),
  "plan-changed-yearly": (o: { assetBase?: string; unsubscribeUrl?: string }) => planChanged({ plan: "pro", interval: "year", renewsAt: new Date(Date.now() + 365 * 86400_000), ...o }),
  "plan-changed-team": (o: { assetBase?: string; unsubscribeUrl?: string }) => planChanged({ plan: "team", interval: "year", renewsAt: new Date(Date.now() + 365 * 86400_000), ...o }),
  "cancel-scheduled": (o: { assetBase?: string; unsubscribeUrl?: string }) => cancelScheduled({ plan: "pro", endsAt: inAMonth(), ...o }),
  ended: (o: { assetBase?: string; unsubscribeUrl?: string }) => ended({ plan: "pro", ...o }),
  "confirm-newsletter": (o: { assetBase?: string; unsubscribeUrl?: string }) => confirmNewsletter({ confirmUrl: url("/email/confirm?t=sample"), ...o }),
  "confirm-tips": (o: { assetBase?: string; unsubscribeUrl?: string }) => confirmTips({ confirmUrl: url("/email/confirm?t=sample"), ...o }),
  "tip-writing": (o: { assetBase?: string; unsubscribeUrl?: string }) => tipWriting({ audience: "tips", unsubscribeUrl: o.unsubscribeUrl ?? url("/email/unsubscribe?t=sample"), assetBase: o.assetBase }),
  "tip-suggestions": (o: { assetBase?: string; unsubscribeUrl?: string }) => tipSuggestions({ audience: "tips", unsubscribeUrl: o.unsubscribeUrl ?? url("/email/unsubscribe?t=sample"), assetBase: o.assetBase }),
  "tip-recall": (o: { assetBase?: string; unsubscribeUrl?: string }) => tipRecall({ audience: "tips", unsubscribeUrl: o.unsubscribeUrl ?? url("/email/unsubscribe?t=sample"), assetBase: o.assetBase }),
  "win-back": (o: { assetBase?: string; unsubscribeUrl?: string }) => winBack({ audience: "customers", unsubscribeUrl: o.unsubscribeUrl ?? url("/email/unsubscribe?t=sample"), assetBase: o.assetBase }),
  "highlight-ask": (o: { assetBase?: string; unsubscribeUrl?: string }) => highlightAsk({ audience: "customers", unsubscribeUrl: o.unsubscribeUrl ?? url("/email/unsubscribe?t=sample"), assetBase: o.assetBase }),
  "highlight-meetings": (o: { assetBase?: string; unsubscribeUrl?: string }) => highlightMeetings({ audience: "customers", unsubscribeUrl: o.unsubscribeUrl ?? url("/email/unsubscribe?t=sample"), assetBase: o.assetBase }),
  "meeting-notes": (o: { assetBase?: string; unsubscribeUrl?: string }) =>
    meetingNotes({
      title: "Q4 launch plan with Priya",
      date: "Monday, November 2, 2026 at 14:00",
      durationMin: 42,
      summary:
        "You and Priya agreed to move the launch to November 18 so the onboarding fixes ship first. Marketing starts the week before, and support gets a briefing doc.",
      decisions: ["Launch moves to November 18", "Onboarding fixes ship before any marketing"],
      actionItems: ["You: send Priya the updated deck (by Friday)", "Priya: book the press briefing for Nov 11", "Sam: draft the support FAQ"],
      questions: ["Can we offer a launch discount to existing Free users?"],
      followUp:
        "Hi Priya,\n\nThanks for the time today. To recap: we’re launching on November 18, after the onboarding fixes ship.\n\n- I’ll send the updated deck by Friday.\n- You’ll book the press briefing for Nov 11.\n- Sam is drafting the support FAQ.\n\nBest,\nAna",
      assetBase: o.assetBase,
    }),
  "personal-note": (o: { assetBase?: string; unsubscribeUrl?: string }) =>
    personalNote({
      subject: "Quick question about your meeting notes",
      body: "Hi Ana,\n\nI saw you’ve been using meeting notes a lot this month. Thank you. Is there anything that would make them more useful for your team?\n\nIf you have five minutes, just reply. I read every one.",
      ...o,
    }),
} as const;

export type SampleName = keyof typeof samples;
export const sampleNames = Object.keys(samples) as SampleName[];
export const isSampleName = (n: string): n is SampleName => n in samples;

/** Broadcast-ready marketing templates (Resend fills the unsubscribe link). */
export const broadcasts = {
  "win-back": winBack,
  "highlight-ask": highlightAsk,
  "highlight-meetings": highlightMeetings,
} as const;
export type BroadcastName = keyof typeof broadcasts;

/**
 * The tips sequence, in order, per language (English only so far; a new one
 * goes in TIP_LANGUAGES too, with the same number of tips). Only append: a
 * subscriber's progress is an index into this list, so reordering would skip
 * or repeat a tip.
 */
export const TIP_SEQUENCES: Record<TipLanguage, readonly ((d: MarketingData) => Rendered)[]> = {
  en: [tipWriting, highlightAsk, highlightMeetings, tipSuggestions, tipRecall],
};

/** Shortcut labels used in copy, exported so tests can check they match the app. */
export const shortcutsInCopy = { ask: askShortcut.mac, dictate: defaultShortcut.mac };
