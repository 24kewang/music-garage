/**
 * Comparing two note sequences, key-agnostically.
 *
 * The alignment happens in note space with an explicit transposition search rather
 * than in interval space, which would be transposition-invariant for free. Interval
 * space is the wrong choice and it is worth saying why before someone "simplifies"
 * it: one wrong note corrupts the two intervals either side of it, and one inserted
 * note corrupts two more, so every error gets counted twice and the indels stop
 * meaning anything a player would recognise.
 */

import { align, type Alignment, type AlignCosts } from "./align";

export interface CompareOptions extends AlignCosts {
  /** Transposition search range, in semitones either way. */
  maxShift: number;
}

export interface Comparison {
  /** Semitones added to the **attempt** to line it up with the target. */
  shift: number;
  /** The alignment at that shift — this is what the failure graph draws. */
  alignment: Alignment;
  /** Alignment cost normalized by length. 0 is perfect. */
  error: number;
  /** The same thing as a number out of 100, for the player. */
  score: number;
  /** The attempt after `shift`, ready to plot against the target. */
  shifted: number[];
}

/**
 * Normalize by the **longer** of the two sequences.
 *
 * Not by the sum, not by either one alone, and not by the path length. Using the
 * longer keeps a short attempt from scoring well against a long target simply by
 * having little to be wrong about; normalizing by the path length would go further
 * wrong still and actively *reward* padding an attempt with junk, since every extra
 * note would lengthen the denominator it was being charged against.
 */
export function normalizedError(
  cost: number,
  targetLength: number,
  attemptLength: number,
): number {
  const longest = Math.max(targetLength, attemptLength);
  return longest === 0 ? 0 : cost / longest;
}

/**
 * 100 for identical, 0 for nothing in common.
 *
 * An error of 1 is "every note missing or wrong" — one indel per note of the longer
 * sequence — so that is where the scale bottoms out. Honest rather than flattering:
 * a copy that failed at 0.16 against a 0.1 threshold reads 84, and it should.
 */
export function scoreFromError(error: number): number {
  return Math.round(100 * Math.max(0, 1 - error));
}

/**
 * The best the attempt looks in any key.
 *
 * Shifts are tried in order of increasing size and only a **strictly** better cost
 * displaces the incumbent, so an ambiguous phrase reports the smallest shift that
 * explains it. Without that, a short figure that matches equally well in two keys
 * would report "up an octave" as readily as "same key", and the graph would draw the
 * attempt somewhere the player never played.
 *
 * A shift of one octave is just another candidate, so a correct copy sung an octave
 * away scores exactly as well as one in the original register. That is the intent.
 */
export function compare(
  target: readonly number[],
  attempt: readonly number[],
  options: CompareOptions,
): Comparison {
  let best: Comparison | null = null;

  for (let size = 0; size <= options.maxShift; size++) {
    for (const shift of size === 0 ? [0] : [size, -size]) {
      const shifted = attempt.map((note) => note + shift);
      const alignment = align(target, shifted, options);
      const error = normalizedError(alignment.cost, target.length, shifted.length);

      if (best !== null && error >= best.error) continue;
      best = { shift, alignment, error, score: scoreFromError(error), shifted };
    }
  }

  // Only reachable if maxShift were negative; the loop always runs shift 0.
  return (
    best ?? {
      shift: 0,
      alignment: align(target, attempt, options),
      error: 0,
      score: 100,
      shifted: [...attempt],
    }
  );
}
