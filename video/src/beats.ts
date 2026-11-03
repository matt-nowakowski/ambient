// v3: v1's cut, slowed down. The bed (public/music/bed.mp3, take B of
// scripts/music.mjs) is 100 BPM: a beat is 0.6 s (18 frames), a bar 2.4 s; its
// first beat is at 0.032 s (measured with scripts/beats.mjs), no leading silence.
// Its shape, measured: a short dip at beat 15 (into the agent shots), a step up
// around beat 32, a dip at 61–63 and a fuller groove from 64, building to the
// end; a final warm hit at beat ~110, then the tail.
//
// Each shot keeps v1's internal beat numbers (its third column is where it
// started in v1), so inside a shot v1's moves run on 0.6 s beats (1.2× slower),
// and the shot itself is given extra beats to hold (about 1.4× v1 overall).
//
// v4: "They asked… Q3 numbers" and the app names hold twice as long (+4 beats
// each). To keep the logo on the bed's lift and the end card on its final hit,
// the bed repeated two bars of its steady groove (its beats 40–48) at video beat 48.
//
// v5: a new opening (an empty desktop, the orb pulls up a chair, "Your desktop
// colleague.", "You talk."), a smart-writing beat after the mail,
// suggestions moved up after the four verbs and held longer, the modes beat cut,
// and the tagline "Your desktop colleague." Every shot that v4 had
// still sits on the same beat of the bed (writes on its groove, Hey Ambient on
// its breakdown, the logo on its lift, the end card on its final hit); the bed is
// re-cut to fit (MUSIC_SPLICES, see script.md).
//
// v6: the opening line is "Say hi to your new desktop colleague." (the tagline
// stays "Your desktop colleague."); "Hey Ambient" is an also ("Hands-free, too"),
// and moves after the meetings, so the story runs: the four verbs → it nudges
// you → it takes notes for every call, no bot → hands-free, too → in any app →
// nothing to connect → private by design → Meet Ambient.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const BPM = 100;
export const FIRST_BEAT = 0.032;
export const MUSIC_TRIM = 0;
/**
 * The bed as segments [video beat, bed beat] (v5, re-planned in v6): from each
 * video beat on, the bed plays from that beat of its own (until the next
 * segment). Each joint is a 3-frame crossfade on a beat, and every jump keeps
 * the bar phase (video − bed is always a multiple of 4).
 *  - 0 → 0, then 4 → 0: the intro bar plays twice (quietly the first time, under
 *    the empty desktop), so the opening line lands on the bed's first beat;
 *  - 16 → 8: a bar of the groove repeats under the mail, so "It answers" still
 *    lands on the bed's dip (its beat 15);
 *  - 40 → 20: three bars of the groove repeat under the suggestions;
 *  - 56 → 64 (v6): the meeting and "No bot." ride the fuller second groove
 *    (its beats 64–80, just before the riser);
 *  - 72 → 36 (v6): hands-free "Hey Ambient" lands on the breakdown (its beat 36),
 *    and "In any app." on the groove's return after it (its beat 42);
 *  - 94 → 78 (v6): from privacy on, the bed is v4's: the riser under privacy,
 *    the logo on the lift (88), the end card's hit on 110.
 */
export const MUSIC_SPLICES: [number, number][] = [
  [0, 0],
  [4, 0],
  [16, 8],
  [40, 20],
  [56, 64],
  [72, 36],
  [94, 78],
];
/** Frames per beat. */
export const FB = (60 / BPM) * FPS;
/** Global frame of beat b. */
export const beat = (b: number) => Math.round((FIRST_BEAT + (b * 60) / BPM) * FPS);

/** Shots: [id, start beat in this cut, start beat in v1]. Each runs until the next one starts. */
export const SHOTS: [string, number, number][] = [
  ["open", 0, 0],
  ["talk", 8, 4],
  ["writes", 12, 7],
  ["smart", 18, 0],
  ["answers", 23, 12],
  ["acts", 29, 16],
  ["remembers", 34, 20],
  ["nudge", 40, 0],
  ["suggest", 50, 40],
  ["meeting", 56, 32],
  ["nobot", 63, 36],
  ["hey", 72, 28],
  ["apps", 78, 48],
  ["connect", 90, 54],
  ["private", 94, 57],
  ["gather", 100, 62],
  ["reveal", 104, 64],
  ["tagline", 112, 72],
  ["endcard", 120, 80],
];
export const END_BEAT = 131;
export const TOTAL = beat(END_BEAT);

/** Voice fragments: [file in public/vo, beat it starts on]. */
export const VO: [string, number][] = [
  ["colleague", 4],
  ["talk", 8.2],
  ["writes", 15.5],
  ["answers", 23],
  ["acts", 29],
  ["remembers", 34],
  ["nudges", 40],
  ["notes", 56],
  ["nobot", 67],
  ["hey", 72],
  ["anyapp", 78],
  ["nothing", 90],
  ["private", 94.5],
  ["meet", 104],
  ["free", 121],
];

/** Chapters for the site's player (seconds). */
export const CHAPTERS: [string, number][] = [
  ["Intro", 0],
  ["Writing", 8],
  ["The agent", 23],
  ["Suggestions", 40],
  ["Meetings", 56],
  ["Hey Ambient", 72],
  ["Nothing to connect", 78],
  ["Privacy", 94],
  ["Meet Ambient", 104],
];
