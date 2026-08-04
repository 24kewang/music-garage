import { config } from "../config";
import type { Phase } from "../lib/useDial";
import type { NeedleMode } from "../lib/settings";
import { needsMicrophone } from "../lib/settings";
import { BUTTON_GRADIENT_ID } from "./DialDefs";

const { geometry, palette } = config;

/** Highlight arc across the top-left of the button, from the design. */
const HIGHLIGHT = "M -52 -14 A 54 54 0 0 1 -14 -52";

const SHACKLE_CLOSED = "M -8 -3 V -14 a 8 8 0 0 1 16 0 V -3";
/** Open padlock: the shackle has swung up and clear of the body. */
const SHACKLE_OPEN = "M 5 -3 V -15 a 8 8 0 0 1 16 0 V -11";

interface CenterButtonProps {
  phase: Phase;
  mode: NeedleMode;
  locked: boolean;
  /** Points scored, shown during the reveal. */
  score: number | null;
  onClick: () => void;
}

/**
 * The button at the hub. Its job changes with the phase: start the round, hold the
 * needle, or report the score.
 */
export default function CenterButton({
  phase,
  mode,
  locked,
  score,
  onClick,
}: CenterButtonProps) {
  const isLockToggle = phase === "guess" && needsMicrophone(mode);
  const isInteractive = phase === "setup" || isLockToggle;

  const label = phase === "setup" ? "Start the round" : isLockToggle
    ? locked
      ? "Unlock the needle"
      : "Lock the needle"
    : score !== null
      ? `Scored ${score}`
      : "Aim the needle";

  return (
    <g
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={
        isInteractive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={isInteractive ? "button" : "img"}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={label}
      style={{ cursor: isInteractive ? "pointer" : "default" }}
    >
      <circle cx={0} cy={0} r={geometry.buttonRadius} fill={`url(#${BUTTON_GRADIENT_ID})`} />
      <circle
        cx={0}
        cy={0}
        r={geometry.buttonRingRadius}
        fill="none"
        stroke={palette.buttonRing}
        strokeWidth={3}
        strokeOpacity={0.55}
      />
      <path
        d={HIGHLIGHT}
        fill="none"
        stroke={palette.coverHighlight}
        strokeOpacity={0.5}
        strokeWidth={4}
        strokeLinecap="round"
      />

      <g style={{ pointerEvents: "none" }}>
        {phase === "setup" && (
          <text
            x={0}
            y={7}
            textAnchor="middle"
            fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
            fontSize={16}
            fontWeight={700}
            letterSpacing={1.5}
            fill={palette.buttonLabel}
          >
            START
          </text>
        )}

        {isLockToggle && <Padlock locked={locked} />}

        {phase === "reveal" && score !== null && (
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="ui-monospace, 'SF Mono', Menlo, monospace"
            fontSize={40}
            fontWeight={700}
            fill={palette.buttonLabel}
          >
            {score}
          </text>
        )}

        {/* Manual aiming leaves the button blank, as specified. */}
      </g>
    </g>
  );
}

function Padlock({ locked }: { locked: boolean }) {
  return (
    <g>
      <path
        d={locked ? SHACKLE_CLOSED : SHACKLE_OPEN}
        fill="none"
        stroke={palette.buttonLabel}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <rect
        x={-14}
        y={-3}
        width={28}
        height={22}
        rx={3}
        fill={palette.buttonLabel}
      />
      <circle cx={0} cy={8} r={3} fill={palette.buttonHighlight} />
    </g>
  );
}
