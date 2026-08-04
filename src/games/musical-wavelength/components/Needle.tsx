import { config } from "../config";

const { geometry, palette } = config;

/** The pointer. Drawn above the housing so it reads over the cover and the bands. */
export default function Needle({ needleDeg }: { needleDeg: number }) {
  return (
    <g transform={`rotate(${needleDeg.toFixed(2)})`} style={{ pointerEvents: "none" }}>
      {/* Offset copy, lifting the needle off the face. */}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-geometry.needleLength}
        stroke={palette.needleShadow}
        strokeOpacity={0.3}
        strokeWidth={9}
        strokeLinecap="round"
        transform="translate(4,5)"
      />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-geometry.needleLength}
        stroke={palette.needle}
        strokeWidth={8}
        strokeLinecap="round"
      />
    </g>
  );
}
