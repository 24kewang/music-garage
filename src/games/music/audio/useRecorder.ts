"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { createOnsetGate } from "../dsp/onset";
import { assembleChunks, trimToOnset } from "../dsp/trim";

/**
 * Recording a take.
 *
 * The shape of the interaction, which is what most of this file is arranging:
 *
 * ```
 * idle ──press──► arming ──ready──► armed ──onset──► recording ──cap│press──► idle
 *                                     └────── press, nothing heard ──────► idle
 * ```
 *
 * Three things here are load-bearing.
 *
 * **The clock starts at the first note, not at the press.** Somebody reaching back to
 * their instrument should not spend their ten seconds doing it, so the window is
 * measured from the energy onset and the armed state says so rather than showing a
 * timer that is already running.
 *
 * **The cap is enforced from the audio clock**, in the level handler, not from the
 * interval that draws the countdown. A backgrounded tab throttles timers to once a
 * second or worse; the audio clock does not care, so a tab that loses focus mid-take
 * still stops at ten seconds instead of recording until the heat death of the
 * universe. The interval only writes digits.
 *
 * **A press with nothing heard leaves no trace.** No recording, no attempt, no
 * letter — the turn is exactly where it was, which is what the brief asks for and
 * what makes the record button safe to press experimentally.
 *
 * The microphone is acquired on the first press and **held for the session**. Four
 * players taking turns would otherwise wait out a permission round-trip before every
 * single take.
 */

export interface Recording {
  samples: Float32Array;
  /** The rate it was captured at, which it has to be played back at to sound right. */
  sampleRate: number;
}

export type RecorderStatus =
  /** Nothing happening. */
  | "idle"
  /** Opening the microphone; the permission prompt may be up. */
  | "arming"
  /** Listening. Nothing captured yet, and no clock running. */
  | "armed"
  /** A note was heard; the window is running. */
  | "recording"
  /** Stopped, draining the last chunk out of the worklet. */
  | "finishing";

export interface Recorder {
  status: RecorderStatus;
  /** Smoothed input level, 0–1, for the meter. */
  level: number;
  /** Seconds left in the window, or `null` when the clock is not running. */
  remaining: number | null;
  /** Microphone trouble worth putting on screen. */
  error: string | null;
  /** Begin a take with a wall-clock cap, in seconds, measured from the first note. */
  start: (capSeconds: number) => void;
  /** Second press: keep the take, or abandon it if nothing was ever heard. */
  stop: () => void;
  /** Release the microphone and forget everything. */
  release: () => void;
}

export interface UseRecorderOptions {
  /** A take that heard something. */
  onCaptured: (recording: Recording) => void;
  /** A take that heard nothing — treat it as if the button was never pressed. */
  onDiscarded: (reason: "silent" | "timeout") => void;
}

/** Level at which the meter reads full. Chosen so ordinary playing fills most of it. */
const LEVEL_FULL_SCALE = 0.2;
/** How much of the previous level carries over, so the meter breathes rather than flickers. */
const LEVEL_SMOOTHING = 0.7;

const WORKLET_URL = "/worklets/music-capture.js";

