"use client";

import { useEffect, useRef } from "react";
import { useDismiss, type DismissReason } from "@/shared/hooks/useDismiss";
import { describeAlignment } from "../lib/graph";
import type { Verdict } from "../lib/useGame";
import AlignmentGraph from "./AlignmentGraph";
import styles from "./ResultDialog.module.css";

/**
 * What went wrong, shown rather than asserted.
 *
 * This is the instrument for arguing about a threshold — and for accepting a letter
 * without feeling cheated. It only appears on a failure: a success has nothing to
 * explain and the toast has already said so.
 *
 * The score is deliberately honest rather than flattering. A copy that missed the
 * strict threshold by a hair reads in the high eighties, and that is the number that
 * makes "switch to loose" an informed decision instead of a shrug.
 */

export default function ResultDialog({
  verdict,
  onClose,
}: {
  verdict: Verdict;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const dismiss = (reason?: DismissReason) => {
    onClose();
    // Focus is only worth restoring on Escape. Clicking away already moved it
    // somewhere the player chose.
    if (reason === "escape") document.querySelector("main")?.focus?.();
  };

  useDismiss(true, cardRef, dismiss);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const { comparison, kind, player } = verdict;
  const who = player?.name ?? "That attempt";

  return (
    <div className={styles.backdrop}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-result-title"
      >
        <h2 id="music-result-title" className={styles.title}>
          {kind === "set"
            ? `${who} couldn't repeat it`
            : `${who} didn't quite get it`}
        </h2>

        <p className={styles.summary}>
          {kind === "set"
            ? "The confirmation take had to match the first one. Here they are together."
            : "Your attempt over the melody you were copying."}
        </p>

        <AlignmentGraph
          target={verdict.target}
          shifted={comparison.shifted}
          steps={comparison.alignment.steps}
        />

        <div className={styles.legend} aria-hidden="true">
          <span className={styles.key} data-tone="target">
            The melody
          </span>
          <span className={styles.key} data-tone="match">
            Matched
          </span>
          <span className={styles.key} data-tone="miss">
            Wrong, missed or extra
          </span>
        </div>

        <div className={styles.footer}>
          <p className={styles.score}>
            <span className={styles.number}>{comparison.score}</span>
            <span className={styles.outOf}>/ 100</span>
          </p>

          <div className={styles.detail}>
            <p className={styles.description}>
              {describeAlignment(comparison.alignment.steps)}
            </p>
            {comparison.shift !== 0 && (
              <p className={styles.description}>
                {/*
                 * Worth saying out loud: the comparison is key-agnostic, so somebody
                 * looking at a graph that lines up in a different octave from the one
                 * they sang has an explanation rather than a mystery.
                 */}
                Matched {comparison.shift < 0 ? "down" : "up"}{" "}
                {Math.abs(comparison.shift)} semitone
                {Math.abs(comparison.shift) === 1 ? "" : "s"} — the key does not count
                against you.
              </p>
            )}
          </div>
        </div>

        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={() => onClose()}
        >
          Carry on
        </button>
      </div>
    </div>
  );
}
