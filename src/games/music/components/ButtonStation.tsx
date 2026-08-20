"use client";

import {
  ArrowClockwiseIcon,
  MicrophoneIcon,
  PlayIcon,
  StopIcon,
} from "@phosphor-icons/react";
import { config } from "../config";
import type { RecorderStatus } from "../audio/useRecorder";
import styles from "./ButtonStation.module.css";

/**
 * The controls, and nothing else.
 *
 * Which buttons exist is a function of the phase, so there is never a control on
 * screen that would do nothing — the playback button simply does not appear until
 * there is something to play.
 *
 * The record button carries four states and the caption underneath carries the
 * explanation. The important one is **armed**: the clock has not started, and the
 * button deliberately shows no digits, because a countdown that is not counting is
 * a lie about how much time somebody has.
 */

export default function ButtonStation({
  phase,
  takeIndex,
  status,
  level,
  remaining,
  working,
  selectable,
  canPlayBack,
  playing,
  disabled,
  onPress,
  onPlay,
  onReset,
}: {
  phase: "setting" | "copying" | "finished";
  takeIndex: 0 | 1;
  status: RecorderStatus;
  level: number;
  remaining: number | null;
  working: boolean;
  /** True while a box can still be clicked to change who sets. */
  selectable: boolean;
  canPlayBack: boolean;
  playing: boolean;
  disabled: boolean;
  onPress: () => void;
  onPlay: () => void;
  onReset: () => void;
}) {
  if (phase === "finished") {
    return (
      <div className={styles.station}>
        <button type="button" className={styles.reset} onClick={onReset}>
          <ArrowClockwiseIcon size={22} weight="bold" aria-hidden="true" />
          New game
        </button>
      </div>
    );
  }

  const live = status !== "idle";
  const counting = status === "recording" && remaining !== null;
  const lastCall = counting && remaining <= config.record.countdownSeconds;

  const caption = working
    ? "Working out what that was…"
    : status === "arming"
      ? "Opening the microphone…"
      : status === "armed"
        ? "Listening — the clock starts on your first note."
        : status === "recording"
          ? "Recording. Press again when you're done."
          : status === "finishing"
            ? "Finishing up…"
            : phase === "setting" && takeIndex === 1
              ? "Play the same melody again to confirm it."
              : phase === "setting"
                ? selectable
                  // Stated rather than left to be discovered — a box that only
                  // becomes a button some of the time is easy to miss.
                  ? "Record the melody you want to set, or pick a different player."
                  : "Record the melody you want to set."
                : "Copy the melody.";

  return (
    <div className={styles.station}>
      <div className={styles.row}>
        {canPlayBack && (
          <button
            type="button"
            className={styles.secondary}
            onClick={onPlay}
            disabled={live || working}
            aria-label={playing ? "Playing the melody" : "Play the melody"}
          >
            <PlayIcon size={24} weight="fill" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          className={styles.record}
          onClick={onPress}
          disabled={disabled || working || status === "finishing"}
          data-live={live || undefined}
          data-armed={status === "armed" || undefined}
          aria-label={live ? "Stop recording" : "Start recording"}
        >
          {/*
           * The ring reacts to input level. It is the only thing on screen that
           * proves the microphone is actually hearing the room, which is what makes
           * "nothing was recorded" diagnosable rather than mystifying.
           */}
          <span
            className={styles.level}
            style={{ transform: `scale(${1 + level * 0.35})` }}
            aria-hidden="true"
          />
          {live ? (
            <StopIcon size={26} weight="fill" aria-hidden="true" />
          ) : (
            <MicrophoneIcon size={26} weight="fill" aria-hidden="true" />
          )}

          {phase === "setting" && takeIndex === 1 && !live && (
            <span className={styles.badge} aria-hidden="true">
              &times;2
            </span>
          )}
        </button>

        {counting && (
          <span className={styles.clock} data-urgent={lastCall || undefined}>
            {Math.ceil(remaining)}
            <span className={styles.unit}>s</span>
          </span>
        )}
      </div>

      {/*
       * Polite, not assertive. This changes on every phase of every take, and an
       * alert on each one would nag rather than inform.
       */}
      <p className={styles.caption} aria-live="polite">
        {caption}
      </p>
    </div>
  );
}
