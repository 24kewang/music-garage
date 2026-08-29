import type { AlignStep, Op } from "../score/align";

/**
 * Geometry for the failure graph — two step functions, one over the other.
 *
 * Pure and tested, so the fiddly parts are checkable rather than only inspectable by
 * losing a round and squinting at the dialog.
 *
 * Two decisions do most of the work here.
 *
 * **The x axis is indexed by the alignment path, not by the target sequence.** Every
 * step gets identical width — evenly spaced, as the brief asks — but an inserted note
 * then occupies real width instead of being wedged into a boundary. The consequence
 * is the good bit: a missed note leaves a *gap* in the attempt's line and an extra
 * one leaves a gap in the target's, so both kinds of error are legible with the
 * colors ignored entirely.
 *
 * **The y range comes from the target alone**, with the attempt clamped into it.
 * Fitting the range to both would let one note sung two octaves out squash the real
 * phrase into a flat sliver; clamping instead pins that note to the edge, which reads
 * correctly as "far too high" while the interesting part stays readable.
 */

export interface Cell {
  x0: number;
  x1: number;
  y: number;
  /** True when the pitch fell outside the drawn range and was pinned to an edge. */
  clamped: boolean;
}

export interface GraphGeometry {
  /** One entry per alignment step; `null` where the attempt inserted a note. */
  target: (Cell | null)[];
  /** One entry per alignment step; `null` where the attempt missed one. */
  attempt: (Cell | null)[];
  /** Parallel to both, so the renderer can color each cell. */
  ops: Op[];
}

export interface GraphOptions {
  width: number;
  height: number;
  padY: number;
  /**
   * Semitones shown even when the phrase covers less than that.
   *
   * Without a floor a unison phrase divides by zero, and a two-semitone phrase gets
   * stretched to fill the panel and reads as far more dramatic than it was.
   */
  minSpanSemitones: number;
}

export const EMPTY_GEOMETRY: GraphGeometry = { target: [], attempt: [], ops: [] };

export function buildGraph(
  target: readonly number[],
  shifted: readonly number[],
  steps: readonly AlignStep[],
  options: GraphOptions,
): GraphGeometry {
  if (steps.length === 0) return EMPTY_GEOMETRY;

  const { width, height, padY, minSpanSemitones } = options;

  // Range from the target. An empty target has no shape to show, so borrow the
  // attempt's rather than dividing by zero.
  const reference = target.length > 0 ? target : shifted;
  const low = reference.length > 0 ? Math.min(...reference) : 0;
  const high = reference.length > 0 ? Math.max(...reference) : 0;
  const middle = (low + high) / 2;
  const span = Math.max(high - low, minSpanSemitones);
  const top = middle + span / 2;
  const inner = height - 2 * padY;

  const place = (midi: number): { y: number; clamped: boolean } => {
    const raw = padY + ((top - midi) / span) * inner;
    const y = Math.min(height, Math.max(0, raw));
    return { y, clamped: y !== raw };
  };

  const step = width / steps.length;

  const cellFor = (index: number, midi: number | undefined): Cell | null => {
    if (midi === undefined) return null;
    const { y, clamped } = place(midi);
    return { x0: index * step, x1: (index + 1) * step, y, clamped };
  };

  return {
    target: steps.map((s, index) =>
      cellFor(index, s.targetIndex >= 0 ? target[s.targetIndex] : undefined),
    ),
    attempt: steps.map((s, index) =>
      cellFor(index, s.attemptIndex >= 0 ? shifted[s.attemptIndex] : undefined),
    ),
    ops: steps.map((s) => s.op),
  };
}

/**
 * The graph in words, for the `aria-label`.
 *
 * The picture is not the only way to learn what went wrong — a screen reader gets
 * the same account, and it is the account the dialog's heading is built from too.
 */
export function describeAlignment(steps: readonly AlignStep[]): string {
  if (steps.length === 0) return "Nothing to compare.";

  const count = (op: Op) => steps.filter((s) => s.op === op).length;
  const matched = count("match");
  const notes = steps.filter((s) => s.targetIndex >= 0).length;

  const parts = [`${matched} of ${notes} notes matched`];
  if (count("sub") > 0) parts.push(`${count("sub")} wrong`);
  if (count("del") > 0) parts.push(`${count("del")} missed`);
  if (count("ins") > 0) parts.push(`${count("ins")} extra`);

  return `${parts.join(", ")}.`;
}
