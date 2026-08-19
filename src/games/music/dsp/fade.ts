/**
 * A short ramp at each end of a clip, applied in place.
 *
 * A recording starts and ends mid-note, so both edges are step discontinuities and
 * both click on playback. The ramp is long enough to remove the click and short
 * enough that nobody hears it as a fade.
 *
 * Destructive, deliberately: the caller copies first. Stored recordings get replayed
 * more than once, and fading the original each time would eat further into it.
 */
export function fadeEdges(
  samples: Float32Array,
  sampleRate: number,
  fadeMs: number,
): void {
  const ramp = Math.round((fadeMs / 1000) * sampleRate);
  if (ramp <= 0) return;

  // Never longer than half the clip, or the two ramps would overlap and fight over
  // the middle — a very short clip would come out quieter than it went in.
  const length = Math.min(ramp, Math.floor(samples.length / 2));

  for (let i = 0; i < length; i++) {
    const gain = i / length;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}
