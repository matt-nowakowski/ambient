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
huggingface.co/Qwen/Qwen3-1.7B-GGUF (Apache-2.0, Copyright 2025 Alibaba
Cloud). llama.cpp: MIT License, Copyright (c) 2023-2026 The ggml authors.

## Speech engine: transcribe.cpp, ggml, Silero VAD, miniz

Speech recognition and voice activity detection run through the
`transcribe-cpp` crate (transcribe.cpp, from the Handy project), which builds
in ggml (the tensor library behind whisper.cpp and llama.cpp), an offline
segmentation translated from Silero VAD, and miniz. The Silero VAD v6.2 model
is bundled in `src-tauri/resources/models/`. All MIT License (text above):

- transcribe.cpp: Copyright (c) 2026 The transcribe.cpp authors
- ggml: Copyright (c) 2023-2026 The ggml authors
- Silero VAD (code and model): Copyright (c) 2020-present Silero Team
- miniz: Copyright 2013-2014 RAD Game Tools and Valve Software; Copyright
  2010-2014 Rich Geldreich and Tenacious Software LLC

## Rust crates built from forks

- `rdev` (global keyboard events), the RustDesk fork of rdev: MIT License,
  Copyright (c) 2020 Nicolas Patry.
- `hf-hub` (model downloads from Hugging Face), our modified fork of
  huggingface/hf-hub: Apache License 2.0, Copyright Hugging Face. Our change
  adds cancellable downloads.
- `tao` and `tao-macros` (windowing), our modified fork of tauri-apps/tao:
  Apache License 2.0 (tao-macros: MIT or Apache-2.0), Copyright 2021-2023 The
  Tauri Programme in the Commons Conservancy; portions Copyright the winit
  contributors.
- `tauri-nspanel` (macOS panels): MIT or Apache-2.0, Copyright (c) 2023 -
  Present Victor Aremu.

## Tauri

The app is built on Tauri 2 (https://tauri.app) and its plugins: MIT or
Apache License 2.0, at your option. Copyright 2019-2026 The Tauri Programme
in the Commons Conservancy.

## Chinese conversion: ferrous-opencc and OpenCC

Simplified/Traditional Chinese conversion uses `ferrous-opencc` (Copyright
apoint123) with the OpenCC dictionaries (Copyright Carbo Kuo / BYVoid and the
OpenCC contributors). Both Apache License 2.0
(https://www.apache.org/licenses/LICENSE-2.0).

## Other Rust crates

The app links about 800 crates from crates.io, each under a permissive
licence (MIT, Apache-2.0, BSD, ISC, Zlib, Unicode, MPL-2.0 and similar; no
GPL). `docs/third-party-licenses/rust-crates.md` lists every crate with its
licence. The MPL-2.0 crates (symphonia, used to decode audio files; cssparser,
selectors and dtoa-short, used by the webview layer; epoll; option-ext) are
used unmodified, and their source is available from crates.io.

## Fonts

All under the SIL Open Font License 1.1 (text below):

- Inter (the app's typeface, via `@fontsource-variable/inter`): Copyright 2016
  The Inter Project Authors (https://github.com/rsms/inter).
- Geist (the website and the launch video, `video/public/fonts`): Copyright (c)
  2023 Vercel, in collaboration with basement.studio.
- Noto Sans CJK (a subset in `src/assets/fonts/cjk-subset.woff2`, for Chinese,
  Japanese and Korean language names): Copyright 2014-2021 Adobe
  (http://www.adobe.com/), with Reserved Font Name 'Source'.

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION AND CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
