import { config } from "../config";
import { WEDGES, polar, scallopPath, wedgePath } from "../lib/geometry";
import type { Landing } from "../lib/scoring";
import { GLOW_FILTER_ID } from "./DialDefs";
import styles from "./Wheel.module.css";

const { geometry, palette } = config;

const SCALLOP_PATH = scallopPath(
  geometry.scallopRadius,
  geometry.scallopBumpRadius,
  geometry.scallopCount,
);

/**
 * Glow timing handed to CSS. The pulse runs for a whole number of cycles so it ends
 * on a full-strength beat rather than mid-fade.
 */
const GLOW_STYLE = {
  "--glow-pulse-ms": `${config.reveal.glowPulseMs}ms`,
  "--glow-iterations": Math.max(
    1,
    Math.round(config.reveal.glowDurationMs / config.reveal.glowPulseMs),
  ),
} as React.CSSProperties;

interface WheelProps {
  wheelDeg: number;
  /** Set during the reveal so the scored band can glow. */
  landing: Landing | null;
  /** Changes on every reveal, restarting the glow animation. */
  revealKey: number;
}

/**
 * The target wheel: scalloped plate, plus a band group at each mirrored position.
 *
 * Wedge paths are generated from `config.bands` rather than copied from the design,
 * so scoring and drawing can't disagree — see `lib/geometry.ts`.
 */
export default function Wheel({ wheelDeg, landing, revealKey }: WheelProps) {
  return (
    <g transform={`rotate(${wheelDeg.toFixed(2)})`}>
      <path
        d={SCALLOP_PATH}
        fill={palette.wheelFace}
        stroke={palette.wheelPlateStroke}
        strokeWidth={2}
      />
      <circle
        cx={0}
        cy={0}
        r={geometry.wheelRimRadius}
        fill={palette.wheelFace}
        stroke={palette.wheelRimStroke}
        strokeWidth={2}
      />

      {config.bandGroupsDeg.map((groupDeg) => (
        <g key={groupDeg} transform={`rotate(${groupDeg})`}>
          {WEDGES.map((wedge, index) => {
            const isHit =
              landing?.groupDeg === groupDeg && landing.wedgeIndex === index;

            return (
              <path
                // Remounting on reveal restarts the CSS animation from the top.
                key={isHit ? `${index}-hit-${revealKey}` : index}
                d={wedgePath(wedge.startDeg, wedge.endDeg, geometry.wheelRadius)}
                fill={wedge.fill}
                className={isHit ? styles.hit : undefined}
                filter={isHit ? `url(#${GLOW_FILTER_ID})` : undefined}
                style={isHit ? GLOW_STYLE : undefined}
              />
            );
          })}

          {WEDGES.map((wedge, index) => {
            const at = polar(geometry.bandLabelRadius, wedge.labelDeg);
            return (
              <text
                key={index}
                x={at.x}
                y={at.y}
                textAnchor="middle"
                fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
                fontSize={26}
                fontWeight={600}
                fill={wedge.labelFill}
                // The label rides around with its wedge.
                transform={`rotate(${wedge.labelDeg} ${at.x} ${at.y})`}
              >
                {wedge.score}
              </text>
            );
          })}
        </g>
      ))}
    </g>
  );
}
