"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { fadeEdges } from "../dsp/fade";

/** A captured clip, kept for replay. */
export interface Recording {
  samples: Float32Array;
  /** The microphone's rate, which the clip must be played back at to sound right. */
  sampleRate: number;
}

export interface Playback {
  playing: boolean;
  /** Play from the start, interrupting anything already playing. */
  play: (recording: Recording) => void;
  stop: () => void;
}

/**
 * Replaying the captured clip.
 *
 * Owns an `AudioContext` of its own rather than borrowing the microphone's, because
 * `useMicrophone`'s teardown closes that one — and the round deliberately releases the
 * microphone the moment someone answers correctly, which is exactly when the players
 * most want to hear the clip again. The samples themselves are a plain array in memory
 * and outlive the microphone without trouble.
 *
 * The context is created on the first press, which is a click, so browsers' autoplay
 * rules are satisfied.
 */
export function usePlayback(): Playback {
  const [playing, setPlaying] = useState(false);

  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stop = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;

    if (source) {
      // Detached first: otherwise stop() fires `ended` and the handler races the state
      // update below.
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already finished. Nothing to stop, nothing to report.
      }
      source.disconnect();
    }

    setPlaying(false);
  }, []);

  const play = useCallback(
    (recording: Recording) => {
      if (recording.samples.length === 0) return;

      // A press during playback restarts, so whatever is running goes first.
      stop();

      let context = contextRef.current;
      if (!context || context.state === "closed") {
        context = new AudioContext();
        contextRef.current = context;
      }
      // Contexts can start (or come back) suspended even inside a gesture.
      if (context.state === "suspended") void context.resume();

      // Built at the microphone's rate; the browser resamples to the context's own.
      const buffer = context.createBuffer(
        1,
        recording.samples.length,
        recording.sampleRate,
      );
      // Copied before fading — the fade is destructive, and the stored recording has to
      // survive being replayed more than once. Annotated rather than inferred through
      // fadeEdges, since copyToChannel rejects a view that might be shared-backed.
      const faded: Float32Array<ArrayBuffer> = Float32Array.from(recording.samples);
      fadeEdges(faded, recording.sampleRate, config.playback.fadeMs);
      buffer.copyToChannel(faded, 0);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      source.onended = () => {
        // Only the source still on screen may clear the flag. A restart stops the old
        // source, and its `ended` would otherwise switch off the new one immediately.
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        setPlaying(false);
      };

      sourceRef.current = source;
      source.start();
      setPlaying(true);
    },
    [stop],
  );

  useEffect(() => {
    return () => {
      const source = sourceRef.current;
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // Already finished.
        }
        source.disconnect();
      }
      sourceRef.current = null;

      // close() rejects if it is already closed; nothing to recover from.
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, []);

  return { playing, play, stop };
}
