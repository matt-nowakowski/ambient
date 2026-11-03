// Builds /llms.txt (llmstxt.org format) and /llms-full.txt from the same
// content the pages render, so they stay in sync with the brand config.
import { brand, company, emails, fairUseNote, freeMeetingsPerMonth, freeWordsLabel, siteUrl, upstream } from "./brand";
import {
  agent,
  agentModes,
  comingSoon,
  compareRows,
  comparedAsOf,
  competitors,
  description,
  featureGroups,
  features,
  heroSub,
  heroTitle,
  macFirst,
  meetings,
  platforms,
  suggestions,
  tiers,
  trust,
  writing,
} from "./content";
import { changelog } from "./changelog";

import { billingFaqs, faqs } from "./faqs";
import {
  greetingsNote,
  guidePages,
  guideShortcuts,
  handsFree,
  nothingToConnect,
  platformNote,
  routingRules,
  suggestionMoments,
  talkingWays,
  trySaying,
  writingOutcomes,
  writingSettings,
} from "./guide";
import { RELEASE_VERSION, defaultShortcut, releases } from "./releases";

const url = (path: string) => `${siteUrl}${path === "/" ? "" : path}`;
const cell = (c: boolean | string) => (c === true ? "Yes" : c === false ? "No" : c);

function facts() {
  return [
    `- Platforms: ${platforms.join(", ")}. Current version ${RELEASE_VERSION}.`,
    `- Privacy: speech-to-text runs on the user's device with local models; audio is never uploaded. Dictation works offline.`,
    `- ${macFirst}`,
    `- Free plan: $0, the whole colleague with weekly limits. Dictation ${freeWordsLabel.toLowerCase()}; ${brand.freePolishPerWeek} AI uses a week shared across polish, smart writing, answers, actions and meeting summaries; up to ${brand.freeSuggestionsPerWeek} suggestions a week; screen reading; hands-free “Hey ${brand.name}”; ${freeMeetingsPerMonth} meetings a month; the last 24 hours of screen memory. Every install starts with a ${brand.trialDays}-day trial of Pro, no card. It is not “dictation free, agent paid”: every feature is on Free.`,
    `- Pro: $${tiers.pro.monthly}/month, or $${tiers.pro.yearlyPerMonth}/month billed annually ($${tiers.pro.yearlyTotal}/year). ${tiers.pro.features.join("; ")}.`,
    `- Team: custom pricing for 5+ people, via sales (${emails.sales}).`,
    `- Licensing: Pro is unlocked by signing in to the app with the purchase email and a 6-digit emailed code (Account → Sign in); Free and the trial need no account.`,
    `- Built on ${upstream.name} by ${upstream.author} (${upstream.license}), an open-source dictation app.`,
    `- Pro removes the weekly limits (fair use). The agent, on Free and Pro: it decides from what you say whether to write, answer (with sources, web search only when needed), act (calendar, reminders, open apps and links, run your shortcuts) or recall; meeting notes for any call with no bot; suggestions decided on the computer (or, optionally on Pro, in the cloud); and recall from local sources with nothing to connect.`,
    `- Smart writing (dictation): per dictation, ${brand.name} types the words as said, polishes them, or writes the message for you from an instruction (“tell him I can’t make it, be polite”), and rewrites selected text on request (“make this more formal”). A chip shows what it did; “Use my words” (click, or say “use my words”, “undo that” or “just what I said”) takes it back, and Edit changes it by voice (“shorter”, “warmer”). It learns per app. Setting: Writing = Smart (default), Always as I said, or Always polish. Polishing needs AI polish on, which is the default for new installs. Only Polished or Written insertions spend AI uses; deciding how to write is a background call that never does.`,
    `- ${brand.name} never talks out loud. It answers on screen and nudges with one-line suggestions.`,
    `- Talking to ${brand.name}: hold the Ask shortcut; or start with “Hey ${brand.name}” on the dictation key (works in AI chat apps and messaging apps, where plain dictation is typed); or, optionally, turn on hands-free and just say “Hey ${brand.name}, …” with no key. Hands-free is off by default, listens on the computer, checks only the first couple of seconds of speech for the phrase and drops everything else; nothing is recorded or sent until the phrase is said.`,
    `- No bots, no accounts, no integrations to connect. ${nothingToConnect.lead} Everything that reads the screen is off until the user turns it on.`,
    `- Coming soon (not shipped): computer use, operating apps on screen like a person.`,
  ].join("\n");
}

