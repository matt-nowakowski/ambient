# scripts

One line per script. Most run through `bun run <name>` (see `package.json`).

| Script                             | What it does                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apply-brand.ts`                   | `bun run brand`: writes `brand.config.json` into files that can't read it at runtime; `brand:check` fails on drift.  |
| `build-cjk-font.ts`                | `bun run build:cjk-font`: rebuilds the Noto Sans CJK subset in `src/assets/fonts/`; `check:cjk-font` verifies it.    |
| `check-egress.ts`                  | `bun run check:egress`: fails if code outside the egress allowlist can reach the network (see `docs/VERIFY.md`).     |
| `check-model-language-coverage.ts` | `bun run check:model-languages`: every model's languages map to a language the app can save.                         |
| `check-translations.ts`            | `bun run check:translations`: every locale has exactly the English keys.                                             |
| `eval_router.py`                   | Measures routing accuracy of the voice agent (`src-tauri/src/agent/router.rs`) against labelled examples.            |
| `marketing-upload.ts`              | Uploads creator videos for the marketing suite to R2, from a maintainer's machine (never CI).                        |
| `mirror_models.py`                 | Mirrors the speech models to our backup storage (run by `mirror-models.yml`).                                        |
| `sync-catalog.ts`                  | `bun run sync:catalog`: copies the model catalog from `packages/models` into the Rust app; `check:catalog` verifies. |
| `ci/stage-transcribe-libs.sh`      | CI: stages transcribe-cpp's dynamic GPU backend libraries next to the Linux and Windows builds.                      |

The website has its own scripts in `web/scripts/` (brand sync, email art, server-side tests).
