"use client";

import { useId } from "react";
import { config } from "../config";
import { coerceWord, MAX_LETTERS, type Tolerance } from "../lib/settings";
import styles from "./GameTab.module.css";

/**
 * The word and how forgiving the judging is.
 *
 * Both apply immediately. Shortening the word can eliminate somebody on the spot,
 * and occasionally end the game — that is the honest consequence of the setting and
 * showing it at once is better than deferring it to a moment nobody connects to the
 * edit that caused it.
 */

export default function GameTab({
  word,
  tolerance,
  onWord,
  onTolerance,
}: {
  word: string;
  tolerance: Tolerance;
  onWord: (word: string) => void;
  onTolerance: (tolerance: Tolerance) => void;
}) {
  const wordId = useId();
  const groupId = useId();

  const options: { value: Tolerance; label: string; hint: string }[] = [
    {
      value: "strict",
      label: "Strict",
      hint: `Every note has to land. A copy allows ${Math.round(
        config.tolerance.strict.copy * 100,
      )}% error; a set has to be exact.`,
    },
    {
      value: "loose",
      label: "Loose",
      hint: `Near enough counts. A copy allows ${Math.round(
        config.tolerance.loose.copy * 100,
      )}% error.`,
    },
  ];

  return (
    <div className={styles.tab}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={wordId}>
          Word to spell
        </label>
        <input
          id={wordId}
          type="text"
          className={styles.word}
          value={word}
          maxLength={MAX_LETTERS}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          // Coerced on the way in rather than validated on the way out: there is no
          // moment where the board is asked to spell something it cannot.
          onChange={(event) => onWord(coerceWord(event.target.value))}
        />
        <p className={styles.hint}>
          One to {MAX_LETTERS} letters. Each miss earns the next letter; spelling the
          whole word is out.
        </p>
      </div>

      <fieldset className={styles.field}>
        <legend className={styles.label} id={groupId}>
          Tolerance
        </legend>

        <div className={styles.choices} role="radiogroup" aria-labelledby={groupId}>
          {options.map((option) => (
            <label
              key={option.value}
              className={styles.choice}
              data-selected={tolerance === option.value || undefined}
            >
              <input
                type="radio"
                name="music-tolerance"
                value={option.value}
                checked={tolerance === option.value}
                onChange={() => onTolerance(option.value)}
              />
              <span className={styles.choiceLabel}>{option.label}</span>
              <span className={styles.hint}>{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
