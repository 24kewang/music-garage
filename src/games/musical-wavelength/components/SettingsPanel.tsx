"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LivePitch, Microphone } from "@/shared/audio";
import PitchReadout from "@/shared/components/PitchReadout";
import {
  MAX_SPAN_CENTS,
  MIN_SPAN_CENTS,
  NEEDLE_MODES,
  needsMicrophone,
  validatePitchRange,
  validateSpan,
  type NeedleMode,
  type Settings,
} from "../lib/settings";
import styles from "./SettingsPanel.module.css";

const MODE_LABELS: Record<NeedleMode, string> = {
  manual: "Manual",
  pitch: "Pitch",
  intonation: "Intonation",
};

const MODE_HINTS: Record<NeedleMode, string> = {
  manual: "Drag the needle to aim by hand.",
  pitch:
    "The needle follows the note you play or sing, across the range below.",
  intonation:
    "The needle shows how sharp or flat you are against the nearest note.",
};

interface SettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  mic: Microphone;
  pitch: LivePitch;
}

/**
 * The gear and its popup. Reachable in every phase — the mode may be changed
 * mid-round.
 *
 * Text fields hold a draft while typing and only commit when valid, so the game
 * always has a usable configuration no matter how the popup is left.
 */
export default function SettingsPanel({
  settings,
  onChange,
  mic,
  pitch,
}: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const [lowDraft, setLowDraft] = useState(settings.pitchLow);
  const [highDraft, setHighDraft] = useState(settings.pitchHigh);
  const [spanDraft, setSpanDraft] = useState(String(settings.intonationSpanCents));

  const rangeCheck = validatePitchRange(lowDraft, highDraft);
  const spanCheck = validateSpan(spanDraft);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const selectMode = (mode: NeedleMode) => {
    onChange({ ...settings, mode });

    // This click is the user gesture browsers require before audio can start.
    if (needsMicrophone(mode)) {
      void mic.start();
    } else {
      mic.stop();
    }
  };

  const commitRange = (low: string, high: string) => {
    setLowDraft(low);
    setHighDraft(high);
    if (validatePitchRange(low, high).ok) {
      onChange({ ...settings, pitchLow: low.trim(), pitchHigh: high.trim() });
    }
  };

  const commitSpan = (text: string) => {
    setSpanDraft(text);
    const checked = validateSpan(text);
    if (checked.ok) onChange({ ...settings, intonationSpanCents: checked.value });
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div className={styles.panel} id={panelId} role="dialog" aria-label="Game settings">
          <div className={styles.title}>Needle</div>

          <div className={styles.field}>
            <div className={styles.modes} role="group" aria-label="Needle mode">
              {NEEDLE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectMode(mode)}
                  aria-pressed={settings.mode === mode}
                  className={`${styles.mode} ${
                    settings.mode === mode ? styles.modeActive : ""
                  }`}
                >
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className={styles.hint}>{MODE_HINTS[settings.mode]}</p>
          </div>

          {settings.mode === "pitch" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${panelId}-low`}>
                Range (low to high)
              </label>
              <div className={styles.row}>
                <input
                  id={`${panelId}-low`}
                  className={`${styles.input} ${rangeCheck.ok ? "" : styles.inputInvalid}`}
                  value={lowDraft}
                  onChange={(event) => commitRange(event.target.value, highDraft)}
                  aria-invalid={!rangeCheck.ok}
                  placeholder="C4"
                  spellCheck={false}
                />
                <input
                  aria-label="High note"
                  className={`${styles.input} ${rangeCheck.ok ? "" : styles.inputInvalid}`}
                  value={highDraft}
                  onChange={(event) => commitRange(lowDraft, event.target.value)}
                  aria-invalid={!rangeCheck.ok}
                  placeholder="C5"
                  spellCheck={false}
                />
              </div>
              {rangeCheck.ok ? (
                <p className={styles.hint}>
                  Note names like C4, Bb3 or F#5. Low sits at the left of the dial.
                </p>
              ) : (
                <p className={styles.error} role="alert">
                  {rangeCheck.error} Still using {settings.pitchLow}–{settings.pitchHigh}.
                </p>
              )}
            </div>
          )}

          {settings.mode === "intonation" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${panelId}-span`}>
                Span (cents either side)
              </label>
              <input
                id={`${panelId}-span`}
                className={`${styles.input} ${spanCheck.ok ? "" : styles.inputInvalid}`}
                value={spanDraft}
                onChange={(event) => commitSpan(event.target.value)}
                aria-invalid={!spanCheck.ok}
                inputMode="numeric"
                placeholder="50"
              />
              {spanCheck.ok ? (
                <p className={styles.hint}>
                  {MIN_SPAN_CENTS}–{MAX_SPAN_CENTS} cents. Smaller spans magnify
                  smaller errors.
                </p>
              ) : (
                <p className={styles.error} role="alert">
                  {spanCheck.error} Still using {settings.intonationSpanCents}.
                </p>
              )}
            </div>
          )}

          {needsMicrophone(settings.mode) && (
            <>
              <div className={styles.divider} />
              <div className={styles.field}>
                <div className={styles.title}>Microphone</div>
                {mic.status === "running" ? (
                  <div className={styles.readout}>
                    <PitchReadout pitch={pitch} />
                  </div>
                ) : (
                  <>
                    <p className={styles.status}>
                      {mic.error ??
                        (mic.status === "requesting"
                          ? "Waiting for permission…"
                          : "The microphone isn't running.")}
                    </p>
                    <button
                      type="button"
                      className={styles.micButton}
                      onClick={() => void mic.start()}
                      disabled={mic.status === "requesting"}
                    >
                      Enable microphone
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles.gear}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Game settings"
      >
        <GearIcon />
      </button>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V19a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 17.3a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.03H2.8a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.5 6.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1.03-1.56V.8a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V7a1.7 1.7 0 0 0 1.56 1.03h.09a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 13Z"
        stroke="currentColor"
        strokeWidth="1.7"
        transform="translate(0 2) scale(0.92)"
      />
    </svg>
  );
}
