/**
 * An in-place iterative radix-2 Cooley–Tukey FFT.
 *
 * Hand-rolled rather than pulled from a package: this is about seventy lines, the
 * transform sizes are fixed and known, and a dependency here would be a third-party
 * module sitting in the middle of the one calculation the whole game rests on.
 *
 * Pure — no browser APIs — so the detector above it is testable in Node against
 * synthesized buffers.
 */

/** Precomputed tables for one transform size. Build once, reuse every capture. */
export interface FftPlan {
  /** Transform size. A power of two. */
  size: number;
  /** Destination index for each input index, i.e. the bit-reversal permutation. */
  reversed: Uint32Array;
  /** cos(-2πk/N) for k < N/2. */
  cos: Float64Array;
  /** sin(-2πk/N) for k < N/2. */
  sin: Float64Array;
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

/**
 * Build the tables for a transform of `size` samples.
 *
 * Twiddle factors and the bit-reversal permutation depend only on the size, so they
 * are computed once here rather than per capture — the per-capture work is then just
 * the butterflies.
 */
export function planFft(size: number): FftPlan {
  if (!isPowerOfTwo(size)) {
    throw new Error(`FFT size must be a power of two, got ${size}`);
  }

  const levels = Math.log2(size);
  const reversed = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let value = 0;
    for (let bit = 0; bit < levels; bit++) {
      value = (value << 1) | ((i >>> bit) & 1);
    }
    reversed[i] = value;
  }

  const half = size / 2;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    const angle = (-2 * Math.PI * k) / size;
    cos[k] = Math.cos(angle);
    sin[k] = Math.sin(angle);
  }

  return { size, reversed, cos, sin };
}

/**
 * Transform `real`/`imag` in place.
 *
 * Both arrays must be `plan.size` long. For real input, fill `imag` with zeros.
 */
export function fft(plan: FftPlan, real: Float64Array, imag: Float64Array): void {
  const { size, reversed, cos, sin } = plan;

  if (real.length !== size || imag.length !== size) {
    throw new Error(`Expected ${size} samples, got ${real.length}/${imag.length}`);
  }

  // Reorder into bit-reversed positions so the butterflies below can run in place.
  for (let i = 0; i < size; i++) {
    const j = reversed[i];
    if (j > i) {
      let swap = real[i];
      real[i] = real[j];
      real[j] = swap;
      swap = imag[i];
      imag[i] = imag[j];
      imag[j] = swap;
    }
  }

  // Butterflies, doubling the span each pass.
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const step = size / span;

    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < half; offset++) {
        const twiddle = offset * step;
        const wr = cos[twiddle];
        const wi = sin[twiddle];

        const top = start + offset;
        const bottom = top + half;

        const tr = real[bottom] * wr - imag[bottom] * wi;
        const ti = real[bottom] * wi + imag[bottom] * wr;

        real[bottom] = real[top] - tr;
        imag[bottom] = imag[top] - ti;
        real[top] += tr;
        imag[top] += ti;
      }
    }
  }
}

/**
 * Magnitude spectrum of a real signal, up to (and including) Nyquist.
 *
 * Returns `size / 2 + 1` bins; the rest of the transform is their mirror image and
 * carries no extra information for real input.
 */
export function magnitudeSpectrum(
  plan: FftPlan,
  samples: ArrayLike<number>,
): Float64Array {
  const { size } = plan;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);

  const count = Math.min(size, samples.length);
  for (let i = 0; i < count; i++) real[i] = samples[i];
  // Anything past the input length stays zero — zero-padding, which interpolates the
  // spectrum rather than adding information.

  fft(plan, real, imag);

  const bins = size / 2 + 1;
  const magnitude = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    magnitude[i] = Math.hypot(real[i], imag[i]);
  }
  return magnitude;
}

/** Hertz at the center of a bin. */
export function binToFrequency(bin: number, sampleRate: number, size: number): number {
  return (bin * sampleRate) / size;
}

/** Bin a frequency falls in, unrounded. */
export function frequencyToBin(
  frequency: number,
  sampleRate: number,
  size: number,
): number {
  return (frequency * size) / sampleRate;
}
