/**
 * The candidate notes the detector is allowed to report, and where each one's
 * harmonics land in the spectrum.
 *
 * This is the "harmonic sieve": only real equal-tempered notes are ever scored, never
 * arbitrary spectral peaks. It keeps a noisy overtone from being reported as a pitch,
 * and it means the answer is snapped to a note by construction.
 */

import { midiToFrequency } from "@/shared/audio";
import { config } from "../config";
import { frequencyToBin } from "./fft";

/** A harmonic above Nyquist isn't in the spectrum at all. */
export const ABSENT = -1;

export interface Candidate {
  midi: number;
  frequency: number;
  /**
   * Fractional bin of each harmonic, 1st first, or {@link ABSENT} past Nyquist.
   * Fractional because a bin index is where the harmonic *is*, not where the nearest
   * bin center happens to sit.
   */
  harmonicBins: Float64Array;
  /** Search radius for each harmonic, in bins. See {@link toleranceBins}. */
  harmonicTolerance: Float64Array;
}

export interface NoteGrid {
  candidates: readonly Candidate[];
  sampleRate: number;
  size: number;
}

/**
 * How far off its predicted bin a harmonic at `bin` may sit, for a tolerance in cents.
 *
 * Expressed in cents rather than bins because tuning error is proportional: a note
 * twenty cents flat puts its 8th harmonic eight times further from the predicted bin
 * than its 1st. A fixed bin tolerance would be far too tight up high and pointlessly
 * loose down low. Never below one bin, so the lowest harmonics still have somewhere to
 * be found.
 */
export function toleranceBins(bin: number, cents: number): number {
  return Math.max(1, bin * (Math.pow(2, cents / 1200) - 1));
}

/**
 * Build the candidate grid for a sample rate and transform size.
 *
 * Depends only on those two, so it is built once and reused across captures.
 */
export function buildNoteGrid(sampleRate: number, size: number): NoteGrid {
  const { minMidi, maxMidi, harmonics, harmonicToleranceCents } = config.detector;
  const nyquistBin = size / 2;

  const candidates: Candidate[] = [];

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const frequency = midiToFrequency(midi);
    const fundamentalBin = frequencyToBin(frequency, sampleRate, size);

    const harmonicBins = new Float64Array(harmonics);
    const harmonicTolerance = new Float64Array(harmonics);

    for (let h = 1; h <= harmonics; h++) {
      const bin = fundamentalBin * h;
      const present = bin <= nyquistBin;
      harmonicBins[h - 1] = present ? bin : ABSENT;
      harmonicTolerance[h - 1] = present
        ? toleranceBins(bin, harmonicToleranceCents)
        : 0;
    }

    candidates.push({ midi, frequency, harmonicBins, harmonicTolerance });
  }

  return { candidates, sampleRate, size };
}

/** Weight of the nth harmonic in the salience sum. Higher harmonics count for less. */
export function harmonicWeight(harmonic: number): number {
  return 1 / harmonic;
}
