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
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const BPM = 100;
export const FIRST_BEAT = 0.032;
export const MUSIC_TRIM = 0;
/**
 * v5: the bed as segments [video beat, bed beat]: from each video beat on, the
 * bed plays from that beat of its own (until the next segment). Each joint is a
 * 3-frame crossfade on a beat.
 *  - 0 → 0, then 4 → 0: the intro bar plays twice (quietly the first time, under
 *    the empty desktop), so the slam line lands on the bed's first beat;
 *  - 16 → 8: a bar of the groove repeats under the mail, so "It answers" still
 *    lands on the bed's dip (its beat 15);
 *  - 40 → 20: three bars of the groove repeat under the suggestions, so Hey
 *    Ambient still lands on the breakdown (its beat 36);
 *  - 68 → 52: from "No bot." on, the bed is v4's (v4's 48 → 40 splice, minus the
 *    12 beats the suggestions took there).
 */
export const MUSIC_SPLICES: [number, number][] = [
  [0, 0],
  [4, 0],
  [16, 8],
  [40, 20],
  [68, 52],
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
  ["hey", 56, 28],
  ["meeting", 62, 32],
  ["nobot", 68, 36],
  ["apps", 77, 48],
  ["connect", 89, 54],
  ["private", 93, 57],
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
  ["hey", 56],
  ["notes", 62],
  ["nobot", 72],
  ["anyapp", 77],
  ["nothing", 89],
  ["private", 93.5],
  ["meet", 104],
  ["free", 121],
];

/** Chapters for the site's player (seconds). */
export const CHAPTERS: [string, number][] = [
  ["Intro", 0],
  ["Writing", 8],
  ["The agent", 23],
  ["Suggestions", 40],
  ["Hey Ambient", 56],
  ["Meetings", 62],
  ["Nothing to connect", 77],
  ["Privacy", 93],
  ["Meet Ambient", 104],
];
