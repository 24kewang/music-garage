"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicrophoneStatus =
  /** Nothing requested yet. */
  | "idle"
  /** Permission prompt is up. */
  | "requesting"
  /** Live — `analyser` is available. */
  | "running"
  /** The user (or a browser policy) said no. */
  | "denied"
  /** Something else went wrong; see `error`. */
  | "error";

export interface MicrophoneOptions {
  /**
   * Analyser window size. 4096 samples is ~85 ms at 48 kHz: long enough to resolve a
   * low male voice near 85 Hz (several full periods), short enough to still feel live.
   */
  fftSize?: number;
}

export interface Microphone {
  status: MicrophoneStatus;
  /** Human-readable failure reason, set when status is "denied" or "error". */
  error: string | null;
  /** Null until status is "running". */
  analyser: AnalyserNode | null;
  /** The hardware sample rate, needed to interpret detected pitches. */
  sampleRate: number | null;
  /** Must be called from a user gesture — browsers block audio started any other way. */
  start: () => Promise<void>;
  stop: () => void;
}

const DEFAULT_FFT_SIZE = 4096;

/**
 * Owns the microphone stream and its Web Audio graph.
 *
 * Two constraints drive this implementation:
 *
 * 1. `echoCancellation`, `noiseSuppression` and `autoGainControl` are all disabled.
 *    They are tuned for speech intelligibility and actively distort pitch — leaving
 *    them on produces readings that wobble and octave-jump.
 * 2. The `AudioContext` is created and resumed inside `start()`, which must be called
 *    from a click. Safari and iOS refuse to start audio outside a user gesture.
 *
 * Teardown stops every track and closes the context. Skipping that leaves the
 * browser's "recording" indicator lit after the user navigates away.
 */
export function useMicrophone(options: MicrophoneOptions = {}): Microphone {
  const { fftSize = DEFAULT_FFT_SIZE } = options;

  const [status, setStatus] = useState<MicrophoneStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  /** Guards against setState after unmount when start() is still in flight. */
  const mountedRef = useRef(true);

  const teardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    // close() rejects if the context is already closed; nothing to recover from.
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }, []);

  const stop = useCallback(() => {
    teardown();
    if (!mountedRef.current) return;
    setAnalyser(null);
    setSampleRate(null);
    setStatus("idle");
    setError(null);
  }, [teardown]);

  const start = useCallback(async () => {
    if (streamRef.current) return; // already running

    setStatus("requesting");
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError(
        "This browser can't reach the microphone. Microphone access needs a secure origin — use https:// or localhost.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // All three mangle pitch. See the note above.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
    } catch (cause) {
      if (!mountedRef.current) return;
      const name = cause instanceof DOMException ? cause.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setError(
          "Microphone access was blocked. Allow it in your browser's site settings, then try again.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("error");
        setError("No microphone found. Plug one in or pick one in your system settings.");
      } else {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Could not open the microphone.");
      }
      return;
    }

    // Unmounted while the permission prompt was up — release and bail.
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    try {
      const context = new AudioContext();
      // Contexts can start suspended even inside a gesture; resume explicitly.
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const node = context.createAnalyser();
      node.fftSize = fftSize;
      // No smoothing: it's an FFT-domain average and we read the time domain, but
      // being explicit documents that raw samples are what the detector wants.
      node.smoothingTimeConstant = 0;

      // Deliberately NOT connected to context.destination — routing the mic to the
      // speakers would produce feedback.
      source.connect(node);

      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;

      // Device unplugged or permission revoked mid-session.
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => stop());
      });

      setAnalyser(node);
      setSampleRate(context.sampleRate);
      setStatus("running");
    } catch (cause) {
      stream.getTracks().forEach((track) => track.stop());
      teardown();
      if (!mountedRef.current) return;
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not start audio.");
    }
  }, [fftSize, stop, teardown]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown();
    };
  }, [teardown]);

  return { status, error, analyser, sampleRate, start, stop };
}
