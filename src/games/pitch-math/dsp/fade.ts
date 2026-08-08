/**
 * Edge fades for the replay clip.
 *
 * The capture starts and ends mid-note, so the buffer begins and ends part-way through
 * a waveform. Played back untreated, both edges are step discontinuities and click
 * audibly. A few milliseconds of ramp at each end removes that without being long
 * enough to hear as a fade.
 *
 * Pure, and separated from the playback hook so it can be tested without an
 * AudioContext.
 */

/**
 * Ramp the first and last `ms` of a clip in and out, in place.
 *
 * Returns the same array for convenience. A clip too short to hold two full ramps gets
 * proportionally shorter ones rather than overlapping ramps that would scale the middle
 * twice and dip the whole clip.
 */
export function fadeEdges(
  samples: Float32Array,
  sampleRate: number,
  ms: number,
): Float32Array {
  if (ms <= 0 || sampleRate <= 0 || samples.length === 0) return samples;

  const requested = Math.floor((ms / 1000) * sampleRate);
  // Never more than half the clip each, so the two ramps meet at most in the middle.
  const fade = Math.min(requested, Math.floor(samples.length / 2));
  if (fade <= 0) return samples;

  for (let i = 0; i < fade; i++) {
    // Linear is enough here: at a few milliseconds the curve shape is inaudible.
    const gain = i / fade;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }

  return samples;
}
