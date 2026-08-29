"use client";

import { useRef } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { INTERVALS, intervalLabel } from "../lib/intervals";
import styles from "./IntervalGrid.module.css";

/**
 * The thirteen answers.
 *
 * A wrong press shakes the button and dulls it; a right one lights up. Neither state
 * is carried by color alone — an eliminated button is also struck through and marked
 * `aria-disabled`, and the winner also gets a tick. Color-only status is the single
 * most common accessibility failure in a UI like this, and it would leave a
 * color-blind player unable to tell which answers they had already burned.
 */
export default function IntervalGrid({
  eliminated,
  solved,
  abbreviate,
  onGuess,
}: {
  eliminated: readonly number[];
  solved: number | null;
  abbreviate: boolean;
  /** Receives the semitone value and the button, so confetti can burst at it. */
  onGuess: (semitones: number, button: HTMLButtonElement) => void;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div
      className={`${styles.grid} ${abbreviate ? styles.gridCompact : ""}`}
      role="group"
      aria-label="Interval answers"
    >
      {INTERVALS.map((interval) => {
        const isOut = eliminated.includes(interval.semitones);
        const isWon = solved === interval.semitones;
        // Once the round is over every button stops taking presses, not just the
        // ones already used.
        const locked = isOut || solved !== null;

        return (
          <button
            key={interval.semitones}
            ref={(node) => {
              buttonRefs.current[interval.semitones] = node;
            }}
            type="button"
            className={`${styles.button} ${isOut ? styles.buttonOut : ""} ${
              isWon ? styles.buttonWon : ""
            }`}
            // Kept focusable rather than `disabled`, so a keyboard user can still read
            // what has been ruled out instead of it vanishing from the tab order.
            aria-disabled={locked}
            aria-label={
              abbreviate
                ? `${interval.name}${isOut ? " — already tried" : ""}`
                : isOut
                  ? `${interval.name} — already tried`
                  : undefined
            }
            onClick={(event) => {
              if (locked) return;
              onGuess(interval.semitones, event.currentTarget);
            }}
          >
            <span className={styles.label}>
              {intervalLabel(interval, abbreviate)}
            </span>
            {isWon && (
              <CheckIcon
                size={14}
                weight="bold"
                className={styles.check}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
