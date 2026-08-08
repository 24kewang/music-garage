"use client";

import { useCallback, useId, useRef, useState } from "react";
import { GearIcon } from "@phosphor-icons/react";
import { useDismiss } from "@/shared/hooks/useDismiss";
import { TRANSPOSITIONS, TRANSPOSITION_LABELS, type Transposition } from "../lib/spelling";
import type { Settings } from "../lib/settings";
import styles from "./SettingsPanel.module.css";

/**
 * The gear and its popup: how the reveal is spelled, and how long the button labels
 * are. Neither affects who wins — the guessing mode, which does, lives on the start
 * screen where both players can see it.
 */
export default function SettingsPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const abbreviateId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div className={styles.panel} id={panelId} role="dialog" aria-label="Game settings">
          <div className={styles.field}>
            <label className={styles.title} htmlFor={`${panelId}-transposition`}>
              Instrument
            </label>
            <p className={styles.hint}>
              Changes how the notes are written, not which answer is right.
            </p>
            <select
              id={`${panelId}-transposition`}
              className={styles.select}
              value={settings.transposition}
              onChange={(event) =>
                onChange({
                  ...settings,
                  transposition: event.target.value as Transposition,
                })
              }
            >
              {TRANSPOSITIONS.map((transposition) => (
                <option key={transposition} value={transposition}>
                  {TRANSPOSITION_LABELS[transposition]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <div className={styles.checkbox}>
              <input
                id={abbreviateId}
                type="checkbox"
                checked={settings.abbreviate}
                onChange={(event) =>
                  onChange({ ...settings, abbreviate: event.target.checked })
                }
              />
              <label htmlFor={abbreviateId}>Short labels</label>
            </div>
            <p className={styles.hint}>
              m3 instead of Minor 3rd, so the whole board fits on one row.
            </p>
          </div>
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
        <GearIcon size={22} weight="bold" />
      </button>
    </div>
  );
}
