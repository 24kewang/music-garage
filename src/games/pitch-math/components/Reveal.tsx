"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { revealNames } from "../lib/spelling";
import type { Transposition } from "../lib/spelling";
import styles from "./Reveal.module.css";

/**
 * What was actually played, once someone has named it.
 *
 * Shown only after the round is won — before that these notes live in the round state
 * and never reach the DOM, so they can't be read out of devtools mid-guess.
 */
export default function Reveal({
  midis,
  transposition,
  onReset,
  playButton,
}: {
  midis: readonly number[];
  transposition: Transposition;
  onReset: () => void;
  /**
   * The replay button, which moves here from below the board once the round is won.
   * Passed in rather than built here so playback keeps running across the move.
   */
  playButton?: React.ReactNode;
}) {
  const { text } = revealNames(midis, transposition);

  return (
    <div className={styles.root}>
      {playButton}

      {/* Announced politely: the players have just seen the button light up. */}
      <p className={styles.notes} aria-live="polite">
        {text}
      </p>

      <button
        type="button"
        className={styles.retry}
        onClick={onReset}
        aria-label="Play again"
      >
        <ArrowClockwiseIcon size={20} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
