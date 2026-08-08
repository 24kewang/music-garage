"use client";

import { PlayIcon } from "@phosphor-icons/react";
import styles from "./PlayButton.module.css";

/**
 * Replay what the microphone caught.
 *
 * Stays a play triangle even while sound is coming out, because a press always
 * restarts from the beginning rather than stopping — swapping in a stop square would
 * promise something the button doesn't do. A ring pulses instead, so there is still
 * some sign that a press registered on a clip this short.
 */
export default function PlayButton({
  playing,
  onPlay,
}: {
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.play} ${playing ? styles.playing : ""}`}
      onClick={onPlay}
      aria-label="Play what was recorded"
    >
      {/* Sits behind the icon; purely the pulse. */}
      <span className={styles.ring} aria-hidden="true" />
      <PlayIcon size={20} weight="fill" aria-hidden="true" />
    </button>
  );
}
