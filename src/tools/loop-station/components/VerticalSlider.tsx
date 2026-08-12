"use client";

import { config } from "../config";
import styles from "./VerticalSlider.module.css";

/**
 * A vertical fader with an optional segment meter beside it — the mixer-strip
 * control used by the master panel, buses and expanded track rows. The meter's
 * segments are lit by the root's rAF paint loop via [data-meter]/[data-lit];
 * React only renders the empty shells.
 */
export default function VerticalSlider({
  label,
  caption,
  value,
  onChange,
  meterName,
  max = 100,
  tall = false,
}: {
  label: string;
  /** Tiny caption under the fader (VOL / REV / V / R). */
  caption: string;
  value: number;
  onChange: (value: number) => void;
  /** Renders a paint-driven meter next to the fader. */
  meterName?: string;
  /** Above 100 the fader boosts, and a unity tick is drawn at 100. */
  max?: number;
  tall?: boolean;
}) {
  return (
    <div className={`${styles.strip} ${tall ? styles.tall : ""}`}>
      <div className={styles.column}>
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          aria-label={label}
          className={styles.fader}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {max > 100 && (
          // A fader that can boost needs a findable "no change" point.
          <span
            className={styles.unityTick}
            style={{ bottom: `${(100 / max) * 100}%` }}
            aria-hidden="true"
          />
        )}
        {meterName && (
          <div className={styles.meter} data-meter={meterName} aria-hidden="true">
            {Array.from({ length: config.ui.meterSegments }, (_, i) => (
              <div key={i} className={styles.segment} />
            ))}
          </div>
        )}
      </div>
      <span className={styles.caption}>{caption}</span>
      <span className={styles.readout}>{value}</span>
    </div>
  );
}
