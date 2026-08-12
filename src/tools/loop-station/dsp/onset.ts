/**
 * Rising-energy onset detection over a stream of (time, rms) block levels.
 *
 * During calibration the capture worklet posts one RMS value per 128-frame
 * block (~2.7ms at 48kHz), and this runs on the main thread — so the whole
 * decision stays in testable TypeScript and the worklet stays dumb.
 */

export interface OnsetOptions {
  /** Absolute RMS a block must reach. */
  threshold: number;
  /** How much louder than the recent floor a block must be to count as an attack. */
  riseRatio: number;
  /** Dead time after a hit, seconds, so one note can't fire twice. */
  refractorySeconds: number;
}

export interface OnsetDetector {
  /** Feed one block; returns true when this block is an onset. */
  update(time: number, rms: number): boolean;
}

/** Smoothing factor for the running floor — slow enough to sit under attacks. */
const FLOOR_ALPHA = 0.05;

export function createOnsetDetector(options: OnsetOptions): OnsetDetector {
  let floor = 0;
  let lastOnset = -Infinity;

  return {
    update(time: number, rms: number): boolean {
      const fired =
        rms >= options.threshold &&
        rms >= floor * options.riseRatio &&
        time - lastOnset >= options.refractorySeconds;
      if (fired) lastOnset = time;
      // Update the floor after the decision, so an attack is judged against the
      // level before it, not including it.
      floor = floor * (1 - FLOOR_ALPHA) + rms * FLOOR_ALPHA;
      return fired;
    },
  };
}
