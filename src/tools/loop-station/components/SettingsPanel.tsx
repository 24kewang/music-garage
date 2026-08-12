"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GearIcon, XIcon } from "@phosphor-icons/react";
import { config } from "../config";
import { useDismiss, type DismissReason } from "@/shared/hooks/useDismiss";
import type { SessionEvent, SessionState } from "../lib/session";
import type { CalibrationView } from "../lib/useLoopStation";
import styles from "./SettingsPanel.module.css";

/**
 * The settings gear, bottom-right: the default delay (±1000 ms, seeding every
 * new track and overwrite) and latency calibration. Closing the panel — by any
 * route — stops the calibration metronome immediately.
 */
export default function SettingsPanel({
  session,
  dispatch,
  calibration,
  startCalibration,
  stopCalibration,
}: {
  session: SessionState;
  dispatch: (event: SessionEvent) => void;
  calibration: CalibrationView;
  startCalibration: () => void;
  stopCalibration: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gearRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(
    (reason?: DismissReason) => {
      stopCalibration();
      setOpen(false);
      if (reason === "escape") gearRef.current?.focus();
    },
    [stopCalibration],
  );

  useDismiss(open, rootRef, close);

  // Calibration needs the transport stopped; if playback starts, end the run.
  useEffect(() => {
    if (calibration.running && session.playing) stopCalibration();
  }, [calibration.running, session.playing, stopCalibration]);

  return (
    <div ref={rootRef} className={styles.root}>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Loop station settings">
          <div className={styles.head}>
            <span className={styles.title}>Settings</span>
            <button
              type="button"
              className={styles.close}
              aria-label="Close settings"
              onClick={() => close()}
            >
              <XIcon size={14} weight="bold" />
            </button>
          </div>

          <div className={styles.group}>
            <span className={styles.groupLabel}>New recording defaults</span>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="loop-station-delay">
                Delay
                <span className={styles.value}>{session.defaultDelayMs} ms</span>
              </label>
              <input
                id="loop-station-delay"
                type="range"
                min={config.delay.minMs}
                max={config.delay.maxMs}
                step={config.delay.stepMs}
                value={session.defaultDelayMs}
                className={styles.slider}
                onChange={(event) =>
                  dispatch({ type: "setDefaultDelay", ms: Number(event.target.value) })
                }
              />
              <p className={styles.hint}>
                Alignment. Positive compensates for latency — what you heard on the
                beat plays on the beat.
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="loop-station-volume">
                Volume
                <span className={styles.value}>{session.defaultTrackVolume}</span>
              </label>
              <input
                id="loop-station-volume"
                type="range"
                min={0}
                max={100}
                value={session.defaultTrackVolume}
                className={styles.slider}
                onChange={(event) =>
                  dispatch({
                    type: "setDefaultTrackVolume",
                    value: Number(event.target.value),
                  })
                }
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="loop-station-reverb">
                Reverb
                <span className={styles.value}>{session.defaultTrackReverb}</span>
              </label>
              <input
                id="loop-station-reverb"
                type="range"
                min={0}
                max={100}
                value={session.defaultTrackReverb}
                className={styles.slider}
                onChange={(event) =>
                  dispatch({
                    type: "setDefaultTrackReverb",
                    value: Number(event.target.value),
                  })
                }
              />
            </div>

            <p className={styles.hint}>
              These seed the next recording. Tracks you have already made keep their
              own settings.
            </p>
          </div>

          <div className={styles.divider} />

          <div className={styles.field}>
            <button
              type="button"
              className={`${styles.calibrate} ${calibration.running ? styles.calibrateOn : ""}`}
              aria-pressed={calibration.running}
              disabled={session.playing}
              onClick={() => (calibration.running ? stopCalibration() : startCalibration())}
            >
              {calibration.running ? "Stop calibrating" : "Calibrate"}
            </button>
            {session.playing && (
              <p className={styles.hint}>Stop the loop first — calibration needs quiet.</p>
            )}
            {calibration.running && (
              <p className={styles.hint} role="status">
                Play a short note on every click.{" "}
                {calibration.count < config.calibration.minSamples
                  ? `Heard ${calibration.count}…`
                  : `${calibration.count} hits · latency ≈ ${calibration.estimateMs} ms`}
                {calibration.count >= config.calibration.targetBeats && " — that's plenty."}
              </p>
            )}
            {!calibration.running && calibration.estimateMs !== null && (
              <p className={styles.hint}>
                Last run measured ≈ {calibration.estimateMs} ms and set the delay.
              </p>
            )}
          </div>
        </div>
      )}

      <button
        ref={gearRef}
        type="button"
        className={styles.gear}
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <GearIcon size={22} weight="bold" />
      </button>
    </div>
  );
}
