import type { CSSProperties } from "react";
import { config } from "../config";

/**
 * The CSS custom property a bus's label wears.
 *
 * Components never see a color value — they set `--bus-color` and the CSS
 * modules read it, so the palette stays entirely in `tokens.css`. The hue is
 * confined to bus labels (the rack card's name, a track's bus badge); rows,
 * outlines and waveforms keep the single accent.
 */
export function busColorStyle(colorIndex: number): CSSProperties {
  const slot = (colorIndex % config.mix.maxBuses) + 1;
  return { "--bus-color": `var(--color-bus-${slot})` } as CSSProperties;
}
