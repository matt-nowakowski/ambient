# Security

If you find a security or privacy problem in Ambient, please tell us
privately at **legal@tryambient.ai** (subject: "Security"), not in a public
issue.

Include what you found, how to reproduce it, the app version (Settings ›
About) and your operating system. A proof of concept helps; please don't
access other people's data, degrade the service or run automated scans
against tryambient.ai to get one.

**What happens next.** We reply within 3 working days, tell you whether we can
reproduce it within 10 working days, and keep you posted until it's fixed.
We'll credit you in the changelog if you'd like. We ask that you give us 90
days, or until a fix ships, before you disclose it.

**In scope:** the Ambient desktop app for macOS, Windows and Linux (the latest
release from tryambient.ai/download), the server it talks to (tryambient.ai and
its `/api` routes) and the update and download path. Especially: anything
that sends audio, screen text or other data off your computer in a way
[docs/VERIFY.md](docs/VERIFY.md) says it doesn't, gets past the never-watch
list or redaction, reads the encrypted local memory without the key, forges a
license token or session, or installs an update that isn't ours.

**Out of scope:** third-party services we use (Polar, Vercel, Cloudflare,
Baseten, Resend; report to them), social engineering, denial of service, and
findings that need an already-compromised computer.

Reading this code to look for problems is welcome; that is what it's public
for. The licence (see [LICENSE](LICENSE)) still doesn't allow building or
running modified copies, so test against the released app.