export function llmsTxt() {
  return `# ${brand.name}

> ${description}

${brand.name} is a live agent on your desktop, like a colleague: hold a global shortcut and talk, and it answers (on screen, with sources), takes actions, or recalls what you said or saw. When it can help, it nudges you with one suggestion on screen; it does not talk out loud. It takes meeting notes with no bot. It also writes for you in any app: free, unlimited dictation, transcribed on your computer, that knows when to type what you said, when to polish it, and when to write the message for you.

${facts()}

## Pages

- [Home](${url("/")}): What ${brand.name} does: the live agent, suggestions, meetings, writing and dictation, privacy, comparison with ${competitors.join(" and ")}, FAQ
- [Pricing](${url("/pricing")}): Free, Pro and Team plans, the full comparison and FAQ
- [Download](${url("/download")}): Installers for every platform and first-run steps
- [Features](${url("/features")}): Every capability in detail: the agent, meetings, suggestions, recall, privacy, smart writing and dictation
- [Release notes](${url("/changelog")}): What changed in each version
- [Contact](${url("/contact")}): Support email and help links
- [Sales](${url("/sales")}): Team plan

## Docs

${guidePages.map((p) => `- [${p.title}](${url(p.path)}): ${p.description}`).join("\n")}
- [Troubleshooting](${url("/docs/troubleshooting")}): Shortcuts and macOS Secure Input, microphone and accessibility permissions, pasting
- [Linux setup](${url("/docs/linux")}): Packages, Wayland shortcuts, paste tools, accessibility, meeting audio, reminders, overlay

## Optional

- [Privacy Policy](${url("/privacy")})
- [Terms of Service](${url("/terms")})
- [Full text](${url("/llms-full.txt")}): All of the above as plain text
- [Source (upstream)](${upstream.url})
`;
}

