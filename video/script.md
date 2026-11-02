# Ambient launch spot: script and cut (v3)

v3 is v1's music-led cut (kinetic type, real screens, camera moves, whips)
slowed down about 1.4×, with v2's polish on top. It runs 69 s at 30 fps in two
compositions from one component (`src/Ad.tsx`): `Launch` (1920 × 1080) and
`LaunchVertical` (1080 × 1920, re-laid out with its own captions and camera
moves, not cropped). The voice is unchanged from v1: ElevenLabs Lily, short
fragments, `VOICE_ID` in `scripts/voice.mjs`.

**Music** (`npm run music`, ElevenLabs music, `scripts/music.mjs`): a tight,
warm, modern tech-launch groove at 100 BPM, between v1 (EDM, 120) and v2 (zen,
80). Its energy target was Matt's reference, `eleven labs promo video.mov`:
- no steady percussive pulse (it seems voice-led);
- bass-weighted and dark on top;
- about 4 onsets per second.

Three takes were generated; take B (`bed-v3b.mp3`, installed as `bed.mp3`) was
chosen. It locks to 100 BPM with its first beat at 0.032 s and builds from about
−19 to −12 dB through the cut, with a final warm hit at beat ~110. v1 and v2's
beds are kept as `bed-v1.mp3` and `bed-v2.mp3`.

**Timing** (`src/beats.ts`): a beat is 0.6 s (18 frames). Each shot keeps v1's
internal beat numbers, so v1's moves play 1.2× slower, and each shot gets
extra beats to hold. The music sits a little lower than in v1 (0.72), ducks to 0.3
under the voice, and eases back by a quarter as the bed builds after beat 30.

**Kept from v2:**
- the app's `.app-backdrop` (light and dark), with no violet anywhere;
- the launch-screen lockup (weight 300, -0.04em, orb 17/14, 18px gap) at 72 px, 64 px vertical;
- the website's font stack (`-apple-system`, i.e. SF Pro on the Mac we render
  on, then Inter, Geist): SF Pro Display for headlines and the lockup, SF Pro
  Text for UI, at 300 for display and 400–500 for UI, nothing bold;
- content-sized labels and pills (nothing truncates);
- product captions that never overlap the UI;
- sound effects (`npm run sfx`, `public/sfx/`), re-timed to this cut.

| Beat | Time | Shot | v1 beat | Voice |
|---|---|---|---|---|
| 0 | 0:00 | open: the orb punches in on each beat, rings | 0 | — |
| 4 | 0:02.4 | speak: "Speak." and the recording pill | 4 | Speak. |
| 8 | 0:04.8 | writes: Live pill, fillers struck, "3:30", the line flies into the email | 7 | It writes. |
| 15 | 0:09 | answers: request, answer card, sources, Insert / Copy | 12 | It answers. |
| 21 | 0:12.6 | acts: "Reminder added", 4:59 rolls to 5:00 | 16 | It acts. |
| 26 | 0:15.6 | remembers: recall card citing a dictation and a meeting | 20 | It remembers. |
| 32 | 0:19.2 | modes: Write. Answer. Act. Recall. on light and dark | 24 | — |
| 36 | 0:21.6 | hey (dark): the orb wakes on "Hey Ambient" | 28 | Or just say: Hey Ambient. |
| 42 | 0:25.2 | meeting: "Take notes for this call?", live You/Them notes | 32 | Notes for every call. |
| 48 | 0:28.8 | nobot: the nudge, the summary, "No bot." | 36 | No bot. |
| 53 | 0:31.8 | suggest: four suggestions, three beats each | 40 | — |
| 65 | 0:39 | apps: "In any app." and ten app names, half a beat each | 48 | In any app. |
| 73 | 0:43.8 | connect: "Nothing to connect." | 54 | Nothing to connect. |
| 77 | 0:46.2 | private: never watched, "Paused here", key removed | 57 | Private by design. |
| 84 | 0:50.4 | gather: the break, everything pulled into the orb | 62 | — |
| 88 | 0:52.8 | reveal (dark): the lockup assembles, as in the app's intro | 64 | Meet Ambient. |
| 96 | 0:57.6 | tagline: Speak. It's written. Answered. Done. | 72 | — |
| 104 | 1:02.4 | endcard: lockup, tryambient.ai, "Free for Mac, Windows and Linux. Agent on Mac."; final hit at beat 110 | 80 | Free, at try ambient dot A I. |

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
`npm run render` and `npm run render:vertical`. Rehearse with `npm run sheet`
and `npm run sheet:vertical` (contact sheets in `out/rehearse/`).

Posters (`npm run poster`) put the lockup on the light or dark backdrop for
both formats, so the embed matches the page's theme. The lockup sits in the
upper third and the URL in the lower third, which keeps the centre clear for
the player's play button.
