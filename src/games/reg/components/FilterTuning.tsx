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
  useCamera,
  cameraBusy,
  onUseCameraChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  /** Session state, not a stored setting — see lib/settings.ts. */
  useCamera: boolean;
  /** The camera is starting; switching back now would tear down a half-built scene. */
  cameraBusy: boolean;
  onUseCameraChange: (useCamera: boolean) => void;
}) {
  const captionId = useId();
  const cameraLabelId = useId();
  const isDefault =
    settings.offsetX === DEFAULT_SETTINGS.offsetX &&
    settings.offsetY === DEFAULT_SETTINGS.offsetY &&
    settings.offsetZ === DEFAULT_SETTINGS.offsetZ &&
    settings.scalePercent === DEFAULT_SETTINGS.scalePercent &&
    settings.showCaption === DEFAULT_SETTINGS.showCaption;

  // Nothing to position against without a head to track, so the offsets go quiet —
  // greyed rather than hidden, so the tab keeps its shape as the mode flips.
  const positional = !useCamera;

  return (
    <div className={styles.root}>
      <div className={styles.switchField}>
        <span className={styles.label} id={cameraLabelId}>
          Camera mode
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={useCamera}
          aria-labelledby={cameraLabelId}
          className={styles.switch}
          disabled={cameraBusy}
          onClick={() => onUseCameraChange(!useCamera)}
        >
          <span className={styles.switchThumb} />
        </button>
      </div>

      <div className={styles.divider} />

      <Slider
        label="Left / right"
        bounds={config.tuning.offsetX}
        value={settings.offsetX}
        format={formatOffset}
        disabled={positional}
        onChange={(offsetX) => onChange({ ...settings, offsetX })}
      />
      <Slider
        label="Up / down"
        bounds={config.tuning.offsetY}
        value={settings.offsetY}
        format={formatOffset}
        disabled={positional}
        onChange={(offsetY) => onChange({ ...settings, offsetY })}
      />
      <Slider
        label="Near / far"
        bounds={config.tuning.offsetZ}
        value={settings.offsetZ}
        format={formatOffset}
        disabled={positional}
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
        {positional
          ? "Position only applies to the camera filter. Size scales the excerpt and its name."
          : "Position is measured in face widths, so the box keeps its place as you move closer or further away."}
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
  disabled = false,
  onChange,
}: {
  label: string;
  bounds: { min: number; max: number; step: number };
  value: number;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();

  return (
    <div className={`${styles.field} ${disabled ? styles.fieldDisabled : ""}`}>
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
        disabled={disabled}
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