export function llmsFullTxt() {
  const s: string[] = [];
  s.push(`# ${brand.name}\n\n> ${description}\n\n${facts()}\n`);

  s.push(`## Home (${url("/")})\n\n### ${heroTitle.join(" ")}\n\n${heroSub}\n`);
  s.push(`### ${writing.eyebrow}: ${writing.title}\n\n${writing.body}\n`);
  s.push(
    `### ${agent.eyebrow}: ${agent.title}\n\n${agent.body}\n\n${agentModes.map((m) => `- ${m.k} (“${m.say}”): ${m.body}`).join("\n")}\n\n${agent.handsFree}\n`,
  );
  s.push(`### ${meetings.eyebrow}: ${meetings.title}\n\n${meetings.body}\n\n${meetings.points.map((p) => `- ${p.k}: ${p.v}`).join("\n")}\n`);
  s.push(
    `### ${suggestions.eyebrow}: ${suggestions.title}\n\n${suggestions.body}\n\n${suggestions.examples.map((e) => `- ${e}`).join("\n")}\n\n${suggestions.promise}\n`,
  );
  s.push(`### ${trust.eyebrow}: ${trust.title}\n\n${trust.body}\n\n${[...trust.highlights, ...trust.points].map((p) => `- ${p.k}: ${p.v}`).join("\n")}\n`);
  s.push(`### Dictation, unlimited and free\n\n${features.map((f) => `- ${f.title}: ${f.body}`).join("\n")}\n`);
  s.push(
    `### ${brand.name} compared\n\n| | ${brand.name} | ${competitors.join(" | ")} |\n|---|---|${competitors.map(() => "---|").join("")}\n${compareRows
      .map((r) => `| ${r.label} | ${cell(r.us)} | ${r.them.map(cell).join(" | ")} |`)
      .join("\n")}\n\nCompared as of ${comparedAsOf}; check each product’s site for current details. A dash means not confirmed from their public pages.\n`,
  );
  s.push(`### FAQ\n\n${[...faqs, ...billingFaqs.slice(1)].map((f) => `**${f.q}**\n${f.a}`).join("\n\n")}\n`);

  s.push(
    `## Pricing (${url("/pricing")})\n\n- ${tiers.free.name} — $0. ${tiers.free.features.join("; ")}.\n- ${tiers.pro.name} — $${tiers.pro.monthly}/month or $${tiers.pro.yearlyPerMonth}/month billed annually. ${tiers.pro.features.join("; ")}.\n- ${tiers.team.name} — custom pricing for 5+ people. ${tiers.team.features.join("; ")}. Contact ${emails.sales}.\n\n${fairUseNote}\n\nPrices in USD; taxes calculated at checkout.\n`,
  );

  s.push(
    `## Download (${url("/download")})\n\nVersion ${RELEASE_VERSION}.\n\n${Object.values(releases)
      .map((r) => `- ${r.label} (${r.detail}): ${r.url}`)
      .join("\n")}\n\nAfter installing:\n1. Grant microphone access. On macOS also enable ${brand.name} under System Settings → Privacy & Security → Accessibility.\n2. Press the shortcut: ${defaultShortcut.mac} on macOS, ${defaultShortcut.windows} on Windows and Linux.\n3. Speak naturally.\n4. Release. The text appears wherever the cursor is.\n`,
  );

  s.push(guideFull());

  s.push(
    `## Troubleshooting (${url("/docs/troubleshooting")})\n\n### Shortcuts stopped working on macOS (Secure Input)\nmacOS Secure Input stops keystrokes reaching other apps, including global shortcuts. It is on while a password field has focus, and some apps enable it (password managers such as 1Password, Terminal or iTerm2 with Secure Keyboard Entry). Switch away from or close the app holding it. Check which process holds it with \`ioreg -l -w 0 | grep SecureInput\` (look for kCGSSessionSecureInputPID). Locking and unlocking the Mac also resets it.\n\n### Microphone permission\nmacOS: System Settings → Privacy & Security → Microphone. Windows: Settings → Privacy & security → Microphone. Linux: check the input device in ${brand.name} and in PipeWire/PulseAudio.\n\n### Accessibility permission (macOS)\nSystem Settings → Privacy & Security → Accessibility → enable ${brand.name}, then restart it. If it is on but not working, remove and re-add it.\n\n### Text doesn't paste\nClick into a text field first; check Accessibility on macOS; try another paste method in Settings; transcripts are kept in History. On Linux install a paste tool (see Linux setup).\n`,
  );

  s.push(
    `## Linux setup (${url("/docs/linux")})\n\n- Debian/Ubuntu: \`sudo apt install ./${releases.linuxDeb.file}\`\n- Fedora/RHEL/openSUSE: \`sudo dnf install ./${releases.linuxRpm.file}\`\n- AppImage: \`chmod +x ${releases.linuxAppImage.file}\` then run it.\n\nWayland: global shortcuts are limited. Bind \`${brand.slug} --toggle-transcription\` to a keyboard shortcut in your desktop environment (also \`--toggle-post-process\`, \`--cancel\`).\n\nPaste tools: wtype (wlroots compositors such as Sway and Hyprland; not GNOME or KDE), ydotool (any compositor and X11; needs the ydotoold daemon), xdotool (X11).\n\nThe recording overlay uses gtk-layer-shell; disable it with \`${brand.slug.toUpperCase()}_NO_GTK_LAYER_SHELL=1\`.\n`,
  );

  s.push(
    `## Features (${url("/features")})\n\n${featureGroups
      .map((g) => `### ${g.heading}\n\n${g.intro ? `${g.intro}\n\n` : ""}${g.items.map((i) => `- ${i.title}: ${i.body}`).join("\n")}`)
      .join("\n\n")}\n\n### ${comingSoon.label}\n\n${comingSoon.body}\n\n${comingSoon.examples.map((e) => `- “${e}”`).join("\n")}\n\n${comingSoon.points.map((p) => `- ${p.k}: ${p.v}`).join("\n")}\n\n${macFirst}\n`,
  );
  s.push(
    `## Release notes (${url("/changelog")})\n\n${changelog
      .map((r) => `### ${r.version} — ${r.title} (${r.date})\n\n${r.summary}\n\n${r.sections.map((x) => `${x.heading}:\n${x.items.map((i) => `- ${i}`).join("\n")}`).join("\n\n")}`)
      .join("\n\n")}\n`,
  );
  s.push(
    `## Team plan (${url("/sales")})\n\nCustom pricing for 5+ people. ${tiers.team.features.join("; ")}. Shared dictionary and admin controls are coming soon.\n`,
  );
  s.push(
    `## Company and contact (${url("/contact")})\n\n${company.legalName}, ${company.jurisdiction}. Email ${emails.hello}; replies usually within one business day. Sales: ${emails.sales}. Legal and privacy requests: ${emails.legal}. Privacy: ${url("/privacy")}. Terms: ${url("/terms")}.\n`,
  );
  return s.join("\n");
}

