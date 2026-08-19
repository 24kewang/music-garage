"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import { GearIcon } from "@phosphor-icons/react";
import { useDismiss, type DismissReason } from "@/shared/hooks/useDismiss";
import type { Player } from "../lib/rules";
import type { Settings, Tolerance } from "../lib/settings";
import GameTab from "./GameTab";
import PlayerTab from "./PlayerTab";
import styles from "./SettingsPanel.module.css";

const TABS = [
  { id: "players", label: "Players" },
  { id: "game", label: "Game" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * The gear and its popup, in two tabs.
 *
 * **Players** is the roster — order, names, letters, who is in. **Game** is the word
 * and the tolerance. Everything applies immediately, including the changes that end a
 * game on the spot.
 *
 * Locked shut while a melody is being copied, and while anything is recording. The
 * copying phase has a melody in flight that nothing on screen can re-record, so
 * editing the roster underneath it would be editing the terms of a bet already
 * placed.
 */
export default function SettingsPanel({
  settings,
  disabled,
  onChange,
}: {
  settings: Settings;
  /** True during copying, or while a take is running — the gear refuses to open. */
  disabled: boolean;
  onChange: (settings: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  // Not reset by close(): fixing a score means opening the panel repeatedly, and
  // landing back on Players every time would be a nuisance.
  const [tab, setTab] = useState<TabId>("players");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const gearRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const tabId = (id: TabId) => `${panelId}-tab-${id}`;

  const close = useCallback((reason?: DismissReason) => {
    setOpen(false);
    // Only on Escape: an outside click has already put focus somewhere deliberate.
    if (reason === "escape") gearRef.current?.focus();
  }, []);

  useDismiss(open, rootRef, close);

  // Arrow keys move between tabs, as the tab pattern expects.
  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.findIndex((candidate) => candidate.id === tab);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.id);
    rootRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(next.id))}`)
      ?.focus();
  };

  const setPlayers = (players: Player[]) => onChange({ ...settings, players });
  const setWord = (word: string) => onChange({ ...settings, word });
  const setTolerance = (tolerance: Tolerance) => onChange({ ...settings, tolerance });

  return (
    <div className={styles.root} ref={rootRef}>
      {open && (
        <div
          className={styles.panel}
          id={panelId}
          role="dialog"
          aria-label="Game settings"
        >
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Settings sections"
            onKeyDown={handleTabKeys}
          >
            {TABS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                id={tabId(candidate.id)}
                className={`${styles.tab} ${tab === candidate.id ? styles.tabActive : ""}`}
                role="tab"
                aria-selected={tab === candidate.id}
                aria-controls={`${panelId}-panel-${candidate.id}`}
                tabIndex={tab === candidate.id ? 0 : -1}
                onClick={() => setTab(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>

          {tab === "players" ? (
            <div
              className={styles.tabPanel}
              id={`${panelId}-panel-players`}
              role="tabpanel"
              aria-labelledby={tabId("players")}
            >
              <PlayerTab
                players={settings.players}
                word={settings.word}
                onChange={setPlayers}
              />
            </div>
          ) : (
            <div
              className={styles.tabPanel}
              id={`${panelId}-panel-game`}
              role="tabpanel"
              aria-labelledby={tabId("game")}
            >
              <GameTab
                word={settings.word}
                tolerance={settings.tolerance}
                onWord={setWord}
                onTolerance={setTolerance}
              />
            </div>
          )}
        </div>
      )}

      <button
        ref={gearRef}
        type="button"
        className={styles.gear}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          disabled ? "Settings, unavailable mid-round" : "Game settings"
        }
        title={disabled ? "Settings are locked while a melody is in play" : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <GearIcon size={22} weight="duotone" aria-hidden="true" />
      </button>
    </div>
  );
}
