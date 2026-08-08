/**
 * Two-pitch estimation from a single microphone.
 *
 * The shape, following the architecture spec: score every candidate note by how much
 * of its harmonic series is present, take the strongest, subtract that note's series
 * from the spectrum, and take the strongest of what's left. If nothing convincing
 * survives the subtraction, one note was played — and the even/odd harmonic balance
 * decides whether that one note was really two an octave apart.
 *
 * Pure. Everything here runs against synthesized buffers in the tests.
 */

import { config } from "../config";
import { ABSENT, harmonicWeight, type Candidate, type NoteGrid } from "./noteGrid";
import { peakNear, rms, type Spectrum } from "./spectrum";

export interface DetectedPitch {
  midi: number;
  frequency: number;
  /** Salience relative to the strongest candidate, 0–1. */
  confidence: number;
}

export type Detection =
  /** Two distinct notes were separated. */
  | { kind: "two"; low: DetectedPitch; high: DetectedPitch }
  /** One note, played by both — or one player silent. */
  | { kind: "unison"; note: DetectedPitch }
  /** One fundamental, but the spectrum says an octave sits on top of it. */
  | { kind: "octave"; note: DetectedPitch }
  /** Nothing usable. */
  | { kind: "none"; reason: "silence" | "unclear" };

/** Semitone distance the round is judged on, or null when there is no answer. */
export function detectionSemitones(detection: Detection): number | null {
  switch (detection.kind) {
    case "two":
      return detection.high.midi - detection.low.midi;
    case "unison":
      return 0;
    case "octave":
      return 12;
    case "none":
      return null;
  }
}

/** The MIDI notes to print on the reveal, lowest first. */
export function detectionMidis(detection: Detection): number[] {
  switch (detection.kind) {
    case "two":
      return [detection.low.midi, detection.high.midi];
    case "unison":
      return [detection.note.midi, detection.note.midi];
    case "octave":
      return [detection.note.midi, detection.note.midi + 12];
    case "none":
      return [];
  }
}

/**
 * Weighted sum of a candidate's harmonics.
 *
 * Each harmonic contributes the strongest magnitude near where it should be, damped by
 * `1/h` so a candidate isn't rewarded for high harmonics it merely shares with a
 * louder neighbour.
 */
export function salience(magnitude: Float64Array, candidate: Candidate): number {
  let sum = 0;

  for (let index = 0; index < candidate.harmonicBins.length; index++) {
    const bin = candidate.harmonicBins[index];
    if (bin === ABSENT) continue;

    sum +=
      harmonicWeight(index + 1) *
      peakNear(magnitude, bin, candidate.harmonicTolerance[index]);
  }

  return sum;
}

/** Salience of every candidate, in grid order. */
function scoreAll(magnitude: Float64Array, grid: NoteGrid): Float64Array {
  const scores = new Float64Array(grid.candidates.length);
  for (let i = 0; i < grid.candidates.length; i++) {
    scores[i] = salience(magnitude, grid.candidates[i]);
  }
  return scores;
}

function indexOfMax(values: Float64Array): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

/**
 * Remove a note's harmonic series from a spectrum, returning a new one.
 *
 * The ceiling is the load-bearing part. Where two notes share a bin — the lower note's
 * 3rd harmonic and the upper note's 2nd, for a perfect 5th — unrestricted subtraction
 * would take the *upper* note's energy with it and leave nothing to find, turning
 * every 5th into a unison. Capping the removal at a fraction of the bin leaves the
 * shared evidence standing.
 */
export function cancel(
  magnitude: Float64Array,
  candidate: Candidate,
  ceiling: number = config.detector.cancellationCeiling,
): Float64Array {
  const residual = Float64Array.from(magnitude);

  for (let index = 0; index < candidate.harmonicBins.length; index++) {
    const bin = candidate.harmonicBins[index];
    if (bin === ABSENT) continue;

    const tolerance = candidate.harmonicTolerance[index];
    const from = Math.max(0, Math.round(bin - tolerance));
    const to = Math.min(residual.length - 1, Math.round(bin + tolerance));

    for (let b = from; b <= to; b++) {
      residual[b] *= 1 - ceiling;
    }
  }

  return residual;
}

