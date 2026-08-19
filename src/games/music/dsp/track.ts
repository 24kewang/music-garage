/**
 * Steps 1–3 of the pipeline: frame the buffer, gate out the unvoiced frames, and
 * convert what survives to continuous MIDI.
 *
 * DOM-free, and so is everything downstream of it. `createPitchDetector` and
 * `detectPitch` are pure with respect to the browser by design, which is what lets
 * the entire transcription be a plain function of `(Float32Array, sampleRate)` and
 * be tested in Node against synthesized tones — no microphone, no jsdom.
 */

import { createPitchDetector, detectPitch, frequencyToMidi } from "@/shared/audio";

export interface Frame {
  /** Frame centre, in seconds from the start of the buffer. */
  time: number;
  /**
   * Continuous MIDI — deliberately **not** rounded. Smoothing and plateau detection
   * both need the sub-semitone detail; rounding happens at step 9 and not before.
   */
  midi: number | null;
  clarity: number;
}

export interface TrackOptions {
  frameSamples: number;
  hopMs: number;
  minClarity: number;
  minFrequency: number;
  maxFrequency: number;
  minVolumeDecibels: number;
}

/**
 * Analyse the whole buffer at a fixed hop.
 *
 * One detector is allocated for the entire pass — it holds internal scratch buffers,
 * so reusing it makes the per-frame work allocation-free. That matters here: a
 * thirty-second take at a 10 ms hop is three thousand frames.
 *
 * The final partial frame is dropped rather than zero-padded. A window half full of
 * zeros produces a confident reading of nothing in particular.
 */
export function trackPitch(
  samples: Float32Array,
  sampleRate: number,
  options: TrackOptions,
): Frame[] {
  const { frameSamples, hopMs } = options;
  const hopSamples = Math.max(1, Math.round((hopMs / 1000) * sampleRate));

  if (samples.length < frameSamples) return [];

  const detector = createPitchDetector(frameSamples, options);
  // Reused across every frame; `subarray` would alias the input, which is fine for
  // reading, but pitchy wants a view it can hand to its own typed-array maths.
  const window = new Float32Array(frameSamples);

  const frames: Frame[] = [];
  const last = samples.length - frameSamples;

  for (let start = 0; start <= last; start += hopSamples) {
    window.set(samples.subarray(start, start + frameSamples));
    const result = detectPitch(detector, window, sampleRate, options);

    frames.push({
      // The centre, not the leading edge: a frame's reading describes the middle of
      // the window it was measured over, and using the edge shifts every note
      // earlier by half a window.
      time: (start + frameSamples / 2) / sampleRate,
      midi: result === null ? null : frequencyToMidi(result.frequency),
      clarity: result?.clarity ?? 0,
    });
  }

  return frames;
}
