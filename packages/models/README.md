# @ambient/models

Ambient's speech-to-text model catalog and the helpers that grade, rank and
recommend its models. The frontend imports it as `@ambient/models`; the Rust
app compiles in a copy of `catalog.json` (`bun run sync:catalog` copies it to
`src-tauri/src/catalog/catalog.json`, `bun run check:catalog` verifies it).

## Use

```ts
import {
  recommend,
  CURATED_MODELS,
  getModel,
  modelFile,
  LANGUAGE_DETECTION_MODEL,
} from "@ambient/models";

const picks = recommend(["en", "de"], { engineVersion });
for (const pick of picks) {
  const file = modelFile(pick.model); // the default (benchmarked) file
  (pick.model.repository, pick.model.revision, file.filename, file.sha256);
}
```

Files download from
`https://huggingface.co/<repository>/resolve/<revision>/<filename>` (our
`tryambientai` account) and are verified against `sha256`. `files` holds every
published file, keyed by quant; `quant` names the default. Unknown fields can
be ignored; `schema` changes on any breaking change.

Grades are on measured error at the benchmarked quant: A under 5%, B under
10%, C under 20%, D under 30%, F beyond; each `+`/`-` step is a factor of ∛2.
The speed meter counts how many of 1.5, 3, 5, 10 and 20 seconds the model
beats when processing a 30-second dictation on the benchmark GPU.

## Changing the catalog

Edit `catalog.json`, then run `bun install` (the app installs this package by
copy) and `bun run sync:catalog`. `dist/` is compiled JavaScript with type
declarations; it has no build step here.

Licensing and provenance: see `LICENSE` and `NOTICE`.
