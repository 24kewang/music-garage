/**
 * The interval catalog and the rules for judging a guess.
 *
 * Pure — no React, no DOM, no audio. This is the part of the game that decides who is
 * right, so it is kept separate from everything that detected the notes.
 */

export type IntervalMode =
  /** One correct answer: the exact distance from the lower note. */
  | "absolute"
  /** Two correct answers: the interval and its inversion. */
  | "relative";

export const INTERVAL_MODES: readonly IntervalMode[] = ["absolute", "relative"];

export interface Interval {
  /** Semitones above the lower note, 0–12. Doubles as the catalog index. */
  semitones: number;
  /** Full name, e.g. "Minor 3rd". */
  name: string;
  /** Short form for the compact grid, e.g. "m3". */
  abbr: string;
}

/**
 * All thirteen, ordered by distance — the order they appear on screen.
 *
 * Unison and octave are both here and are genuinely different answers in absolute
 * mode, which is why there are thirteen buttons rather than twelve.
 */
export const INTERVALS: readonly Interval[] = [
  { semitones: 0, name: "Unison", abbr: "P1" },
  { semitones: 1, name: "Minor 2nd", abbr: "m2" },
  { semitones: 2, name: "Major 2nd", abbr: "M2" },
  { semitones: 3, name: "Minor 3rd", abbr: "m3" },
  { semitones: 4, name: "Major 3rd", abbr: "M3" },
  { semitones: 5, name: "Perfect 4th", abbr: "P4" },
  { semitones: 6, name: "Tritone", abbr: "TT" },
  { semitones: 7, name: "Perfect 5th", abbr: "P5" },
  { semitones: 8, name: "Minor 6th", abbr: "m6" },
  { semitones: 9, name: "Major 6th", abbr: "M6" },
  { semitones: 10, name: "Minor 7th", abbr: "m7" },
  { semitones: 11, name: "Major 7th", abbr: "M7" },
  { semitones: 12, name: "Octave", abbr: "P8" },
];

/** Widest answer on the board. */
export const OCTAVE = 12;

/**
 * Fold a raw semitone distance onto the board.
 *
 * Two players on different instruments can land several octaves apart, but the board
 * only goes as far as an octave — so a 12th answers as a perfect 5th and two octaves
 * as an octave, the usual ear-training convention. Unison is the one distance that
 * stays put; every other multiple of twelve reads as an octave rather than collapsing
 * back to unison.
 */
export function foldSemitones(semitones: number): number {
  const distance = Math.abs(Math.round(semitones));
  if (distance === 0) return 0;
  return ((distance - 1) % OCTAVE) + 1;
}

/**
 * The inversion of a folded interval: what the same pair of notes is called measured
 * the other way round. 0↔12, 1↔11, 5↔7 … and the tritone, alone, inverts to itself.
 */
export function invert(folded: number): number {
  return OCTAVE - folded;
}

/**
 * Every answer the board accepts for a given true distance.
 *
 * Absolute takes the distance from the lower note and nothing else. Relative also
 * takes the inversion, because a player naming the interval from the top note rather
 * than the bottom isn't wrong about what they heard. That yields exactly two answers
 * for every interval except the tritone, which is its own inversion — derived here
 * rather than written out as a table, so the rule can't drift from the catalog.
 */
export function acceptedAnswers(
  trueSemitones: number,
  mode: IntervalMode,
): readonly number[] {
  const folded = foldSemitones(trueSemitones);
  if (mode === "absolute") return [folded];

  const inverted = invert(folded);
  return inverted === folded ? [folded] : [folded, inverted];
}

/** Whether a guess (in semitones) is right. */
export function isCorrectGuess(
  guessSemitones: number,
  trueSemitones: number,
  mode: IntervalMode,
): boolean {
  return acceptedAnswers(trueSemitones, mode).includes(guessSemitones);
}

/** Look an interval up by its semitone distance, e.g. for the reveal caption. */
export function intervalAt(semitones: number): Interval {
  return INTERVALS[foldSemitones(semitones)];
}

/** The label to print on a button, honoring the abbreviate setting. */
export function intervalLabel(interval: Interval, abbreviate: boolean): string {
  return abbreviate ? interval.abbr : interval.name;
}
