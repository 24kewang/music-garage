"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseNoteName, useMicrophone, usePitchDetector } from "@/shared/audio";
import { config } from "./config";
import Captions from "./components/Captions";
import Confetti from "./components/Confetti";
import Dial from "./components/Dial";
import SettingsPanel from "./components/SettingsPanel";
import {
  intonationNeedleDeg,
  intonationTicks,
  pitchNeedleDeg,
  pitchTicks,
  type Tick,
} from "./lib/modes";
import { MAX_SCORE } from "./lib/scoring";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  needsMicrophone,
  saveSettings,
  type Settings,
} from "./lib/settings";
import { useDial } from "./lib/useDial";
import styles from "./game.module.css";

const NO_TICKS: readonly Tick[] = [];

/**
 * Musical Wavelength — a two-player game around one screen.
 *
 * One player spins the wheel, opens the cover to see where the target landed, and
 * describes it out loud. The other player never sees it: they answer by ear, moving
 * the needle by playing a note, singing, or dragging it by hand, then open the cover
 * to see how close they got.
 *
 * Which of those three the needle listens to is the mode, set from the settings gear.
 */
export default function Game() {
  // Starts at the defaults so the server and the first client render agree; stored
  // settings are adopted once mounted.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
  }, []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const mic = useMicrophone();
  const pitch = usePitchDetector(mic.analyser, mic.sampleRate, config.audio);

  const range = useMemo(() => {
    const low = parseNoteName(settings.pitchLow);
    const high = parseNoteName(settings.pitchHigh);
    // Settings validation guarantees these parse; fall back rather than crash if a
    // future edit ever lets an invalid pair through.
    return low !== null && high !== null ? { low, high } : { low: 60, high: 72 };
  }, [settings.pitchLow, settings.pitchHigh]);

  /** Where the microphone says the needle should point, or null when it can't tell. */
  const audioNeedleDeg = useMemo(() => {
    if (!needsMicrophone(settings.mode)) return null;

    if (settings.mode === "pitch") {
      return pitch.frequency === null
        ? null
        : pitchNeedleDeg(pitch.frequency, range.low, range.high);
    }

    return pitch.note === null
      ? null
      : intonationNeedleDeg(pitch.note.cents, settings.intonationSpanCents);
  }, [
    pitch.frequency,
    pitch.note,
    range.low,
    range.high,
    settings.intonationSpanCents,
    settings.mode,
  ]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dial = useDial(svgRef, settings.mode, audioNeedleDeg);

  /**
   * The scale printed on the cover. Only while the guesser is actually aiming — the
   * cover is bare when the target is being placed and after the reveal.
   */
  const ticks = useMemo(() => {
    if (dial.phase !== "guess") return NO_TICKS;
    if (settings.mode === "pitch") return pitchTicks(range.low, range.high);
    if (settings.mode === "intonation") {
      return intonationTicks(settings.intonationSpanCents);
    }
    return NO_TICKS;
  }, [
    dial.phase,
    range.low,
    range.high,
    settings.intonationSpanCents,
    settings.mode,
  ]);

  const scoredMax = dial.phase === "reveal" && dial.landing?.score === MAX_SCORE;

  // Release the microphone when it isn't needed, so the recording indicator goes out.
  // Depends on the individual fields rather than `mic`, which is a fresh object on
  // every render.
  const { status: micStatus, stop: stopMic } = mic;
  useEffect(() => {
    if (!needsMicrophone(settings.mode) && micStatus === "running") stopMic();
  }, [micStatus, settings.mode, stopMic]);

  return (
    <div className={styles.game}>
      <div className={styles.stage}>
        <div className={styles.dial}>
          <Dial svgRef={svgRef} dial={dial} mode={settings.mode} ticks={ticks} />
        </div>
      </div>

      <Captions
        phase={dial.phase}
        mode={settings.mode}
        micBlocked={
          needsMicrophone(settings.mode) &&
          (mic.status === "denied" || mic.status === "error")
        }
      />

      <SettingsPanel
        settings={settings}
        onChange={updateSettings}
        mic={mic}
        pitch={pitch}
      />

      <Confetti burstKey={scoredMax ? dial.revealKey : null} />
    </div>
  );
}
