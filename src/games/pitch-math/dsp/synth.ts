/**
 * Synthesized instrument tones, for testing the detector without a microphone.
 *
 * Lives in `dsp/` rather than in a test file because several test files build signals
 * from it, and because the harmonic model here is the assumption the detector is built
 * on — worth stating once, in one place.
 */

import { midiToFrequency } from "@/shared/audio";

export interface ToneOptions {
  /** Peak amplitude of the fundamental. */
  amplitude?: number;
  /** How many harmonics to synthesize. */
  harmonics?: number;
  /**
   * How quickly harmonics fall away — amplitude of harmonic h is `1 / h ** rolloff`.
   * 1 is a bright, reedy tone; 2 is closer to a flute.
   */
  rolloff?: number;
  /** Detuning in cents, so tests can check the tolerance actually tolerates. */
  cents?: number;
  /** Starting phase, in radians. Varied so harmonics don't all align at t=0. */
  phase?: number;
}

/**
 * Additive tone at a MIDI pitch: a fundamental plus harmonics at `1/h ** rolloff`.
 *
 * A real instrument's spectrum is messier than this, but the property the detector
 * depends on — energy at integer multiples of the fundamental — is exactly what a
 * harmonic series is.
 */
export function tone(
  midi: number,
  sampleRate: number,
  length: number,
  options: ToneOptions = {},
): Float64Array {
  const { amplitude = 1, harmonics = 8, rolloff = 1, cents = 0, phase = 0 } = options;

  const frequency = midiToFrequency(midi) * Math.pow(2, cents / 1200);
  const samples = new Float64Array(length);

  for (let h = 1; h <= harmonics; h++) {
    const partial = frequency * h;
    if (partial >= sampleRate / 2) break; // above Nyquist it would alias

    const level = amplitude / Math.pow(h, rolloff);
    const step = (2 * Math.PI * partial) / sampleRate;
    // Offset each harmonic so they don't all peak together, which would produce an
    // unnaturally spiky waveform and an unrealistically easy signal.
    const offset = phase + h * 0.7;

    for (let n = 0; n < length; n++) {
      samples[n] += level * Math.sin(step * n + offset);
    }
  }

  return samples;
}

/** Two tones played together, as one microphone would hear them. */
export function mix(...parts: Float64Array[]): Float64Array {
  const length = Math.max(...parts.map((part) => part.length));
  const mixed = new Float64Array(length);

  for (const part of parts) {
    for (let n = 0; n < part.length; n++) mixed[n] += part[n];
  }

  return mixed;
}

/**
 * Deterministic pseudo-random noise, for the "does it survive a real room" tests.
 *
 * Seeded rather than `Math.random` so a failure is reproducible — a detector test that
 * passes only sometimes is worse than no test.
 */
export function noise(length: number, amplitude: number, seed = 1): Float64Array {
  const samples = new Float64Array(length);
  let state = seed >>> 0;

  for (let n = 0; n < length; n++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    samples[n] = ((state / 0xffffffff) * 2 - 1) * amplitude;
  }

  return samples;
}
