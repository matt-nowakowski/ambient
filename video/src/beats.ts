// The edit is cut to the music. The v2 bed (public/music/bed.mp3, scripts/music.mjs)
// is 80 BPM; it opens with 1.5 s of silence, which we skip (MUSIC_TRIM), after
// which its first beat is at 0.023 s (measured with scripts/beats.mjs). A beat
// is 0.75 s, a bar 3 s; its phrase onsets fall every 8 beats (6 s), the
// resolving chord at beat 72 (54 s, the logo), and the tail rings out to ~63 s.
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const BPM = 80;
export const FIRST_BEAT = 0.023;
/** Frames of the bed skipped at the start (its leading silence). */
export const MUSIC_TRIM = 45;
/** Global frame of beat b. */
export const beat = (b: number) => Math.round((FIRST_BEAT + (b * 60) / BPM) * FPS);

/** Shots, in beats: [id, startBeat, dark]. Each runs until the next one starts. */
export const SHOTS: [string, number, boolean][] = [
  ["open", 0, true],
  ["speak", 4, false],
  ["writes", 8, false],
  ["answers", 16, false],
  ["acts", 23, false],
  ["remembers", 28, false],
  ["hey", 34, true],
  ["meeting", 40, false],
  ["nobot", 46, true],
  ["suggest", 50, false],
  ["apps", 57, false],
  ["private", 64, false],
  ["logo", 72, true],
];
export const END_BEAT = 84;
export const TOTAL = beat(END_BEAT);

/** Voice fragments: [file in public/vo, beat it starts on]. */
export const VO: [string, number][] = [
  ["speak", 5],
  ["writes", 10],
  ["answers", 17.5],
  ["acts", 24.5],
  ["remembers", 29.5],
  ["hey", 35],
  ["notes", 41],
  ["nobot", 46.5],
  ["anyapp", 57.5],
  ["nothing", 61.5],
  ["private", 64.5],
  ["meet", 73],
  ["free", 77.5],
];

/** Chapters for the site's player (seconds). */
export const CHAPTERS: [string, number][] = [
  ["Intro", 0],
  ["Dictation", 4],
  ["The agent", 16],
  ["Hey Ambient", 34],
  ["Meetings", 40],
  ["Suggestions", 50],
  ["Nothing to connect", 57],
  ["Privacy", 64],
  ["Meet Ambient", 72],
];
