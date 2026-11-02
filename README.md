# Ambient

**Speak. It's written.** Ambient is a desktop dictation app: hold a shortcut, talk,
and clean text appears wherever your cursor is. Transcription runs on your
device, works offline, and supports macOS, Windows and Linux.

> **Source available, not open source.** This code is public to read and review
> only. You may not use, copy, modify, build or redistribute it: see [LICENSE](LICENSE).
> To use Ambient, download it from [tryambient.ai](https://tryambient.ai).

This repository is the whole product:

| Path                 | What it is                                                     |
| -------------------- | -------------------------------------------------------------- |
| `src/`, `src-tauri/` | The desktop app (Tauri 2: React UI + Rust backend)             |
| `web/`               | Website: landing page, pricing, downloads, Polar + licensing   |
| `brand.config.json`  | The brand: name, domain, identifiers, prices, license settings |
| `brand/`             | Logo mark (SVG) and the icon generator                         |

Ambient includes open-source code whose license and copyright notices must
stay in every copy: see [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (the app shows the notices
under About › Acknowledgments).

## Renaming the product

The brand lives in one file. To rename:

1. Edit `brand.config.json` (`name`, `slug`, `identifier`, `domain`, …).
2. Run `bun run brand`.

What reads the config directly, with nothing to rewrite:

- **UI strings**: every locale uses `{{appName}}`, filled in by i18next
  (`src/i18n/index.ts`).
- **React**: `import { BRAND } from "@/lib/brand"`.
- **Rust**: `env!("BRAND_NAME")`, `env!("BRAND_SLUG")`, … emitted by
  `src-tauri/build.rs`, which also fills `{{appName}}` in tray menus.
- **Website**: `web/lib/brand.ts`.

`bun run brand` rewrites what can't read it at runtime: `tauri.conf.json`
(product name, bundle identifier, updater URL), `Cargo.toml`, the NSIS
installer, CI workflows and docs. `brand.lock.json` records the
last-applied brand so the script knows what to replace;
`bun run brand:check` fails CI if the config was edited without being applied.

Changing `identifier` moves the app's data directory, so existing installs start
fresh.

The logo is the AICSS "Lens" orb, variant B1 (MIT). Icons are art, not
text: `swift brand/generate-icons.swift` renders the app and tray icons, and
`node brand/generate-svg.mjs` writes `brand/mark.svg` (favicon/web logo, flips
to light in dark mode). The Swift script also writes animated favicons
(`brand/favicon.gif`, `brand/favicon-dark.gif`) and web icons
(`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`). In the app,
`BrandMark` renders the live animated orb.

## Plans and licensing

**Dictation is free and unlimited, forever.** It runs on the user's machine and
costs us nothing; the unlimited free tier is a selling point against Wispr
Flow's 2,000 words/week. `enforceFreeWordLimit` in `brand.config.json` stays
`false` (the weekly counter still exists, but nothing is ever blocked).

Pro pays for what costs money to run or is unique to Ambient:

| Plan | Price                            | What you get                                                                                                                 |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Free | $0                               | Unlimited on-device dictation, every platform, a weekly allowance of hosted AI polish                                        |
| Pro  | $12/mo, or $9/mo billed annually | AI polish on every dictation (hosted, or on-device with Apple Intelligence), the ambient agent as it ships, priority support |
| Team | $8/user/mo billed annually       | Everything in Pro, central billing                                                                                           |

### AI polish (Pro)

- The app ships a built-in provider, **Ambient AI** (`settings.rs`,
  `AMBIENT_AI_PROVIDER_ID`), pointing at `{apiBaseUrl}/api/ai/v1`. Its API key is
  the user's signed Pro token (from sign-in, a redeemed code or the trial); the
  user configures nothing. There are no bring-your-own-key providers: polish
  and the agent use only this hosted model or Apple Intelligence.
- `web/app/api/ai/v1/chat/completions` is OpenAI-compatible: it checks the
  license (valid, unexpired, paid), caps request size, and calls DeepSeek V4
  Flash on Baseten with thinking off (~1s). Each upstream attempt times out at
  8s with one retry; if polish fails the app pastes the raw transcript.
- Apple Intelligence ("Keep it on this Mac") is also Pro-only.
- With a Pro provider selected, every dictation is polished, not only the
  separate post-process shortcut (`plan::polish_every_dictation`).
- No database: a per-license rate limit lives in server memory. If strict
  quotas are ever needed, use Upstash Redis (pay per request, no idle cost).

How it works (`src-tauri/src/plan.rs`):

- Words are counted after each successful paste, per local week (Mon–Sun).
- Free and the 7-day trial need no account. Pro is bought on the website (Polar
  checkout; Polar is merchant of record) and unlocked by **signing in** to the
  app (Account) with the purchase email and a 6-digit emailed code
  (`/api/auth/code`, `/api/auth/verify`).
- Sign-in returns a long-lived HMAC-signed session and, while an Ambient
  subscription is live, a signed **license token**:
  `<prefix>` + base64url(JSON payload) + `.` + base64url(Ed25519 signature).
  The app verifies the token offline against `licensePublicKey`.
- Tokens expire at the end of the billing period plus 7 days. The app trades
  its session at `/api/auth/refresh` every 6 hours and when its window gains
  focus, so renewals, cancellations and refunds reach it. Refresh is stateless;
  Neon only holds short-lived sign-in attempt counters (`auth_throttle`).
- Gift and support codes (`red-grizzly-4320`) still redeem under Account →
  Redeem a code (`/api/license/activate`); those tokens renew at
  `/api/license/refresh`.

The signing private key is **not** in this repo. It was generated to
`~/.ambient/license-signing-key.pem`; set it as `LICENSE_PRIVATE_KEY` on the
website's host. If you rotate it, update `licensePublicKey` and ship a new
build.

## Development

Prerequisites: [Rust](https://rustup.rs/), [Bun](https://bun.sh/), and the
platform tools in [BUILD.md](BUILD.md) (on macOS: Xcode Command Line Tools and
CMake).

```bash
bun install
bun run tauri dev          # the app
cd web && bun dev          # the website
```

The Silero VAD model the app needs is committed in `src-tauri/resources/models/`.
Speech models download from our Hugging Face account (`tryambientai`), with
`tryambient.ai/models` as the mirror fallback. The model catalog is our own
package in `packages/models` (`@ambient/models`), and the keyboard and audio
crates (`ambient-keys`, `ambient-recorder`, `ambient-cpal`) are vendored in
`src-tauri/vendor/`, so the app depends on no outside model host or package.

## Releasing

1. Create the GitHub repo named in `brand.config.json` (`githubRepo`).
2. Generate an updater key pair: `bun run tauri signer generate -w ~/.ambient/updater.key`,
   then put the public key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
   and the private key + password in the CI secrets `TAURI_SIGNING_PRIVATE_KEY`
   and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Code signing: an Apple Developer ID certificate + notarization for macOS
   (`APPLE_*` secrets), and a Windows signing certificate (Azure Trusted
   Signing via the `AZURE_*` secrets, plus `bundle.windows.signCommand`).
4. Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (and
   `Cargo.lock`), `package.json` and `RELEASE_VERSION` in `web/lib/releases.ts`,
   add a `web/lib/changelog.ts` entry, commit to `main`, then push a matching tag:

   ```bash
   git tag v0.1.1 && git push origin v0.1.1
   ```

   That one tag runs **Release** (`.github/workflows/release.yml`). It checks the
   tag equals the app version and points at a commit on `main`, then builds
   macOS (Apple silicon and Intel; signed, notarized and stapled, DMG included),
   Windows (x64 and ARM64; unsigned unless `AZURE_*` secrets exist) and Linux
   (AppImage, .deb, .rpm; x64 and ARM64), with signed updater artifacts. It
   uploads everything to the R2 bucket (`R2_BUCKET` variable) under
   `releases/<version>/`, writes `releases/latest.json` (updater feed) and
   `releases/manifest.json` (what `tryambient.ai/dl/<id>` resolves), publishes
   the GitHub release, then deletes older versions from R2 after a 15-minute
   grace period (`GRACE_MINUTES`) so in-flight downloads and updates finish.

   Only the repo admin can create `v*` tags (tag ruleset). Signing, notarization,
   updater and R2 secrets are scoped to the `release` environment, which accepts
   runs from `main` and `v*` tags only. Watch a run with `gh run watch`.

## Troubleshooting

User-facing help lives on the website (`/docs/troubleshooting`, `/docs/linux`).
Build problems: see [BUILD.md](BUILD.md).

## License

Copyright © 2026 Valenor Core Design FZCO (Dubai, UAE). All rights reserved.
The source is public for reading only; no right to use, copy, modify, build or
redistribute it is granted (see [LICENSE](LICENSE)). Open-source code it
includes keeps its own license and copyright notices: see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Permission requests:
legal@tryambient.ai.
