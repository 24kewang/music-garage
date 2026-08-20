"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayback } from "../audio/usePlayback";
import { useRecorder, type Recording } from "../audio/useRecorder";
import { config } from "../config";
import { transcribe } from "../dsp/transcribe";
import { compare, type Comparison } from "../score/compare";
import {
  armConfirmation,
  canChooseSetter,
  canPlay,
  chooseSetter,
  reconcile,
  resetLetters,
  resolveCopy,
  resolveSet,
  restartSet,
  startRound,
  winner,
  type Player,
  type Round,
} from "./rules";
import type { Settings } from "./settings";
import { useToasts, type Toast } from "./useToasts";

/**
 * The whole game, wired up.
 *
 * Every *decision* here is delegated: turn order and elimination to `rules.ts`,
 * transcription to `dsp/`, judging to `score/`. What is left is sequencing — a
 * recording arrives, it gets transcribed, it gets compared, and the result gets
 * handed to the rules. That is the only reason this file is not pure, and it is why
 * it is deliberately thin.
 */

/** A take, and what the pipeline heard in it. */
interface Take {
  recording: Recording;
  notes: number[];
}

export interface Verdict {
  /** Which comparison this was, for the dialog's wording. */
  kind: "set" | "copy";
  player: Player | null;
  comparison: Comparison;
  target: number[];
  passed: boolean;
}

export interface Game {
  round: Round;
  players: readonly Player[];
  word: string;
  /** True while there are at least two people to play against. */
  playable: boolean;
  /** Whose attempt is live, if anybody's. */
  current: Player | null;
  setter: Player | null;
  /** The last player standing, once there is one. */
  champion: Player | null;

  /** True while the room may still pick who sets, by clicking a box. */
  selectable: boolean;
  selectSetter: (id: string) => void;

  /** What the playback button plays: take one, always. */
  clip: Recording | null;
  playing: boolean;
  play: () => void;

  recording: ReturnType<typeof useRecorder>;
  /** True while the pipeline is running on a finished take. */
  working: boolean;

  toasts: readonly Toast[];
  dismissToast: (id: number) => void;

  /** The failure dialog's contents, or null when there is nothing to explain. */
  verdict: Verdict | null;
  closeVerdict: () => void;

  /**
   * Set once when the game ends, whether or not anybody won it. Drives the dialog.
   */
  finishKey: number | null;
  /** Confetti trigger. Null when there is nothing to celebrate. */
  burstKey: number | null;

  press: () => void;
  reset: () => void;
}

