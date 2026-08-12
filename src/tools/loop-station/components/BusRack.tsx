"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { config } from "../config";
import { busColorStyle } from "../lib/busColor";
import type { BusState, SessionEvent, SessionState } from "../lib/session";
import VerticalSlider from "./VerticalSlider";
import styles from "./BusRack.module.css";

/**
 * The bus rack. The selected bus is where new recordings land; each bus has
 * volume, a reverb send, mute, a rename, and (except the first) a delete.
 */
export default function BusRack({
  session,
  dispatch,
}: {
  session: SessionState;
  dispatch: (event: SessionEvent) => void;
}) {
  return (
    <section className={styles.rack} aria-label="Buses">
      <div className={styles.head}>
        <span className={styles.eyebrow}>Buses</span>
        <button
          type="button"
          className={styles.addButton}
          disabled={session.buses.length >= config.mix.maxBuses}
          onClick={() => dispatch({ type: "addBus" })}
        >
          <PlusIcon size={12} weight="bold" aria-hidden="true" />
          Add bus
        </button>
      </div>
      <p className={styles.hint}>
        New recordings land on the selected bus. Each bus&apos; colour tags its tracks.
      </p>
      <div className={styles.cards}>
        {session.buses.map((bus, index) => (
          <BusCard
            key={bus.id}
            bus={bus}
            selected={session.selectedBusId === bus.id}
            deletable={index > 0}
            dispatch={dispatch}
          />
        ))}
      </div>
    </section>
  );
}

function BusCard({
  bus,
  selected,
  deletable,
  dispatch,
}: {
  bus: BusState;
  selected: boolean;
  deletable: boolean;
  dispatch: (event: SessionEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bus.name);

  const commitName = () => {
    dispatch({ type: "renameBus", id: bus.id, name: draft });
    setEditing(false);
  };

  return (
    <div
      className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
      style={busColorStyle(bus.colorIndex)}
    >
      <div className={styles.cardHead}>
        {editing ? (
          <input
            value={draft}
            autoFocus
            aria-label="Bus name"
            className={styles.nameInput}
            onChange={(event) =>
              setDraft(event.target.value.slice(0, config.ui.busNameMaxLength))
            }
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitName();
              if (event.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className={styles.name}
            title="Click to select · double-click to rename"
            aria-pressed={selected}
            onClick={() => dispatch({ type: "selectBus", id: bus.id })}
            onDoubleClick={() => {
              setDraft(bus.name);
              setEditing(true);
            }}
          >
            {bus.name}
          </button>
        )}
        {deletable && (
          <button
            type="button"
            className={styles.delete}
            aria-label={`Delete ${bus.name}`}
            onClick={() => dispatch({ type: "deleteBus", id: bus.id })}
          >
            <TrashIcon size={12} weight="bold" />
          </button>
        )}
      </div>

      <div className={styles.faders}>
        <VerticalSlider
          label={`${bus.name} volume`}
          caption="V"
          value={bus.volume}
          meterName={`bus-${bus.id}`}
          onChange={(value) => dispatch({ type: "setBusVolume", id: bus.id, value })}
        />
        <VerticalSlider
          label={`${bus.name} reverb`}
          caption="R"
          value={bus.reverb}
          onChange={(value) => dispatch({ type: "setBusReverb", id: bus.id, value })}
        />
      </div>

      <div className={styles.cardFoot}>
        <button
          type="button"
          className={`${styles.mute} ${bus.muted ? styles.muteOn : ""}`}
          aria-pressed={bus.muted}
          title={`Mute ${bus.name}`}
          onClick={() => dispatch({ type: "toggleBusMute", id: bus.id })}
        >
          M
        </button>
      </div>
    </div>
  );
}
