import assert from "node:assert/strict";
import { parseAnswer } from "./parseAnswer";

// Plain text stays one segment.
assert.deepEqual(parseAnswer("Just text."), [
  { kind: "text", text: "Just text." },
]);

// A fenced block, with the text around it.
assert.deepEqual(parseAnswer("Use this:\n```rust\nfn main() {}\n```\nDone."), [
  { kind: "text", text: "Use this:\n" },
  { kind: "code", text: "fn main() {}", block: true },
  { kind: "text", text: "\nDone." },
]);

// Still streaming: an open fence is already code.
assert.deepEqual(parseAnswer("Run:\n```sh\nnpm i"), [
  { kind: "text", text: "Run:\n" },
  { kind: "code", text: "npm i", block: true },
]);

// Inline code and links; a sentence's full stop isn't part of the link.
assert.deepEqual(parseAnswer("Set `x = 1`, see https://example.com/a?b=1."), [
  { kind: "text", text: "Set " },
  { kind: "code", text: "x = 1", block: false },
  { kind: "text", text: ", see " },
  { kind: "link", url: "https://example.com/a?b=1" },
  { kind: "text", text: "." },
]);

// Nothing at all.
assert.deepEqual(parseAnswer(""), []);

console.log("parseAnswer: ok");