export function useGame({
  settings,
  onSettings,
}: {
  settings: Settings;
  onSettings: (next: Settings) => void;
}): Game {
  const { players, word, tolerance } = settings;

  /**
   * The round as the rules last left it. What the rest of the hook uses is the
   * **reconciled** version below, derived on read.
   *
   * Reconciling during render rather than in an effect is what keeps a settings edit
   * from taking two passes to show up — and it means there is no window in which the
   * board is drawn from a round the roster has already invalidated.
   */
  const [rawRound, setRound] = useState<Round>(() => startRound(players, word));
  const round = useMemo(
    () => reconcile(rawRound, players, word),
    [rawRound, players, word],
  );

  /**
   * The takes, each tagged with the setter it belongs to.
   *
   * That tag is what makes them derivable. Deactivating the setter mid-set rotates
   * the round to somebody else, and their half-finished melody has to go with them —
   * checking the tag on read does that without an effect racing the render.
   */
  const [heldTakeOne, setTakeOne] = useState<{ take: Take; setterId: string | null } | null>(
    null,
  );
  const [heldMelody, setMelody] = useState<{ take: Take; setterId: string | null } | null>(
    null,
  );
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [working, setWorking] = useState(false);
  const [finishKey, setFinishKey] = useState<number | null>(null);

  const firstTake =
    heldTakeOne &&
    round.phase === "setting" &&
    round.takeIndex === 1 &&
    heldTakeOne.setterId === round.setterId
      ? heldTakeOne.take
      : null;

  const target =
    heldMelody && round.phase === "copying" && heldMelody.setterId === round.setterId
      ? heldMelody.take
      : null;

  const { toasts, push, dismiss, clear } = useToasts();
  const playback = usePlayback();

  const thresholds = config.tolerance[tolerance];

  /**
   * Latest of everything the capture callback needs.
   *
   * It runs after a yield to the browser, so a closure captured at render time can
   * be a settings edit out of date by the time it fires.
   */
  const latest = useRef({ round, players, word, thresholds, firstTake, target, settings });
  useEffect(() => {
    latest.current = { round, players, word, thresholds, firstTake, target, settings };
  });

  const byId = useCallback(
    (id: string | null) => players.find((player) => player.id === id) ?? null,
    [players],
  );

  const commit = useCallback(
    (next: { round: Round; players: Player[] }) => {
      setRound(next.round);
      onSettings({ ...latest.current.settings, players: next.players });
    },
    [onSettings],
  );

  /** A finished take. Transcribe it, judge it, and hand the result to the rules. */
  const judge = useCallback(
    (recording: Recording) => {
      const {
        round: current,
        players: roster,
        word: spelling,
        thresholds: limits,
        firstTake: take1,
        target: canonical,
      } = latest.current;

      const { notes } = transcribe(recording.samples, recording.sampleRate);
      const attempt: Take = { recording, notes };

      // --- Setting, first take -------------------------------------------------
      if (current.phase === "setting" && current.takeIndex === 0) {
        if (notes.length < config.transcribe.minNotes) {
          // A three-note figure matches almost anything once the comparison is free
          // to transpose, so a melody that short is not worth setting.
          push(
            `Too short — that was ${notes.length} note${notes.length === 1 ? "" : "s"}. Play at least ${config.transcribe.minNotes}.`,
            "failure",
          );
          return;
        }
        setTakeOne({ take: attempt, setterId: current.setterId });
        setRound(armConfirmation(current));
        push("Melody heard. Now play it again to confirm.", "neutral");
        return;
      }

      // --- Setting, confirmation take ------------------------------------------
      if (current.phase === "setting") {
        if (!take1) {
          setRound(restartSet(current));
          return;
        }

        const comparison = compare(take1.notes, notes, config.score);
        const passed = comparison.error <= limits.set;
        const setter = roster.find((player) => player.id === current.setterId) ?? null;

        if (passed) {
          // Take one is the canonical target, not take two: it is what was called.
          setMelody({ take: take1, setterId: current.setterId });
          setTakeOne(null);
          push(`${setter?.name ?? "They"} set the melody.`, "success");
          commit(resolveSet(current, roster, spelling, true));
          return;
        }

        setTakeOne(null);
        setMelody(null);
        push(`${setter?.name ?? "They"} could not repeat it. Turn passes.`, "failure");
        setVerdict({
          kind: "set",
          player: setter,
          comparison,
          target: take1.notes,
          passed: false,
        });
        commit(resolveSet(current, roster, spelling, false));
        return;
      }

      // --- Copying ---------------------------------------------------------------
      if (current.phase !== "copying" || !canonical) return;

      const comparison = compare(canonical.notes, notes, config.score);
      const passed = comparison.error <= limits.copy;
      const copier = roster.find((player) => player.id === current.turnId) ?? null;

      if (passed) {
        push(`${copier?.name ?? "They"} got it.`, "success");
      } else {
        push(`${copier?.name ?? "They"} missed it — that's a letter.`, "failure");
        setVerdict({
          kind: "copy",
          player: copier,
          comparison,
          target: canonical.notes,
          passed: false,
        });
      }

      commit(resolveCopy(current, roster, spelling, passed));
    },
    [commit, push],
  );

  const onCaptured = useCallback(
    (recording: Recording) => {
      setWorking(true);
      // Yielded to the browser so the "listening back" state paints before the
      // pipeline blocks the main thread — thirty seconds of audio is a few thousand
      // detector calls, and doing it inline would freeze mid-press.
      setTimeout(() => {
        try {
          judge(recording);
        } finally {
          setWorking(false);
        }
      }, 0);
    },
    [judge],
  );

  const onDiscarded = useCallback(
    (reason: "silent" | "timeout") => {
      push(
        reason === "timeout"
          ? "Stopped listening — nothing was played."
          : "Didn't hear anything, so nothing was recorded.",
        "neutral",
      );
    },
    [push],
  );

  const recording = useRecorder({ onCaptured, onDiscarded });
  const {
    status: recorderStatus,
    start: startRecording,
    stop: stopRecording,
    release,
  } = recording;

  const champion = useMemo(() => winner(players, word), [players, word]);

  /**
   * Mark the end of the game once, on the transition into it.
   *
   * Fires whether or not there is a champion. Everyone can be knocked out at the same
   * time by a settings edit that shortens the word, and that ending still has to be
   * announced — keying the dialog off the confetti instead would leave the one case
   * with no winner silently stuck on an unplayable board.
   */
  const settled = useRef(false);
  useEffect(() => {
    if (round.phase !== "finished") {
      settled.current = false;
      return;
    }
    if (settled.current) return;
    settled.current = true;
    setFinishKey(Date.now());
    // The game is over; give the microphone back so the browser's recording
    // indicator goes out rather than sitting lit behind the dialog.
    release();
  }, [release, round.phase]);

  /**
   * Hand the setting turn to whoever was clicked.
   *
   * `chooseSetter` is a no-op unless the round is open to it, so the guard is the
   * rules' rather than the board's — a stale render cannot slip a change through.
   */
  const selectSetter = useCallback(
    (id: string) => {
      setRound((current) => chooseSetter(current, latest.current.players, latest.current.word, id));
    },
    [],
  );

  const press = useCallback(() => {
    if (recorderStatus !== "idle") {
      stopRecording();
      return;
    }
    if (working || round.phase === "finished") return;

    playback.stop();
    startRecording(
      round.phase === "setting"
        ? config.record.setterSeconds
        : config.record.copierSeconds,
    );
  }, [playback, recorderStatus, round.phase, startRecording, stopRecording, working]);

  /** Take one of whatever is current: the set in progress, or the round's melody. */
  const clip = (round.phase === "setting" ? firstTake : target)?.recording ?? null;

  const play = useCallback(() => {
    if (clip) playback.play(clip);
  }, [clip, playback]);

  const reset = useCallback(() => {
    const wiped = resetLetters(players);
    playback.stop();
    release();
    clear();
    setMelody(null);
    setTakeOne(null);
    setVerdict(null);
    setFinishKey(null);
    settled.current = false;
    setRound(startRound(wiped, word));
    onSettings({ ...settings, players: wiped });
  }, [clear, onSettings, playback, players, release, settings, word]);

  return {
    round,
    players,
    word,
    playable: canPlay(players, word),
    current: byId(round.turnId),
    setter: byId(round.setterId),
    champion,

    // Rotation supplies the default; this lets the room override it, right up until
    // a first take makes the melody somebody's.
    selectable:
      canChooseSetter(round) &&
      canPlay(players, word) &&
      recording.status === "idle" &&
      !working,
    selectSetter,

    clip,
    playing: playback.playing,
    play,

    recording,
    working,

    toasts,
    dismissToast: dismiss,

    verdict,
    closeVerdict: () => setVerdict(null),

    finishKey,
    // Nothing to celebrate when the word ran everybody out at once.
    burstKey: champion === null ? null : finishKey,

    press,
    reset,
  };
}
