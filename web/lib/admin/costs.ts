/**
 * Every external dependency Ambient has, with plan, prices and limits, in one
 * place so the founders can edit them. The admin page (/admin) reads this.
 *
 * Rules for editing:
 * - `confirmed: true` only for a price Matt confirmed, or a clearly public
 *   fixed price checked at `source` on `asOf`. Anything else stays
 *   `confirmed: false` and the page shows it as an estimate.
 * - Money is USD. Unit prices are per the unit named in the key.
 * - Live numbers (usage, quotas) come from each provider's API when its env
 *   var is set (`liveEnv`); these values are the fallback and the price list.
 */

export type Group =
  | "Revenue & billing"
  | "AI & data"
  | "Hosting & infra"
  | "Distribution & signing"
  | "Email & domain"
  | "Tooling";

export const GROUPS: Group[] = [
  "Revenue & billing",
  "AI & data",
  "Hosting & infra",
  "Distribution & signing",
  "Email & domain",
  "Tooling",
];

export type Price = {
  /** USD. */
  amount: number;
  confirmed: boolean;
  source: string;
  asOf: string;
  note?: string;
};

export type ManualLimit = {
  label: string;
  /** Used amount when known without an API (else null: shown as "—"). */
  used: number | null;
  limit: number;
  unit: string;
  confirmed: boolean;
  note?: string;
};

export type Dependency = {
  id: string;
  name: string;
  group: Group;
  purpose: string;
  plan: string;
  planConfirmed: boolean;
  /** Fixed subscription, already normalised: the page amortises it per month. */
  fixed?: { price: Price; per: "month" | "year"; renewsOn?: string; renewsOnApprox?: boolean; afterRenewal?: Price };
  /** Metered unit prices (USD per unit named in the key). */
  unitPrices?: Record<string, Price>;
  /** Limits shown when no live API is configured (or that no API reports). */
  limits?: ManualLimit[];
  /** Env vars that make this card live, and where to get the key. */
  liveEnv?: string[];
  keyHowTo?: string;
  /** Shared with another product: a sentence for the card. */
  shared?: string;
  notes?: string[];
};

const ASOF = "2026-11-01";

