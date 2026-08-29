/**
 * Turning a captured buffer into a magnitude spectrum the detector can score.
 *
 * Pure — no browser APIs. Everything here is driven by synthesized buffers in the
 * tests, which is what makes the detector verifiable without a microphone.
 */

import { magnitudeSpectrum, planFft, type FftPlan } from "./fft";

/** Root-mean-square level of a buffer. Used for onset detection and silence checks. */
export function rms(samples: ArrayLike<number>, from = 0, to = samples.length): number {
  const start = Math.max(0, from);
  const end = Math.min(samples.length, to);
  if (end <= start) return 0;

  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

/**
 * A Hann window of `size` points.
 *
 * Without a window, a tone whose frequency falls between bins smears across the whole
 * spectrum — and every real note falls between bins. That leakage would swamp the
 * quieter of the two notes.
 */
export function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

export interface Spectrum {
  /** Magnitude per bin, from DC to Nyquist inclusive. */
  magnitude: Float64Array;
  /** Hertz per bin. */
  binWidth: number;
  sampleRate: number;
  /** Transform size the bins came from. */
  size: number;
}

/** Reusable per-size state, so repeated captures don't rebuild the tables. */
export interface SpectrumPlan {
  fft: FftPlan;
  window: Float64Array;
  windowed: Float64Array;
}

export function planSpectrum(size: number): SpectrumPlan {
  return {
    fft: planFft(size),
    window: hannWindow(size),
    windowed: new Float64Array(size),
  };
}

/**
 * Window a captured buffer and transform it.
 *
 * A buffer shorter than the plan is zero-padded by the FFT; a longer one is truncated
 * to the most recent `size` samples, since the end of the capture is the part most
 * likely to be steady rather than mid-attack.
 */
export function analyzeSpectrum(
  plan: SpectrumPlan,
  samples: ArrayLike<number>,
  sampleRate: number,
): Spectrum {
  const size = plan.fft.size;
  const offset = Math.max(0, samples.length - size);
  const count = Math.min(size, samples.length);

  plan.windowed.fill(0);
  for (let i = 0; i < count; i++) {
    plan.windowed[i] = samples[offset + i] * plan.window[i];
  }

  return {
    magnitude: magnitudeSpectrum(plan.fft, plan.windowed),
    binWidth: sampleRate / size,
    sampleRate,
    size,
  };
}

/**
 * Largest magnitude within `tolerance` bins either side of `center`.
 *
 * The detector asks about a harmonic's predicted position, not an exact bin: a note
 * played slightly sharp or flat puts its harmonics a little off where equal
 * temperament says they should be, and each harmonic drifts further than the last.
 */
export function peakNear(
  magnitude: Float64Array,
  center: number,
  tolerance: number,
): number {
  const from = Math.max(0, Math.round(center - tolerance));
  const to = Math.min(magnitude.length - 1, Math.round(center + tolerance));

  let peak = 0;
  for (let bin = from; bin <= to; bin++) {
    if (magnitude[bin] > peak) peak = magnitude[bin];
  }
  return peak;
}

/**
 * Refine a peak's position using its neighbours.
 *
 * A parabola through the three bins around a maximum lands closer to the true
 * frequency than the bin center does — useful for reporting the note actually played
 * rather than the nearest bin.
 */
export function interpolatePeak(magnitude: Float64Array, bin: number): number {
  if (bin <= 0 || bin >= magnitude.length - 1) return bin;

  const left = magnitude[bin - 1];
  const center = magnitude[bin];
  const right = magnitude[bin + 1];

  const denominator = left - 2 * center + right;
  if (denominator === 0) return bin;

  const offset = (0.5 * (left - right)) / denominator;
  // A parabola fitted to a genuine peak cannot place it outside the neighbouring bins;
  // if it does, the three points weren't a peak and the bin center is the better answer.
  return Math.abs(offset) > 1 ? bin : bin + offset;
}
