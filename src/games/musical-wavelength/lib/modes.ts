/**
 * Turning what the microphone hears into a needle angle, and the matching tick
 * scale drawn on the cover.
 *
 * The needle mapping and the tick positions come from the same functions, so a tick
 * labeled A4 is exactly where the needle sits when A4 is sung.
 */

import { formatMidi, frequencyToMidi } from "@/shared/audio";
import { config } from "../config";
import { clamp } from "./geometry";

/**
 * Half-span of the audio scale.
 *
 * One constant for both the needle mapping and the tick positions, so a tick labeled
 * A4 sits exactly where singing A4 puts the needle. It stops short of the needle's own
 * `needleMaxDeg` limit to keep the outermost labels clear of the window edge.
 */
const MAX = config.geometry.scaleMaxDeg;

export interface Tick {
  /** Dial angle, in degrees. */
  deg: number;
  major: boolean;
  /** Present on labeled ticks only. */
  label?: string;
}

/**
 * Map a (fractional) MIDI number onto the dial, low note at the left. Unclamped, so
 * tick generation and out-of-range readings both use it.
 */
export function midiToNeedleDeg(
  midi: number,
  lowMidi: number,
  highMidi: number,
): number {
  const span = highMidi - lowMidi;
  if (span <= 0) return 0;
  const t = (midi - lowMidi) / span;
  return -MAX + t * 2 * MAX;
}

/**
 * Needle angle for a detected frequency in pitch mode, clipped to the ends of the
 * dial so singing outside the range parks the needle at the edge.
 */
export function pitchNeedleDeg(
  frequency: number,
  lowMidi: number,
  highMidi: number,
): number {
  const midi = frequencyToMidi(frequency);
  return clamp(midiToNeedleDeg(midi, lowMidi, highMidi), -MAX, MAX);
}

/**
 * Needle angle for a cents deviation in intonation mode. Cents are already within
 * ±50 of the nearest semitone; the clamp handles spans narrower than that.
 */
export function intonationNeedleDeg(cents: number, spanCents: number): number {
  if (spanCents <= 0) return 0;
  return clamp((cents / spanCents) * MAX, -MAX, MAX);
}

/**
 * How many semitones to skip between labels. Wide ranges would otherwise overlap
 * their labels, so they thin out automatically.
 */
export function labelStrideFor(semitones: number): number {
  const { labelEverySemitones, autoThinAboveSemitones } = config.ticks;
  const thinning = Math.max(1, Math.ceil(semitones / autoThinAboveSemitones));
  return Math.max(labelEverySemitones, thinning);
}

/** Semitone ticks across the pitch range, subdivided and labeled with note names. */
export function pitchTicks(lowMidi: number, highMidi: number): Tick[] {
  const ticks: Tick[] = [];
  const semitones = highMidi - lowMidi;
  if (semitones <= 0) return ticks;

  const stride = labelStrideFor(semitones);
  const { minorTicksPerSemitone, minMinorSpacingDeg } = config.ticks;

  const degPerSemitone = (2 * MAX) / semitones;
  const minorSpacingDeg = degPerSemitone / (minorTicksPerSemitone + 1);
  const drawMinors =
    minorTicksPerSemitone > 0 && minorSpacingDeg >= minMinorSpacingDeg;

  for (let i = 0; i <= semitones; i++) {
    const midi = lowMidi + i;
    ticks.push({
      deg: midiToNeedleDeg(midi, lowMidi, highMidi),
      major: true,
      label: i % stride === 0 ? formatMidi(midi) : undefined,
    });

    if (drawMinors && i < semitones) {
      for (let j = 1; j <= minorTicksPerSemitone; j++) {
        ticks.push({
          deg: midiToNeedleDeg(
            midi + j / (minorTicksPerSemitone + 1),
            lowMidi,
            highMidi,
          ),
          major: false,
        });
      }
    }
  }

  return ticks;
}

/** Cent ticks across ±span, labeled every `labelStepCents` with 0 at the center. */
export function intonationTicks(spanCents: number): Tick[] {
  const ticks: Tick[] = [];
  if (spanCents <= 0) return ticks;

  const { labelStepCents, minorTicksPerLabel, minMinorSpacingDeg } = config.ticks;

  const degPerStep = (labelStepCents / spanCents) * MAX;
  const minorSpacingDeg = degPerStep / (minorTicksPerLabel + 1);
  const drawMinors = minorTicksPerLabel > 0 && minorSpacingDeg >= minMinorSpacingDeg;

  // Walk outward from center so 0 is always present and the scale stays symmetric
  // even when the span isn't a whole number of steps.
  for (let cents = 0; cents <= spanCents; cents += labelStepCents) {
    for (const signed of cents === 0 ? [0] : [-cents, cents]) {
      ticks.push({
        deg: intonationNeedleDeg(signed, spanCents),
        major: true,
        label: `${signed}`,
      });
    }

    if (!drawMinors || cents + labelStepCents > spanCents) continue;

    for (let j = 1; j <= minorTicksPerLabel; j++) {
      const offset = cents + (j * labelStepCents) / (minorTicksPerLabel + 1);
      for (const signed of [-offset, offset]) {
        ticks.push({ deg: intonationNeedleDeg(signed, spanCents), major: false });
      }
    }
  }

  return ticks.sort((a, b) => a.deg - b.deg);
}
