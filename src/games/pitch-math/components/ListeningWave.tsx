"use client";

import { config } from "../config";
import styles from "./ListeningWave.module.css";

/**
 * The dotted soundwave shown while the app is listening.
 *
 * Its height follows the live input level, which is the point: with the retry loop
 * running silently in the background, this is how a player too quiet to trigger an
 * onset can see that they are too quiet rather than guessing.
 *
 * Under `prefers-reduced-motion` the travelling animation stops but the level response
 * stays — the information survives, the movement doesn't.
 */
export default function ListeningWave({
  level,
  active,
}: {
  /** Smoothed input level, 0–1. */
  level: number;
  /** False once the window is captured, so the wave settles. */
  active: boolean;
}) {
  const { dotCount, baseHeight, levelHeight, cycleSeconds } = config.wave;

  return (
    <div
      className={`${styles.wave} ${active ? styles.waveActive : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: dotCount }, (_, index) => {
        // A bell across the row, so the middle swings widest and the ends stay calm.
        const position = index / (dotCount - 1);
        const envelope = Math.sin(position * Math.PI);
        const height = baseHeight + level * levelHeight * envelope;

        return (
          <span
            key={index}
            className={styles.dot}
            style={{
              height: `${height}px`,
              // Staggered so the pulse reads as travelling left to right.
              animationDelay: `${(index / dotCount) * cycleSeconds}s`,
              animationDuration: `${cycleSeconds}s`,
            }}
          />
        );
      })}
    </div>
  );
}
