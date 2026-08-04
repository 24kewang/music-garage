import { config } from "../config";
import { discPath, windowPath } from "../lib/geometry";
import { SPECKLE_ID } from "./DialDefs";

const { geometry, palette } = config;
const { base, housingRadius } = geometry;

/** The trapezoid the dial sits in. */
const BASE_PATH = `M ${-base.topHalfWidth} 0 L ${base.topHalfWidth} 0 L ${
  base.bottomHalfWidth
} ${base.depth} L ${-base.bottomHalfWidth} ${base.depth} Z`;

/**
 * The faceplate ring: the outer disc with the window punched out of it by the even-odd
 * rule. The window comes from the same function the cover fills with, so the opening
 * and the lid are the same shape by construction.
 */
const RING_PATH = `${discPath(housingRadius)} ${windowPath()}`;

/** Inner bevel highlights on either side of the window. */
const BEZEL_LEFT = "M -318 0 A 318 318 0 0 0 -286 143 L -296 154 A 330 330 0 0 1 -330 0 Z";
const BEZEL_RIGHT = "M 318 0 A 318 318 0 0 1 286 143 L 296 154 A 330 330 0 0 0 330 0 Z";

/**
 * The dark faceplate the wheel sits behind: a trapezoid below, and a ring above with
 * the upper semicircle punched out to form the window. Both get a speckle overlay.
 *
 * The trapezoid needs no punching of its own — it lives entirely at y ≥ 0 and the
 * window entirely at y ≤ 0, so it can never intrude into the opening.
 */
export default function Housing() {
  return (
    <>
      <path d={BASE_PATH} fill={palette.housing} />
      <path d={BASE_PATH} fill={`url(#${SPECKLE_ID})`} />

      <path d={RING_PATH} fillRule="evenodd" fill={palette.housing} />
      <path d={RING_PATH} fillRule="evenodd" fill={`url(#${SPECKLE_ID})`} />

      <path d={BEZEL_LEFT} fill={palette.bezelShade} opacity={0.45} />
      <path d={BEZEL_RIGHT} fill={palette.bezelShade} opacity={0.25} />
    </>
  );
}
