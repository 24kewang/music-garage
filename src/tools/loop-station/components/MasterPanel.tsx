"use client";

import { MetronomeIcon } from "@phosphor-icons/react";
import { config } from "../config";
import { transportUnlocked, type SessionEvent, type SessionState } from "../lib/session";
import NumberField from "./NumberField";
import VerticalSlider from "./VerticalSlider";
import styles from "./MasterPanel.module.css";

/**
 * Master volume/reverb/mute, tempo, metronome, and the beats/bars fields.
 * Tempo, beats and bars lock together the moment the first track is set —
 * the loop's length depends on all three — and unlock when every track is gone.
 */
export default function MasterPanel({
  session,
  dispatch,
}: {
  session: SessionState;
  dispatch: (event: SessionEvent) => void;
}) {
  const unlocked = transportUnlocked(session);
  const metronomeBlocked = session.recording.kind === "free";

  return (
    <section className={styles.panel} aria-label="Master">
      <span className={styles.eyebrow}>Master</span>

      <div className={styles.mixRow}>
        <VerticalSlider
          label="Master volume"
          caption="VOL"
          value={session.master.volume}
          onChange={(value) => dispatch({ type: "setMasterVolume", value })}
          meterName="master"
          max={config.mix.maxMasterVolume}
          tall
        />
        <VerticalSlider
          label="Master reverb"
          caption="REV"
          value={session.master.reverb}
          onChange={(value) => dispatch({ type: "setMasterReverb", value })}
          tall
        />
        <button
          type="button"
          className={`${styles.muteButton} ${session.master.muted ? styles.muteOn : ""}`}
          aria-pressed={session.master.muted}
          onClick={() => dispatch({ type: "toggleMasterMute" })}
          title="Mute master"
        >
          M
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.tempoRow}>
        <div className={styles.tempo}>
          <NumberField
            label="Tempo in BPM"
            value={Math.round(session.tempo)}
            min={config.transport.minTempo}
            max={config.transport.maxTempo}
            disabled={!unlocked}
            wide
            onCommit={(value) => dispatch({ type: "setTempo", value })}
          />
          <span className={styles.unit}>BPM</span>
        </div>
        <button
          type="button"
          className={`${styles.metroButton} ${session.metronomeOn ? styles.metroOn : ""}`}
          aria-pressed={session.metronomeOn}
          aria-label="Metronome"
          title={
            metronomeBlocked
              ? "No tempo yet — close the free loop first"
              : "Metronome"
          }
          disabled={metronomeBlocked}
          onClick={() => dispatch({ type: "toggleMetronome" })}
        >
          <MetronomeIcon size={18} weight="bold" />
        </button>
      </div>

      <div className={styles.lengthRow}>
        <NumberField
          label="Beats per bar"
          value={session.beats}
          min={config.transport.minBeats}
          max={config.transport.maxBeats}
          disabled={!unlocked}
          onCommit={(value) => dispatch({ type: "setBeats", value })}
        />
        <span className={styles.unit}>beats</span>
        <span className={styles.slash}>/</span>
        <NumberField
          label="Bars in the loop"
          value={session.bars}
          min={config.transport.minBars}
          max={config.transport.maxBars}
          disabled={!unlocked}
          onCommit={(value) => dispatch({ type: "setBars", value })}
        />
        <span className={styles.unit}>bars</span>
      </div>

      {!unlocked && (
        <p className={styles.lockHint}>
          Tempo, beats and bars are locked while tracks exist.
        </p>
      )}
    </section>
  );
}