function guideFull() {
  const rows = (items: readonly { k: string; v: string }[]) => items.map((i) => `- ${i.k}: ${i.v}`).join("\n");
  const say = (items: readonly { say: string; then: string }[]) => items.map((i) => `- “${i.say}” → ${i.then}`).join("\n");
  const page = (slug: string) => guidePages.find((p) => p.slug === slug)!;
  const head = (slug: string) => `## ${page(slug).title} (${url(page(slug).path)})\n\n${page(slug).intro}\n`;
  return [
    `${head("getting-started")}
Talking to ${brand.name}:
${rows(talkingWays)}
${greetingsNote}

Hands-free (turn it on in ${brand.name} → Privacy):
${rows(handsFree)}

Shortcuts: the dictation key (${guideShortcuts.dictate.mac} on Mac, ${guideShortcuts.dictate.other} on Windows and Linux) types what you say, unless it is a request for the agent. The Ask shortcut (${guideShortcuts.ask.mac} on Mac, ${guideShortcuts.ask.other} on Windows and Linux) always goes to the agent and never types.

How it decides:
${rows(routingRules)}
- “Typed it. Search this instead?”: if it typed something that sounded like a question, a chip offers to answer it instead for a few seconds.

The answer card: Insert pastes the answer where the cursor was; Copy; sources link to the pages and files used; Esc closes it and nothing is saved; hold the shortcut within 90 seconds to follow up.

${nothingToConnect.title} ${nothingToConnect.lead} ${nothingToConnect.body}
${rows(nothingToConnect.sources)}

${platformNote}
`,
    `${head("writing")}\nTry saying:\n${say(trySaying.writing)}\n\nWhat it does:\n${rows(writingOutcomes)}\n\nTake it back: click Use my words, or say “use my words”, “undo that” or “just what I said”. It learns per app; see and undo it in Privacy → Writing → What you’ve told me.\n\nThe Writing setting (Account → Writing):\n${rows(writingSettings)}\n`,
    `${head("answers")}\nTry saying:\n${say(trySaying.answers)}\n`,
    `${head("actions")}\nTry saying:\n${say(trySaying.actions)}\n\nReminders and events show Undo for a few seconds. On Windows and Linux, reminders are scheduled notifications and events open as an .ics file.\n`,
    `${head("recall")}\nTry saying:\n${say(trySaying.recall)}\n`,
    `${head("meetings")}\nTry saying:\n${say(trySaying.meetings)}\n\nDuring the call: a live transcript of You and Them, rolling notes and nudges (Find it, Remind me, Copy). After: summary, decisions, action items, questions for you and a follow-up email draft; a card says the notes are ready, with Email to me when signed in. A consent message is offered to paste into the call chat. No bot joins. Audio is never saved.\n`,
    `${head("suggestions")}\nMoments:\n${rows(suggestionMoments)}\n\nWhen one appears, try saying:\n${say(trySaying.suggestions)}\n`,
    `${head("privacy")}\nSwitches: Read what you ask about; Remember what you’ve seen; Offer suggestions; Meeting notes; Hands-free; Share anonymous usage counts (counts and timings only, off by default). Intelligence: Automatic, On this computer only, or Cloud. What you’ve told me: suggestions you turned down and per-app writing preferences, with Undo. Never read: password fields, password managers and Keychain, private windows, crypto wallets, and any window showing a recovery phrase or private key. Secrets are removed before text is sent. The network ledger lists every request and exactly what it sent.\n`,
  ].join("\n");
}

export function securityTxt() {
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  return `Contact: mailto:${brand.supportEmail}
Expires: ${expires}
Preferred-Languages: en
Canonical: ${siteUrl}/.well-known/security.txt
`;
}
