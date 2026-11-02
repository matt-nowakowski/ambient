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
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const BPM = 100;
export const FIRST_BEAT = 0.032;
export const MUSIC_TRIM = 0;
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
  ["suggest", 53, 40],
  ["apps", 65, 48],
  ["connect", 73, 54],
  ["private", 77, 57],
  ["gather", 84, 62],
  ["reveal", 88, 64],
  ["tagline", 96, 72],
  ["endcard", 104, 80],
];
export const END_BEAT = 115;
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
  ["nobot", 50],
  ["anyapp", 65],
  ["nothing", 73],
  ["private", 77.5],
  ["meet", 88],
  ["free", 105],
];

/** Chapters for the site's player (seconds). */
export const CHAPTERS: [string, number][] = [
  ["Intro", 0],
  ["Dictation", 4],
  ["The agent", 15],
  ["Hey Ambient", 36],
  ["Meetings", 42],
  ["Suggestions", 53],
  ["Nothing to connect", 65],
  ["Privacy", 77],
  ["Meet Ambient", 88],
];
