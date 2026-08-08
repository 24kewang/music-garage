import { describe, expect, it } from "vitest";
import {
  binToFrequency,
  fft,
  frequencyToBin,
  isPowerOfTwo,
  magnitudeSpectrum,
  planFft,
} from "./fft";

/** Straight from the definition — slow, obviously correct, and the reference. */
function naiveDft(samples: number[]): { real: number[]; imag: number[] } {
  const size = samples.length;
  const real: number[] = [];
  const imag: number[] = [];

  for (let k = 0; k < size; k++) {
    let sumReal = 0;
    let sumImag = 0;
    for (let n = 0; n < size; n++) {
      const angle = (-2 * Math.PI * k * n) / size;
      sumReal += samples[n] * Math.cos(angle);
      sumImag += samples[n] * Math.sin(angle);
    }
    real.push(sumReal);
    imag.push(sumImag);
  }

  return { real, imag };
}

describe("isPowerOfTwo", () => {
  it("accepts powers of two and nothing else", () => {
    for (const value of [1, 2, 4, 1024, 32768]) expect(isPowerOfTwo(value)).toBe(true);
    for (const value of [0, 3, 6, 1000, -8, 2.5]) expect(isPowerOfTwo(value)).toBe(false);
  });
});

describe("planFft", () => {
  it("refuses a size that isn't a power of two", () => {
    expect(() => planFft(1000)).toThrow(/power of two/);
  });

  it("builds a self-inverse bit-reversal permutation", () => {
    const { reversed } = planFft(8);
    // 8 points, 3 bits: 0,4,2,6,1,5,3,7
    expect([...reversed]).toEqual([0, 4, 2, 6, 1, 5, 3, 7]);
    for (let i = 0; i < 8; i++) expect(reversed[reversed[i]]).toBe(i);
  });
});

describe("fft", () => {
  it("rejects buffers of the wrong length", () => {
    const plan = planFft(8);
    expect(() => fft(plan, new Float64Array(4), new Float64Array(8))).toThrow(/Expected 8/);
  });

  it("turns a constant signal into a single DC bin", () => {
    const plan = planFft(8);
    const real = new Float64Array(8).fill(1);
    const imag = new Float64Array(8);

    fft(plan, real, imag);

    expect(real[0]).toBeCloseTo(8, 10);
    for (let bin = 1; bin < 8; bin++) {
      expect(Math.hypot(real[bin], imag[bin])).toBeCloseTo(0, 10);
    }
  });

  it("puts a sinusoid at exactly its own bin", () => {
    const size = 64;
    const plan = planFft(size);
    const bin = 7;

    const real = new Float64Array(size);
    const imag = new Float64Array(size);
    for (let n = 0; n < size; n++) {
      real[n] = Math.cos((2 * Math.PI * bin * n) / size);
    }

    fft(plan, real, imag);

    // Real cosine: half the energy at +bin, half at the mirrored -bin.
    expect(Math.hypot(real[bin], imag[bin])).toBeCloseTo(size / 2, 8);
    expect(Math.hypot(real[size - bin], imag[size - bin])).toBeCloseTo(size / 2, 8);

    for (let other = 1; other < size; other++) {
      if (other === bin || other === size - bin) continue;
      expect(Math.hypot(real[other], imag[other])).toBeCloseTo(0, 8);
    }
  });

  it("agrees with a naive DFT on an arbitrary signal", () => {
    const size = 32;
    const samples = Array.from({ length: size }, (_, n) =>
      Math.sin(n * 0.7) + 0.3 * Math.cos(n * 2.1) - 0.1 * n,
    );

    const expected = naiveDft(samples);

    const plan = planFft(size);
    const real = Float64Array.from(samples);
    const imag = new Float64Array(size);
    fft(plan, real, imag);

    for (let bin = 0; bin < size; bin++) {
      expect(real[bin]).toBeCloseTo(expected.real[bin], 8);
      expect(imag[bin]).toBeCloseTo(expected.imag[bin], 8);
    }
  });

  it("conserves energy (Parseval)", () => {
    const size = 128;
    const samples = Array.from({ length: size }, (_, n) => Math.sin(n * 0.31) * 0.8);

    const timeEnergy = samples.reduce((sum, value) => sum + value * value, 0);

    const plan = planFft(size);
    const real = Float64Array.from(samples);
    const imag = new Float64Array(size);
    fft(plan, real, imag);

    let spectralEnergy = 0;
    for (let bin = 0; bin < size; bin++) {
      spectralEnergy += real[bin] * real[bin] + imag[bin] * imag[bin];
    }

    expect(spectralEnergy / size).toBeCloseTo(timeEnergy, 6);
  });
});

describe("magnitudeSpectrum", () => {
  it("returns bins up to and including Nyquist", () => {
    const plan = planFft(64);
    expect(magnitudeSpectrum(plan, new Float64Array(64))).toHaveLength(33);
  });

  it("peaks at the bin holding the tone", () => {
    const size = 256;
    const plan = planFft(size);
    const bin = 20;

    const samples = Array.from({ length: size }, (_, n) =>
      Math.cos((2 * Math.PI * bin * n) / size),
    );

    const magnitude = magnitudeSpectrum(plan, samples);
    const peak = magnitude.indexOf(Math.max(...magnitude));
    expect(peak).toBe(bin);
  });

  it("zero-pads a short input rather than failing", () => {
    // Used when the captured window is shorter than the transform size.
    const plan = planFft(64);
    const magnitude = magnitudeSpectrum(plan, [1, 1, 1, 1]);
    expect(magnitude).toHaveLength(33);
    expect(magnitude[0]).toBeCloseTo(4, 10);
  });
});

describe("bin ↔ frequency", () => {
  it("round-trips", () => {
    for (const frequency of [110, 261.6255653, 440, 1000]) {
      const bin = frequencyToBin(frequency, 48000, 32768);
      expect(binToFrequency(bin, 48000, 32768)).toBeCloseTo(frequency, 9);
    }
  });

  it("gives the resolution the detector depends on", () => {
    // 32768 points at 48 kHz is ~1.46 Hz per bin — comfortably finer than the ~8 Hz
    // gap between adjacent semitones at the bottom of the note grid.
    const spacing = binToFrequency(1, 48000, 32768);
    expect(spacing).toBeLessThan(2);
  });
});