export const DEPENDENCIES: Dependency[] = [
  // ── Revenue & billing ──────────────────────────────────────────────────
  {
    id: "polar",
    name: "Polar",
    group: "Revenue & billing",
    purpose: "Merchant of record: checkout, tax/VAT, invoices, customer portal, subscriptions.",
    plan: "Starter (no monthly fee): 5% + 50¢ per transaction",
    planConfirmed: true,
    unitPrices: {
      // Real fees per order come from the API (order.platform_fee_amount);
      // these are only used to project the rest of the month.
      percent: {
        amount: 0.05,
        confirmed: true,
        source: "https://polar.sh/docs/merchant-of-record/fees",
        asOf: ASOF,
        note: "Matt: the org is on the tier without a Polar subscription (Starter, 5% + 50¢). Surcharges below are unconfirmed for this tier.",
      },
      fixedPerOrder: { amount: 0.5, confirmed: true, source: "https://polar.sh/docs/merchant-of-record/fees", asOf: ASOF },
      subscriptionPercent: { amount: 0.005, confirmed: false, source: "https://polar.sh/docs/merchant-of-record/fees", asOf: ASOF },
      internationalCardPercent: { amount: 0.015, confirmed: false, source: "https://polar.sh/docs/merchant-of-record/fees", asOf: ASOF },
    },
    liveEnv: ["POLAR_ACCESS_TOKEN"],
    keyHowTo: "Already set. Polar → Settings → Access tokens; read scopes needed: orders:read, subscriptions:read.",
    shared: "Organization shared with fisco: every number here is filtered to Ambient's product ids.",
  },

  // ── AI & data ──────────────────────────────────────────────────────────
  {
    id: "baseten",
    name: "Baseten",
    group: "AI & data",
    purpose:
      "Hosted LLM (DeepSeek V4 Flash) for Pro polish, the agent router, answers and cloud suggestion checks (/api/ai, /api/agent/answer, /api/agent/suggest).",
    plan: "Basic, pay as you go",
    planConfirmed: true,
    unitPrices: {
      inputPer1M: { amount: 0.13, confirmed: true, source: "https://www.baseten.co/pricing/", asOf: ASOF, note: "DeepSeek-V4-Flash-0731" },
      cachedInputPer1M: { amount: 0.028, confirmed: true, source: "https://www.baseten.co/pricing/", asOf: ASOF, note: "Not tracked separately; all input billed at the uncached rate here (a slight overestimate)." },
      outputPer1M: { amount: 0.26, confirmed: true, source: "https://www.baseten.co/pricing/", asOf: ASOF },
    },
    notes: [
      "Cost is computed from our own token counts (usage_daily). Baseten has no public usage API; reconcile with the Baseten billing page.",
      "Tokens are exact when Baseten returns `usage`, else estimated at ~4 characters per token.",
    ],
  },
  {
    id: "tavily",
    name: "Tavily",
    group: "AI & data",
    purpose: "Web search for agent answers (basic depth, 1 credit, cached 6 h per query).",
    plan: "Researcher (free)",
    planConfirmed: true,
    unitPrices: {
      paygoPerCredit: { amount: 0.008, confirmed: true, source: "https://docs.tavily.com/documentation/api-credits", asOf: ASOF },
    },
    limits: [{ label: "Credits this month", used: null, limit: 1_000, unit: "credits", confirmed: true }],
    liveEnv: ["TAVILY_API_KEY"],
    keyHowTo: "Already set. app.tavily.com → API keys.",
    notes: ["Free plan: searches fail once the monthly credits run out."],
  },
  {
    id: "neon",
    name: "Neon",
    group: "AI & data",
    purpose: "Postgres: trials, Free weekly allowance, fair use, usage aggregates.",
    plan: "Launch, pay per use (no monthly minimum)",
    planConfirmed: true,
    unitPrices: {
      cuHour: { amount: 0.106, confirmed: true, source: "https://neon.com/pricing", asOf: ASOF },
      storageGbMonth: { amount: 0.35, confirmed: true, source: "https://neon.com/pricing", asOf: ASOF },
      egressGbOver500: { amount: 0.1, confirmed: true, source: "https://neon.com/pricing", asOf: ASOF },
    },
    liveEnv: ["NEON_API_KEY", "NEON_PROJECT_ID"],
    keyHowTo: "NEON_PROJECT_ID is already set. Neon console → Account settings → API keys (or Org settings → API keys, project-scoped) → NEON_API_KEY.",
    notes: ["Scales to zero when idle; usage aggregates flush at most every 10 minutes per instance, only during real traffic, so it can."],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    group: "AI & data",
    purpose: "Hosts the speech models the app downloads (user tryambientai).",
    plan: "Free",
    planConfirmed: true,
    fixed: { price: { amount: 0, confirmed: true, source: "Matt", asOf: ASOF }, per: "month" },
    limits: [
      { label: "Model repos", used: 74, limit: 74, unit: "repos", confirmed: true, note: "No hard cap for public repos" },
      { label: "Public storage", used: 2.6, limit: 0, unit: "GB", confirmed: true, note: "Best-effort, no hard cap" },
    ],
    notes: ["Repo count and storage are read live from the public Hub API (no token)."],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    group: "AI & data",
    purpose: "Voice-over and music for the launch video.",
    plan: "Free",
    planConfirmed: true,
    fixed: { price: { amount: 0, confirmed: true, source: "Matt", asOf: ASOF }, per: "month" },
    limits: [{ label: "Characters this period", used: null, limit: 10_000, unit: "chars", confirmed: true }],
    liveEnv: ["ELEVENLABS_API_KEY"],
    keyHowTo: "elevenlabs.io/app/settings/api-keys → create a key with User read access → ELEVENLABS_API_KEY.",
  },

  // ── Hosting & infra ────────────────────────────────────────────────────
  {
    id: "vercel",
    name: "Vercel",
    group: "Hosting & infra",
    purpose: "Hosts tryambient.ai: site, licensing and AI API, functions, CDN.",
    plan: "Pro, 1 seat",
    planConfirmed: true,
    fixed: { price: { amount: 20, confirmed: true, source: "Matt", asOf: ASOF, note: "Includes $20 usage credit" }, per: "month" },
    limits: [
      { label: "Fast data transfer", used: null, limit: 1_000, unit: "GB", confirmed: true },
      { label: "Edge requests", used: null, limit: 10_000_000, unit: "requests", confirmed: true },
      { label: "Usage credit", used: null, limit: 20, unit: "USD", confirmed: true },
    ],
    liveEnv: ["VERCEL_API_TOKEN"],
    keyHowTo: "vercel.com/account/tokens → scope: the Ambient team, short expiry → VERCEL_API_TOKEN. Team id is in costs.ts.",
  },
  {
    id: "r2",
    name: "Cloudflare R2",
    group: "Hosting & infra",
    purpose: "Installers, updater latest.json, the model mirror and the launch video (bucket ambient-builds).",
    plan: "Free tier, card on file (overage billed)",
    planConfirmed: true,
    unitPrices: {
      storageGbMonth: { amount: 0.015, confirmed: true, source: "https://developers.cloudflare.com/r2/pricing/", asOf: ASOF },
      classAPer1M: { amount: 4.5, confirmed: true, source: "https://developers.cloudflare.com/r2/pricing/", asOf: ASOF },
      classBPer1M: { amount: 0.36, confirmed: true, source: "https://developers.cloudflare.com/r2/pricing/", asOf: ASOF },
    },
    limits: [
      { label: "Storage (account)", used: null, limit: 10, unit: "GB", confirmed: true, note: "Another project (firme) uses ~2.8 GB" },
      { label: "Class A ops", used: null, limit: 1_000_000, unit: "ops", confirmed: true },
      { label: "Class B ops", used: null, limit: 10_000_000, unit: "ops", confirmed: true },
    ],
    liveEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    keyHowTo: "Cloudflare → My profile → API tokens → custom token, permission Account · Account Analytics · Read → CLOUDFLARE_API_TOKEN. Account id from the R2 overview → CLOUDFLARE_ACCOUNT_ID.",
    shared: "The 10 GB free tier is account-wide, shared with firme.",
    notes: ["Egress is free."],
  },

  // ── Distribution & signing ─────────────────────────────────────────────
  {
    id: "apple",
    name: "Apple Developer Program",
    group: "Distribution & signing",
    purpose: "Developer ID signing and notarization (App Store Connect API key), team 7NFBM8AU48.",
    plan: "Individual/organization membership",
    planConfirmed: true,
    fixed: {
      price: { amount: 99, confirmed: true, source: "https://developer.apple.com/programs/", asOf: ASOF },
      per: "year",
      renewsOn: "2027-04-01",
      renewsOnApprox: true, // Matt: renews in April 2027; exact day unknown
    },
    notes: ["Membership renews April 2027 (day approximate). Developer ID certificate expiry not recorded yet."],
  },
  {
    id: "github",
    name: "GitHub",
    group: "Distribution & signing",
    purpose: "Private repo matt-nowakowski/ambient, forks hf-hub and tao (pinned in Cargo.toml), release assets, Actions secrets.",
    plan: "Free",
    planConfirmed: true,
    fixed: { price: { amount: 0, confirmed: true, source: "Matt", asOf: ASOF }, per: "month" },
    limits: [{ label: "Actions minutes (private)", used: null, limit: 2_000, unit: "min", confirmed: true, note: "Blocked by billing: builds run on Matt's Mac (self-hosted)" }],
  },

  // ── Email & domain ─────────────────────────────────────────────────────
  {
    id: "domain",
    name: "GoDaddy (tryambient.ai)",
    group: "Email & domain",
    purpose: "Domain registrar and DNS (A record → Vercel).",
    plan: "2-year registration",
    planConfirmed: true,
    fixed: {
      // $249 for the first two years, amortised: ~$124.50/yr (~$10.38/mo).
      price: { amount: 124.5, confirmed: true, source: "Matt ($249 for 2 years)", asOf: ASOF },
      per: "year",
      renewsOn: "2028-11-01",
      renewsOnApprox: true,
      afterRenewal: { amount: 350, confirmed: true, source: "Matt", asOf: ASOF, note: "$350 per year from renewal" },
    },
  },
  {
    id: "improvmx",
    name: "ImprovMX",
    group: "Email & domain",
    purpose: "Forwards hello@, sales@ and legal@tryambient.ai.",
    plan: "Free",
    planConfirmed: true,
    fixed: { price: { amount: 0, confirmed: true, source: "Matt", asOf: ASOF }, per: "month" },
    limits: [
      { label: "Aliases", used: 3, limit: 25, unit: "aliases", confirmed: true, note: "hello@, sales@, legal@" },
      { label: "Forwarded emails / day", used: null, limit: 500, unit: "emails", confirmed: true },
    ],
    liveEnv: ["IMPROVMX_API_KEY"],
    keyHowTo: "app.improvmx.com/api → copy the API key → IMPROVMX_API_KEY.",
  },
  {
    id: "resend",
    name: "Resend",
    group: "Email & domain",
    purpose: "Transactional email. Set up, not in use yet: nothing sends through it until it is wired in.",
    plan: "Free",
    planConfirmed: true,
    fixed: { price: { amount: 0, confirmed: true, source: "Matt", asOf: ASOF }, per: "month" },
    limits: [
      { label: "Emails this month", used: null, limit: 3_000, unit: "emails", confirmed: true },
      { label: "Emails today", used: null, limit: 100, unit: "emails", confirmed: true },
    ],
    liveEnv: ["RESEND_API_KEY"],
    keyHowTo: "resend.com/api-keys → full access is needed for /usage (beta) → RESEND_API_KEY.",
  },

];

