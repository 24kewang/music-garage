/**
 * Steps 9 and 10: round the segments to whole semitones and collapse the runs.
 *
 * Absolute octave is preserved here. Register-independence is the transposition
 * search's job, later — which is what lets the sequence keep *relative* octave
 * information, so a leap has to be reproduced as a leap, without ever testing which
 * octave somebody sang it in.
 */

/** A tuning correction and the notes it produced. */
export interface Quantized {
  notes: number[];
  /**
   * Semitones subtracted before rounding — a positive value means they were playing
   * sharp of concert pitch. Diagnostic only; the notes already have it removed.
   */
  tuningOffset: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * How far the whole performance sits off the semitone grid, in semitones.
 *
 * Taken as the median of each pitch's distance to its nearest semitone, which lands
 * in (-0.5, 0.5]. Removing it before rounding is not cosmetic. A singer who is
 * consistently forty cents flat has every note sitting at x.60 of the semitone
 * below; rounding that directly sends some notes up and some down depending on
 * which side of x.50 the detector's noise happened to fall, and the *intervals* —
 * the only thing this game scores — come out wrong. Correcting first makes the
 * rounding unanimous.
 *
 * A median rather than a mean, so one wildly wrong segment cannot drag the whole
 * performance off the grid.
 */
export function tuningOffset(pitches: readonly number[]): number {
  if (pitches.length === 0) return 0;
  return median(pitches.map((pitch) => pitch - Math.round(pitch)));
}

/** Step 9. */
export function quantize(pitches: readonly number[]): Quantized {
  const offset = tuningOffset(pitches);
  return {
    notes: pitches.map((pitch) => Math.round(pitch - offset)),
    tuningOffset: offset,
  };
}

/**
 * Step 10: run-length encode, keeping one event per run of identical pitches.
 *
 * Only **adjacent** duplicates collapse. An oscillating figure like `C D C D` is a
 * valid sequence and survives intact; `C C D` becomes `C D`. Two repeated notes at
 * the same pitch are indistinguishable here by design — the pipeline discards
 * rhythm, and without rhythm there is nothing left to tell a repeat from a hold.
 */
export function collapse(notes: readonly number[]): number[] {
  const out: number[] = [];
  for (const note of notes) {
    if (out.length === 0 || out[out.length - 1] !== note) out.push(note);
  }
  return out;
}
