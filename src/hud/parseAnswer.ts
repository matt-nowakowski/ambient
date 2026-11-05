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
    if (code.trim()) out.push({ kind: "code", text: code, block: true });
    at = (m.index ?? 0) + m[0].length;
  }
  inline(src.slice(at));
  return out;
}
