# AGENTS.md

Guidance for AI coding assistants working in this repository.

Ambient is a desktop colleague: a live agent that writes, answers, acts,
remembers and offers suggestions on screen (it never talks out loud), plus
meeting notes and free, unlimited dictation. It runs on macOS, Windows and
Linux with the same agent features everywhere; only where the intelligence
runs differs (the Intelligence setting: Automatic, On this computer only,
Cloud, No AI). The repo is public so users can verify what the app does
(see `docs/VERIFY.md`); the licence is view-only. The app and website never
link to the repo.

## Layout

- `src-tauri/` Rust core (Tauri 2). `src/` React interface. `web/` website and
  the API the app calls (Next.js on Vercel). `testing/` scenario suite.
  `video/` launch video (Remotion). `packages/models` model catalog.
- `docs/ARCHITECTURE.md` has the data-flow diagram and the full module map;
  `docs/VERIFY.md` maps each privacy claim to code.

### The Rust core (`src-tauri/src/`)

- `lib.rs` startup and managers; `settings.rs` the settings store (and the
  `Intelligence` enum); `commands/` Tauri commands for the UI; `cli.rs` flags.
- Speech: `managers/audio.rs`, `audio_toolkit/` (capture, Silero VAD),
  `managers/transcription*.rs`, `engine_supervisor/` (transcribe-cpp in a
  supervised worker), `language_detection/`.
- Dictation: `transcription_coordinator.rs` → `actions.rs` (polish, paste),
  `clipboard.rs`, `paste_tx/`, `corrections.rs`, `screen_names.rs`.
- `agent/`: `router.rs` decides, by reasoning over what was said and the
  screen, whether to type, write, answer, act or answer a card (never app,
  site or phrase rules; only guards stay as code); `writing.rs` smart
  writing; `answer.rs` answer cards (server or on device); `act.rs`
  actions; `proactive.rs` + `judge.rs` suggestions; `wake.rs` hands-free;
  `llm.rs` is the single place a model is called (`ai_off` stops every call
  under No AI).
- `context/`: screen text through accessibility APIs; never-watch list,
  private-page judgement (`judge.rs`, `sensitive.rs`), redaction (`redact.rs`).
- `recall/`: encrypted local store (screen memory, meetings, the network
  ledger). `recall::log_request` must be called before any outbound request.
- `meeting/`: capture, segmentation, notes; `deliver.rs` emails notes.
- `hud.rs` (+ `hud_linux.rs`, `hud_keys.rs`): the HUD panel for cards.
- `plan.rs` trial, sign-in, license tokens; `limits.rs` Free's limits;
  `telemetry.rs` opt-in counts; `checkin.rs` daily check-in;
  `remote_config.rs` remote tunables; `updates.rs` self-update.
- `local_llm.rs`: the downloaded on-device model via llama-server on
  127.0.0.1; `apple_intelligence.rs` Apple's on-device model.
- `testing/`: the hidden test mode the scenario suite drives.

## Commands

```bash
bun install                       # root and video use bun; web uses npm (package-lock.json, what Vercel builds with)
bun run tauri dev                 # the app (CMAKE_POLICY_VERSION_MINIMUM=3.5 if cmake complains on macOS)
cd web && npm ci && npm run dev   # the website

bun run lint                      # ESLint (src/)
bun run format:check              # Prettier + cargo fmt (bun run format to fix)
bun run check:translations        # every locale has the English keys
bun run check:egress              # only allowlisted files reach the network
cd src-tauri && cargo test        # Rust tests; cargo clippy before committing
cd src-tauri && cargo deny check licenses   # dependency licences (deny.toml)
cd web && npx tsc --noEmit        # if you touched web/
bun run test:scenarios            # scenario suite (testing/README.md)
```

When several agents share a machine, prefix cargo commands with the shared
`CARGO_TARGET_DIR` you were given (disk is tight). Platform setup is in
[BUILD.md](BUILD.md).

## Rules

