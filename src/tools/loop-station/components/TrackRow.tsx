"use client";

import { useRef, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { config } from "../config";
import { busColorStyle } from "../lib/busColor";
import type { SessionEvent, SessionState, TrackState } from "../lib/session";
import VerticalSlider from "./VerticalSlider";
import styles from "./TrackRow.module.css";

/**
 * One track. Collapsed it is a name, a bus badge and a waveform; it expands on
 * hover, keyboard focus, or selection (click pins it). Selecting a graduated
 * single-repetition track is what arms the record button as an overwrite.
 *
 * A track still inside its spawn loop renders locked: audible in the mix but
 * not selectable or editable, exactly as the recording rules demand.
 */
export default function TrackRow({
  track,
  session,
  peaks,
  overdubbing,
  index,
  dragging,
  dragActive,
  dragOffset,
  draggable,
  onDragPointerDown,
  dispatch,
}: {
  track: TrackState;
  session: SessionState;
  peaks: number[] | undefined;
  /** True while a live overwrite is being recorded onto this track. */
  overdubbing: boolean;
  index: number;
  /** This row is the one being dragged. */
  dragging: boolean;
  /** Some row is being dragged — nothing expands until it is dropped. */
  dragActive: boolean;
  /** Pixels to translate so the destination slot opens. */
  dragOffset: number;
  /** False at or below an in-progress track, which pins everything under it. */
  draggable: boolean;
  onDragPointerDown: (index: number, id: number, event: React.PointerEvent) => void;
  dispatch: (event: SessionEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.name);
  const row = useRef<HTMLDivElement | null>(null);

  const inProgress = track.spawnLoopEndTime !== null;
  const selected = session.selectedTrackId === track.id;
  // Nothing expands while a drag is in flight: it is what the gesture asks for,
  // and it is also what keeps every row a known height for the whole drag.
  const expanded = !inProgress && !dragActive && (hovered || focused || selected);
  const loop = session.loopSeconds ?? 1;
  const bus = session.buses.find((b) => b.id === track.busId);
  const busStyle = busColorStyle(bus?.colorIndex ?? 0);

  const commitName = () => {
    dispatch({ type: "renameTrack", id: track.id, name: draft });
    setEditing(false);
  };

  const bars = peaks ?? new Array<number>(config.ui.waveBars).fill(0);
  const owFrom = track.overwrite ? track.overwrite.startPhase / loop : 0;
  const owTo = track.overwrite ? track.overwrite.endPhase / loop : 0;

  return (
    <div
      ref={row}
      className={`${styles.row} ${expanded ? styles.rowExpanded : ""} ${
        selected ? styles.rowSelected : ""
      } ${inProgress ? styles.rowInProgress : ""} ${overdubbing ? styles.rowOverdub : ""} ${
        dragging ? styles.rowDragging : ""
      } ${draggable ? styles.rowDraggable : ""}`}
      // The dragged row's transform is written straight to the DOM by the drag
      // hook every frame; this only positions the siblings around it.
      style={dragging ? undefined : { transform: `translateY(${dragOffset}px)` }}
      data-track-row
      onPointerDown={(event) => onDragPointerDown(index, track.id, event)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        // Mid-drag: a fader dragged past the row's edge would otherwise collapse
        // the row out from under the pointer. Wait for the button to come up.
        if (event.buttons !== 0) {
          window.addEventListener("pointerup", () => setHovered(false), { once: true });
          return;
        }
        setHovered(false);
        // A control clicked with the pointer keeps focus after the pointer has
        // gone, which used to pin the row open until something else was clicked.
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          row.current?.contains(active) &&
          !active.matches(":focus-visible")
        ) {
          active.blur();
        }
      }}
      onFocus={(event) => {
        // Keyboard focus pins the row open; a pointer click on a control inside
        // it must not. `:focus-visible` is exactly that distinction.
        const target = event.target as HTMLElement;
        if (target.matches?.(":focus-visible")) setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      onClick={(event) => {
        if (inProgress) return;
        const target = event.target as HTMLElement;
        if (target.closest("input, button, select")) return;
        dispatch({ type: "selectTrack", id: track.id });
      }}
      role="button"
      tabIndex={inProgress ? -1 : 0}
      onKeyDown={(event) => {
        if (inProgress) return;
        // Alt+Arrow reordering is a global shortcut keyed off the *selected*
        // track, not handled here: a row keeps DOM focus while the selection
        // arrows past it, so a row-local handler latched onto the wrong track.
        if (event.key === "Enter" && event.target === event.currentTarget) {
          dispatch({ type: "selectTrack", id: track.id });
        }
      }}
      aria-pressed={selected}
      aria-label={`${track.name}, ${index + 1} of ${session.tracks.length}${
        selected ? ", selected" : ""
      }${inProgress ? ", still recording" : ""}${
        selected && draggable ? ". Alt with up or down arrow to reorder." : ""
      }`}
    >
      <div className={styles.main}>
        <div className={styles.head}>
          {editing ? (
            <input
              value={draft}
              autoFocus
              aria-label="Track name"
              className={styles.nameInput}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                setDraft(event.target.value.slice(0, config.ui.trackNameMaxLength))
              }
              onBlur={commitName}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") commitName();
                if (event.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <span
              className={styles.name}
              data-no-drag
              title={inProgress ? undefined : "Double-click to rename"}
              onDoubleClick={(event) => {
                if (inProgress) return;
                event.stopPropagation();
                setDraft(track.name);
                setEditing(true);
              }}
            >
              {track.name}
            </span>
          )}

          {expanded ? (
            <select
              value={track.busId}
              aria-label="Track bus"
              className={styles.busSelect}
              style={busStyle}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                dispatch({ type: "setTrackBus", id: track.id, busId: Number(event.target.value) })
              }
            >
              {session.buses.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.busBadge} style={busStyle} data-no-drag>
              {bus?.name ?? ""}
            </span>
          )}

          {track.reps > 1 && (
            <span className={styles.repsBadge} data-no-drag>
              {track.reps}x
            </span>
          )}
          {inProgress && (
            <span className={styles.recBadge} data-no-drag>
              REC
            </span>
          )}

          <span className={styles.meta} data-no-drag>
            {track.muted && <span className={styles.metaMuted}>MUTED</span>}
            {track.soloed && <span className={styles.metaSolo}>SOLO</span>}
            <span>{session.bars} BARS</span>
          </span>
        </div>

        <div className={styles.wave}>
          {bars.map((p, i) => {
            const f = i / bars.length;
            const inOverwrite = track.overwrite && f >= owFrom && f < owTo;
            return (
              <div
                key={i}
                className={`${styles.waveBar} ${track.muted ? styles.waveBarMuted : ""} ${
                  inOverwrite ? styles.waveBarOverwrite : ""
                }`}
                style={{ height: `${Math.max(6, p * 100)}%` }}
              />
            );
          })}
          {overdubbing && <div className={styles.odLive} data-od-live aria-hidden="true" />}
          <div className={styles.playhead} data-playhead aria-hidden="true" />
        </div>

        {track.overwrite && (
          <div className={styles.owMarker} aria-hidden="true">
            <div
              className={styles.owMarkerBar}
              style={{ left: `${owFrom * 100}%`, width: `${(owTo - owFrom) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className={styles.controls} inert={!expanded}>
        <div className={styles.delayField}>
          <label className={styles.delayLabel}>
            Start
            <span className={styles.delayValue}>{track.delayMs} ms</span>
          </label>
          <input
            type="range"
            min={config.delay.minMs}
            max={config.delay.maxMs}
            step={config.delay.stepMs}
            value={track.delayMs}
            aria-label="Track delay in milliseconds"
            className={styles.delaySlider}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              dispatch({ type: "setTrackDelay", id: track.id, ms: Number(event.target.value) })
            }
          />
        </div>

        {track.overwrite && (
          <div className={`${styles.delayField} ${styles.owField}`}>
            <label className={styles.delayLabel}>
              Overwrite
              <span className={styles.delayValue}>{track.overwrite.delayMs} ms</span>
            </label>
            <div className={styles.owFieldRow}>
              <input
                type="range"
                min={config.delay.minMs}
                max={config.delay.maxMs}
                step={config.delay.stepMs}
                value={track.overwrite.delayMs}
                aria-label="Overwrite delay in milliseconds"
                className={styles.delaySlider}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  dispatch({
                    type: "setOverwriteDelay",
                    id: track.id,
                    ms: Number(event.target.value),
                  })
                }
              />
              <button
                type="button"
                className={styles.owDelete}
                aria-label="Delete the overwrite"
                onClick={(event) => {
                  event.stopPropagation();
                  dispatch({ type: "deleteOverwrite", id: track.id });
                }}
              >
                <TrashIcon size={14} weight="bold" />
              </button>
            </div>
          </div>
        )}

        <div className={styles.mixControls}>
          <div className={styles.muteSolo}>
            <button
              type="button"
              className={`${styles.toggle} ${track.muted ? styles.toggleMuteOn : ""}`}
              aria-pressed={track.muted}
              title="Mute"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "toggleTrackMute", id: track.id });
              }}
            >
              M
            </button>
            <button
              type="button"
              className={`${styles.toggle} ${track.soloed ? styles.toggleSoloOn : ""}`}
              aria-pressed={track.soloed}
              title="Solo"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "toggleTrackSolo", id: track.id });
              }}
            >
              S
            </button>
          </div>
          <div className={styles.levels}>
            <div className={styles.levelFaders}>
              <VerticalSlider
                label={`${track.name} volume`}
                caption="V"
                value={track.volume}
                onChange={(value) => dispatch({ type: "setTrackVolume", id: track.id, value })}
              />
              <VerticalSlider
                label={`${track.name} reverb`}
                caption="R"
                value={track.reverb}
                onChange={(value) => dispatch({ type: "setTrackReverb", id: track.id, value })}
              />
            </div>
            <button
              type="button"
              className={styles.setDefault}
              title="Use this track's volume and reverb for new recordings"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "adoptTrackDefaults", id: track.id });
              }}
            >
              Set as default
            </button>
          </div>
          <button
            type="button"
            className={styles.deleteTrack}
            aria-label={`Delete ${track.name}`}
            onClick={(event) => {
              event.stopPropagation();
              dispatch({ type: "deleteTrack", id: track.id });
            }}
          >
            <TrashIcon size={15} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
