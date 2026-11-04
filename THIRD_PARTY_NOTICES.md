# Third-party notices

This app includes code and designs from the projects below.

## Handy

The app is a fork of Handy (https://github.com/cjpais/Handy).
MIT License, Copyright (c) 2025 CJ Pais. Full text:

```
MIT License

Copyright (c) 2025 CJ Pais

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Packages derived from Handy

- `packages/models` (`@ambient/models`): from `@handy-computer/models` 0.2.3.
  MIT License.
- `src-tauri/vendor/ambient-keys` and `src-tauri/vendor/ambient-recorder`: from
  the crates `handy-keys` 0.3.4 and `handy-recorder` 0.1.0. MIT License.
- `src-tauri/vendor/ambient-cpal`: from `handy-cpal` 0.18.2, Handy's fork of
  cpal (RustAudio). Apache License 2.0; full text in its `LICENSE`.

Each directory carries its license and a `NOTICE` describing the changes.

## liquid-gooey

Liquid indicator and quick-actions effects (`node_modules/liquid-gooey`, used
in `src/components/ui/LiquidIndicator.tsx` and
`src/components/home/QuickActions.tsx`).
MIT License, Copyright (c) 2026 Jakub Antalik.

## AICSS Orbs

Activity indicators vendored in `src/components/orb/`
(https://www.aicss.dev/components/orbs). MIT License, Copyright (c) 2026 AICSS.

## MIT License text (Handy, liquid-gooey, AICSS Orbs)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## transitions.dev

Motion snippets ported by hand into `src/styles/transitions.css` and
`src/components/ui/Transitions.tsx` (https://transitions.dev).

```
Transitions.dev License
Copyright (c) 2026 Jakub Antalik / Transitions.dev

You (and any coding agent working for you) may use this skill and the
transitions it contains in unlimited personal and commercial projects,
copy and modify them freely, and ship them to your users as part of your
own product or website. You may install and run this skill in any coding
agent to apply the transitions to your code.

Restriction: you may not repackage, resell, or publish the collection (or a
substantial part of it) as a competing transitions library, motion pack,
or animation kit. Using the transitions inside templates and themes you
sell is allowed; see the full terms. Use the transitions in your products, not as a product of
their own.

This skill is free for everyone, including companies, and needs no plan.
Paid plans cover the Pro transitions and paid Agent features: Pro is for
solo builders and freelancers (one individual paying personally,
including freelance client work); Business is for companies and teams,
even a single person at a company (one seat per person). If a company
pays for or reimburses the plan, it must be Business.

Full terms: https://transitions.dev/terms.html
```

## Speech models

Speech models are not bundled with Ambient (except the Silero VAD model,
MIT). They are downloaded on demand from unmodified copies of the GGUF
conversions published by the Handy project (huggingface.co/handy-computer),
hosted at huggingface.co/tryambientai. Each model keeps its original licence
and attribution, shown in its model card; most are Apache-2.0, MIT or
CC-BY-4.0, some carry vendor licences (NVIDIA Open Model License, FunASR
Model License) and a few are licensed for non-commercial use only. The
catalog's `license` field records each model's licence.

## On-device AI (optional download)

Not bundled. "Download on-device AI" fetches two things on request:
llama.cpp's `llama-server` from the unmodified release archives published by
the ggml-org/llama.cpp project (MIT; the archive includes its LICENSE), and
the Qwen3 1.7B model (GGUF, Q8_0) published by the Qwen team at
huggingface.co/Qwen/Qwen3-1.7B-GGUF (Apache-2.0).