- **Network.** Any new outbound request goes in a file on the allowlist in
  `scripts/check-egress.ts`, calls `crate::recall::log_request(destination,
purpose, exactly_what_is_sent)` first, gets a `privacy.ledger.purpose.*`
  label in every locale, and a row in `docs/VERIFY.md`. Audio never goes near
  it. Screen text is redacted (`context::redact::redact`) before it leaves.
  If it changes what the privacy policy says, update `web/app/privacy/page.tsx`.
- **Remote config.** `web/lib/agent/config-schema.json` is mirrored by the
  bounds in `remote_config.rs` (a test checks they match): change both.
- **Free's AI pool.** Background routing calls don't spend it:
  `completionKind` in `web/lib/ai.ts` matches system-prompt prefixes ("You
  route a voice transcript", "You decide how to type what the user just
  dictated"). Keep the prefixes or update `completionKind` in the same change.
- **i18n.** Every user-facing string goes through i18next (ESLint enforces
  it in JSX). Add the English key to `src/i18n/locales/en/translation.json`
  and real translations to every other locale, keeping `{{variables}}` and
  CLDR plural forms. A new language: copy `en/translation.json` to
  `locales/<code>/` and add it to `LANGUAGE_METADATA` in
  `src/i18n/languages.ts`.
- **Branding.** The name is never hardcoded; it comes from
  `brand.config.json`: `{{appName}}` in locales, `BRAND` from `@/lib/brand`
  in React, `env!("BRAND_NAME")` etc. in Rust (from `build.rs`),
  `web/lib/brand.ts` on the website. `bun run brand` rewrites static files;
  `bun run brand:check` fails CI on drift.
- **Vendored code** (`src-tauri/vendor/ambient-*`, `packages/models`) keeps
  its LICENSE and NOTICE; list new third-party code in
  `THIRD_PARTY_NOTICES.md` (shown in the app under About › Acknowledgments).
  To change the model catalog, edit `packages/models/catalog.json`, then
  `bun install && bun run sync:catalog`.
- **Tauri commands.** Regenerate `src/bindings.ts` (tauri-specta), or
  hand-edit it consistently and say so.
- **Style.** Rust: `cargo fmt`, `cargo clippy`, no `unwrap` in production
  paths. TypeScript: strict, no `any`, functional components, Tailwind,
  `@/` → `src/`. Match the surrounding comment density and tone: plain,
  short, warm.
- **Commits.** Conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`,
  `chore:`), message about why. Commit explicit paths only (other agents
  may have staged work). Never commit keys, `.env` files or audio.

## Releases

The release gate is the scenario suite: `release.yml` builds through
`build.yml` with the full suite run on the built app, and publishes only if
it passes. A release is a version bump
in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`),
`package.json` and `RELEASE_VERSION` in `web/lib/releases.ts`, a
`web/lib/changelog.ts` entry, and a `v*` tag that only the repo admin can
push. Agents don't tag, push, release or deploy.

## CLI flags

`--toggle-transcription`, `--toggle-post-process`, `--cancel` (sent to the
running instance through `tauri_plugin_single_instance`), `--start-hidden`,
`--no-tray`, `--debug`. They are runtime-only and never change saved
settings. Definitions in `cli.rs`, applied in `lib.rs`, shared logic in
`signal_handle.rs`.

## Platform notes

- macOS: Metal; Accessibility permission for shortcuts and screen text; the
  memory key lives in the Keychain (release builds).
- Windows: Vulkan; implicit Vulkan layers are disabled for the process
  (`VK_LOADER_LAYERS_DISABLE=~implicit~` in `main.rs`; opt out with
  `AMBIENT_KEEP_VULKAN_IMPLICIT_LAYERS=1`). Windows and Linux code can't be
  run on a Mac; cross-check that it compiles.
- Linux: OpenBLAS + Vulkan; the overlay uses GTK layer shell (disable with
  `AMBIENT_NO_GTK_LAYER_SHELL=1`); limited Wayland support.
