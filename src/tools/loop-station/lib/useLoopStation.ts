"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { LoopEngine } from "../audio/engine";
import { createScheduler } from "../audio/scheduler";
import {
  clickOffset,
  estimateRtl,
  isOutlier,
} from "../dsp/calibration";
import { createOnsetDetector, type OnsetDetector } from "../dsp/onset";
import { peaks } from "../dsp/level";
import { resample } from "../dsp/resample";
import { bakeTrack } from "../dsp/tile";
import {
  EMPTY_SIGNATURE,
  loopSignature,
  referencedSegments,
  toSnapshot,
} from "./snapshot";
import { deleteLoop, loadLoop, saveLoop } from "./storage";
import {
  createSession,
  reduce,
  type Effect,
  type SessionEvent,
  type SessionState,
} from "./session";

/**
 * The loop station's one stateful hook. Owns the engine, drives the pure
 * reducer, and interprets its effects against the audio graph. Everything it
 * decides *musically* is decided in `session.ts`/`transport.ts`/`dsp/` — this
 * file only moves bytes between them and the browser.
 */

export type StationStatus =
  /** Booting: permission prompt is up or the worklet is loading. */
  | "loading"
  /** Context is suspended by autoplay policy; needs one tap. */
  | "gate"
  | "ready"
  | "error";

export type SaveStatus = "idle" | "saving" | "saved" | "deleted" | "error";

export interface CalibrationView {
  running: boolean;
  /** Best current estimate of round-trip latency, ms. */
  estimateMs: number | null;
  /** Usable hits so far, against `config.calibration.targetBeats`. */
  count: number;
}

export interface Visuals {
  /** Loop playhead in [0,1), or null while stopped. */
  playhead: number | null;
  inputLevel: number;
  masterLevel: number;
  busLevels: Map<number, number>;
  now: number;
}

interface CalibrationRun {
  anchor: number;
  detector: OnsetDetector;
  offsets: number[];
  unsubscribe: (() => void) | null;
}

