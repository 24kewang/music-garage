"use client";

import { useEffect, useRef } from "react";
import { TrophyIcon } from "@phosphor-icons/react";
import { useDismiss } from "@/shared/hooks/useDismiss";
import type { Player } from "../lib/rules";
import styles from "./WinnerDialog.module.css";

/**
 * Who won.
 *
 * Dismissible, because the board underneath is worth looking at afterwards and the
 * confetti should not have to be sat through. The reset button stays in the station
 * either way, so closing this loses nothing.
 *
 * `champion` can legitimately be null — everyone can be knocked out at once by a
 * settings edit that shortens the word — and saying so is better than indexing into
 * an empty roster and announcing that `undefined` won.
 */

export default function WinnerDialog({
  champion,
  word,
  onClose,
  onReset,
}: {
  champion: Player | null;
  word: string;
  onClose: () => void;
  onReset: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resetRef = useRef<HTMLButtonElement | null>(null);

  useDismiss(true, cardRef, () => onClose());

  useEffect(() => {
    resetRef.current?.focus();
  }, []);

  return (
    <div className={styles.backdrop}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-winner-title"
      >
        <TrophyIcon
          className={styles.trophy}
          size={44}
          weight="duotone"
          aria-hidden="true"
        />

        <h2 id="music-winner-title" className={styles.title}>
          {champion ? `${champion.name} wins` : "Nobody left standing"}
        </h2>

        <p className={styles.body}>
          {champion
            ? `Everyone else spelled out ${word}.`
            : `Every player has spelled out ${word}. Reset to play again.`}
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.dismiss} onClick={onClose}>
            Look at the board
          </button>
          <button
            ref={resetRef}
            type="button"
            className={styles.again}
            onClick={onReset}
          >
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
