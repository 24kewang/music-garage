/**
 * The tests' instrument.
 *
 * Synthesizing input in-process is the house convention for audio tests — there are
 * no fixture files anywhere in this repo, and a golden `.wav` would drift silently
 * against a detector change. Everything here is deterministic: the noise is seeded,
 * so a failure is reproducible rather than occasionally.
 *
 * Only the tests import this. It lives beside the pipeline rather than inside a
 * test file because several test files need the same phrases.
 */

import { midiToFrequency } from "@/shared/audio";

export interface NoteSpec {
  midi: number;
  seconds: number;
  /** Vibrato depth in semitones, peak deviation. 0 for a dead-straight tone. */
  vibratoSemitones?: number;
  /** Vibrato rate in Hz. Singers and string players sit around 5–6. */
  vibratoHz?: number;
  /** Seconds of portamento *into* this note from the previous one's pitch. */
  glideSeconds?: number;
  /** Silence after this note, in seconds. */
  gapSeconds?: number;
  amplitude?: number;
}

/** A seeded LCG — same numbers on every run, on every machine. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Render a phrase.
 *
 * Three harmonics rather than a bare sine: a pure sine is the easiest thing in the
 * world for MPM to track, and passing the tests on one would prove very little.
 */
export function phrase(
  notes: readonly NoteSpec[],
  sampleRate: number,
  noiseAmplitude = 0,
): Float32Array {
  const random = seeded(20250819);
  const chunks: number[] = [];
  let previousMidi: number | null = null;

  for (const note of notes) {
    const {
      midi,
      seconds,
      vibratoSemitones = 0,
      vibratoHz = 5.5,
      glideSeconds = 0,
      gapSeconds = 0,
      amplitude = 0.3,
    } = note;

    const length = Math.round(seconds * sampleRate);
    const glide = Math.round(glideSeconds * sampleRate);
    const from = previousMidi ?? midi;

    // Phase is integrated rather than computed per sample from a fixed frequency:
    // with a changing frequency, `sin(2π f t)` produces a discontinuity every time f
    // moves, which reads as a click and wrecks the detector.
    let phase = 0;

    for (let i = 0; i < length; i++) {
      const glided = i < glide ? from + ((midi - from) * i) / glide : midi;
      const vibrato =
        vibratoSemitones === 0
          ? 0
          : vibratoSemitones * Math.sin((2 * Math.PI * vibratoHz * i) / sampleRate);
      const frequency = midiToFrequency(glided + vibrato);
      phase += (2 * Math.PI * frequency) / sampleRate;

      // A short attack and release, so the buffer has no step edges in it.
      const fade = Math.min(1, i / (0.01 * sampleRate), (length - i) / (0.01 * sampleRate));
      chunks.push(
        fade *
          amplitude *
          (Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.15 * Math.sin(3 * phase)),
      );
    }

    for (let i = 0; i < Math.round(gapSeconds * sampleRate); i++) chunks.push(0);
    previousMidi = midi;
  }

  const out = new Float32Array(chunks.length);
  for (let i = 0; i < chunks.length; i++) {
    out[i] = chunks[i] + (noiseAmplitude === 0 ? 0 : (random() * 2 - 1) * noiseAmplitude);
  }
  return out;
}

/** Every note the same length, straight, with no gaps — the simplest possible case. */
export function melody(
  midis: readonly number[],
  sampleRate: number,
  seconds = 0.4,
): Float32Array {
  return phrase(
    midis.map((midi) => ({ midi, seconds })),
    sampleRate,
  );
}

/** Silence, for the "heard nothing" path. */
export function silence(seconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(seconds * sampleRate));
}
