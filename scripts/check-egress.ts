/**
 * Machine-checked egress: fails if code that can reach the network appears
 * anywhere in the app outside the files listed below, or if the modules that
 * hold audio refer to any of it.
 *
 * What it checks:
 * 1. Rust (src-tauri/src, src-tauri/vendor) and Swift (src-tauri/swift): an
 *    HTTP client, socket or networking plugin appears only in EGRESS_FILES.
 * 2. The audio and speech modules (AUDIO_PATHS) mention no network API and no
 *    module that sends anything.
 * 3. The UI (src/) makes no request of its own (fetch, XMLHttpRequest,
 *    WebSocket, EventSource, sendBeacon, the Tauri HTTP plugin): it can only
 *    ask the Rust side, which is covered by 1.
 *
 * It is a text check, so it is deliberately broad (a mention in code counts,
 * comments don't). docs/VERIFY.md explains what each listed file sends.
 *
 * Run: bun run check:egress
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");

/** Every file allowed to open a network connection, and why. */
const EGRESS_FILES: Record<string, string> = {
  "src-tauri/src/plan.rs":
    "trial, sign-in, plan and billing calls to tryambient.ai",
  "src-tauri/src/llm_client.rs":
    "hosted AI requests (OpenAI-compatible, tryambient.ai)",
  "src-tauri/src/local_llm.rs": "the on-device model server, on 127.0.0.1 only",
  "src-tauri/src/telemetry.rs": "anonymous usage counts (opt-in)",
  "src-tauri/src/checkin.rs": "daily anonymous check-in",
  "src-tauri/src/remote_config.rs": "assistant settings download",
  "src-tauri/src/feedback.rs": "feedback you choose to send",
  "src-tauri/src/agent/answer.rs":
    "answers and web search through tryambient.ai",
  "src-tauri/src/agent/judge.rs": "cloud suggestion check (opt-in, Pro)",
  "src-tauri/src/meeting/deliver.rs": "meeting notes by email (opt-in)",
  "src-tauri/src/managers/model.rs":
    "speech and on-device AI model downloads (Hugging Face)",
  "src-tauri/src/managers/model/download.rs":
    "model and runtime downloads (mirror, GitHub)",
  "src-tauri/src/updates.rs": "update check and download",
  "src-tauri/src/lib.rs": "registers the updater plugin used by updates.rs",
  // Tests only: a fake server on 127.0.0.1.
  "src-tauri/src/managers/model/download/tests.rs": "test server on 127.0.0.1",
};

/** Code that can reach the network from Rust or Swift. */
const NETWORK_RUST =
  /\b(reqwest|ureq|hyper|isahc|attohttpc|surf|curl|tungstenite|tokio_tungstenite|websocket|hf_hub::api|ApiBuilder|tauri_plugin_http|tauri_plugin_updater|tauri_plugin_websocket|tauri_plugin_upload|TcpStream|TcpListener|UdpSocket|ToSocketAddrs)\b|\b(std|tokio|async_std|smol)::net::(?!(Ipv4Addr|Ipv6Addr|IpAddr)\b)/;
const NETWORK_SWIFT =
  /\b(URLSession|URLRequest|NSURLConnection|NWConnection|NWListener|CFStream|CFSocket|Network\.framework)\b|^\s*import\s+Network\b/;

/**
 * Where audio lives: capture, VAD, the speech engine and meeting capture.
 * Text that comes out of speech recognition moves on to other modules; audio
 * samples do not.
 */
const AUDIO_PATHS = [
  "src-tauri/src/audio_toolkit/",
  "src-tauri/src/audio_feedback.rs",
  "src-tauri/src/engine_supervisor/",
  "src-tauri/src/language_detection/",
  "src-tauri/src/managers/audio.rs",
  "src-tauri/src/managers/transcription.rs",
  "src-tauri/src/managers/transcription/",
  "src-tauri/src/meeting/capture.rs",
  "src-tauri/src/meeting/linux.rs",
  "src-tauri/src/meeting/windows.rs",
  "src-tauri/src/meeting/segmenter.rs",
  "src-tauri/vendor/ambient-recorder/",
  "src-tauri/vendor/ambient-cpal/",
];
/** Modules that send something, which audio code must not call. */
const SENDING_MODULES =
  /\b(crate|super)::(llm_client|local_llm|telemetry|feedback|checkin|plan|remote_config|updates|actions|agent::(answer|judge|llm|router|writing|act)|meeting::deliver|managers::model::download)\b/;

