/**
 * A model's deliberation is never the answer. Mirrors `strip` in
 * src-tauri/src/agent/reasoning.rs: reasoning blocks in their tag spellings
 * are removed, an unclosed opening tag hides everything after it, and a lone
 * closing tag hides everything before it. Pure: no server-only imports.
 */

const TAGS = ["think", "thinking", "thought", "thoughts", "reasoning", "reflection", "scratchpad"];
const NAMES = TAGS.join("|");
const BLOCK = new RegExp(`<(${NAMES})(?:\\s[^>]*)?>[\\s\\S]*?</\\1>`, "gi");
const UNCLOSED = new RegExp(`<(?:${NAMES})(?:\\s[^>]*)?>[\\s\\S]*$`, "i");
const CLOSE = new RegExp(`</(?:${NAMES})>`, "gi");

export function stripReasoning(reply: string): string {
  let out = reply.replace(BLOCK, "").replace(UNCLOSED, "");
  let end = -1;
  for (const m of out.matchAll(CLOSE)) end = (m.index ?? 0) + m[0].length;
  if (end >= 0) out = out.slice(end);
  return out.trim();
}
