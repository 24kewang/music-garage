/**
 * Steps 4 and 5: join the voiced frames into one contour, then smooth it.
 *
 * The unvoiced frames are dropped rather than held as gaps, so an index into the
 * contour counts *voiced* time, not wall-clock time. That is deliberate and it is
 * the whole reason rhythm plays no part in this game: a rest carries no meaning
 * here, and a gap must not be allowed to re-articulate a repeated note.
 *
 * Each point keeps the clock time it came from anyway — not for the pipeline, which
 * never reads it, but for the debug artifacts, which are what make a threshold
 * argument settleable.
 */

import type { Frame } from "./track";

export interface ContourPoint {
  midi: number;
  /** Where in the original recording this reading came from, in seconds. */
  time: number;
}

/** Drop every unvoiced frame and join what is left. */
export function concatenate(frames: readonly Frame[]): ContourPoint[] {
  const points: ContourPoint[] = [];
  for (const frame of frames) {
    if (frame.midi === null) continue;
    points.push({ midi: frame.midi, time: frame.time });
  }
  return points;
}

/** The middle value of `values`, which is mutated in place by the sort. */
function medianOf(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

/**
 * Median filter over a sliding window, edges clamped.
 *
 * A **median**, never a mean — the failure this exists to catch is the detector
 * reporting a lone frame an octave out, and a mean would smear that across the
 * whole kernel instead of discarding it.
 *
 * The kernel is short by design (see `config.transcribe.medianMs`). A kernel long
 * enough to suppress vibrato would also be longer than the shortest note the
 * pipeline is meant to keep, and would erase short notes outright. Vibrato is dealt
 * with by the slope window and the per-segment median instead.
 */
export function medianFilter(
  points: readonly ContourPoint[],
  kernel: number,
): ContourPoint[] {
  const width = Math.max(1, kernel % 2 === 0 ? kernel + 1 : kernel);
  if (width === 1 || points.length === 0) return points.map((point) => ({ ...point }));

  const radius = (width - 1) / 2;
  const last = points.length - 1;

  return points.map((point, index) => {
    // Truncated at the edges, not clamped. Clamping pads the window with copies of
    // the edge value, so a spike sitting *on* the first frame outvotes its
    // neighbours and survives — and the first frame is exactly where an attack
    // transient puts one. Truncating lets the real readings win.
    const from = Math.max(0, index - radius);
    const to = Math.min(last, index + radius);

    const window: number[] = [];
    for (let at = from; at <= to; at++) window.push(points[at].midi);

    return { midi: medianOf(window), time: point.time };
  });
}

/** Points per millisecond of voiced contour, for turning a config value into a kernel. */
export function pointsForMs(ms: number, hopMs: number): number {
  return Math.max(1, Math.round(ms / hopMs));
}
