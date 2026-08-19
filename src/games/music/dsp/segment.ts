/**
 * Steps 6–8: find the held notes in a smoothed contour, and throw away the ones
 * that turn out to be a slide passing through.
 *
 * The design doc phrases step 6 as "regions where the derivative is near zero", and
 * that is the right *intent* but not an implementation that survives real input. A
 * frame-to-frame difference reads the instantaneous vibrato slope — half a semitone
 * at five and a half hertz peaks around seventeen semitones per second, so every
 * sustained note reads as a glide. A least-squares slope over a window does not fix
 * it either: the regression slope of a sine over one period is only zero at one
 * particular phase, not in general.
 *
 * What is actually stable about a held note is that it *stays put*. So a run extends
 * while the contour remains within a band of the pitch the run started at, and the
 * anchor is fixed once from the run's opening frames rather than tracking. Both
 * halves matter:
 *
 * - **A band, not a derivative**, so vibrato inside the band is simply ignored.
 * - **A fixed anchor, not a running one**, because a running median drifts along
 *   with a slow portamento and swallows the entire slide into one "note". Anchored,
 *   a glide leaves the band after it has travelled `tolerance` semitones, however
 *   slowly it got there.
 *
 * **This stage expects an already-smoothed contour** — step 5's median filter, with
 * a kernel around one vibrato period. The band tolerates vibrato that is centred on
 * the anchor, but the anchor is taken from the run's opening frames, and on a raw
 * contour those frames can land anywhere in the swing and push the whole band off to
 * one side. The median filter is what puts the anchor in the middle of the vibrato
 * rather than on its edge; a median is used rather than a mean precisely because it
 * does that without also rounding off the step between two notes.
 */

import type { ContourPoint } from "./contour";

export interface Segment {
  /** Half-open range into the contour. */
  startIndex: number;
  endIndex: number;
  /** Median MIDI over the run — still continuous; rounding happens at step 9. */
  midi: number;
  /** Length in seconds of *voiced* contour, which is what the duration gates use. */
  seconds: number;
  /** Clock times from the original recording, kept for the debug view only. */
  startTime: number;
  endTime: number;
}

export interface SegmentOptions {
  /** Seconds of voiced contour per point. */
  hopSeconds: number;
  /**
   * How far the contour may stray from the run's anchor and still count as the same
   * note, in semitones.
   *
   * Must sit above the vibrato depth it has to tolerate and below a semitone, so it
   * can never merge two neighbouring notes. Sung vibrato routinely reaches ±50 cents
   * and strings ±30, which is why this is not the ±0.5 that "same rounded pitch"
   * would imply.
   */
  toleranceSemitones: number;
  /** Opening frames the anchor is taken from. */
  anchorPoints: number;
  /**
   * Consecutive out-of-band points needed to end a run. One stray frame is a
   * consonant, a bow change or a bad reading — not a note boundary.
   */
  breakPoints: number;
  /** Shortest run that counts as a note. */
  minSeconds: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function midisIn(points: readonly ContourPoint[], start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(points[i].midi);
  return out;
}

/** Split the contour into runs that hold still, before any duration filtering. */
export function findRuns(
  points: readonly ContourPoint[],
  options: SegmentOptions,
): { start: number; end: number }[] {
  if (points.length === 0) return [];

  const { toleranceSemitones, anchorPoints, breakPoints } = options;
  const runs: { start: number; end: number }[] = [];

  let start = 0;
  let anchor = points[0].midi;
  let out = 0;

  for (let i = 1; i <= points.length; i++) {
    if (i === points.length) {
      // The tail out-of-band points, if any, belong to nothing — they were the
      // beginning of a move that the recording ended in the middle of.
      runs.push({ start, end: points.length - out });
      break;
    }

    // Still establishing the anchor: take it as the median of what the run has so
    // far, so one bad opening frame cannot set the band in the wrong place.
    if (i - start < anchorPoints) {
      anchor = median(midisIn(points, start, i + 1));
      out = 0;
      continue;
    }

    if (Math.abs(points[i].midi - anchor) <= toleranceSemitones) {
      out = 0;
      continue;
    }

    out++;
    if (out < breakPoints) continue;

    // The run ended where the departure began, not where it was confirmed.
    const end = i - out + 1;
    runs.push({ start, end });

    start = end;
    anchor = points[start].midi;
    out = 0;
    // Re-run from the new start so its anchor is established the same way.
    i = start;
  }

  return runs.filter((run) => run.end > run.start);
}

/** Steps 6 and 7 together: the runs that hold still *and* last long enough. */
export function findSegments(
  points: readonly ContourPoint[],
  options: SegmentOptions,
): Segment[] {
  return findRuns(points, options)
    .map(({ start, end }) => ({
      startIndex: start,
      endIndex: end,
      midi: median(midisIn(points, start, end)),
      seconds: (end - start) * options.hopSeconds,
      startTime: points[start].time,
      endTime: points[end - 1].time,
    }))
    .filter((segment) => segment.seconds >= options.minSeconds);
}

export interface GlideOptions {
  /** A segment longer than this is a note whatever its neighbours are doing. */
  maxSeconds: number;
  /** …and its neighbours must be at least this far apart for it to be a passing tone. */
  minSpanSemitones: number;
}

/**
 * Step 8: drop the leftovers of a portamento.
 *
 * A slide that paused briefly on its way leaves a short segment sitting strictly
 * between its neighbours and continuing their direction of travel. That is a
 * passing tone, not a note somebody meant.
 *
 * Three guards keep this from eating real music. It only fires on a **short**
 * segment, only when the neighbours are far enough apart that something had to
 * happen in between, and only when it is **strictly** between them and moving the
 * same way — so an upper neighbour tone, or a real note that happens to be brief,
 * survives. The pass repeats, because a two-step scoop leaves two intermediates and
 * removing the first exposes the second.
 */
export function dropGlides(
  segments: readonly Segment[],
  options: GlideOptions,
): Segment[] {
  let current = [...segments];

  for (;;) {
    const next = current.filter((segment, index) => {
      const before = current[index - 1];
      const after = current[index + 1];
      if (!before || !after) return true;
      if (segment.seconds >= options.maxSeconds) return true;

      const low = Math.min(before.midi, after.midi);
      const high = Math.max(before.midi, after.midi);
      if (high - low < options.minSpanSemitones) return true;

      return !(segment.midi > low && segment.midi < high);
    });

    if (next.length === current.length) return next;
    current = next;
  }
}
