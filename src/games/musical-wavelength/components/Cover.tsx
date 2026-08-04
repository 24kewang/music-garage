import { config } from "../config";
import { coverRimPath, windowPath } from "../lib/geometry";
import type { Tick } from "../lib/modes";
import TickScale from "./TickScale";

const { palette } = config;
const { handle } = config.geometry;

const COVER_PATH = windowPath();
const COVER_EDGE = coverRimPath();

/** Grip lines on the handle, from the design. */
const GRIP_X = [418, 432, 446];

interface CoverProps {
  coverDeg: number;
  /** Empty outside the guessing phase, and in manual mode. */
  ticks: readonly Tick[];
  onHandlePointerDown: (event: React.PointerEvent) => void;
}

/**
 * The lid over the target. Rotates from 0 (closed) to -180 (open); dragging it fully
 * open is what ends a round.
 *
 * Its outline is the *same path* as the window it closes over, so the lid always fills
 * the opening exactly — a gap would show a sliver of the wheel and give the target away.
 *
 * Child order matters: the handle goes down FIRST so the cover body paints over its
 * inner half. That keeps the handle from covering the tick scale, and leaves its
 * visible edge flush with the rim wherever the rim happens to fall.
 */
export default function Cover({ coverDeg, ticks, onHandlePointerDown }: CoverProps) {
  return (
    <g transform={`rotate(${coverDeg.toFixed(2)})`}>
      <g onPointerDown={onHandlePointerDown} style={{ cursor: "grab" }}>
        <rect
          x={handle.x}
          y={handle.y}
          width={handle.width}
          height={handle.height}
          rx={handle.radius}
          fill={palette.coverHandle}
          stroke={palette.coverHandleStroke}
          strokeWidth={2}
        />
        {GRIP_X.map((x) => (
          <rect
            key={x}
            x={x}
            y={-30}
            width={4}
            height={20}
            rx={2}
            fill={palette.coverHandleGrip}
          />
        ))}
      </g>

      <path d={COVER_PATH} fill={palette.cover} />
      <path
        d={COVER_EDGE}
        fill="none"
        stroke={palette.coverHighlight}
        strokeOpacity={0.4}
        strokeWidth={5}
      />

      {ticks.length > 0 && <TickScale ticks={ticks} />}
    </g>
  );
}
