import { config } from "../config";

const { palette, reveal } = config;

/** Speckle dots, as fractions of the 74×74 tile — straight from the design. */
const SPECKLES = [
  { cx: 9, cy: 14, r: 1.5, light: false, opacity: 0.85 },
  { cx: 41, cy: 6, r: 0.9, light: false, opacity: 0.6 },
  { cx: 63, cy: 27, r: 1.7, light: true, opacity: 0.8 },
  { cx: 26, cy: 38, r: 1.1, light: false, opacity: 0.7 },
  { cx: 52, cy: 55, r: 1.4, light: true, opacity: 0.75 },
  { cx: 14, cy: 64, r: 0.8, light: false, opacity: 0.55 },
  { cx: 35, cy: 70, r: 1.6, light: true, opacity: 0.7 },
  { cx: 70, cy: 47, r: 1, light: false, opacity: 0.6 },
];

export const SPECKLE_ID = "wl-speckle";
export const BUTTON_GRADIENT_ID = "wl-btn";
export const GLOW_FILTER_ID = "wl-glow";

/** Shared paint servers for the dial. */
export default function DialDefs() {
  return (
    <defs>
      <pattern id={SPECKLE_ID} width="74" height="74" patternUnits="userSpaceOnUse">
        {SPECKLES.map((speckle, index) => (
          <circle
            key={index}
            cx={speckle.cx}
            cy={speckle.cy}
            r={speckle.r}
            fill={speckle.light ? palette.speckleLight : palette.speckleDark}
            opacity={speckle.opacity}
          />
        ))}
      </pattern>

      <radialGradient id={BUTTON_GRADIENT_ID} cx="38%" cy="30%" r="78%">
        <stop offset="0%" stopColor={palette.buttonHighlight} />
        <stop offset="62%" stopColor={palette.buttonMid} />
        <stop offset="100%" stopColor={palette.buttonShadow} />
      </radialGradient>

      {/* Bloom for the band the needle landed on. */}
      <filter id={GLOW_FILTER_ID} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={reveal.glowBlur} result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
