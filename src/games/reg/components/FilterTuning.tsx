"use client";

import { useId } from "react";
import { config } from "../config";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";
import styles from "./FilterTuning.module.css";

/**
 * The Filter tab: where the box sits above the head, and how big it is.
 *
 * Every slider writes on each input event so the filter follows the drag live — the
 * panel sits over the camera feed, so tuning is done by watching, not by numbers.
 */
export default function FilterTuning({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const captionId = useId();
  const isDefault =
    settings.offsetX === DEFAULT_SETTINGS.offsetX &&
    settings.offsetY === DEFAULT_SETTINGS.offsetY &&
    settings.offsetZ === DEFAULT_SETTINGS.offsetZ &&
    settings.scalePercent === DEFAULT_SETTINGS.scalePercent &&
    settings.showCaption === DEFAULT_SETTINGS.showCaption;

  return (
    <div className={styles.root}>
      <Slider
        label="Left / right"
        bounds={config.tuning.offsetX}
        value={settings.offsetX}
        format={formatOffset}
        onChange={(offsetX) => onChange({ ...settings, offsetX })}
      />
      <Slider
        label="Up / down"
        bounds={config.tuning.offsetY}
        value={settings.offsetY}
        format={formatOffset}
        onChange={(offsetY) => onChange({ ...settings, offsetY })}
      />
      <Slider
        label="Near / far"
        bounds={config.tuning.offsetZ}
        value={settings.offsetZ}
        format={formatOffset}
        onChange={(offsetZ) => onChange({ ...settings, offsetZ })}
      />
      <Slider
        label="Size"
        bounds={config.tuning.scalePercent}
        value={settings.scalePercent}
        format={(value) => `${value}%`}
        onChange={(scalePercent) => onChange({ ...settings, scalePercent })}
      />

      <p className={styles.hint}>
        Position is measured in face widths, so the box keeps its place as you move
        closer or further away.
      </p>

      <div className={styles.field}>
        <div className={styles.checkbox}>
          <input
            id={captionId}
            type="checkbox"
            checked={settings.showCaption}
            onChange={(event) =>
              onChange({ ...settings, showCaption: event.target.checked })
            }
          />
          <label htmlFor={captionId}>Show excerpt name</label>
        </div>
        <p className={styles.hint}>
          The name under the excerpt, in the filter and in the enlarged view.
        </p>
      </div>

      <button
        type="button"
        className={styles.reset}
        disabled={isDefault}
        onClick={() => onChange({ ...DEFAULT_SETTINGS })}
      >
        Reset to defaults
      </button>
    </div>
  );
}

function Slider({
  label,
  bounds,
  value,
  format,
  onChange,
}: {
  label: string;
  bounds: { min: number; max: number; step: number };
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <output className={styles.value} htmlFor={id}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className={styles.slider}
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </div>
  );
}

/** Two decimals, but without a trailing "0.00" reading as more precision than it is. */
function formatOffset(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}
