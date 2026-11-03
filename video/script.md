# Ambient launch spot: script and cut (v5)

**v5** is a light re-organisation of v4 for the new positioning. Ambient is a
live agent on your desktop, a colleague: you talk to it, and it writes, answers,
acts and remembers, and nudges you with suggestions when it can help. It never
talks back out loud, and nothing in the cut implies voice output (the narrator
is a narrator; every pill and chip on screen is the user speaking or the app
writing). Kept exactly from v4: the music, the pacing, the SFX, the mail scene,
the meetings, "In any app", "Nothing to connect", privacy and the logo reveal.

What changed from v4:
- **Opening.** v4's "Speak." slam is replaced. 0:00 an empty desktop (the
  backdrop and a plain pointer, no OS chrome), a quiet beat; ~0:01.5 the orb (the
  intro's lens, dark) slides in from the right on a low arc and settles beside
  the pointer at ~0:02, like someone pulling up a chair; on the bed's first beat
  (0:02.4) the brand line **"Your desktop colleague."**, voiced, word by word on
  the voice; 0:04.8 **"You talk."** with the recording pill, voiced; then the mail.
- **Smart writing.** After the mail (which holds one beat less: 1.3 s after
  "It writes." lands, not 1.9 s), a hard cut to a chat with Ana ("Does Thursday
  work for the dry run?"), with "It writes." held in place. The Live pill hears
  an instruction, "tell Ana Thursday works, after three", turns to "Writing", and
  the message box fills with "Thursday works for me — any time after 3pm.". The
  HUD chip "Written for you · Use my words" springs in under it (the app's dark
  glass, `hud-card` surface, a `hud-undo`-style raised button).
- **Suggestions** move up to right after the four verbs and get the voice line
  **"It nudges you."**. One example is held for 6 s: an inbox thread with a
  "40 messages" badge, scrolling; the suggestion card "Want me to summarise this
  40-message thread?" (Summarise ⏎ / Not now esc, wrapping as in the app); the
  user's spoken **“yes”** pill; Summarise pressed; the summary card (Launch moves
  to the 14th / Priya sends the press kit Friday / Tom signs off the pricing
  page). Then two of v4's quick ones, three beats each: the date in chat ("Add it
  to your calendar?") and the failing test ("Explain this error?").
- **Modes** ("Write. Answer. Act. Recall.") is cut, to pay for the above.
- **Tagline**: "Your desktop colleague." in two steps on the lift ("Your
  desktop", then "colleague.", then all of it dark), broken where the opening
  breaks it. Then v4's lockup and end card (logo and tryambient.ai only). The
  final line stays "Free, at try ambient dot A I." (dictation is free; the agent
  is Pro, which the end card doesn't claim otherwise).
- Platform parity: the agent works on macOS, Windows and Linux (beta on Windows
  and Linux). Nothing says "Mac only" or "Agent on Mac"; the opening's desktop
  has no OS chrome. (The product shots still use the mail-style windows from v4.)

The cut runs **78.6 s** (131 beats), 4.8 s longer than v4's 73.8 s:
+4 beats opening, +4 smart writing (−1 from the mail hold, +5 for the chat),
+4 suggestions (16 beats, was 12), −4 modes.

**Music** (`npm run music`, ElevenLabs music, `scripts/music.mjs`): unchanged
from v4, take B (`bed-v3b.mp3`, installed as `bed.mp3`): a tight, warm tech-launch
groove at 100 BPM, first beat at 0.032 s, building from about −19 to −12 dB, a
dip at its beat 15, a step up around 32, a breakdown at 36–42, a dip at 61–63, a
fuller groove from 64, a riser into the lift at 88, and a final warm hit at ~110.

**The music splice moved** (`MUSIC_SPLICES` in `src/beats.ts`, replacing v4's
single `MUSIC_SPLICE = { at: 48, to: 40 }`). The bed is now a list of
`[video beat, bed beat]` segments, each joint a 3-frame crossfade on a beat, so
that every shot v4 had still lands on the same beat of the bed:

| From video beat | Bed beat | Why |
|---|---|---|
| 0 | 0 | the intro bar, quietly (0.45 → 0.8 of the bed level) under the empty desktop |
| 4 | 0 | the intro bar again, full level: the brand line lands on the bed's first beat, the kick comes in under "You talk.", the groove starts with the mail (bed beat 8, as in v4) |
| 16 | 8 | one bar of the groove repeats under the mail, so "It answers" still lands on the dip (bed beat 15) |
| 40 | 20 | three bars of the groove repeat under the suggestions (the step up at bed 32 lands on the quick examples), so Hey Ambient still lands on the breakdown (bed beat 36) |
| 68 | 52 | from "No bot." on, the bed is exactly v4's (v4's 48 → 40 splice, less the 12 beats the suggestions took there): apps on 61, the logo on the lift (88), the end card's hit on 110 |

**Timing** (`src/beats.ts`): a beat is 0.6 s (18 frames). Each shot keeps v1's
internal beat numbers. The music sits at 0.72, ducks to 0.3 under the voice,
and eases back by a quarter as the bed builds (video beats 38 → 106, the same
bed beats as v4's 30 → 98).

**Kept from v2–v4:**
- the app's `.app-backdrop` (light and dark), with no violet anywhere;
- the launch-screen lockup (weight 300, -0.04em, orb 17/14, 18px gap) at 72 px, 64 px vertical;
- the website's font stack (`-apple-system`, i.e. SF Pro on the Mac we render
  on, then Inter, Geist): SF Pro Display for headlines and the lockup, SF Pro
  Text for UI, sized and weighted per `brand/TYPOGRAPHY.md` (Video): slam words
  and headlines at 200, display lines and leads at 300, UI at 400–500, nothing bold;
- content-sized labels and pills (nothing truncates);
- product captions that never overlap the UI (16:9: a left column ending by
  x 820, UI from x 900; 9:16: centred above the UI);
- sound effects (`npm run sfx`, `public/sfx/`), at v4's levels.

| Beat | Time | Shot | Voice |
|---|---|---|---|
| 0 | 0:00 | open: empty desktop, the pointer drifts to rest; at 2.5 (0:01.5) the orb slides in and settles beside it (~0:02) | — |
| 4 | 0:02.4 | open: "Your desktop colleague." slams in word by word on the voice | Your desktop colleague. |
| 8 | 0:04.8 | talk: "You talk." and the recording pill | You talk. |
| 12 | 0:07.2 | writes: Live pill, fillers struck, "3:30", the line flies into the email | It writes. |
| 18 | 0:10.8 | smart: "tell Ana Thursday works, after three" → "Thursday works for me — any time after 3pm." and the chip "Written for you · Use my words" | — |
| 23 | 0:13.8 | answers: request, answer card, sources, Insert / Copy | It answers. |
| 29 | 0:17.4 | acts: "Reminder added", 4:59 rolls to 5:00 | It acts. |
| 34 | 0:20.4 | remembers: recall card citing a dictation and a meeting | It remembers. |
| 40 | 0:24.0 | nudge: 40-message thread → "Want me to summarise this 40-message thread?" → “yes” → the summary | It nudges you. |
| 50 | 0:30.0 | suggest: the date in chat, then the failing test, three beats each | — |
| 56 | 0:33.6 | hey (dark): the orb wakes on "Hey Ambient" | Or just say: Hey Ambient. |
| 62 | 0:37.2 | meeting: "Take notes for this call?", live You/Them notes | Notes for every call. |
| 68 | 0:40.8 | nobot: the nudge, the summary, "No bot." | No bot. |
| 77 | 0:46.2 | apps: "In any app." and ten app names, one beat each | In any app. |
| 89 | 0:53.4 | connect: "Nothing to connect." | Nothing to connect. |
| 93 | 0:55.8 | private: never watched, "Paused here", key removed | Private by design. |
| 100 | 1:00.0 | gather: the break, everything pulled into the orb | — |
| 104 | 1:02.4 | reveal (dark): the lockup assembles, as in the app's intro | Meet Ambient. |
| 112 | 1:07.2 | tagline: "Your desktop colleague." | — |
| 120 | 1:12.0 | endcard: lockup and tryambient.ai; final hit at beat 126 | Free, at try ambient dot A I. |
| 131 | 1:18.6 | end | |

Chapters (`out/chapters.json`, `npm run chapters`): Intro 0:00, Writing 0:04.8,
The agent 0:13.8, Suggestions 0:24.0, Hey Ambient 0:33.6, Meetings 0:37.2,
Nothing to connect 0:46.2, Privacy 0:55.8, Meet Ambient 1:02.4.

## Voice

ElevenLabs Lily (`VOICE_ID` in `scripts/voice.mjs`, model and settings
unchanged), short fragments, one file each in `public/vo/` (`src/lines.mjs`).
v5 adds three lines, generated with `node scripts/voice.mjs scenes colleague
talk nudges`: "Your desktop colleague." (1.76 s, at beat 4), "You talk." (1.04 s,
at 8.2) and "It nudges you." (1.52 s, at 40). v4's "Speak." is dropped; every
other line is v4's file, unchanged. The mp3s are gitignored (the word-timing
`.json` files are committed, because the cut reads them).

## Facts each moment rests on

- Dictation is a smart writing assistant: it knows when to type what you said
  (the mail: fillers removed, "3:30", punctuation) and when to write it for you
  (the chat: an instruction becomes the message, marked "Written for you", with
  "Use my words" to put back what you said). Speech recognition runs on the
  user's computer; free dictation is unlimited (`brand.config.json`
  `enforceFreeWordLimit: false`).
