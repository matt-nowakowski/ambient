// The Rust app compiles in a copy of the model catalog (src-tauri can't
// depend on node_modules or packages/: cargo-only builds never run bun
// install). The source of truth is our vendored package, packages/models
// (`@ambient/models`); this keeps the Rust copy identical to it.
//
//   bun run sync:catalog    copy packages/models/catalog.json into src-tauri
//   bun run check:catalog   fail if the copy differs (CI)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(
  new URL("../packages/models/catalog.json", import.meta.url),
);
const target = fileURLToPath(
  new URL("../src-tauri/src/catalog/catalog.json", import.meta.url),
);
const { version } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../packages/models/package.json", import.meta.url)),
    "utf8",
  ),
) as { version: string };

const expected = readFileSync(source);
// Only a missing copy counts as "differs"; any other read error is rethrown
// rather than overwriting a file that couldn't be read.
let current: Buffer | undefined;
try {
  current = readFileSync(target);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}

if (current?.equals(expected)) {
  console.log(`catalog.json matches packages/models@${version}`);
} else if (process.argv.includes("--check")) {
  console.error(
    `src-tauri/src/catalog/catalog.json differs from packages/models@${version}; run \`bun run sync:catalog\``,
  );
  process.exit(1);
} else {
  writeFileSync(target, expected);
  console.log(`catalog.json synced from packages/models@${version}`);
}
