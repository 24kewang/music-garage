"use client";

import type { SpinPhase } from "../lib/useSpinReel";
import styles from "./SpinButton.module.css";

/**
 * The one SPIN button, shared by both modes so the pill, the placement and the
 * reject shake can't drift apart between them.
 */
export default function SpinButton({
  phase,
  spinning,
  shaking,
  disabled,
  onClick,
}: {
  phase: SpinPhase;
  spinning: boolean;
  /** Set for one animation's length after a press with nothing selected. */
  shaking: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.spin} ${shaking ? styles.spinShake : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {spinning ? "Spinning…" : phase === "result" ? "Spin again" : "Spin"}
    </button>
  );
}
