import { config } from "../config";
import { polar } from "../lib/geometry";
import type { Tick } from "../lib/modes";

const { ticks: tickConfig } = config;

/**
 * The scale the needle reads against in pitch and intonation modes.
 *
 * Drawn inside the cover group, so it swings away with the lid when the cover opens
 * and the target bands are revealed. Tick angles come from the same functions that
 * position the needle, so a tick labelled A4 is exactly where A4 lands.
 */
export default function TickScale({ ticks }: { ticks: readonly Tick[] }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {ticks.map((tick, index) => {
        const length = tick.major ? tickConfig.majorLength : tickConfig.minorLength;
        const outer = polar(tickConfig.outerRadius, tick.deg);
        const inner = polar(tickConfig.outerRadius - length, tick.deg);

        return (
          <line
            key={index}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            stroke={tick.major ? tickConfig.majorColor : tickConfig.minorColor}
            strokeWidth={tick.major ? tickConfig.majorWidth : tickConfig.minorWidth}
            strokeLinecap="round"
          />
        );
      })}

      {ticks.map((tick, index) => {
        if (!tick.label) return null;
        const at = polar(tickConfig.labelRadius, tick.deg);

        return (
          <text
            key={`label-${index}`}
            x={at.x}
            y={at.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
            fontSize={tickConfig.labelSize}
            fontWeight={600}
            fill={tickConfig.labelColor}
            // Labels stand upright along the radius, like the band numbers.
            transform={`rotate(${tick.deg} ${at.x} ${at.y})`}
          >
            {tick.label}
          </text>
        );
      })}
    </g>
  );
}
