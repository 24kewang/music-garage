"use client";

import { useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import styles from "./NumberField.module.css";

/**
 * A numeric field with stepper carets. Validates on a draft value and commits
 * only when valid, so a half-typed entry never reaches the session. Arrow keys
 * step; the carets appear on hover/focus.
 */
export default function NumberField({
  label,
  value,
  min,
  max,
  disabled = false,
  wide = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  /** The tempo variant: bigger digits, no box. */
  wide?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [adopted, setAdopted] = useState(value);

  // Adopt outside changes (a derived free-mode tempo, a reset) into the draft —
  // the render-time derive-from-props pattern, not an effect.
  if (value !== adopted) {
    setAdopted(value);
    setDraft(String(value));
  }

  const parsed = Number.parseInt(draft, 10);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;

  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    setDraft(String(clamped));
    onCommit(clamped);
  };

  const step = (delta: number) => {
    commit((Number.isFinite(parsed) ? parsed : value) + delta);
  };

  return (
    <div
      className={`${styles.field} ${wide ? styles.wide : ""} ${
        valid ? "" : styles.invalid
      } ${disabled ? styles.disabled : ""}`}
    >
      <input
        inputMode="numeric"
        value={draft}
        disabled={disabled}
        aria-label={label}
        className={styles.input}
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9]/g, "").slice(0, 3);
          setDraft(next);
          const n = Number.parseInt(next, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onCommit(n);
        }}
        onBlur={() => {
          if (!valid) setDraft(String(value));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            step(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            step(-1);
          }
        }}
      />
      <span className={styles.steppers} aria-hidden={disabled}>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`Increase ${label}`}
          onClick={() => step(1)}
        >
          <CaretUpIcon size={9} weight="bold" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          onClick={() => step(-1)}
        >
          <CaretDownIcon size={9} weight="bold" />
        </button>
      </span>
    </div>
  );
}
