"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { rms } from "../dsp/spectrum";

/**
 * Waiting for the players to start, then grabbing the window that follows.
 *
 * Deliberately built on an `AnalyserNode` rather than an `AudioWorklet`. The analyser
 * always holds the most recent `fftSize` samples, so after waiting exactly that long
 * from the onset, one read returns exactly the post-onset window — no ring buffer, no
 * worklet module to load, and `useMicrophone` needs no changes to support it.
 *
 * The same property is what makes the replay clip possible: a read one window later is
 * exactly contiguous with the previous one, so successive reads concatenate seamlessly.
 * Only the first window is analyzed; the rest are collected purely so the players have
 * something long enough to listen back to.
 */

export type CaptureStatus =
  /** Not listening. */
  | "idle"
  /** Listening for someone to start playing. */
  | "waiting"
  /** Onset heard; the window being analyzed is filling. */
  | "capturing"
  /** Analysis has already started; extra windows are being collected for the replay. */
  | "extending";

export interface Capture {
  status: CaptureStatus;
  /** Smoothed input level, 0–1, for the listening animation. */
  level: number;
  /** Begin listening. The analyser must already be running. */
  start: () => void;
  /** Stop listening and discard any capture in flight. */
  stop: () => void;
}

export interface UseCaptureOptions {
  analyser: AnalyserNode | null;
  sampleRate: number | null;
  /**
   * Called with the window to analyze, as soon as it is full.
   *
   * Return `true` to keep collecting the remaining replay windows, `false` to stop
   * immediately — which is how a capture that turned out to be unusable avoids holding
   * up the next attempt behind a tail nobody will listen to.
   */
  onCaptured: (samples: Float32Array, sampleRate: number) => boolean;
  /** Called once the full replay clip is assembled, if collection ran to the end. */
  onRecording?: (samples: Float32Array, sampleRate: number) => void;
}

/** Level at which the meter reads full. Chosen so normal playing fills most of it. */
const LEVEL_FULL_SCALE = 0.25;

export function useCapture({
  analyser,
  sampleRate,
  onCaptured,
  onRecording,
}: UseCaptureOptions): Capture {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [level, setLevel] = useState(0);

  const statusRef = useRef<CaptureStatus>("idle");
  const frameRef = useRef<number | null>(null);
  // Typed to a plain ArrayBuffer: getFloatTimeDomainData won't accept a view that
  // might be backed by a SharedArrayBuffer.
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const captureAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const levelRef = useRef(0);

  /** Windows collected so far, in order, while the replay clip is being assembled. */
  const windowsRef = useRef<Float32Array[]>([]);

  /** Latest callbacks, so the loop never needs rebinding when they change identity. */
  const handlersRef = useRef({ onCaptured, onRecording });
  useEffect(() => {
    handlersRef.current = { onCaptured, onRecording };
  });

  const setStatusBoth = useCallback((next: CaptureStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const stopLoop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopLoop();
    windowsRef.current = [];
    setStatusBoth("idle");
    levelRef.current = 0;
    setLevel(0);
  }, [setStatusBoth, stopLoop]);

  const start = useCallback(() => {
    if (!analyser || !sampleRate) return;
    startedAtRef.current = performance.now();
    windowsRef.current = [];
    setStatusBoth("waiting");
  }, [analyser, sampleRate, setStatusBoth]);

  useEffect(() => {
    if (!analyser || !sampleRate) return;
    if (status === "idle") return;

    const size = analyser.fftSize;
    // Allocated once per analyser, not per frame — this is read sixty times a second.
    if (!bufferRef.current || bufferRef.current.length !== size) {
      bufferRef.current = new Float32Array(size);
    }
    const buffer = bufferRef.current;

    const { onsetRmsThreshold, onsetWindowSamples, onsetGraceMs, playbackWindows } =
      config.capture;
    const { levelSmoothing } = config.wave;

    /** One analyser window, in milliseconds. */
    const windowMs = (size / sampleRate) * 1000;

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);

      // The round can release the microphone from outside this loop — on a correct
      // answer, or on Stop — which closes the context and leaves the analyser dead.
      if (analyser.context.state === "closed") {
        stopLoop();
        return;
      }

      analyser.getFloatTimeDomainData(buffer);

      // Level over the tail only: the freshest slice of the analyser's window.
      const tail = rms(buffer, size - onsetWindowSamples, size);
      levelRef.current =
        levelRef.current * levelSmoothing + tail * (1 - levelSmoothing);
      setLevel(Math.min(1, levelRef.current / LEVEL_FULL_SCALE));

      const now = performance.now();

      if (statusRef.current === "waiting") {
        // The click that granted microphone permission makes a noise of its own.
        if (now - startedAtRef.current < onsetGraceMs) return;

        if (tail >= onsetRmsThreshold) {
          setStatusBoth("capturing");
          // One full analyser window from now, its contents are entirely post-onset.
          captureAtRef.current = now + windowMs;
        }
        return;
      }

      if (now < captureAtRef.current) return;

      // Copied: the buffer is reused every frame, so handing it over directly would let
      // the next read overwrite the samples still being used.
      const window = Float32Array.from(buffer);
      windowsRef.current.push(window);

      if (statusRef.current === "capturing") {
        const keepGoing = handlersRef.current.onCaptured(window, sampleRate);

        // Nothing usable in it, or no tail wanted: stop here and let the round retry.
        if (!keepGoing || playbackWindows <= 1) {
          stopLoop();
          windowsRef.current = [];
          setStatusBoth("idle");
          return;
        }

        setStatusBoth("extending");
        captureAtRef.current = now + windowMs;
        return;
      }

      // Collecting the replay tail.
      if (windowsRef.current.length < playbackWindows) {
        captureAtRef.current = now + windowMs;
        return;
      }

      const collected = windowsRef.current;
      windowsRef.current = [];
      stopLoop();
      setStatusBoth("idle");

      const clip = new Float32Array(collected.length * size);
      collected.forEach((part, index) => clip.set(part, index * size));
      handlersRef.current.onRecording?.(clip, sampleRate);
    };

    frameRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [analyser, sampleRate, setStatusBoth, status, stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  return { status, level, start, stop };
}
