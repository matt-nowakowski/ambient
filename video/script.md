# Ambient launch spot: script and cut (v2)

A calm, music-led launch film, 63 s, 30 fps, in two compositions from one
component (`src/Ad.tsx`): `Launch` (1920 × 1080) and `LaunchVertical`
(1080 × 1920, re-laid out, not cropped). The voice (ElevenLabs, Lily,
`VOICE_ID` in `scripts/voice.mjs`) says short fragments, unchanged from v1.

**Music** (`npm run music`, ElevenLabs music, `scripts/music.mjs`): serene
ambient electronica, 80 BPM: soft pads, felt piano, plucked arpeggios. Its
first 1.5 s are silent and skipped (`MUSIC_TRIM`); after that the first beat is
at 0.023 s, a beat is 0.75 s, a bar 3 s, phrase onsets every 6 s, the resolving
chord at 54 s (the logo), tail out by 63 s. Measure a new take with
`scripts/beats.mjs` (edit its BPM list) and update `src/beats.ts`.

**Sound** (`npm run sfx`, ElevenLabs sound generation, `public/sfx/`): taps
when a pill opens, clicks on accept, soft typing as the email line writes,
pops and swishes as cards land, a whoosh under each crossfade, a chime when the
orb wakes, a sonic logo at the lockup. Mixed under the VO and music in
`sfxList()`.

**Look:** the site's/app's `.app-backdrop` exactly (two blurred drifting lights:
blue top-left, rust bottom-right; light `#f5f5f7` or dark `#0b0b0d`), Geist at
300 for display and 400–500 for UI, the intro's lockup (Geist 300, -0.04em,
orb 17px dots / 14 gap, 18px gap) at 72 px (64 px vertical). Shots crossfade
over 20 frames with a soft blur and a 1–1.5 % scale; nothing whips.

| Beat | Time | Shot | On screen | Voice |
|---|---|---|---|---|
| 0 | 0:00 | open (dark) | The orb assembles from blur, chime | — |
| 4 | 0:03 | speak | "Speak." and the recording pill | Speak. |
| 8 | 0:06 | writes | Mail window; Live pill streams "um so can we uh…", fillers struck, swaps to "Can we move the sync to 3:30 on Thursday?", which types into the email | It writes. |
| 16 | 0:12 | answers | Request pill, answer card, sources, Insert / Copy | It answers. |
| 23 | 0:17.3 | acts | "Remind me at 5 to call Sam", "Reminder added", the reminder | It acts. |
| 28 | 0:21 | remembers | Recall card citing a dictation and a meeting | It remembers. |
| 34 | 0:25.5 | hey (dark) | "Or just say" → the orb wakes on "Hey Ambient"; "Optional. No key at all." | Or just say: Hey Ambient. |
| 40 | 0:30 | meeting | Call window, "Take notes for this call?" accepted, live You/Them notes | Notes for every call. |
| 46 | 0:34.5 | nobot (dark) | "No bot. Nothing joins your call." | No bot. |
| 50 | 0:37.5 | suggest | Chat with a date; suggestion accepted; "Added to Calendar" | — |
| 57 | 0:42.8 | apps | "In any app." with ten app chips → "Nothing to connect." | In any app. / Nothing to connect. |
| 64 | 0:48 | private | Never-watched list, recovery phrase blurred to "Paused here", a key removed before sending | Private by design. |
| 72 | 0:54 | logo (dark) | The lockup assembles as in the app's intro; tryambient.ai; "Free for Mac, Windows and Linux. Agent on Mac." | Meet Ambient. / Free, at try ambient dot A I. |

Dropped from v1: the Write/Answer/Act/Recall flash cards, the gather break and
the tagline (too fast); the four quick suggestions became one readable one.

Captions on product shots (left column in 16:9, above the UI in 9:16, never
overlapping it): "It writes." · "It answers." · "It acts." · "It remembers." ·
"Notes for every call." · "It notices." · "Private by design.", each with one
short supporting line.

## Facts each moment rests on

- Dictation: speech recognition runs on the user's computer; free dictation is
  unlimited (`brand.config.json` `enforceFreeWordLimit: false`).
- Agent features (answer, act, recall, meetings, suggestions, screen-reading
  protections) are macOS-first: the end card says "Agent on Mac".
- "Hey Ambient" is opt-in and off by default ("Optional" on screen); it listens
  on the Mac and nothing is recorded or sent until the phrase is said.
- Meetings: mic and system audio, You/Them, no bot joins the call.
- Suggestions are decided on the Mac; nothing is sent unless accepted.
- Privacy: off until turned on; passwords, Keychain, private windows, Messages
  and wallets never watched; a recovery-phrase window is dropped and the HUD
  says it paused; secrets (API keys) removed before anything is sent. We don't
  claim "everything runs on your Mac": on-device AI is a mode.
- The UK capital gains answer (18% / 24%, £3,000 annual exempt amount) is
  correct for 2025/26.
- Computer use is not shown (coming soon).

## Rendering

Set `REMOTION_CHROME` to a local headless Chrome (for example Playwright's
`chrome-headless-shell`) so Remotion doesn't download its own. Then
`npm run render`, `npm run render:vertical`; rehearse with `npm run sheet` /
`npm run sheet:vertical` (contact sheets in `out/rehearse/`).

Posters (`npm run poster`): the end-card lockup on the light or dark backdrop,
for both formats, so the embed matches the page's theme:
`out/ambient-launch-v2.jpg`, `out/ambient-launch-v2-dark.jpg`,
`out/ambient-launch-v2-vertical.jpg`, `out/ambient-launch-v2-vertical-dark.jpg`.

The vertical cut is laid out for a phone-width embed: in 9:16 the wide product
shots (mail, call, chat) use narrower windows so UI text stays legible at about
390 CSS px wide, and the chat suggestion uses a shorter line.
