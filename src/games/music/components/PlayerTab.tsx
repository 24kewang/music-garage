"use client";

import { useEffect, useRef, useState } from "react";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";
import { moveItem } from "@/shared/lib/reorder";
import type { Player } from "../lib/rules";
import { MAX_LETTERS } from "../lib/settings";
import { useRowDrag } from "../lib/useRowDrag";
import styles from "./PlayerTab.module.css";

/**
 * The roster: order, names, strike counts, and who is in.
 *
 * Top-to-bottom here is left-to-right on the board, which is why reordering matters
 * enough to be draggable at all.
 *
 * **Dragging is never the only way.** Each handle is a real button that moves its row
 * with the arrow keys, because a pointer-only reorder is simply unreachable for
 * anybody using a keyboard. Both paths call the same `moveItem`, so the tested
 * geometry covers both.
 */

export default function PlayerTab({
  players,
  word,
  onChange,
}: {
  players: readonly Player[];
  word: string;
  onChange: (players: Player[]) => void;
}) {
  const [notice, setNotice] = useState("");
  /** Which handle to put focus back on after a move rearranged the DOM. */
  const pendingFocus = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const move = (from: number, to: number) => {
    const clamped = Math.min(players.length - 1, Math.max(0, to));
    if (clamped === from) return;

    const player = players[from];
    onChange(moveItem(players, from, clamped));
    pendingFocus.current = player.id;
    setNotice(`${player.name} moved to position ${clamped + 1} of ${players.length}.`);
  };

  // The moved row is somewhere else in the DOM now, so its handle is found by id
  // rather than held in a map — the same querySelector approach the Loop Station's
  // drag uses, and it keeps the render free of ref bookkeeping.
  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-handle="${CSS.escape(id)}"]`)
      ?.focus();
  }, [players]);

  const drag = useRowDrag({ count: players.length, onMove: move });

  const attachList = (node: HTMLDivElement | null) => {
    listRef.current = node;
    drag.listRef(node);
  };

  const update = (index: number, patch: Partial<Player>) => {
    onChange(players.map((player, at) => (at === index ? { ...player, ...patch } : player)));
  };

  return (
    <div className={styles.tab}>
      <p className={styles.hint} id="music-reorder-hint">
        Order runs left to right on the board. Drag a handle to reorder, or focus one
        and use the arrow keys.
      </p>

      <div className={styles.list} ref={attachList}>
        {players.map((player, index) => (
          <div
            key={player.id}
            data-row
            className={styles.row}
            data-dragging={drag.draggingIndex === index || undefined}
            style={{ transform: `translateY(${drag.offsets[index] ?? 0}px)` }}
            onPointerDown={(event) => drag.onRowPointerDown(index, event)}
          >
            <button
              type="button"
              data-handle={player.id}
              className={styles.handle}
              aria-label={`Reorder ${player.name}, position ${index + 1} of ${players.length}`}
              aria-describedby="music-reorder-hint"
              onKeyDown={(event) => {
                // Moves immediately rather than entering a grab mode. Nothing to
                // get stuck in, and nothing to explain beyond the hint above.
                if (event.key === "ArrowUp") move(index, index - 1);
                else if (event.key === "ArrowDown") move(index, index + 1);
                else if (event.key === "Home") move(index, 0);
                else if (event.key === "End") move(index, players.length - 1);
                else return;
                event.preventDefault();
              }}
            >
              <DotsSixVerticalIcon size={18} weight="bold" aria-hidden="true" />
            </button>

            <input
              type="text"
              className={styles.name}
              value={player.name}
              maxLength={24}
              aria-label={`Name of player ${index + 1}`}
              onChange={(event) => update(index, { name: event.target.value })}
            />

            <label className={styles.strikes}>
              <span className={styles.srOnly}>{player.name} letters</span>
              <input
                type="number"
                min={0}
                max={MAX_LETTERS}
                value={player.letters}
                onChange={(event) => {
                  const raw = Number.parseInt(event.target.value, 10);
                  const letters = Number.isFinite(raw)
                    ? Math.min(MAX_LETTERS, Math.max(0, raw))
                    : 0;
                  update(index, { letters });
                }}
              />
              <span className={styles.spelled} aria-hidden="true">
                {word.slice(0, Math.min(player.letters, word.length)) || "—"}
              </span>
            </label>

            <label className={styles.active}>
              <input
                type="checkbox"
                checked={player.active}
                onChange={(event) => update(index, { active: event.target.checked })}
              />
              <span>Playing</span>
            </label>
          </div>
        ))}
      </div>

      {/* A reorder is otherwise completely silent to a screen reader. */}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
