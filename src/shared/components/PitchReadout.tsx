"use client";

import { formatNote, type LivePitch } from "@/shared/audio";
import styles from "./PitchReadout.module.css";

/** Cents within this of center are treated as in tune. */
const IN_TUNE_CENTS = 10;

/**
 * Live display of a detected pitch: note name, frequency, a ±50-cent tuning meter and
 * a clarity bar. Reusable by any game that needs to show what the mic is hearing.
 */
export default function PitchReadout({ pitch }: { pitch: LivePitch }) {
  const { note, frequency, clarity } = pitch;

  // Map -50..+50 cents onto 0..100% of the meter track.
  const needlePercent = note ? 50 + clamp(note.cents, -50, 50) : 50;
  const inTune = note ? Math.abs(note.cents) <= IN_TUNE_CENTS : true;

  return (
    <div className={styles.readout}>
      <div className={styles.noteRow}>
        <span className={`${styles.note} ${note ? "" : styles.noteIdle}`}>
          {note ? formatNote(note) : "—"}
        </span>
        <span className={styles.frequency}>
          {frequency ? `${frequency.toFixed(1)} Hz` : "listening…"}
        </span>
      </div>

      <div className={styles.meter}>
        <div className={styles.meterLabels}>
          <span>−50¢</span>
          <span>in tune</span>
          <span>+50¢</span>
        </div>
        <div
          className={styles.meterTrack}
          role="meter"
          aria-label="Cents from the nearest note"
          aria-valuemin={-50}
          aria-valuemax={50}
          aria-valuenow={note ? Math.round(note.cents) : 0}
        >
          <div className={styles.meterTolerance} />
          <div className={styles.meterCenter} />
          {note && (
            <div
              className={`${styles.needle} ${inTune ? "" : styles.needleOff}`}
              style={{ left: `${needlePercent}%` }}
            />
          )}
        </div>
        <span className={styles.cents}>
          {note
            ? `${note.cents >= 0 ? "+" : "−"}${Math.abs(note.cents).toFixed(1)} cents`
            : "no pitch detected"}
        </span>
      </div>

      <div className={styles.clarity}>
        <span className={styles.clarityLabel}>Clarity</span>
        <div
          className={styles.clarityTrack}
          role="meter"
          aria-label="Detection clarity"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={Number(clarity.toFixed(2))}
        >
          <div
            className={styles.clarityFill}
            style={{ width: `${Math.round(clarity * 100)}%` }}
          />
        </div>
        <span className={styles.clarityValue}>{Math.round(clarity * 100)}%</span>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
