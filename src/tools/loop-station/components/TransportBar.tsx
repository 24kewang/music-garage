"use client";

import { PlayIcon, StopIcon } from "@phosphor-icons/react";
import { divisorsOf } from "../lib/transport";
import type { SessionEvent, SessionState } from "../lib/session";
import styles from "./TransportBar.module.css";

/**
 * Play/stop, the record button, and the multiplier — the station's feet.
 *
 * The record button is one control with many meanings (count-in display, free
 * elapsed, capture, overwrite); its inner text is painted by the root's rAF
 * loop via [data-rec-count] so the count runs without re-rendering React.
 * The multiplier disappears entirely in overwrite mode — it doesn't apply there.
 */
export default function TransportBar({
  session,
  dispatch,
  overwriteArmed,
}: {
  session: SessionState;
  dispatch: (event: SessionEvent) => void;
  overwriteArmed: boolean;
}) {
  const rec = session.recording;
  const playable = session.tracks.length > 0 || rec.kind !== "off";
  const recordState =
    rec.kind === "off" ? (overwriteArmed ? "overwriteReady" : "idle") : rec.kind;

  const recordLabel =
    rec.kind === "off"
      ? overwriteArmed
        ? "Overwrite the selected track"
        : "Record"
      : rec.kind === "countIn"
        ? "Cancel the count-in"
        : rec.kind === "free"
          ? "Close the free loop"
          : rec.kind === "overdub"
            ? "End the overwrite"
            : "Stop recording";

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.play}
        onClick={() => dispatch({ type: "playStop" })}
        disabled={!playable}
        aria-label={session.playing ? "Stop" : "Play"}
      >
        {session.playing || rec.kind === "countIn" || rec.kind === "free" ? (
          <StopIcon size={26} weight="fill" />
        ) : (
          <PlayIcon size={26} weight="fill" />
        )}
      </button>

      <div className={styles.recordColumn}>
        <button
          type="button"
          className={styles.record}
          data-state={recordState}
          onClick={() => dispatch({ type: "record" })}
          aria-pressed={rec.kind !== "off"}
          aria-label={recordLabel}
        >
          <span className={styles.recordDot} aria-hidden="true" />
          <span className={styles.recordCount} data-rec-count aria-hidden="true" />
        </button>

        {!overwriteArmed && (
          <div role="group" aria-label="Loop multiplier" className={styles.multTrack}>
            {divisorsOf(session.bars).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={session.multiplier === m}
                className={`${styles.multSeg} ${
                  session.multiplier === m ? styles.multSegActive : ""
                }`}
                onClick={() => dispatch({ type: "setMultiplier", value: m })}
              >
                {m}x
              </button>
            ))}
          </div>
        )}
        {overwriteArmed && (
          <p className={styles.overwriteHint}>
            {rec.kind === "overdub"
              ? "Overwriting — press again or let the loop end"
              : "Record overwrites the selected track"}
          </p>
        )}
      </div>
    </div>
  );
}