const NETWORK_UI =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource)\b|@tauri-apps\/plugin-(http|websocket|upload)/;

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "target" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/**
 * Lines of code with comments removed. A small lexer: it knows strings and
 * character literals, so a `//` or `/*` inside one isn't taken for a comment
 * and a comment's text is never taken for code.
 */
function codeLines(file: string): [number, string][] {
  const src = fs.readFileSync(file, "utf8");
  const lines: string[] = [""];
  const charLiteral = /^'(\\.|[^\\'])'/;
  let mode: "code" | "line" | "block" | "string" = "code";
  let depth = 0;
  let i = 0;
  const keep = (text: string) => {
    for (const ch of text) {
      if (ch === "\n") lines.push("");
      else if (mode === "code" || mode === "string")
        lines[lines.length - 1] += ch;
    }
  };
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (mode === "code") {
      if (two === "//") {
        mode = "line";
        i += 2;
      } else if (two === "/*") {
        mode = "block";
        depth = 1;
        i += 2;
      } else if (c === "'" && charLiteral.test(src.slice(i, i + 4))) {
        const lit = src.slice(i, i + 4).match(charLiteral)![0];
        keep(lit);
        i += lit.length;
      } else {
        if (c === '"') mode = "string";
        keep(c);
        i++;
      }
    } else if (mode === "string") {
      if (c === "\\") {
        keep(src.slice(i, i + 2));
        i += 2;
        continue;
      }
      keep(c);
      if (c === '"') mode = "code";
      i++;
    } else if (mode === "line") {
      if (c === "\n") mode = "code";
      keep(c);
      i++;
    } else if (two === "/*") {
      depth++;
      i += 2;
    } else if (two === "*/") {
      if (--depth === 0) mode = "code";
      i += 2;
    } else {
      keep(c);
      i++;
    }
  }
  return lines
    .map((l, n): [number, string] => [n + 1, l])
    .filter(([, l]) => l.trim() !== "");
}

const failures: string[] = [];
const seen = new Set<string>();

const native = [
  ...walk(path.join(root, "src-tauri/src"), [".rs"]),
  ...walk(path.join(root, "src-tauri/vendor"), [".rs"]),
  ...walk(path.join(root, "src-tauri/swift"), [".swift"]),
];
for (const file of native) {
  const name = rel(file);
  const pattern = name.endsWith(".swift") ? NETWORK_SWIFT : NETWORK_RUST;
  const isAudio = AUDIO_PATHS.some((p) =>
    p.endsWith("/") ? name.startsWith(p) : name === p,
  );
  for (const [n, line] of codeLines(file)) {
    const net = line.match(pattern);
    if (net) {
      seen.add(name);
      if (!(name in EGRESS_FILES) || isAudio) {
        failures.push(
          `${name}:${n}: network code (${net[0]}) outside the egress allowlist`,
        );
      }
    }
    const sends = isAudio && line.match(SENDING_MODULES);
    if (sends) {
      failures.push(
        `${name}:${n}: audio module refers to ${sends[0]}, which sends data`,
      );
    }
  }
}

for (const file of walk(path.join(root, "src"), [".ts", ".tsx"])) {
  for (const [n, line] of codeLines(file)) {
    const m = line.match(NETWORK_UI);
    if (m)
      failures.push(
        `${rel(file)}:${n}: the UI makes a request (${m[0].trim()}); go through Rust`,
      );
  }
}

// A listed file that no longer reaches the network should leave the list, so
// the list stays an exact map of where data can leave.
for (const name of Object.keys(EGRESS_FILES)) {
  if (!seen.has(name))
    failures.push(
      `${name}: listed in EGRESS_FILES but has no network code; remove it`,
    );
}

if (failures.length) {
  console.error(
    "Egress check failed:\n" + failures.map((f) => `  ${f}`).join("\n"),
  );
  console.error(
    "\nIf a new file must reach the network, add it to EGRESS_FILES in scripts/check-egress.ts",
  );
  console.error(
    "with what it sends, ledger the request (crate::recall::log_request) and update docs/VERIFY.md.",
  );
  process.exit(1);
}
console.log(
  `Egress check passed: ${Object.keys(EGRESS_FILES).length} files may reach the network; audio modules and the UI reach none.`,
);
