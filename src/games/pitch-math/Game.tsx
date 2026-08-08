"use client";

import { useEffect, useState } from "react";
import Confetti from "@/shared/components/Confetti";
import { usePlayback } from "./audio/usePlayback";
import { config } from "./config";
import IntervalGrid from "./components/IntervalGrid";
import ListeningWave from "./components/ListeningWave";
import PlayButton from "./components/PlayButton";
import Reveal from "./components/Reveal";
import SettingsPanel from "./components/SettingsPanel";
import StartButton from "./components/StartButton";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./lib/settings";
import { useRound } from "./lib/useRound";
import styles from "./game.module.css";

/**
 * Pitch Math — two players, two notes, one interval.
 *
 * Both players play a note at the same time; the app works out what they were and
 * judges the guesses. Whoever names it out loud first gets to press a button, and a
 * wrong press hands the turn over. Scores and turn order are the players' business,
 * not the app's — which is why there is no scoreboard here.
 */
export default function Game() {
  // Starts at the defaults so the server and first client render agree; stored
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

  const round = useRound(settings.mode);

  /**
   * Owned here rather than inside the button, so the clip keeps playing when the button
   * moves from below the board to alongside the note names at the reveal.
   */
  const playback = usePlayback();

  const recording = round.recording;
  const replay = recording ? (
    <PlayButton playing={playback.playing} onPlay={() => playback.play(recording)} />
  ) : null;

  /** Starting a new round cuts off the old clip rather than talking over it. */
  const startOver = () => {
    playback.stop();
    round.reset();
  };

  /** Where the winning button was, so the confetti bursts there rather than centre. */
  const [burst, setBurst] = useState<{ key: number; x: number; y: number } | null>(null);

  const onGuess = (semitones: number, button: HTMLButtonElement) => {
    const wasSolved = round.solved !== null;
    round.guess(semitones);

    // `round.solved` won't have updated yet, so ask the rules directly via the button
    // that was pressed: it becomes the winner only if the guess was right.
    if (!wasSolved) {
      const rect = button.getBoundingClientRect();
      setBurst({
        key: Date.now(),
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
  };

  // Only fire once the round is actually won — the position is captured on every
  // press, but the burst belongs to the correct one.
  const burstKey = round.phase === "solved" && burst ? burst.key : null;

  const listening = round.phase === "listening" || round.phase === "analysing";

  return (
    <div className={styles.game}>
      <div className={styles.stage}>
        {round.phase === "idle" && (
          <>
            <StartButton
              mode={settings.mode}
              onModeChange={(mode) => updateSettings({ ...settings, mode })}
              onStart={round.begin}
              busy={round.requesting}
            />
            {round.micError && (
              <p className={styles.error} role="alert">
                {round.micError}
              </p>
            )}
          </>
        )}

        {listening && (
          <div className={styles.listening}>
            <ListeningWave level={round.level} active={round.phase === "listening"} />

            {/*
             * Polite, not assertive: the retry loop can run several times, and an
             * alert on each pass would nag rather than inform.
             */}
            <p className={styles.status} aria-live="polite">
              {round.notice ??
                (round.phase === "analysing"
                  ? "Working out what you played…"
                  : "Listening — play when you're ready.")}
            </p>

            <button type="button" className={styles.stop} onClick={round.cancel}>
              Stop
            </button>
          </div>
        )}

        {(round.phase === "guessing" || round.phase === "solved") && (
          <div className={styles.board}>
            <p className={styles.question}>
              {round.solved === null
                ? "What was the interval?"
                : "That's the one."}
            </p>

            <IntervalGrid
              eliminated={round.eliminated}
              solved={round.solved}
              abbreviate={settings.abbreviate}
              onGuess={onGuess}
            />

            {/* Below the board while guessing; it moves into the reveal once won. */}
            {round.phase === "guessing" && replay}

            {round.phase === "solved" && (
              <Reveal
                midis={round.revealMidis}
                transposition={settings.transposition}
                onReset={startOver}
                playButton={replay}
              />
            )}
          </div>
        )}
      </div>

      <SettingsPanel settings={settings} onChange={updateSettings} />

      <Confetti
        burstKey={burstKey}
        config={config.reveal.confetti}
        origin={burst ? { x: burst.x, y: burst.y } : null}
      />
    </div>
  );
}
