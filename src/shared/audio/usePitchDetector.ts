"use client";

import { useEffect, useRef, useState } from "react";
import { frequencyToNote, type DetectedNote } from "./notes";
import {
  createPitchDetector,
  detectPitch,
  type Detector,
  type PitchDetectionOptions,
} from "./pitch";

export interface LivePitch {
  /** Smoothed fundamental in Hz, or null when nothing confident is being heard. */
  frequency: number | null;
  /** The nearest note, with cents deviation. Null whenever `frequency` is null. */
  note: DetectedNote | null;
  /** Clarity of the most recent raw reading, 0–1. */
  clarity: number;
  /** True while confident readings are arriving. */
  isDetecting: boolean;
}

export interface PitchDetectorOptions extends PitchDetectionOptions {
  /**
   * How many recent readings the median is taken over. A median (not a mean) is what
   * kills the occasional octave jump — a single wrong frame can't drag the result.
   */
  smoothingFrames?: number;
  /**
   * How long to keep showing the last reading through a dropout, in ms. Without this
   * the readout flickers to empty on every consonant or bow change.
   */
  holdMs?: number;
  /** Throttle for React updates. The analyser window only refreshes so often anyway. */
  updateIntervalMs?: number;
}

const IDLE: LivePitch = {
  frequency: null,
  note: null,
  clarity: 0,
  isDetecting: false,
};

/**
 * Runs pitch detection on a live analyser node and returns a smoothed reading.
 *
 * Pass the `analyser` and `sampleRate` from {@link useMicrophone}; the loop starts
 * when they become available and stops on unmount or when the mic is stopped.
 */
export function usePitchDetector(
  analyser: AnalyserNode | null,
  sampleRate: number | null,
  options: PitchDetectorOptions = {},
): LivePitch {
  const {
    smoothingFrames = 5,
    holdMs = 250,
    updateIntervalMs = 50,
    ...detectionOptions
  } = options;

  const [pitch, setPitch] = useState<LivePitch>(IDLE);

  // Kept in a ref so tweaking detection options doesn't tear down and restart the
  // animation loop. Synced in an effect rather than during render — mutating a ref
  // while rendering is what makes concurrent rendering misbehave.
  const optionsRef = useRef({ smoothingFrames, holdMs, updateIntervalMs, detectionOptions });
  useEffect(() => {
    optionsRef.current = { smoothingFrames, holdMs, updateIntervalMs, detectionOptions };
  });

  useEffect(() => {
    if (!analyser || !sampleRate) return;

    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    const detector: Detector = createPitchDetector(bufferLength, detectionOptions);

    /** Recent confident frequencies, newest last. */
    const recent: number[] = [];
    let lastConfidentAt = 0;
    let lastPublishedAt = 0;
    let frameId = 0;

    const tick = () => {
      frameId = requestAnimationFrame(tick);

      analyser.getFloatTimeDomainData(buffer);
      const result = detectPitch(detector, buffer, sampleRate, optionsRef.current.detectionOptions);

      const now = performance.now();
      const { smoothingFrames, holdMs, updateIntervalMs } = optionsRef.current;

      if (result) {
        recent.push(result.frequency);
        while (recent.length > smoothingFrames) recent.shift();
        lastConfidentAt = now;
      } else if (now - lastConfidentAt > holdMs) {
        // Dropout has outlasted the hold window — forget what we were hearing.
        recent.length = 0;
      }

      if (now - lastPublishedAt < updateIntervalMs) return;
      lastPublishedAt = now;

      if (recent.length === 0) {
        setPitch((prev) => (prev.isDetecting || prev.clarity !== 0 ? IDLE : prev));
        return;
      }

      const frequency = median(recent);
      setPitch({
        frequency,
        note: frequencyToNote(frequency),
        clarity: result?.clarity ?? 0,
        isDetecting: result !== null,
      });
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      // Clear on teardown so restarting the mic doesn't briefly show the last note
      // heard before it was stopped.
      setPitch(IDLE);
    };
    // detectionOptions is read through optionsRef inside the loop; only the audio
    // graph identity should restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser, sampleRate]);

  // Derived rather than stored, so no state update is needed when the mic is idle.
  return analyser && sampleRate ? pitch : IDLE;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
