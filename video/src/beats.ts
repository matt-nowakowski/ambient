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
// the bed repeats two bars of its steady groove (its beats 40–48) at video beat
// 48 (MUSIC_SPLICE): from there on, music beat = video beat − 8.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const BPM = 100;
export const FIRST_BEAT = 0.032;
export const MUSIC_TRIM = 0;
/** v4: at video beat `at`, the bed jumps back to its beat `to` (repeats `at − to` beats). */
export const MUSIC_SPLICE = { at: 48, to: 40 };
/** Frames per beat. */
export const FB = (60 / BPM) * FPS;
/** Global frame of beat b. */
export const beat = (b: number) => Math.round((FIRST_BEAT + (b * 60) / BPM) * FPS);

/** Shots: [id, start beat in this cut, start beat in v1]. Each runs until the next one starts. */
export const SHOTS: [string, number, number][] = [
  ["open", 0, 0],
  ["speak", 4, 4],
  ["writes", 8, 7],
  ["answers", 15, 12],
  ["acts", 21, 16],
  ["remembers", 26, 20],
  ["modes", 32, 24],
  ["hey", 36, 28],
  ["meeting", 42, 32],
  ["nobot", 48, 36],
  ["suggest", 57, 40],
  ["apps", 69, 48],
  ["connect", 81, 54],
  ["private", 85, 57],
  ["gather", 92, 62],
  ["reveal", 96, 64],
  ["tagline", 104, 72],
  ["endcard", 112, 80],
];
export const END_BEAT = 123;
export const TOTAL = beat(END_BEAT);

/** Voice fragments: [file in public/vo, beat it starts on]. */
export const VO: [string, number][] = [
  ["speak", 4],
  ["writes", 11.5],
  ["answers", 15],
  ["acts", 21],
  ["remembers", 26],
  ["hey", 36],
  ["notes", 42],
  ["nobot", 52],
  ["anyapp", 69],
  ["nothing", 81],
  ["private", 85.5],
  ["meet", 96],
  ["free", 113],
];

/** Chapters for the site's player (seconds). */
export const CHAPTERS: [string, number][] = [
  ["Intro", 0],
  ["Dictation", 4],
  ["The agent", 15],
  ["Hey Ambient", 36],
  ["Meetings", 42],
  ["Suggestions", 57],
  ["Nothing to connect", 69],
  ["Privacy", 85],
  ["Meet Ambient", 96],
];
