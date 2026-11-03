# Website + licensing API

Marketing site, docs, pricing, downloads and the licensing API for Ambient, your desktop colleague.
Next.js (App Router) + TypeScript + Tailwind v4, deployable to Vercel.

The product name, domain, support email, prices, GitHub repo and license key prefix all come from
the repo-root **`brand.config.json`**. Nothing in `web/` hardcodes them — import from `lib/brand.ts`.
`scripts/sync-brand.mjs` copies `../brand.config.json` to `lib/brand.config.json` before every
`dev` and `build` (Turbopack can't import files outside the project root). The copy is checked in so
`web/` also builds on its own.

```
bun install
bun run dev          # http://localhost:3000
bun run build        # production build (works with zero env vars)
bun run lint
bun run verify-license   # mint + verify a test license key (needs LICENSE_PRIVATE_KEY)
```

## Pages

| Route               | What                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `/`                 | Landing: the agent, suggestions, meetings, writing, privacy, pricing, FAQ |
| `/features`         | Everything it does, by area                                          |
| `/pricing`          | Free / Pro (monthly–annual toggle → Polar checkout) / Team (mailto) |
| `/download`         | OS-detected primary download + every installer                       |
| `/checkout/success` | Verifies the paid Checkout Session and shows a freshly minted key    |
| `/checkout/cancel`  | —                                                                    |
| `/docs/*`           | Guide (getting started, writing, answers, actions, recall, meetings, suggestions, privacy) and help (troubleshooting, Linux); nav in `components/docs-nav.tsx`, copy in `lib/guide.ts` |
| `/privacy`, `/terms`| **Templates — need legal review before launch**                      |

### SEO / metadata (all generated from `brand.config.json`)

- Per-page `metadata` (title template `%s · <name>`, description, canonical) via `lib/seo.ts`.
- Open Graph + Twitter images per route (`opengraph-image.tsx` / `twitter-image.tsx`, rendered by `lib/og.tsx`).
- `app/manifest.ts`, `app/robots.ts`, `app/sitemap.ts` (pages listed in `lib/routes.ts`).
- `/llms.txt`, `/llms-full.txt` and `/.well-known/security.txt` are static route handlers built from `lib/content.ts`, `lib/faqs.ts` and `lib/releases.ts` (`lib/llms.ts`).
- JSON-LD: `SoftwareApplication` + `FAQPage` on `/`, `Product` + `FAQPage` on `/pricing` (`lib/structured-data.ts`).
- Icons: `public/favicon.gif` / `favicon-dark.gif` (animated, light/dark), `icon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192/512.png` — copied from `../brand/`.

### Design

Glass UI matching the desktop app (`src/styles/glass.css`): frosted panels, ambient drifting backdrop,
sentence case only (no all-caps), no monospace. Motion: `motion` (springy reveals, hover lift, press
scale), transitions from [transitions.dev](https://transitions.dev) (number pop-in, tabs sliding, text
swap, texts reveal, shimmer, accordion, toast, success check — see attribution in `app/globals.css`),
and `liquid-gooey` (MIT) for the pricing toggle pill. Everything respects `prefers-reduced-motion`.
The logo is the AICSS "Lens" orb (B1), vendored in `components/orb/` (MIT).

Installer links live in `lib/releases.ts`: set `RELEASE_VERSION` there and `githubRepo` in
`brand.config.json`. Links point at
`https://github.com/<githubRepo>/releases/latest/download/<file>`.

## Licensing

Stateless: no database. A license key is a signed token the app verifies offline.

```
<prefix> + base64url(payloadJsonUtf8) + "." + base64url(ed25519Signature)
```

- `prefix` = `licenseKeyPrefix` in `brand.config.json`. base64url has no padding.
- The signature is over the **ASCII bytes of the base64url payload segment**, not the raw JSON.
- Payload: `{"v":1,"sub":"<polar customer id>","email":"…","plan":"pro"|"team","iat":<unix>,"exp":<unix>}`
- `exp` = subscription `current_period_end` + 7 days grace.
- The app embeds the raw 32-byte public key (`licensePublicKey` in `brand.config.json`).

| Endpoint                     | Body                                   | Returns                                                                     |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `POST /api/checkout`         | `{plan:"pro", interval:"month"\|"year"}` | `{url}` (Polar checkout for the monthly or yearly Pro product)              |
| `POST /api/license/verify`   | `{key}`                                | `{valid, plan, email, exp}` — signature + expiry only, no Polar call        |
| `POST /api/license/refresh`  | `{key}`                                | `{key, plan, exp}`; `402 {error:"no_active_subscription"}`; `400` bad key   |
| `POST /api/billing/portal`   | `{key}`                                | `{url}` (Polar customer portal for the key's customer)                      |

Missing Polar/signing configuration → `503 {error:"not_configured", message}`. The pricing page
shows a friendly message instead of redirecting.

The plan is read from the subscription's `metadata.plan` (`"team"` → team, anything else → pro).
Checkout sets `metadata.plan = "pro"` (Polar copies checkout metadata to the subscription). For
Team deals created by hand in Polar, set
`metadata.plan = "team"` on the subscription.

Note: `/checkout/success?checkout_id=…` re-mints the key on every visit for a succeeded checkout.
The checkout id is effectively a bearer secret for the buyer — that's the intended recovery path
("reopen the link from your browser history"). Lost keys can also be re-issued by support.

### Signing key

Generate once (the public key is baked into the app — rotating it requires an app release):

```
openssl genpkey -algorithm ed25519 -out license-signing-key.pem
# raw public key, base64 (→ brand.config.json "licensePublicKey"):
openssl pkey -in license-signing-key.pem -pubout -outform DER | tail -c 32 | base64
```

Store the PEM in `LICENSE_PRIVATE_KEY`. Never commit it.

## Polar setup

Polar is the merchant of record (payment, tax/VAT, invoices, customer portal).

1. In the Polar dashboard (sandbox first) create two recurring products:
   - "Pro (monthly)" at `pricing.proMonthly` USD per month
   - "Pro (yearly)" at `pricing.proYearlyPerMonth × 12` USD per year
2. Copy their product IDs into `POLAR_PRODUCT_PRO_MONTHLY` / `POLAR_PRODUCT_PRO_YEARLY`.
3. Create an organization access token (scopes: checkouts, subscriptions, customer sessions)
   and set it as `POLAR_ACCESS_TOKEN`; set `POLAR_ENV=production` for the live org.

No database is required: licenses are minted on the success page and refreshed by the app
(`/api/license/refresh`) against live subscription state in Polar. The only webhook is for email
(see Email).

## Admin dashboard (`/admin`)

Private page for the founders: installs, actives, paying customers, MRR/ARR, revenue net of Polar
fees, AI and search usage by plan, spend and margin per provider, quota bars for every free tier,
orgs, top consumers, the full dependency inventory and risks. `?period=month|30d|all`;
`?demo=1` swaps in clearly labelled sample data for screenshots.

- **Auth:** email allowlist + one shared password. Set `ADMIN_EMAILS`, `ADMIN_PASSWORD_HASH`
  (`bun scripts/admin-hash.ts` reads the password without echo and prints
  `scrypt:<N>:<r>:<p>:<salt>:<key>`) and `ADMIN_SESSION_SECRET` (≥ 32 chars). Missing any → 404.
  Session: HMAC-signed, httpOnly, SameSite=Strict, Secure cookie for 12 h. `proxy.ts` gates only
  `/admin/**` and `/api/admin/**`; every page, action and route re-checks the session.
- **Prices, plans and limits** live in `lib/admin/costs.ts` (with sources, as-of dates and
  `confirmed` flags). Each provider card is live when its key is set (see `.env.example`).
- **Cost to run:** the page is dynamic, with no timers or polling; Polar, Neon and provider reads are
  cached for 15 minutes (`Refresh` drops the cache). Usage counts (`usage_daily`,
  `usage_subject_daily`, see `lib/usage.ts`) are kept in memory and flushed in one batched upsert
  per instance at most every 10 minutes, only during real traffic, so Neon still sleeps.

## Agent analytics, remote config and feedback

Everything runs on this Vercel project and Neon; the app works without any of it (no analytics
sent, built-in config, feedback shows an error and keeps the draft).

| Endpoint | What |
| --- | --- |
| `POST /api/telemetry` | Opt-in anonymous counts from the app: `{v, install, version, os, plan, events: [{name, props, n}]}`. Checked strictly against `lib/agent/telemetry-schema.json` (unknown event, prop or value → 400, whole batch). Rate limited per rotating install id (6 / 15 min) and per IP (120 / 15 min). Bodies are never logged; events only add to daily counters. |
| `GET /api/agent/config?v=` | The agent's tunables: defaults ← auto-tuned ← manual (from `/admin?tab=agent`). `s-maxage=3600`; built-in defaults when Neon is missing. The app fetches it on launch and at most daily, sends only its version, and clamps every value to its own copy of the bounds. |
| `GET /api/cron/tune` | Daily auto-tuning (Vercel Cron, `vercel.json`, 04:17 UTC). Requires `Authorization: Bearer $CRON_SECRET`; 503 without `CRON_SECRET`. Reads 14 days of aggregates; never touches manual or pinned values; skipped while paused in `/admin`. |
| `POST /api/meetings/email` | Meeting notes to the signed-in account's own email (Resend). Content is never logged or stored. |
| `POST /api/feedback` | Bug reports and ideas from the app, shown in `/admin?tab=feedback`. |

**Tables** (created idempotently by `lib/db.ts` `productDb()`): `product_events_daily` (day, event,
canonical props, app version → count), `product_installs_daily` (day, sha256 of the rotating id
and the day: unlinkable across days), `agent_config` (non-default values, source `auto`/`manual`,
`pinned`), `agent_config_state` (the pause flag), `agent_config_history` (every change with its
reason and the numbers behind it). Event and install rows are pruned after **180 days**.

**Tuning rules** (`lib/agent/config.ts`, over 14 days): a suggestion kind accepted < 15% over ≥ 50
offers gets +0.05 minimum confidence (×1.5 cooldown once confidence is at its ceiling); < 5% over
≥ 100 offers turns it off; ≥ 50% over ≥ 50 offers relaxes −0.02 (÷1.25 cooldown at the floor). A
judge timing out on > 20% of ≥ 50 runs gets +1000 ms (device and cloud separately). Over 25% of ≥ 50
requests ending on "did you mean to type this?" moves the router bias +0.05. "Written for you"
(smart writing) reverted with "Use my words" on over 20% of ≥ 50 cases (`write_mode` /
`write_revert` events) raises `writing.written_threshold` +0.05. Each step stays in the bounds:

| Key | Min | Max | Default |
| --- | --- | --- | --- |
| `kind.<kind>.enabled` | — | — | on |
| `kind.<kind>.min_confidence` | 0.5 | 0.95 | 0.6 |
| `kind.<kind>.cooldown_min` | 1 | 1440 | 3 |
| `hourly_budget` | 1 | 20 | 10 |
| `judge.timeout_ms` | 3000 | 15000 | 8000 |
| `judge.cloud_timeout_ms` | 3000 | 12000 | 7000 |
| `judge.min_confidence` | 0.5 | 0.95 | 0.6 |
| `router.did_you_mean_bias` | 0 | 1 | 0.5 |
| `answer.first_byte_timeout_ms` | 8000 | 40000 | 25000 |
| `answer.idle_timeout_ms` | 5000 | 30000 | 20000 |
| `search.timeout_ms` | 2000 | 15000 | 6000 |
| `writing.written_threshold` | 0.5 | 0.95 | 0.7 |
| `writing.ambiguous_floor` | 0.2 | 0.7 | 0.45 |
| `writing.polish_disfluency` | 0.02 | 0.3 | 0.06 |
| `writing.run_on_words` | 15 | 80 | 35 |
| `free.ai_per_week` | 5 | 500 | 25 |
| `free.suggestions_per_week` | 1 | 200 | 10 |
| `free.memory_hours` | 1 | 168 | 24 |
| `free.meetings_per_month` | 1 | 30 | 2 |

Smart writing (`src-tauri/src/agent/writing.rs`) scores each dictation 0–1 as an instruction to
write: at or above `written_threshold` it's "Written for you" with no model call; from
`ambiguous_floor` up to the threshold a model decides (on device when it can); below it, it's typed
as said, or polished when fillers/repeats per word reach `polish_disfluency` or a sentence runs
`run_on_words` words. The app keeps the floor at least 0.05 under the threshold, and raises both
per app where the user reverted.

The bounds live in `lib/agent/config-schema.json`; the app keeps its own copy (`src-tauri`), and a
unit test there checks the two match. Tests: `bun scripts/telemetry-test.ts`,
`bun scripts/agent-config-test.ts`.

## Email

Branded customer emails over [Resend](https://resend.com) (plain `fetch`, no SDK), rendered from
`lib/email/templates.ts` with the shell in `lib/email/layout.ts`: table layout, 600 px, inline CSS,
dark mode through `prefers-color-scheme`, a plain-text part for every email, no tracking pixels.
Each email opens with the app's lockup (the intro's four-dot orb, `public/email/orb.png` /
`orb-dark.png`, APNG whose first frame is the finished mark; `python3 web/scripts/email-orb.py`,
plus the wordmark at weight 300) and a hero that is a slice of the app window's backdrop, the two
lights exactly as `.app-backdrop` paints them, in light and dark (`public/email/hero-*.jpg` /
`hero-*-dark.jpg`, 1200×480), then an accent eyebrow, a light headline,
icon feature rows, the app-style sign-in card and one pill button. The icons are the app's own
lucide glyphs (stroke 1.75, round caps) on a quiet 34px glass tile, light and dark
(`icon-*.png`, 2x): `node web/scripts/email-icons.mjs` from the repo root. Regenerate the rest
of the artwork with `python3 web/scripts/email-art.py` (Pillow + numpy). Everything no-ops with a
log line when `RESEND_API_KEY` is unset.

Polar (merchant of record) already emails customers receipts, invoices, renewals, payment failed
(past due), cancellation, uncancel, revoked and plan-change notices. Those settings are per org and
the org is shared, so they stay on. Ours add what Polar's don't have: the license key, how to use
it, and a person's voice. We never send a receipt and never send a payment-failed email.

| Email | Trigger | Kind |
| --- | --- | --- |
| Welcome + "sign in with this email" card and steps | `order.paid`, `billing_reason = subscription_create` | transactional |
| Friends-and-family thank-you (instead of the welcome; same sign-in card and steps) | `order.paid`, `subscription_create`, with a discount and nothing paid (total or net 0, or 100%); the discount's name and code are logged | transactional |
| Sign-in code (6 digits, 10 minutes) | the app's email-code sign-in calls `sendSignInCode(email, code)` from `lib/email/sign-in.ts` | transactional |
| Plan changed | `order.paid`, `billing_reason = subscription_update` (interval changes always invoice now) | transactional |
| Cancellation scheduled | `subscription.canceled` with `cancel_at_period_end` and still active | transactional |
| Ended / goodbye | `subscription.revoked` | transactional |
| Newsletter confirmation | `POST /api/subscribe` | double opt-in |
| Win-back (~30 days after end) | by hand: Broadcast | marketing |
| Monthly highlight (2 drafts: Ask, Meetings) | by hand: Broadcast, max one a month | marketing |

**Webhook** `POST /api/webhooks/polar`: Standard Webhooks signature checked in
`lib/email/polar-webhook.ts` (both Polar secret encodings, before and after 2026-09-08; the installed
SDK 0.49 helper only knows the old one). No `POLAR_WEBHOOK_SECRET` → 401, bad signature → 403.
Only events for `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY` and `POLAR_PRODUCT_TEAM` do
anything; the rest of the shared org is ignored. Answers 202 at once and sends in `after()`. The
Resend `Idempotency-Key` is `polar/<webhook-id>` (stable across Polar's retries; Resend keeps it
24 h). Logs carry event ids and categories, never addresses or keys. No database.

**No keys in email.** Customers sign in in the app with the email they bought with (Settings ›
Account › Sign in, then a 6-digit code). The welcome email shows that email on a card styled like
the app's license card (`card.jpg` / `card-dark.jpg` reproduce its frosted glass, foil and glare).

**Lists.** Resend contacts are global with one `unsubscribed` flag, grouped in two segments:
"Ambient customers" (added on the welcome email: soft opt-in for existing customers, opt-out in
every marketing email) and "Ambient newsletter" (free users, added `unsubscribed` until they confirm
the signed link). Links are HMAC-signed with `EMAIL_TOKEN_SECRET`, so we keep no list ourselves.
Marketing emails carry `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
(`POST /api/email/unsubscribe?t=…`); the footer link opens `/email/unsubscribe`. Broadcasts use
Resend's own `{{{RESEND_UNSUBSCRIBE_URL}}}` and headers.

**Newsletter form:** `components/newsletter-form.tsx` (posts to `/api/subscribe`); not placed on any
page yet.

**Previews:** `/emails/preview` (every email with sample data, `?format=text` for the text part).
Open in dev; in production only with an `/admin` session.

```
bun scripts/emails.ts render ./out                     # every email → .html + .txt
bun scripts/emails.ts send you@example.com [name|all]  # test send, subject prefixed [Test]
bun scripts/emails.ts broadcast highlight-ask          # Resend Broadcast DRAFT for the customers segment
```

Sending a monthly highlight or a win-back: run the `broadcast` command (`customers` or
`newsletter`), then review and send the draft at resend.com → Broadcasts. For a win-back, first
make a segment of people whose subscription ended about 30 days ago (Polar → Customers, export) and
pick it in the draft. At most one marketing email a month. Free plan: 100 emails/day, 3,000/month,
1,000 marketing contacts.

### Customers in /admin

`/admin/customers` lists Ambient's Polar customers (the overview's cached Polar read, `admin`
tag, cleared by Refresh): plan, status, since, MRR, renewal or end date, with status filters and
search. `/admin/customers/<id>` adds the Polar timeline, the last 30 days of Resend email history
(Resend has no recipient filter, so it pages through recent sends) and the marketing opt-out, all
fetched on view. Sends are server actions behind the admin session: pick a template (personal
note, welcome + key resend, highlights, win-back), preview, send. `/admin/customers/send` sends a
template to a segment (active, cancelling, trialing, past due, canceled in 60 days) after a confirm
step with the exact count. Every send checks the last 24 hours against Resend Free's 100/day and
refuses what wouldn't fit; marketing skips opted-out contacts and carries unsubscribe links;
idempotency keys are per template, recipient (or segment) and UTC day. No database. `?demo=1`
shows sample customers with sends disabled.

## Environment variables

See `.env.example`. For local dev, copy it to `.env.local` (gitignored).

| Var                         | Required for                         |
| --------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_APP_URL`       | Absolute URLs (Polar redirect, OG)   |
| `POLAR_ACCESS_TOKEN`        | checkout, refresh, portal, success   |
| `POLAR_ENV`                 | `production` or `sandbox`            |
| `POLAR_PRODUCT_PRO_MONTHLY` | checkout                             |
| `POLAR_PRODUCT_PRO_YEARLY`  | checkout                             |
| `LICENSE_PRIVATE_KEY`       | success page, refresh, welcome email |
| `LICENSE_CODE_TEST_BYPASS`  | `1` skips the Polar active-subscription check at code activation; local testing only (ignored in production builds and on Vercel) |
| `RESEND_API_KEY`            | all email (unset → logged no-op)     |
| `POLAR_WEBHOOK_SECRET`      | `/api/webhooks/polar` (unset → 401)  |
| `EMAIL_TOKEN_SECRET`        | confirm/unsubscribe links (≥ 32 chars) |
| `AUTH_SECRET`               | app sign-in challenges and sessions (≥ 32 chars; changing it signs everyone out) |
| `RESEND_AUDIENCE_CUSTOMERS` | segment id (optional: found or created by name) |
| `RESEND_AUDIENCE_NEWSLETTER`| segment id (optional: found or created by name) |
| `CRON_SECRET`               | **required** for `/api/cron/tune` (daily agent auto-tuning; unset → the cron refuses with 503 and the config stays as is) |
| `FEEDBACK_NOTIFY_EMAIL`     | optional: email each new feedback item to this address (unset → none) |

## Deploy to Vercel

The Vercel project `ambient` is connected to `matt-nowakowski/ambient`: every push to `main`
deploys to production; other branches get preview deployments.

- Root Directory `web`, with source files outside it included (the build reads
  `../brand.config.json` via `prebuild`).
- Framework Next.js, Node 22, install `npm ci`, build `npm run build`.
- Env vars (Production + Preview): `LICENSE_PRIVATE_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_ENV`,
  `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY`; optionally `NEXT_PUBLIC_APP_URL`
  (defaults to `https://<domain>` from brand.config.json).
- `.vercelignore` keeps local `.env*` files out of CLI deploys.
