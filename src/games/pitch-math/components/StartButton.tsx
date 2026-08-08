"use client";

import { MicrophoneIcon } from "@phosphor-icons/react";
import { INTERVAL_MODES, type IntervalMode } from "../lib/intervals";
import styles from "./StartButton.module.css";

const MODE_LABELS: Record<IntervalMode, string> = {
  absolute: "Absolute",
  relative: "Relative",
};

const MODE_HINTS: Record<IntervalMode, string> = {
  absolute: "One answer, measured up from the lower note.",
  relative: "The interval or its inversion — a 4th also answers a 5th.",
};

/**
 * The opening screen: press to listen, with the guessing mode alongside.
 *
 * The mode sits here rather than behind the gear because it changes what counts as a
 * right answer, and the players need to agree on it before they play.
 */
export default function StartButton({
  mode,
  onModeChange,
  onStart,
  busy,
}: {
  mode: IntervalMode;
  onModeChange: (mode: IntervalMode) => void;
  onStart: () => void;
  /** True while the permission prompt is up. */
  busy: boolean;
}) {
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.mic}
        onClick={onStart}
        disabled={busy}
        aria-label="Start listening"
      >
        <span className={styles.micGlow} aria-hidden="true" />
        <MicrophoneIcon size={44} weight="fill" aria-hidden="true" />
      </button>

      <p className={styles.prompt}>
        {busy ? "Waiting for microphone permission…" : "Play a note each, together."}
      </p>

      <div className={styles.modes} role="group" aria-label="Guessing mode">
        {INTERVAL_MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.mode} ${mode === option ? styles.modeActive : ""}`}
            aria-pressed={mode === option}
            onClick={() => onModeChange(option)}
          >
            {MODE_LABELS[option]}
          </button>
        ))}
      </div>

      <p className={styles.hint}>{MODE_HINTS[mode]}</p>
    </div>
  );
}
