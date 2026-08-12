"use client";

import { useState } from "react";
import { MicrophoneIcon, WarningIcon } from "@phosphor-icons/react";
import type { StationStatus } from "../lib/useLoopStation";
import styles from "./MicGate.module.css";

/**
 * Boot overlays: the mic-permission wait, the tap-to-start autoplay gate, and
 * hard errors. Plus the Bluetooth warning — earbuds + mic at once usually force
 * the hands-free profile (mono, call quality, 100–300ms of drifting latency),
 * which quietly ruins loops and calibration alike.
 */
export default function MicGate({
  status,
  errorMessage,
  bluetoothInput,
  resumeAudio,
}: {
  status: StationStatus;
  errorMessage: string | null;
  bluetoothInput: boolean;
  resumeAudio: () => void;
}) {
  const [warningDismissed, setWarningDismissed] = useState(false);

  if (status === "ready") {
    if (!bluetoothInput || warningDismissed) return null;
    return (
      <div className={styles.warning} role="alert">
        <WarningIcon size={16} weight="bold" aria-hidden="true" />
        <span>
          That looks like a Bluetooth microphone. Bluetooth forces call-quality mono
          audio with high, drifting latency — wired earbuds or an audio interface will
          loop far better.
        </span>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setWarningDismissed(true)}
        >
          Got it
        </button>
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <MicrophoneIcon size={28} weight="duotone" />
        </span>
        {status === "loading" && (
          <>
            <p className={styles.lead}>The loop station listens continuously.</p>
            <p className={styles.body}>Allow microphone access to begin.</p>
          </>
        )}
        {status === "gate" && (
          <>
            <p className={styles.lead}>Microphone ready.</p>
            <button type="button" className={styles.start} onClick={resumeAudio}>
              Tap to start audio
            </button>
          </>
        )}
        {status === "error" && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