export function useRecorder({ onCaptured, onDiscarded }: UseRecorderOptions): Recorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [level, setLevel] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Held for the session once granted. */
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const moduleRef = useRef<Promise<void> | null>(null);

  /** Per take. */
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const gateRef = useRef<ReturnType<typeof createOnsetGate> | null>(null);
  const captureStartRef = useRef(0);
  const onsetAtRef = useRef<number | null>(null);
  const capRef = useRef(0);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelRef = useRef(0);
  const statusRef = useRef<RecorderStatus>("idle");

  /** Latest callbacks, so the message handler never needs rebinding. */
  const handlers = useRef({ onCaptured, onDiscarded });
  useEffect(() => {
    handlers.current = { onCaptured, onDiscarded };
  });

  const setBoth = useCallback((next: RecorderStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    armTimerRef.current = null;
    tickRef.current = null;
  }, []);

  /** Tear down this take's node, keeping the microphone. */
  const teardownNode = useCallback(() => {
    const node = nodeRef.current;
    nodeRef.current = null;
    if (!node) return;
    node.port.onmessage = null;
    try {
      node.disconnect();
    } catch {
      // Already disconnected; nothing to unpick.
    }
  }, []);

  const finish = useCallback(
    (keep: boolean, reason: "silent" | "timeout" = "silent") => {
      clearTimers();
      teardownNode();

      const chunks = chunksRef.current;
      chunksRef.current = [];
      const onsetAt = onsetAtRef.current;
      onsetAtRef.current = null;
      gateRef.current = null;

      setBoth("idle");
      setRemaining(null);
      levelRef.current = 0;
      setLevel(0);

      const sampleRate = contextRef.current?.sampleRate;

      if (!keep || onsetAt === null || sampleRate === undefined) {
        handlers.current.onDiscarded(reason);
        return;
      }

      const samples = trimToOnset(
        assembleChunks(chunks),
        sampleRate,
        captureStartRef.current,
        onsetAt,
        config.record.preRollMs,
      );

      if (samples.length === 0) {
        handlers.current.onDiscarded("silent");
        return;
      }

      handlers.current.onCaptured({ samples, sampleRate });
    },
    [clearTimers, setBoth, teardownNode],
  );

  /** Ask for the microphone once, and load the worklet once. */
  const ensureAudio = useCallback(async () => {
    if (contextRef.current && contextRef.current.state !== "closed") {
      if (contextRef.current.state === "suspended") await contextRef.current.resume();
      return contextRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // All three mangle pitch, which is the only thing this game measures.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Created inside the gesture that called this: iOS refuses audio otherwise.
    const context = new AudioContext();
    contextRef.current = context;
    streamRef.current = stream;
    sourceRef.current = context.createMediaStreamSource(stream);

    moduleRef.current ??= context.audioWorklet.addModule(WORKLET_URL);
    await moduleRef.current;

    if (context.state === "suspended") await context.resume();
    return context;
  }, []);

  const stop = useCallback(() => {
    const current = statusRef.current;
    if (current === "idle" || current === "finishing") return;

    // Nothing was ever heard: abandon it completely rather than handing back a clip
    // of a quiet room for the pipeline to find no notes in.
    if (current !== "recording") {
      finish(false, "silent");
      return;
    }

    setBoth("finishing");
    // Ask for the tail; `finish` runs when the final chunk arrives. If the worklet
    // has already gone, fall through immediately rather than hanging the turn.
    const node = nodeRef.current;
    if (!node) {
      finish(true);
      return;
    }
    node.port.postMessage({ type: "stop" });
  }, [finish, setBoth]);

  const start = useCallback(
    (capSeconds: number) => {
      if (statusRef.current !== "idle") return;

      setError(null);
      setBoth("arming");
      capRef.current = capSeconds;
      chunksRef.current = [];
      onsetAtRef.current = null;

      void ensureAudio()
        .then((context) => {
          // Canceled while the permission prompt was up.
          if (statusRef.current !== "arming") return;

          const node = new AudioWorkletNode(context, "music-capture", {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            processorOptions: { chunkFrames: config.record.chunkSamples },
          });

          // Not connected to the destination: monitoring the microphone through the
          // speakers is a feedback loop, not a feature.
          sourceRef.current?.connect(node);
          nodeRef.current = node;

          node.port.onmessage = (event: MessageEvent) => {
            const message = event.data as
              | { type: "start"; time: number }
              | { type: "level"; time: number; rms: number }
              | { type: "chunk"; samples: Float32Array; final: boolean };

            if (message.type === "start") {
              captureStartRef.current = message.time;
              gateRef.current = createOnsetGate({
                threshold: config.record.onsetRms,
                holdBlocks: config.record.onsetHoldBlocks,
                graceUntil: message.time + config.record.graceMs / 1000,
              });
              setBoth("armed");
              return;
            }

            if (message.type === "chunk") {
              chunksRef.current.push(message.samples);
              if (message.final) finish(true);
              return;
            }

            // A level reading.
            levelRef.current =
              levelRef.current * LEVEL_SMOOTHING + message.rms * (1 - LEVEL_SMOOTHING);
            setLevel(Math.min(1, levelRef.current / LEVEL_FULL_SCALE));

            const onsetAt = onsetAtRef.current;

            if (onsetAt === null) {
              const fired = gateRef.current?.push(message.time, message.rms) ?? null;
              if (fired === null) return;

              onsetAtRef.current = fired;
              if (armTimerRef.current) clearTimeout(armTimerRef.current);
              armTimerRef.current = null;
              setBoth("recording");
              setRemaining(capRef.current);

              // Display only. The cap itself is enforced below, off the audio clock,
              // so a throttled tab cannot overrun it.
              tickRef.current = setInterval(() => {
                const started = onsetAtRef.current;
                const now = contextRef.current?.currentTime;
                if (started === null || now === undefined) return;
                setRemaining(Math.max(0, capRef.current - (now - started)));
              }, 100);
              return;
            }

            if (message.time - onsetAt >= capRef.current) stop();
          };

          // Armed too long with nothing heard: give the microphone back rather than
          // leaving the browser's recording indicator lit while somebody is busy.
          armTimerRef.current = setTimeout(() => {
            if (statusRef.current === "armed" || statusRef.current === "arming") {
              finish(false, "timeout");
            }
          }, config.record.armTimeoutSeconds * 1000);
        })
        .catch((cause: unknown) => {
          const denied =
            cause instanceof DOMException &&
            (cause.name === "NotAllowedError" || cause.name === "SecurityError");
          setError(
            denied
              ? "Microphone access was blocked. Allow it in your browser to play."
              : "Could not open the microphone.",
          );
          clearTimers();
          teardownNode();
          setBoth("idle");
        });
    },
    [clearTimers, ensureAudio, finish, setBoth, stop, teardownNode],
  );

  const release = useCallback(() => {
    clearTimers();
    teardownNode();
    chunksRef.current = [];
    gateRef.current = null;
    onsetAtRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sourceRef.current = null;
    moduleRef.current = null;

    // close() rejects if it has already gone; there is nothing to recover from.
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;

    setBoth("idle");
    setRemaining(null);
    setLevel(0);
  }, [clearTimers, setBoth, teardownNode]);

  useEffect(() => release, [release]);

  return { status, level, remaining, error, start, stop, release };
}