/** Vercel team and project ids (not secrets). */
export const VERCEL_TEAM_ID = "team_LbqxgjgGTYOmeMq2mzX2uVF4";
export const VERCEL_PROJECT_ID = "prj_AJkqnYuaUoBhUITogfl7IqZkmns5";
export const R2_BUCKET = "ambient-builds";
export const HF_USER = "tryambientai";
/** First month the spend-by-month chart shows (YYYY-MM): when Ambient's own bills began. */
export const SPEND_HISTORY_START = "2026-11";

/** Dependencies with no bill of their own: one row each in the "Other" table. */
export type OtherDependency = { name: string; purpose: string; cost: string; note?: string; risk?: boolean };

export const OTHER_DEPENDENCIES: OtherDependency[] = [
  { name: "Handy (cjpais/handy, MIT)", purpose: "Upstream: the app is forked from Handy; credited in the legal docs", cost: "$0" },
  { name: "transcribe-cpp 0.4", purpose: "Speech engine (Whisper, Parakeet, …)", cost: "$0" },
  { name: "rdev (rustdesk-org, git)", purpose: "Global keyboard shortcuts", cost: "$0", note: "Pinned to a git rev" },
  { name: "Silero VAD / earshot", purpose: "Voice activity detection, bundled", cost: "$0" },
  {
    name: "Apple frameworks",
    purpose: "FoundationModels (Apple Intelligence, opt-in), ScreenCaptureKit, EventKit, Keychain",
    cost: "$0",
  },
  { name: "Google (public URLs)", purpose: "Agent opens Search, Maps, Drive, Gmail links", cost: "$0", note: "No API" },
  { name: "Launch video", purpose: "Hosted on Cloudflare R2 (ambient-builds)", cost: "In R2", note: "Counts toward R2 storage and operations" },
  { name: "Remotion", purpose: "Renders the launch video", cost: "$0", note: "Free license: companies of up to 3 people" },
  { name: "Stageshow (benji.org)", purpose: "Video toolchain", cost: "$0" },
  { name: "Playwright / headless Chrome", purpose: "Video rendering", cost: "$0" },
  { name: "Rust, crates.io, Tauri", purpose: "App build", cost: "$0" },
  { name: "Bun, npm registry, Vite", purpose: "App and site build", cost: "$0" },
  { name: "CMake (via uv), Xcode / swiftc", purpose: "Native build", cost: "$0" },
  { name: "Vulkan SDK (LunarG)", purpose: "Windows/Linux GPU builds", cost: "$0" },
  { name: "NSIS", purpose: "Windows installer", cost: "$0" },
  {
    name: "Windows code signing",
    purpose: "None: Windows installers are unsigned",
    cost: "$0",
    note: "SmartScreen warnings for every Windows user",
    risk: true,
  },
  { name: "Geist (npm, OFL)", purpose: "Site font", cost: "$0" },
];

export const RISKS: string[] = [
  "The Polar organization is shared with fisco: a settings change there affects Ambient checkout.",
  "The Cloudflare R2 free tier (10 GB) is shared with firme, and a card is on file: overage bills silently. The launch video will add to it.",
  "Windows installers are unsigned (no code-signing certificate).",
  "GitHub Actions is blocked by billing: every release builds on Matt's Mac.",
  "Apple Developer membership and Developer ID certificate expiry dates are not recorded (set them in costs.ts).",
  "Tavily, ElevenLabs, ImprovMX and Resend are on free plans: hitting a quota breaks the feature until upgraded.",
];

/** Share of a fixed price per month. */
export function monthlyFixed(dep: Dependency, now = new Date()): number {
  if (!dep.fixed) return 0;
  const renewed = dep.fixed.renewsOn && dep.fixed.afterRenewal && now >= new Date(dep.fixed.renewsOn);
  const amount = renewed ? dep.fixed.afterRenewal!.amount : dep.fixed.price.amount;
  return dep.fixed.per === "year" ? amount / 12 : amount;
}

export function depById(id: string): Dependency {
  const d = DEPENDENCIES.find((x) => x.id === id);
  if (!d) throw new Error(`unknown dependency ${id}`);
  return d;
}
