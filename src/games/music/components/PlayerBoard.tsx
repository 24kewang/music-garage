"use client";

import { isContender, lettersShown, type Player } from "../lib/rules";
import styles from "./PlayerBoard.module.css";

/**
 * The row of player boxes.
 *
 * Left-to-right here is top-to-bottom in the settings panel — the same order, shown
 * the way each context wants it.
 *
 * Eliminated players stay on the board while they are active. Removing them would
 * lose the running story of the game, which is the thing everyone in the room is
 * actually watching.
 *
 * Before a first take the boxes are **buttons**: turn order picks a default setter,
 * and clicking picks a different one. Four people around one screen do not take turns
 * in the order an array happens to be in, and the alternative was making them open
 * settings and drag rows to say so. The moment a melody is recorded the boxes go back
 * to being plain cells, because from then on it belongs to whoever recorded it.
 */

export default function PlayerBoard({
  players,
  word,
  currentId,
  setterId,
  showSetter,
  selectable,
  onSelect,
}: {
  players: readonly Player[];
  word: string;
  /** Whose attempt is live. */
  currentId: string | null;
  setterId: string | null;
  /** The setter tag only means something once a melody is actually set. */
  showSetter: boolean;
  /** True while the setting turn is still up for grabs. */
  selectable: boolean;
  onSelect: (id: string) => void;
}) {
  const visible = players.filter((player) => player.active);

  return (
    <ol className={styles.board}>
      {visible.map((player) => {
        const lit = lettersShown(player, word);
        const out = lit >= word.length;
        // Only a contender can be handed the turn; an eliminated box stays inert.
        const pickable = selectable && isContender(player, word);

        const body = (
          <>
            {showSetter && player.id === setterId && (
              <span className={styles.tag}>Their round</span>
            )}

            <span className={styles.name}>{player.name}</span>

            <span className={styles.letters}>
              {/*
               * The whole word is always drawn, with the unearned letters ghosted,
               * so the distance left to go is visible rather than implied. Read out
               * as a sentence instead, since a row of letters is meaningless
               * character by character.
               */}
              <span aria-hidden="true">
                {[...word].map((letter, index) => (
                  <span
                    key={index}
                    className={styles.letter}
                    data-earned={index < lit || undefined}
                  >
                    {letter}
                  </span>
                ))}
              </span>
              <span className={styles.srOnly}>
                {lit} of {word.length} letters{out ? ", out" : ""}
              </span>
            </span>
          </>
        );

        return (
          <li key={player.id} className={styles.slot}>
            {pickable ? (
              <button
                type="button"
                className={styles.card}
                data-current={player.id === currentId || undefined}
                data-out={out || undefined}
                data-pickable
                aria-pressed={player.id === currentId}
                aria-label={`${player.name} sets the next melody`}
                onClick={() => onSelect(player.id)}
              >
                {body}
              </button>
            ) : (
              <div
                className={styles.card}
                data-current={player.id === currentId || undefined}
                data-out={out || undefined}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
