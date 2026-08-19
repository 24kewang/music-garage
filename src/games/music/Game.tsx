"use client";

import { useEffect, useState } from "react";
import Confetti from "@/shared/components/Confetti";
import ButtonStation from "./components/ButtonStation";
import PlayerBoard from "./components/PlayerBoard";
import ResultDialog from "./components/ResultDialog";
import SettingsPanel from "./components/SettingsPanel";
import Toasts from "./components/Toasts";
import WinnerDialog from "./components/WinnerDialog";
import { config } from "./config";
import { useGame } from "./lib/useGame";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./lib/settings";
import styles from "./game.module.css";

/**
 * MUSIC — HORSE, played on melodies.
 *
 * One player sets a melody and proves they can play it twice; everyone else copies it
 * or takes a letter. Spell the word and you are out.
 *
 * The app judges pitch **sequences** and nothing else. Rhythm is discarded, adjacent
 * repeats collapse, and the comparison is key-agnostic, so copying the shape is the
 * whole task — which is what makes a singer and a trumpet player able to play each
 * other. One note at a time, though: the detector is monophonic and a chord gives it
 * nothing to hold on to.
 */
export default function Game() {
  // Starts at the defaults so the server and the first client render agree; stored
  // settings are adopted once mounted.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  /**
   * Which ending has already been acknowledged, keyed by the game's finish stamp.
   *
   * Tracked as that stamp rather than a boolean, so a new game resets it by simply
   * producing a different one. A boolean would need an effect to clear it, and that
   * effect would be a render behind.
   */
  const [seenEnd, setSeenEnd] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
  }, []);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const game = useGame({ settings, onSettings: updateSettings });
  const { round, recording } = game;

  const finished = round.phase === "finished";
  // Keyed off the finish, not the confetti: an ending where the word ran everybody
  // out has no winner to celebrate but still has something to say.
  const showEnding =
    finished && game.finishKey !== null && game.finishKey !== seenEnd && !game.verdict;

  const busy = recording.status !== "idle" || game.working;

  return (
    <div className={styles.game}>
      <div className={styles.stage}>
        <PlayerBoard
          players={game.players}
          word={game.word}
          currentId={finished ? null : round.turnId}
          setterId={round.setterId}
          showSetter={round.phase === "copying"}
        />

        {!game.playable && !finished && (
          <p className={styles.notice} role="status">
            Two players at least. Turn some more on in settings.
          </p>
        )}

        {recording.error && (
          <p className={styles.error} role="alert">
            {recording.error}
          </p>
        )}

        <ButtonStation
          phase={round.phase}
          takeIndex={round.takeIndex}
          status={recording.status}
          level={recording.level}
          remaining={recording.remaining}
          working={game.working}
          canPlayBack={game.clip !== null}
          playing={game.playing}
          disabled={!game.playable}
          onPress={game.press}
          onPlay={game.play}
          onReset={game.reset}
        />
      </div>

      <SettingsPanel
        settings={settings}
        // Locked while a melody is in play, and while a take is running: editing the
        // roster underneath either would be changing the terms mid-attempt.
        disabled={round.phase === "copying" || busy}
        onChange={updateSettings}
      />

      <Toasts toasts={game.toasts} onDismiss={game.dismissToast} />

      {game.verdict && (
        <ResultDialog verdict={game.verdict} onClose={game.closeVerdict} />
      )}

      {showEnding && (
        <WinnerDialog
          champion={game.champion}
          word={game.word}
          onClose={() => setSeenEnd(game.finishKey)}
          onReset={() => {
            setSeenEnd(game.finishKey);
            game.reset();
          }}
        />
      )}

      <Confetti burstKey={game.burstKey} config={config.win.confetti} />
    </div>
  );
}
