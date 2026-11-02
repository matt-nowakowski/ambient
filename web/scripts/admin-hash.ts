/**
 * Prints an ADMIN_PASSWORD_HASH for the /admin login.
 *
 *   bun scripts/admin-hash.ts
 *
 * Reads the password from stdin without echoing it (or from a pipe:
 * `printf %s "$PW" | bun scripts/admin-hash.ts`). Output format:
 *   scrypt:<N>:<r>:<p>:<salt base64>:<derived key base64>
 */
import { randomBytes } from "node:crypto";
import { HASH_PARAMS, scrypt, scryptOptions } from "../lib/admin/session";

async function readHidden(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          return reject(new Error("cancelled"));
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await readHidden("Admin password: ");
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
if (process.stdin.isTTY) {
  const again = await readHidden("Again: ");
  if (again !== password) {
    console.error("Passwords don't match.");
    process.exit(1);
  }
}
const { N, r, p, keylen } = HASH_PARAMS;
const salt = randomBytes(16);
const key = await scrypt(password, salt, keylen, scryptOptions(N, r, p));
console.log(`scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${key.toString("base64")}`);
