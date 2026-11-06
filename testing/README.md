# Scenario suite

Realistic moments (what's on screen, what was said, the settings) run through
the app's real pipeline, graded automatically. It replaces the repetitive part
of manual testing and gates every release.

```bash
bun run test:scenarios                 # everything, real model, $0.50 cap
bun run test:scenarios --dry           # no model calls: cached replies only
bun run test:scenarios --only critical # by tag (comma-separated: draft,pl)
bun run test:scenarios --id draft.pl   # by id substring
bun run test:scenarios --as-os windows # Windows app ids on this build (an early signal only)
```

## How it works

1. **The app's hidden test mode** (`src-tauri/src/testing/`). It needs two
   switches together: `AMBIENT_TEST_MODE=1` and `--test-scenario <file>`; the
   flag alone refuses to start. It is compiled into release builds, so the
   artifact we ship is the one we test. In test mode the app starts no window,
   tray, shortcut, microphone or agent loop; keeps its data in a temporary
   folder; reads the screen, focused field, clock, settings, plan and user
   only from the scenario; records pastes, key presses, opened links, apps,
   reminders and cards instead of performing them; and talks only to the
   suite's local server. It prints one JSON report and exits.

   One scenario = one process, so no state leaks between scenarios. What
   runs is the real code: `actions::process_dictation_output` (markers, the
   first pass, the router, smart writing), then what the stop path does with
   the result (`agent::handle`, `writing::write_now`, the paste or "Did you
   mean to type this?"); for a screen, `context::snapshot` (the private-place
   judge) and `agent::proactive::consider`.

2. **The local server** (`lib/server.ts`) stands in for ours:
   `/api/ai/v1/chat/completions` (router, polish, how-to-type), and
   `/api/agent/answer` and `/api/agent/suggest` built from the server's own
   prompt code (`web/lib/answer-core.ts`, `web/lib/suggest-core.ts`). Web
   search returns canned results (`lib/search.ts`, never Tavily). Nothing
   touches Neon, Vercel or the user's account.

   Model calls go **directly to Baseten** with the same model as
   `web/lib/ai.ts` (`deepseek-ai/DeepSeek-V4-Flash-0731`; override with
   `TESTING_MODEL` if production's `AI_MODEL` differs), at temperature 0 with
   thinking off. Calling Baseten directly rather than the deployed `/api/ai`
   means no test token or account, no Free-pool or fair-use accounting, no
   Neon writes, and the prompts are still exactly the app's (the app builds
   them; the server only forwards them) plus the server's own answer and
   suggestion prompts.

3. **Grading** (`lib/grade.ts`): exact checks for everything structured
   (the route, the action, the suggestion kind, must-nots such as "opened
   the browser" or "typed the instruction word for word", substrings), and
   the same model as a judge (temperature 0, cached) for free text: who a
   draft is addressed to, its language, anything in `judge`.

## Reports

Each run writes `testing/out/<time>-<os>-layer<n>/`:

- `summary.md`: pass rates overall, by language and by tag; every failure
  with what was said, what happened and why it failed; skipped scenarios.
- `report.json`: every scenario's row (status, reasons, route, output).
- `scenarios/<id>.json` (what the app was given) and `<id>.report.json`
  (everything it did, in order), `logs/<id>.log` (the app's debug log).

A scenario is **skipped**, never passed or failed, when a model reply it
needed wasn't available (dry run, budget reached, upstream error): the app
would have fallen back, and that fallback isn't what's being tested.

## Costs

- Every model reply is cached in `testing/.cache/` by a hash of the model,
  messages and length cap; unchanged prompts are free on the next run.
- `--budget <usd>` (default `$0.50`, or `TESTING_BUDGET_USD`) stops spending:
  further calls are refused and their scenarios skipped. Spend is counted
  from the reply's token usage at `TESTING_PRICE_IN` / `TESTING_PRICE_OUT`
  USD per million tokens (defaults $0.30 / $1.20, above Baseten's list price,
  so the cap errs low).
- A full run of ~150 scenarios makes ~250 model calls (~150k tokens): a few
  cents. A re-run with nothing changed costs nothing.
- The key: `TESTING_BASETEN_API_KEY`, else `web/.env.local`'s
  `BASETEN_API_KEY`, else `BASETEN_API_KEY` from the shell. The app itself is
  never given the key.

## Release gate

`.github/workflows/release.yml` runs the suite inside the existing build
matrix, on the app it just built (no extra builds):

| Runner                   | Scenarios  | Layer |
| ------------------------ | ---------- | ----- |
| macos-26 (Apple silicon) | all        | 1     |
| ubuntu-24.04             | `critical` | 2     |
| windows-latest           | `critical` | 2     |

`--gate` fails the build (so `publish-r2` never publishes) unless:

- at least **95%** of the graded scenarios pass (`--min-pass`, or
  `TESTING_MIN_PASS`), and
- **every scenario tagged `critical` passes**. A critical scenario that was
  skipped (no model reply) fails the gate too: it wasn't checked.

`.github/workflows/testing.yml` (Actions › Scenario suite › Run, on main)
builds the app on Linux and runs everything, and with "layer2" also builds
on macOS and Windows and runs the critical scenarios there. Both read the
`TESTING_BASETEN_API_KEY` secret from the `release` environment and keep
`testing/.cache` between runs. Reports are uploaded as artifacts.

## Writing scenarios

`scenarios/*.json`, one file per area. `00-screens.json` holds shared
screens; any file may add its own under `screens`. A file's `defaults` apply
to each of its cases (tags are added, settings merged).

```jsonc
{
  "id": "draft.pl.mail.1", // unique; area.lang.place.n
  "about": "What this checks, in a sentence.",
  "tags": ["critical", "regression"], // critical = release gate
  "lang": "pl",
  "os": ["macos"], // optional: only where it applies (default all)
  "kind": "dictation", // or "screen": the user stays on a window
  "key": "dictate", // or "ask", "polish" (the shortcut)
  "screen": "mail_reply_pl", // a shared screen, or the screen itself
  "say": "odpisz że wszystko ok",
  "now": "2026-11-05T10:00", // local time (this is the default)
  "card": { "kind": "answer", "question": "…", "text": "…" }, // already up
  "settings": {
    "intelligence": "cloud", // auto | device | cloud | none
    "polish": false,
    "writing": "smart", // smart | as_said | polish
    "proactive": true,
    "languages": ["pl", "en"],
    "raw": {}, // any AppSettings field, merged last
  },
  "plan": "pro", // or "free"
  "me": { "name": "Matt Nowakowski", "email": "matt@example.com" },
  "regression": "0.1.8 #5: …", // the bug this guards against
  "expect": {
    "route": "draft", // or a list of acceptable ones
    "act": "open_app", // for route act
    "suggestion": "draft_reply", // for route suggest
    "recipient": "Anna", // judged
    "language": "pl", // judged
    "judge": "Anything else, in a sentence.",
    "contains": ["…"],
    "not_contains": ["…"],
    "typed": " not doing much", // exactly what was typed (spaces, case)
    "shows": ["hud.notice.cantClose"], // some card's text or i18n key
    "not_shows": ["cantDoYet"], // no card's text or i18n key
    "card_text_not_matches": ["\\[\\d+\\]"], // regexes no card's text may match
    "max_sources": 3, // no answer card shows more source chips
    "min_sources": 1, // some answer card shows at least this many
    "sources_distinct_sites": true, // never two chips from one site
    "must_not": ["typed_verbatim", "opened_browser"],
  },
}
```

A screen: `app` and `bundle` (each a string, or per OS:
`{"macos": "com.apple.mail", "windows": "olk.exe", "linux": "thunderbird"}`),
`title`, `url`, `text` (the window's text, as the screen reader returns it),
`focus` (`role`, `editable`, `secure`, `value`, `caret`, `selection`,
`monospace` for a code editor or terminal; `value` up to `caret` is what's
before the caret, which a dictation is joined to), and
for private-place checks `frame_urls`, `frame_titles`, `ui_labels`,
`private_window`. `reply_button: true` lets "press Reply" succeed.

Routes: `write` (typed as said), `polish`, `draft` (written for the user),
`answer`, `act`, `remind`, `recall`, `help`, `report`, `dismiss` (a card
closed by voice), `handled`, `did_you_mean` (offered with Copy: nowhere to
type), and for screens `suggest`, `quiet`, `back_off` (a private place).
Must-nots: `opened_browser`, `typed`, `typed_verbatim`, `answered`,
`suggested`, `model_call` (anything sent to the model server), `read_screen`,
`silent` (nothing visible happened).

Each OS runs a scenario with that OS's app ids, so OS-specific behaviour
(Windows' `explorer.exe`, Linux app ids) is tested where it lives. On a Mac,
the Windows and Linux ids are never used; CI covers them.

## Debugging one scenario

```bash
cd src-tauri && cargo build
bun testing/run.ts --id answer.en.weather.desktop   # then read its log and report
# or the Rust entry on its own (with the suite's server running for model calls):
AMBIENT_TEST_MODE=1 ./target/debug/ambient --test-scenario ../testing/out/<run>/scenarios/<id>.json
```

`cargo test` doesn't run the suite (it is opt-in); the test mode's own unit
tests are in `src-tauri/src/testing/mod.rs`.
