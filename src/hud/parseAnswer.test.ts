import assert from "node:assert/strict";
import { parseAnswer, stripCitations } from "./parseAnswer";

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

// Citation markers go; code and markdown links keep their brackets.
for (const [input, want] of [
  ["Sunny, 19 °C [1]. Rain unlikely [2][4].", "Sunny, 19 °C. Rain unlikely."],
  ["Sunny[1], warm [1, 2] and dry [3-5].", "Sunny, warm and dry."],
  ["See note[^1] and 【4†source】 here.", "See note and here."],
  ["[1] Lisbon is sunny.\n[2] Porto too.", "Lisbon is sunny.\nPorto too."],
  ["Use `arr[1]` here [2].", "Use `arr[1]` here."],
  ["```py\nx = a[1]\n```\nDone [1].", "```py\nx = a[1]\n```\nDone."],
  [
    "In [2024] the [1](https://x.y) link.",
    "In [2024] the [1](https://x.y) link.",
  ],
  ["`x`[1] foo", "`x` foo"],
]) {
  assert.equal(stripCitations(input), want, input);
}

console.log("parseAnswer: ok");
