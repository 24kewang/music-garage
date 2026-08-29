/**
 * The whole transcription, composed.
 *
 * Deterministic given a buffer, and DOM-free from end to end — so this is testable
 * in Node against synthesized phrases rather than only discoverable by singing at a
 * laptop. Nothing downstream of `track.ts` ever sees a `Float32Array`.
 *
 * The intermediate artifacts come back with the notes on purpose. The design doc
 * asks for them, and they are what make a threshold argument settleable: without the
 * contour and the segment list, "it heard the wrong notes" is unfalsifiable.
 */

import { config } from "../config";
import { concatenate, medianFilter, pointsForMs, type ContourPoint } from "./contour";
import { dropGlides, findSegments, type Segment } from "./segment";
import { collapse, quantize } from "./sequence";
import { trackPitch, type Frame } from "./track";

export interface Transcription {
  /** The sequence the game actually scores. */
  notes: number[];
  /** Everything the pipeline saw on the way, for the debug view. */
  frames: Frame[];
  contour: ContourPoint[];
  segments: Segment[];
  /** Semitones the performance sat off concert pitch, removed before rounding. */
  tuningOffset: number;
}

export const EMPTY_TRANSCRIPTION: Transcription = {
  notes: [],
  frames: [],
  contour: [],
  segments: [],
  tuningOffset: 0,
};

export function transcribe(samples: Float32Array, sampleRate: number): Transcription {
  const { hopMs } = config.capture;
  const t = config.transcribe;

  const frames = trackPitch(samples, sampleRate, config.capture);
  const raw = concatenate(frames);
  const contour = medianFilter(raw, pointsForMs(t.medianMs, hopMs));

  const held = findSegments(contour, {
    hopSeconds: hopMs / 1000,
    toleranceSemitones: t.toleranceSemitones,
    anchorPoints: t.anchorPoints,
    breakPoints: t.breakPoints,
    minSeconds: t.minNoteMs / 1000,
  });

  const segments = dropGlides(held, {
    maxSeconds: t.maxGlideMs / 1000,
    minSpanSemitones: t.minGlideSpanSemitones,
  });

  const { notes, tuningOffset } = quantize(segments.map((segment) => segment.midi));

  return { notes: collapse(notes), frames, contour, segments, tuningOffset };
}
