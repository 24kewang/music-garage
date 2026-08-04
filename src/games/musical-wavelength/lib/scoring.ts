/**
 * Where the needle landed.
 *
 * Both mirrored band groups have to be tested: the wheel spins freely, so an
 * arbitrary angle can bring either group under the needle.
 */

import { config } from "../config";
import { norm, WEDGES } from "./geometry";

export interface Landing {
  /** Points scored. */
  score: number;
  /** Which mirrored group was hit — needed to aim the reveal glow. */
  groupDeg: number;
  /** Index into WEDGES of the specific wedge hit. */
  wedgeIndex: number;
}

/**
 * Score the needle against the wheel, or `null` if it missed every band.
 *
 * Angles are absolute dial degrees; the wheel's rotation is subtracted to get the
 * needle's position relative to the target.
 */
export function scoreAt(needleDeg: number, wheelDeg: number): Landing | null {
  for (const groupDeg of config.bandGroupsDeg) {
    const relative = norm(needleDeg - wheelDeg - groupDeg);

    const wedgeIndex = WEDGES.findIndex(
      (wedge) => relative >= wedge.startDeg && relative <= wedge.endDeg,
    );

    if (wedgeIndex !== -1) {
      return { score: WEDGES[wedgeIndex].score, groupDeg, wedgeIndex };
    }
  }

  return null;
}

/** The best score available, used to decide whether to celebrate. */
export const MAX_SCORE = Math.max(...config.bands.map((band) => band.score));

/** Points for a landing, treating a miss as zero. */
export function scoreValue(landing: Landing | null): number {
  return landing?.score ?? 0;
}
