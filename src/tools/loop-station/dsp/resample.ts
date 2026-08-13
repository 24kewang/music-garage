/**
 * Linear resampling, for reopening a save on a device whose audio hardware
 * runs at a different rate.
 *
 * Everything downstream — padding, tiling, punch-in bounds — is computed in
 * frames against the *current* context's sample rate, so a 48kHz recording
 * replayed at 44.1kHz would bake at the wrong length. Converting the stored
 * samples once on load keeps every other frame calculation honest.
 *
 * Linear is enough here: the alternative is an audible-quality argument about
 * a conversion most people will never trigger, and the artefacts sit far above
 * anything a loop pedal is doing.
 */
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;

  const ratio = toRate / fromRate;
  const length = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(length);
  const last = samples.length - 1;

  for (let i = 0; i < length; i++) {
    const source = i / ratio;
    const index = Math.floor(source);
    if (index >= last) {
      out[i] = samples[last];
      continue;
    }
    const fraction = source - index;
    out[i] = samples[index] * (1 - fraction) + samples[index + 1] * fraction;
  }
  return out;
}
