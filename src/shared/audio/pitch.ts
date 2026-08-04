/**
 * Pitch detection, wrapping the McLeod Pitch Method implementation from `pitchy`.
 *
 * Games import from `@/shared/audio` and never from `pitchy` directly, so the
 * algorithm can be swapped (YIN, a WASM detector, an AudioWorklet) without touching
 * game code.
 *
 * Pure with respect to the DOM — testable against synthesized buffers in Node.
 */

import { PitchDetector } from "pitchy";

export interface PitchResult {
  /** Detected fundamental in Hz. */
  frequency: number;
  /** 0–1 confidence from MPM. Sustained sung notes typically land above 0.9. */
  clarity: number;
}

export interface PitchDetectionOptions {
  /**
   * Reject readings below this clarity. 0.9 is a good default for voice: low enough
   * to track a real singer, high enough to reject room noise and consonants.
   */
  minClarity?: number;
  /** Ignore anything below this — below the bottom of the bass range. */
  minFrequency?: number;
  /** Ignore anything above this — above the top of the soprano range. */
  maxFrequency?: number;
  /**
   * Minimum RMS volume in dBFS (0 = full scale, negative = quieter). Silence and room
   * tone read as garbage pitches without this floor.
   */
  minVolumeDecibels?: number;
}

/**
 * dBFS → absolute RMS amplitude.
 *
 * Done here rather than via pitchy's `minVolumeDecibels` setter, which converts with
 * `10 ** (db / 10)` — a power-ratio formula applied to an amplitude threshold, so a
 * requested -50 dB floor lands at -100 dB and effectively never triggers. The `/ 20`
 * below is the amplitude conversion the option name implies.
 */
function decibelsToAmplitude(db: number): number {
  return 10 ** (db / 20);
}

export const DEFAULT_PITCH_OPTIONS: Required<PitchDetectionOptions> = {
  minClarity: 0.9,
  minFrequency: 50,
  maxFrequency: 2000,
  minVolumeDecibels: -50,
};

export type Detector = PitchDetector<Float32Array>;

/**
 * Build a detector for a fixed buffer length. Allocate once and reuse — the detector
 * holds internal scratch buffers so per-frame detection allocates nothing, which
 * matters when this runs every animation frame.
 */
export function createPitchDetector(
  inputLength: number,
  options: PitchDetectionOptions = {},
): Detector {
  const { minVolumeDecibels } = { ...DEFAULT_PITCH_OPTIONS, ...options };
  const detector = PitchDetector.forFloat32Array(inputLength);
  detector.minVolumeAbsolute = decibelsToAmplitude(minVolumeDecibels);
  return detector;
}

/**
 * Detect the pitch of one buffer of time-domain samples.
 *
 * Returns `null` rather than a low-confidence guess when the input is silence, noise,
 * or out of range — callers can treat `null` as "nothing being sung right now".
 */
export function detectPitch(
  detector: Detector,
  buffer: Float32Array,
  sampleRate: number,
  options: PitchDetectionOptions = {},
): PitchResult | null {
  const { minClarity, minFrequency, maxFrequency } = {
    ...DEFAULT_PITCH_OPTIONS,
    ...options,
  };

  const [frequency, clarity] = detector.findPitch(buffer, sampleRate);

  if (clarity < minClarity) return null;
  if (frequency < minFrequency || frequency > maxFrequency) return null;
  if (!Number.isFinite(frequency) || frequency <= 0) return null;

  return { frequency, clarity };
}