export function useLoopStation() {
  const [status, setStatus] = useState<StationStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bluetoothInput, setBluetoothInput] = useState(false);
  const [session, setSession] = useState<SessionState>(() => createSession());
  const [trackPeaks, setTrackPeaks] = useState<Map<number, number[]>>(new Map());
  const [calibration, setCalibration] = useState<CalibrationView>({
    running: false,
    estimateMs: null,
    count: 0,
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  /**
   * The loop as it was last written to storage. State rather than a ref because
   * `dirty` is derived from it during render.
   */
  const [savedSignature, setSavedSignature] = useState(EMPTY_SIGNATURE);
  /** Whether storage currently holds anything — drives hold-to-delete. */
  const [hasSave, setHasSave] = useState(false);

  const engineRef = useRef<LoopEngine | null>(null);
  /** Authoritative state; `setSession` mirrors it for rendering. Effects must
   *  not run inside a state updater (StrictMode double-invokes those). */
  const stateRef = useRef(session);
  /** Padded recordings by segment id. Values upgrade quick → full silently. */
  const segmentsRef = useRef(new Map<number, Float32Array>());
  /** Segment ids we still care about; late extractions for others are dropped. */
  const wantedRef = useRef(new Set<number>());
  const rebakeTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const calibrationRef = useRef<CalibrationRun | null>(null);
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Baking: padded segment + track state → one loop-length buffer, swapped live.

  const bakeAndSwap = useCallback((trackId: number) => {
    const engine = engineRef.current;
    const s = stateRef.current;
    const track = s.tracks.find((t) => t.id === trackId);
    if (!engine || !track || s.loopSeconds === null) return;
    const segment = segmentsRef.current.get(track.segmentId);
    if (!segment) return; // bakes again when the extraction lands

    const sr = engine.context.sampleRate;
    const padFrames = Math.round(config.capture.padSeconds * sr);
    const loopFrames = Math.round(s.loopSeconds * sr);
    const owSegment = track.overwrite
      ? segmentsRef.current.get(track.overwrite.segmentId)
      : undefined;

    const baked = bakeTrack({
      segment,
      padFrames,
      delayFrames: Math.round((track.delayMs / 1000) * sr),
      reps: track.reps,
      loopFrames,
      fadeFrames: Math.round(config.bake.seamFadeSeconds * sr),
      overwrite:
        track.overwrite && owSegment
          ? {
              segment: owSegment,
              padFrames,
              delayFrames: Math.round((track.overwrite.delayMs / 1000) * sr),
              startFrame: Math.min(loopFrames, Math.round(track.overwrite.startPhase * sr)),
              endFrame: Math.min(loopFrames, Math.round(track.overwrite.endPhase * sr)),
            }
          : null,
    });

    engine.ensureTrack(trackId, track.busId);
    engine.setTrackBuffer(trackId, engine.toAudioBuffer(baked));
    engine.applyGains(s);
    setTrackPeaks((old) => new Map(old).set(trackId, peaks(baked, config.ui.waveBars)));
  }, []);

  const scheduleRebake = useCallback(
    (trackId: number) => {
      const timers = rebakeTimersRef.current;
      const existing = timers.get(trackId);
      if (existing) clearTimeout(existing);
      timers.set(
        trackId,
        setTimeout(() => {
          timers.delete(trackId);
          bakeAndSwap(trackId);
        }, config.bake.debounceMs),
      );
    },
    [bakeAndSwap],
  );

  const runEffects = useCallback(
    (effects: Effect[]) => {
      const engine = engineRef.current;
      if (!engine) return;
      for (const effect of effects) {
        switch (effect.type) {
          case "extract": {
            const { segmentId, fromTime, toTime, trackId } = effect;
            wantedRef.current.add(segmentId);
            const pad = config.capture.padSeconds;
            const receive = (samples: Float32Array) => {
              if (!wantedRef.current.has(segmentId)) return;
              segmentsRef.current.set(segmentId, samples);
              bakeAndSwap(trackId);
            };
            // Two passes: a quick window that's already written, so the track is
            // audible right away, then the full ±pad window (the post-roll only
            // exists a second from now) which re-bakes seamlessly and unlocks
            // the delay slider's whole range.
            engine.capture
              .extract(fromTime - pad, toTime + 2 * config.bake.seamFadeSeconds)
              .then(receive);
            engine.capture.extract(fromTime - pad, toTime + pad).then(receive);
            break;
          }
          case "disposeSegment":
            wantedRef.current.delete(effect.segmentId);
            segmentsRef.current.delete(effect.segmentId);
            break;
          case "rebake":
            scheduleRebake(effect.trackId);
            break;
          case "removeTrackAudio": {
            engine.removeTrack(effect.trackId);
            setTrackPeaks((old) => {
              const next = new Map(old);
              next.delete(effect.trackId);
              return next;
            });
            break;
          }
          case "startTransport": {
            const s = stateRef.current;
            if (s.anchorTime !== null && s.loopSeconds !== null) {
              engine.startTransport(s.anchorTime, s.loopSeconds);
            }
            break;
          }
          case "stopTransport":
            engine.stopTransport();
            break;
        }
      }
    },
    [bakeAndSwap, scheduleRebake],
  );

  const dispatch = useCallback(
    (event: SessionEvent) => {
      const engine = engineRef.current;
      const now = engine ? engine.now() : 0;
      const result = reduce(stateRef.current, event, now);
      if (result.state === stateRef.current && result.effects.length === 0) return;
      stateRef.current = result.state;
      setSession(result.state);
      if (engine) {
        engine.syncBuses(result.state.buses);
        for (const track of result.state.tracks) {
          engine.ensureTrack(track.id, track.busId);
        }
        engine.applyGains(result.state);
        runEffects(result.effects);
      }
    },
    [runEffects],
  );

  // -------------------------------------------------------------------------
  // Engine boot: the mic prompt happens on page load, by design.

  useEffect(() => {
    let cancelled = false;
    let engine: LoopEngine | null = null;

    (async () => {
      try {
        engine = await LoopEngine.create();
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        if (/airpods|bluetooth|hands-?free|headset|wireless/i.test(engine.inputLabel())) {
          setBluetoothInput(true);
        }
        engine.onInputEnded(() => {
          setErrorMessage("The microphone was disconnected or its permission was revoked.");
          setStatus("error");
        });
        setStatus(engine.context.state === "suspended" ? "gate" : "ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(micErrorMessage(error));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current = null;
      engine?.dispose();
    };
  }, []);

  const resumeAudio = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.resume();
    if (engine.context.state === "running") setStatus("ready");
  }, []);

  // -------------------------------------------------------------------------
  // The scheduler tick: reducer clock + metronome, every ~25ms.

  useEffect(() => {
    if (status !== "ready") return;
    const stop = createScheduler(() => {
      const engine = engineRef.current;
      if (!engine) return;
      dispatch({ type: "clock" });

      const horizon = engine.now() + config.scheduler.lookaheadSeconds;
      const cal = calibrationRef.current;
      if (cal) {
        // Calibration clicks own the metronome while they run.
        engine.metronome.setGrid(cal.anchor, config.calibration.tempo, 1);
        engine.metronome.scheduleWindow(horizon);
        return;
      }
      const s = stateRef.current;
      // Silent while stopped — except before the first track exists, where the
      // clicks are how the player hears the tempo they're setting.
      const audible =
        s.metronomeOn && (s.playing || (s.anchorTime === null && s.tracks.length === 0));
      if (audible) {
        const anchor = s.anchorTime ?? s.metroAnchor ?? engine.now();
        engine.metronome.setGrid(anchor, s.tempo, s.beats);
        engine.metronome.scheduleWindow(horizon);
      } else {
        engine.metronome.clear();
      }
    });
    return stop;
  }, [status, dispatch]);

  // -------------------------------------------------------------------------
  // Calibration

  const stopCalibration = useCallback(() => {
    const engine = engineRef.current;
    const run = calibrationRef.current;
    calibrationRef.current = null;
    run?.unsubscribe?.();
    if (engine) engine.metronome.clear();
    if (run) {
      const estimate = estimateRtl(run.offsets, {
        trimFraction: config.calibration.trimFraction,
        minSamples: config.calibration.minSamples,
      });
      if (estimate.rtlSeconds !== null) {
        // Positive delay slides the content window later into the padded
        // recording, i.e. plays what the player heard on the beat, on the beat.
        dispatch({ type: "setDefaultDelay", ms: Math.round(estimate.rtlSeconds * 1000) });
      }
    }
    setCalibration((old) => ({ ...old, running: false }));
  }, [dispatch]);

  const startCalibration = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || calibrationRef.current || stateRef.current.playing) return;
    const run: CalibrationRun = {
      anchor: engine.now() + 0.2,
      detector: createOnsetDetector({
        threshold: config.calibration.onsetThreshold,
        riseRatio: config.calibration.onsetRiseRatio,
        refractorySeconds: config.calibration.refractoryMs / 1000,
      }),
      offsets: [],
      unsubscribe: null,
    };
    calibrationRef.current = run;
    setCalibration({ running: true, estimateMs: null, count: 0 });
    const beatSeconds = 60 / config.calibration.tempo;
    run.unsubscribe = engine.capture.addLevelListener((time, rms) => {
      if (!run.detector.update(time, rms)) return;
      if (time < run.anchor) return; // noise before the first click
      const offset = clickOffset(time, run.anchor, beatSeconds);
      if (isOutlier(offset, beatSeconds, config.calibration.outlierBeatFraction)) return;
      run.offsets.push(offset);
      const estimate = estimateRtl(run.offsets, {
        trimFraction: config.calibration.trimFraction,
        minSamples: config.calibration.minSamples,
      });
      setCalibration({
        running: true,
        estimateMs: estimate.rtlSeconds === null ? null : Math.round(estimate.rtlSeconds * 1000),
        count: estimate.count,
      });
    });
  }, []);

  // -------------------------------------------------------------------------
  // Overwrite auto-detect: listen for the player's first note.

  useEffect(() => {
    const engine = engineRef.current;
    if (status !== "ready" || !engine) return;
    if (session.recording.kind !== "detecting") return;

    const detector = createOnsetDetector({
      threshold: config.autoDetect.threshold,
      riseRatio: config.autoDetect.riseRatio,
      refractorySeconds: config.autoDetect.refractoryMs / 1000,
    });
    return engine.capture.addLevelListener((time, rms) => {
      if (detector.update(time, rms)) dispatch({ type: "overwriteDetected", at: time });
    });
  }, [status, session.recording.kind, dispatch]);

  // -------------------------------------------------------------------------
  // The new-recording defaults are the only things that persist. Recorded audio
  // is deliberately in-memory: this is an instrument, not a project file.

  useEffect(() => {
    const stored = readStoredSettings();
    if (stored.delayMs !== undefined) {
      dispatch({ type: "setDefaultDelay", ms: stored.delayMs });
    }
    if (stored.trackVolume !== undefined) {
      dispatch({ type: "setDefaultTrackVolume", value: stored.trackVolume });
    }
    if (stored.trackReverb !== undefined) {
      dispatch({ type: "setDefaultTrackReverb", value: stored.trackReverb });
    }
  }, [dispatch]);

  useEffect(() => {
    window.localStorage.setItem(
      config.settings.storageKey,
      JSON.stringify({
        delayMs: session.defaultDelayMs,
        trackVolume: session.defaultTrackVolume,
        trackReverb: session.defaultTrackReverb,
      }),
    );
  }, [session.defaultDelayMs, session.defaultTrackVolume, session.defaultTrackReverb]);

  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Saving and restoring

  /** Show a status for a moment, then settle back to "Save". */
  const flashStatus = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
    if (savedFlash.current) clearTimeout(savedFlash.current);
    savedFlash.current = setTimeout(() => setSaveStatus("idle"), config.save.savedFlashMs);
  }, []);

  const save = useCallback(async () => {
    const engine = engineRef.current;
    // Saving an empty station would write nothing over a real save.
    if (!engine || stateRef.current.tracks.length === 0) return;
    setSaveStatus("saving");
    const state = stateRef.current;
    try {
      const segments = new Map<number, Float32Array>();
      for (const id of referencedSegments(state)) {
        const samples = segmentsRef.current.get(id);
        if (samples) segments.set(id, samples);
      }
      await saveLoop(toSnapshot(state, engine.context.sampleRate), segments);
      setSavedSignature(loopSignature(state));
      setHasSave(true);
      flashStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [flashStatus]);

  const deleteSave = useCallback(async () => {
    try {
      await deleteLoop();
      setHasSave(false);
      // Nothing is stored any more, so a station with tracks is unsaved again.
      setSavedSignature(EMPTY_SIGNATURE);
      flashStatus("deleted");
    } catch {
      setSaveStatus("error");
    }
  }, [flashStatus]);

  useEffect(() => () => {
    if (savedFlash.current) clearTimeout(savedFlash.current);
  }, []);

  /**
   * Restore once, as soon as the engine exists. The transport stays stopped —
   * pressing play then sounds as the loop was left.
   */
  const restored = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (status !== "ready" || !engine || restored.current) return;
    restored.current = true;

    let cancelled = false;
    (async () => {
      const stored = await loadLoop();
      if (cancelled || !stored) return;
      setHasSave(true);
      if (stored.snapshot.state.tracks.length === 0) return;
      const rate = engine.context.sampleRate;
      for (const [id, samples] of stored.segments) {
        // A save made at another device's rate would bake at the wrong frame
        // counts; convert once here so everything downstream stays honest.
        segmentsRef.current.set(id, resample(samples, stored.snapshot.sampleRate, rate));
        wantedRef.current.add(id);
      }
      setSavedSignature(loopSignature(stored.snapshot.state));
      dispatch({ type: "restore", state: stored.snapshot.state });
      for (const track of stored.snapshot.state.tracks) bakeAndSwap(track.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, dispatch, bakeAndSwap]);

  const dirty = loopSignature(session) !== savedSignature;

  /** Native dialog on a real unload. Client-side nav is guarded separately. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Snapshot for the rAF paint loop — pixels only, never scheduling. */
  const readVisuals = useCallback((): Visuals => {
    const engine = engineRef.current;
    if (!engine) {
      return { playhead: null, inputLevel: 0, masterLevel: 0, busLevels: new Map(), now: 0 };
    }
    const busLevels = new Map<number, number>();
    for (const bus of stateRef.current.buses) {
      busLevels.set(bus.id, engine.busLevel(bus.id));
    }
    return {
      playhead: engine.playheadFraction(),
      inputLevel: engine.inputLevel(),
      masterLevel: engine.masterLevel(),
      busLevels,
      now: engine.now(),
    };
  }, []);

  return {
    status,
    errorMessage,
    bluetoothInput,
    session,
    dispatch,
    trackPeaks,
    calibration,
    startCalibration,
    stopCalibration,
    resumeAudio,
    readVisuals,
    save,
    deleteSave,
    saveStatus,
    hasSave,
    dirty,
  };
}

interface StoredSettings {
  delayMs?: number;
  trackVolume?: number;
  trackReverb?: number;
}

/**
 * Read the persisted defaults, coercing **field by field** so a partially
 * corrupt entry degrades instead of throwing the lot away. The reducer clamps
 * whatever survives, so only the shape has to be checked here.
 *
 * The delay used to live under its own key; it is still read as a fallback so
 * an existing calibration doesn't have to be redone.
 */
function readStoredSettings(): StoredSettings {
  const out: StoredSettings = {};

  const legacy = Number(window.localStorage.getItem(config.delay.legacyStorageKey));
  if (Number.isFinite(legacy)) out.delayMs = legacy;

  const raw = window.localStorage.getItem(config.settings.storageKey);
  if (raw === null) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return out;
    const record = parsed as Record<string, unknown>;
    for (const key of ["delayMs", "trackVolume", "trackReverb"] as const) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
  } catch {
    // Unparseable: fall back to whatever the legacy key gave us.
  }
  return out;
}

function micErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied. The loop station needs to hear you — allow the microphone in your browser's site settings and reload.";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "No microphone was found. Plug one in and reload.";
    }
  }
  return "The microphone couldn't be started. Reload to try again.";
}
