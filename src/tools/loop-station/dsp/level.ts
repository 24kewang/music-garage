import { config } from "../config";

/**
 * Peak envelope of a buffer for the waveform rows: `bars` buckets of
 * max |sample|, **normalised so the loudest bar is exactly 1**.
 *
 * Normalising is not cosmetic. Baked buffers routinely exceed 1.0 where a
 * crossfade sums correlated audio, and the raw value drives a percentage
 * height — so a single spike would push bars out through the top of the row.
 * Dividing by the observed maximum also means a quiet take is still legible.
 *
 * The divisor is clamped to `config.ui.waveFloor` so a near-silent recording
 * stays visually flat instead of having its noise floor amplified to full
 * height.
 */
export function peaks(samples: Float32Array, bars: number): number[] {
  const out = new Array<number>(bars).fill(0);
  if (samples.length === 0) return out;

  const per = samples.length / bars;
  let loudest = 0;
  for (let b = 0; b < bars; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((b + 1) * per)));
    let max = 0;
    for (let i = from; i < to; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    out[b] = max;
    if (max > loudest) loudest = max;
  }

  const divisor = Math.max(loudest, config.ui.waveFloor);
  for (let b = 0; b < bars; b++) out[b] = Math.min(1, out[b] / divisor);
  return out;
}

/**
 * Amplitude (0..1) to a meter fill fraction, via dBFS.
 *
 * A linear amplitude scale is why the meters barely moved: real material sits
 * around 0.1–0.2, which is a fifth of the way up linearly but a comfortable
 * two-thirds on a dB scale. Silence pins to 0 rather than −Infinity.
 */
export function meterFraction(amplitude: number, floorDb = config.ui.meterFloorDb): number {
  if (amplitude <= 0) return 0;
  const db = 20 * Math.log10(amplitude);
  if (db <= floorDb) return 0;
  return Math.min(1, db / -floorDb + 1);
}
