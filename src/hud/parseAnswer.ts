/** An answer's text, split into what the card renders differently: plain
 * text, code (fenced blocks and `inline`) and links. Answers stream in, so a
 * fence that hasn't closed yet is still code. */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string; block: boolean }
  | { kind: "link"; url: string };

const FENCE = /```[\w+-]*[^\S\n]*\n?([\s\S]*?)(?:```|$)/g;
/** Same shape as Rust's `LINK` (agent/answer.rs): trailing punctuation stays
 * text. */
const INLINE = /`([^`\n]+)`|(https?:\/\/[^\s<>()[\]"']+[^\s<>()[\]"'.,;:!?])/g;

/** [1], [1, 2], [1-3], [^1], 【1】, 【1†source】; not a markdown link "[1](…)".
 * The same rule as the server's and Rust's (web/lib/answer-core.ts,
 * src-tauri agent/answer.rs): this is the card's own safety net. */
const MARK = String.raw`(?:\[\^?\d{1,3}(?:\s*[,–-]\s*\^?\d{1,3})*\](?!\()|【\d{1,3}[^】\n]{0,40}】)`;
const LEADING = new RegExp(String.raw`^(?:${MARK}[^\S\n]*)+`, "gm");
const INNER = new RegExp(String.raw`[^\S\n]*${MARK}`, "g");
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;

/** An answer without citation markers (its sources are chips, not
 * numbers); code is left as it is. */
export function stripCitations(text: string): string {
  const parts = text.split(CODE);
  return parts
    .map((part, i) => {
      if (i % 2) return part;
      // A part that follows code on the same line doesn't start a line.
      const midLine = i > 0 && !parts[i - 1].endsWith("\n");
      return ((midLine ? "\u0000" : "") + part)
        .replace(LEADING, "")
        .replace(INNER, "")
        .replace(/^\u0000/, "");
    })
    .join("");
}

export function parseAnswer(src: string): Segment[] {
  const out: Segment[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.kind === "text") last.text += text;
    else out.push({ kind: "text", text });
  };
  const inline = (text: string) => {
    let at = 0;
    for (const m of text.matchAll(INLINE)) {
      pushText(text.slice(at, m.index));
      if (m[1] !== undefined) {
        out.push({ kind: "code", text: m[1], block: false });
      } else {
        out.push({ kind: "link", url: m[2] });
      }
      at = (m.index ?? 0) + m[0].length;
    }
    pushText(text.slice(at));
  };
  let at = 0;
  for (const m of src.matchAll(FENCE)) {
    if (m[0] === "") break; // `$` matched at the very end
    inline(src.slice(at, m.index));
    const code = m[1].replace(/\n$/, "");
    at = (m.index ?? 0) + m[0].length;
    if (code.trim()) {
      out.push({ kind: "code", text: code, block: true });
      // The block is its own line already: the newline after the fence
      // would show as an empty line under it.
      if (src[at] === "\n") at += 1;
    }
  }
  inline(src.slice(at));
  return out;
}
