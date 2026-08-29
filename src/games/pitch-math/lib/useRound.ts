"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMicrophone } from "@/shared/audio";
import { useCapture } from "../audio/useCapture";
import type { Recording } from "../audio/usePlayback";
import { config } from "../config";
import { buildNoteGrid, type NoteGrid } from "../dsp/noteGrid";
import {
  detect,
  detectionMidis,
  detectionSemitones,
  type Detection,
} from "../dsp/multiPitch";
import { analyzeSpectrum, planSpectrum, type SpectrumPlan } from "../dsp/spectrum";
import { isCorrectGuess, type IntervalMode } from "./intervals";

export type Phase =
  /** The microphone button, waiting to be pressed. */
  | "idle"
  /** Listening, or filling the capture window. */
  | "listening"
  /** Running the detector. */
  | "analyzing"
  /** The board is up and the players are guessing. */
  | "guessing"
  /** Someone got it; the notes are on screen. */
  | "solved";

export interface Round {
  phase: Phase;
  /** Input level, 0–1, for the listening animation. */
  level: number;
  /** Set after a pass that heard nothing usable, cleared when listening resumes. */
  notice: string | null;
  /** Semitone answers already ruled out this round. */
  eliminated: readonly number[];
  /** The winning answer, once it has been found. */
  solved: number | null;
  /** The notes that were played — only populated once solved. */
  revealMidis: readonly number[];
  /**
   * The captured audio, for the replay button. Survives the reveal and is cleared only
   * when a new round starts.
   */
  recording: Recording | null;
  /** Microphone trouble worth showing the player. */
  micError: string | null;
  /** True while the browser is asking for permission. */
  requesting: boolean;

  begin: () => void;
  cancel: () => void;
  guess: (semitones: number) => void;
  reset: () => void;
}

const NOTHING: readonly number[] = [];

const NOTICES: Record<"silence" | "unclear", string> = {
  silence: "Didn't hear anything — play a little louder.",
  unclear: "That wasn't clear enough. Try again, holding the notes.",
};

/**
 * One round, from pressing the microphone to the answer being found.
 *
 * The detected interval is deliberately **not** exposed. Only `eliminated` and
 * `solved` leave this hook, so the answer cannot be read out of the DOM or React's
 * devtools while the players are still guessing.
 */
export function useRound(mode: IntervalMode): Round {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<readonly number[]>(NOTHING);
  const [solved, setSolved] = useState<number | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  const mic = useMicrophone({ fftSize: config.capture.fftSize });

  /** Rebuilt only when the sample rate changes, which is once per microphone. */
  const analysis = useRef<{
    sampleRate: number;
    plan: SpectrumPlan;
    grid: NoteGrid;
  } | null>(null);

  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  });

  const clearRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const truth = useMemo(
    () => (detection ? detectionSemitones(detection) : null),
    [detection],
  );

  const onCaptured = useCallback((samples: Float32Array, sampleRate: number) => {
    setPhase("analyzing");

    if (!analysis.current || analysis.current.sampleRate !== sampleRate) {
      analysis.current = {
        sampleRate,
        plan: planSpectrum(config.capture.fftSize),
        grid: buildNoteGrid(sampleRate, config.capture.fftSize),
      };
    }

    const { plan, grid } = analysis.current;
    const result = detect(samples, analyzeSpectrum(plan, samples, sampleRate), grid);

    if (result.kind === "none") {
      // Straight back to listening rather than stopping — the players shouldn't have
      // to reach for the mouse between attempts. The notice and the level meter are
      // what keep that from being a silent dead end. Returning false abandons the
      // replay tail too: nobody wants to listen back to a capture that heard nothing.
      setNotice(NOTICES[result.reason]);
      setPhase("listening");
      return false;
    }

    // Playable straight away, from the window that was analyzed. The longer clip
    // replaces it a moment later, once the tail has been collected.
    setRecording({ samples, sampleRate });

    setDetection(result);
    setNotice(null);
    setEliminated(NOTHING);
    setSolved(null);
    setPhase("guessing");
    return true;
  }, []);

  /** The full replay clip, longer than the window the answer came from. */
  const onRecording = useCallback((samples: Float32Array, sampleRate: number) => {
    setRecording({ samples, sampleRate });
  }, []);

  const capture = useCapture({
    analyser: mic.analyser,
    sampleRate: mic.sampleRate,
    onCaptured,
    onRecording,
  });

  const { start: startCapture, stop: stopCapture } = capture;

  // Listening resumes whenever the phase says so — after the microphone comes up, and
  // again after a pass that heard nothing.
  useEffect(() => {
    if (phase !== "listening") return;
    if (!mic.analyser || capture.status !== "idle") return;

    if (notice === null) {
      startCapture();
      return;
    }

    // A beat before retrying, so the notice is readable rather than a flicker.
    clearRetry();
    retryTimer.current = setTimeout(() => {
      if (phaseRef.current === "listening") startCapture();
    }, config.capture.retryDelayMs);

    return clearRetry;
  }, [capture.status, clearRetry, mic.analyser, notice, phase, startCapture]);

  const begin = useCallback(() => {
    setNotice(null);
    setDetection(null);
    setSolved(null);
    setEliminated(NOTHING);
    setRecording(null);
    setPhase("listening");
    // Must happen inside the click: browsers refuse to start audio any other way.
    void mic.start();
  }, [mic]);

  const cancel = useCallback(() => {
    clearRetry();
    stopCapture();
    mic.stop();
    setRecording(null);
    setPhase("idle");
    setNotice(null);
  }, [clearRetry, mic, stopCapture]);

  const guess = useCallback(
    (semitones: number) => {
      if (phaseRef.current !== "guessing" || truth === null) return;
      if (eliminated.includes(semitones)) return;

      if (isCorrectGuess(semitones, truth, mode)) {
        setSolved(semitones);
        setPhase("solved");
        // Order matters: a fast answer can land while the replay tail is still being
        // collected, and stopping the microphone closes the context out from under
        // that loop. Shut the loop down first, then release the microphone so the
        // browser's recording indicator goes out.
        stopCapture();
        mic.stop();
        return;
      }

      setEliminated((current) => [...current, semitones]);
    },
    [eliminated, mic, mode, stopCapture, truth],
  );

  const reset = useCallback(() => {
    clearRetry();
    stopCapture();
    mic.stop();
    setDetection(null);
    setSolved(null);
    setEliminated(NOTHING);
    setNotice(null);
    // Retry is the one thing that ends the replay: the clip belongs to its round.
    setRecording(null);
    setPhase("idle");
  }, [clearRetry, mic, stopCapture]);

  useEffect(() => clearRetry, [clearRetry]);

  /**
   * A microphone that never opened would otherwise leave the player watching a
   * listening animation forever, so a failed permission drops the screen back to the
   * button — where the error message is.
   *
   * Derived rather than written back into state: correcting it in an effect would
   * render once with the wrong phase and again with the right one, and would need
   * unpicking every time the phase machine grew a new state. The listening loop stays
   * dormant on its own, since it needs an `analyser` that failure never produces.
   */
  const micFailed = mic.status === "denied" || mic.status === "error";
  const visiblePhase: Phase = micFailed && phase === "listening" ? "idle" : phase;

  return {
    phase: visiblePhase,
    level: capture.level,
    notice,
    eliminated,
    solved,
    revealMidis:
      visiblePhase === "solved" && detection ? detectionMidis(detection) : NOTHING,
    recording,
    micError: mic.error,
    requesting: mic.status === "requesting",
    begin,
    cancel,
    guess,
    reset,
  };
}