- The agent (answer, act, recall, meetings, suggestions, screen-reading
  protections) works on macOS, Windows and Linux; Windows and Linux are in beta.
  The agent is Pro; dictation is free, which is all the last line claims.
- Ambient doesn't speak: answers, notes and summaries appear in the HUD.
- "Hey Ambient" is opt-in and off by default ("Optional" on screen); it listens
  on your computer and nothing is recorded or sent until the phrase is said.
- Meetings: mic and system audio, You/Them, no bot joins the call.
- Suggestions are decided on your computer; nothing is sent unless accepted.
- Privacy: off until turned on; passwords, Keychain, private windows, Messages
  and wallets never watched; a recovery-phrase window is dropped and the HUD
  says it paused; secrets (API keys) removed before anything is sent. We don't
  claim "everything runs on your computer": on-device AI is a mode.
- The UK capital gains answer (18% / 24%, £3,000 annual exempt amount) is
  correct for 2025/26.
- Computer use is not shown (coming soon).

## Rendering

Set `REMOTION_CHROME` to a local headless Chrome (for example Playwright's
`chrome-headless-shell` under `~/Library/Caches/ms-playwright`) so Remotion
doesn't download its own. Then `npm run render` (which also writes
`out/chapters.json`) and `npm run render:vertical`, to
`out/ambient-launch-v5.mp4` and `out/ambient-launch-v5-vertical.mp4`. Rehearse
with `npm run sheet` and `npm run sheet:vertical` (contact sheets in
`out/rehearse/`).

Posters (`npm run poster`, `out/ambient-launch-v5{,-dark,-vertical,-vertical-dark}.jpg`)
put the lockup on the light or dark backdrop for both formats, so the embed
matches the page's theme. The lockup sits in the upper third and the URL in the
lower third, which keeps the centre clear for the player's play button.