/**
 * How much louder the even harmonics are than this note's own timbre predicts.
 *
 * A note and the note an octave above it share every harmonic of the upper note, so
 * the pair cannot be separated by subtraction — the upper note has no bin of its own.
 * All it leaves is a signature: it reinforces the lower note's even harmonics (2nd,
 * 4th, 6th…) and not its odd ones.
 *
 * A plain even-to-odd ratio does *not* capture that, because it also moves with the
 * instrument's brightness: measured across timbres, a bright lone note reaches 0.74
 * while a quiet octave sits at 0.66 — overlapping ranges, so no threshold on that
 * ratio can separate them.
 *
 * So the timbre is normalised away first. A harmonic series decays smoothly, roughly
 * as `1/h^r`; fitting that curve to the **odd** harmonics alone gives a prediction for
 * the even ones that is free of any octave contribution, because an octave above
 * touches no odd harmonic. Dividing the observed even harmonics by that prediction
 * leaves a number near 1 for one note and well above 1 for two.
 */
export function octaveEvidence(magnitude: Float64Array, candidate: Candidate): number {
  const levels: number[] = [];
  for (let index = 0; index < candidate.harmonicBins.length; index++) {
    const bin = candidate.harmonicBins[index];
    levels.push(
      bin === ABSENT
        ? 0
        : peakNear(magnitude, bin, candidate.harmonicTolerance[index]),
    );
  }

  // Least squares on log(level) = intercept + slope · log(h), over odd harmonics.
  const points: { x: number; y: number }[] = [];
  for (let h = 1; h <= levels.length; h += 2) {
    const level = levels[h - 1];
    if (level > 0) points.push({ x: Math.log(h), y: Math.log(level) });
  }
  if (points.length < 2) return 0;

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    variance += (point.x - meanX) ** 2;
  }
  // All odd harmonics at one level: a flat series, which no real note produces, but
  // a zero slope is still the right fit for it.
  const slope = variance === 0 ? 0 : covariance / variance;
  const intercept = meanY - slope * meanX;

  // Compare each even harmonic with what that curve predicts.
  const ratios: number[] = [];
  for (let h = 2; h <= levels.length; h += 2) {
    const level = levels[h - 1];
    if (level <= 0) continue;

    const predicted = Math.exp(intercept + slope * Math.log(h));
    if (predicted > 0) ratios.push(level / predicted);
  }
  if (ratios.length === 0) return 0;

  // Median, so one harmonic landing on a noise peak can't carry the verdict.
  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 0
    ? (ratios[mid - 1] + ratios[mid]) / 2
    : ratios[mid];
}

export interface DetectOptions {
  /** Overrides for the config thresholds, used by the tests to probe boundaries. */
  secondNoteSalienceRatio?: number;
  octaveEvidenceThreshold?: number;
  minCaptureRms?: number;
}

/**
 * Work out what was played.
 *
 * `samples` is the captured window; `spectrum` is that window already transformed.
 * Both are passed because the level check wants the raw signal and everything else
 * wants the spectrum.
 */
export function detect(
  samples: ArrayLike<number>,
  spectrum: Spectrum,
  grid: NoteGrid,
  options: DetectOptions = {},
): Detection {
  const {
    secondNoteSalienceRatio = config.detector.secondNoteSalienceRatio,
    octaveEvidenceThreshold = config.detector.octaveEvidenceThreshold,
    minCaptureRms = config.capture.minCaptureRms,
  } = options;

  if (rms(samples) < minCaptureRms) return { kind: "none", reason: "silence" };

  const { magnitude } = spectrum;
  const scores = scoreAll(magnitude, grid);

  const firstIndex = indexOfMax(scores);
  const firstScore = scores[firstIndex];
  if (firstScore <= 0) return { kind: "none", reason: "unclear" };

  const first = grid.candidates[firstIndex];

  // Subtract the first note and look again.
  const residual = cancel(magnitude, first);
  const residualScores = scoreAll(residual, grid);
  // The first note would otherwise win its own residual on the energy the ceiling left.
  residualScores[firstIndex] = 0;

  const secondIndex = indexOfMax(residualScores);
  const secondScore = residualScores[secondIndex];
  const ratio = secondScore / firstScore;

  if (ratio >= secondNoteSalienceRatio) {
    const second = grid.candidates[secondIndex];
    const [low, high] =
      first.midi <= second.midi ? [first, second] : [second, first];

    return {
      kind: "two",
      low: { midi: low.midi, frequency: low.frequency, confidence: 1 },
      high: {
        midi: high.midi,
        frequency: high.frequency,
        confidence: Math.min(1, ratio),
      },
    };
  }

  // One fundamental. Its even/odd balance decides unison against octave.
  const note: DetectedPitch = {
    midi: first.midi,
    frequency: first.frequency,
    confidence: 1,
  };

  return octaveEvidence(magnitude, first) >= octaveEvidenceThreshold
    ? { kind: "octave", note }
    : { kind: "unison", note };
}
