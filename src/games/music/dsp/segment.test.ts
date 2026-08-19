import { describe, expect, it } from "vitest";
import { medianFilter, type ContourPoint } from "./contour";
import { dropGlides, findSegments, type Segment, type SegmentOptions } from "./segment";

const OPTIONS: SegmentOptions = {
  hopSeconds: 0.01,
  toleranceSemitones: 0.7,
  anchorPoints: 5,
  breakPoints: 3,
  minSeconds: 0.08,
};

/** A held note: `count` points all at `midi`. */
function held(midi: number, count: number): number[] {
  return Array.from({ length: count }, () => midi);
}

/** A linear slide from `from` to `to` across `count` points. */
function slide(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + ((to - from) * (i + 1)) / count);
}

/** A held note with vibrato of `depth` semitones at 5.5 Hz. */
function vibrato(midi: number, count: number, depth: number): number[] {
  return Array.from(
    { length: count },
    (_, i) => midi + depth * Math.sin(2 * Math.PI * 5.5 * i * 0.01),
  );
}

/**
 * A contour as `findSegments` actually receives it — step 5's median filter has
 * already run. Thirteen points is 130 ms, near one vibrato period.
 */
const contour = (midis: readonly number[]): ContourPoint[] =>
  medianFilter(
    midis.map((midi, index) => ({ midi, time: index * 0.01 })),
    13,
  );

const pitches = (segments: readonly Segment[]) =>
  segments.map((segment) => Math.round(segment.midi));

describe("findSegments", () => {
  it("finds two clean notes", () => {
    const points = contour([...held(60, 30), ...held(64, 30)]);
    expect(pitches(findSegments(points, OPTIONS))).toEqual([60, 64]);
  });

  it("holds a vibrato'd note together instead of shattering it", () => {
    // This is the case a derivative-based test fails outright: half a semitone at
    // 5.5 Hz peaks around seventeen semitones per second.
    const points = contour(vibrato(67, 60, 0.5));
    const segments = findSegments(points, OPTIONS);

    expect(segments).toHaveLength(1);
    expect(Math.round(segments[0].midi)).toBe(67);
  });

  it("does not turn a slow glide into a note", () => {
    // Twelve semitones over 600 ms. A running anchor would drift along with it and
    // report one long "note"; a fixed anchor leaves the band almost immediately.
    const points = contour(slide(60, 72, 60));
    const segments = findSegments(points, OPTIONS);

    for (const segment of segments) {
      expect(segment.seconds).toBeLessThan(0.25);
    }
  });

  it("keeps a note together through a single bad frame", () => {
    const points = contour([...held(60, 15), 72, ...held(60, 15)]);
    expect(pitches(findSegments(points, OPTIONS))).toEqual([60]);
  });

  it("breaks the run when the departure is sustained", () => {
    const points = contour([...held(60, 20), ...held(72, 20)]);
    expect(pitches(findSegments(points, OPTIONS))).toEqual([60, 72]);
  });

  it("drops a run shorter than the minimum duration", () => {
    // Four points is 40 ms, under the 80 ms floor.
    const points = contour([...held(60, 30), ...held(67, 4), ...held(72, 30)]);
    expect(pitches(findSegments(points, OPTIONS))).toEqual([60, 72]);
  });

  it("separates two notes a semitone apart", () => {
    // The tolerance band must stay under a semitone or neighbours merge.
    const points = contour([...held(60, 30), ...held(61, 30)]);
    expect(pitches(findSegments(points, OPTIONS))).toEqual([60, 61]);
  });

  it("preserves an oscillating figure", () => {
    const points = contour([
      ...held(60, 20),
      ...held(62, 20),
      ...held(60, 20),
      ...held(62, 20),
    ]);
    expect(pitches(findSegments(points, OPTIONS))).toEqual([60, 62, 60, 62]);
  });

  it("reports voiced duration and the original clock times", () => {
    const points = contour(held(60, 30));
    const [segment] = findSegments(points, OPTIONS);

    expect(segment.seconds).toBeCloseTo(0.3, 6);
    expect(segment.startTime).toBeCloseTo(0, 6);
    expect(segment.endTime).toBeCloseTo(0.29, 6);
  });

  it("returns nothing for an empty contour", () => {
    expect(findSegments([], OPTIONS)).toEqual([]);
  });
});

const segment = (midi: number, seconds: number): Segment => ({
  startIndex: 0,
  endIndex: 0,
  midi,
  seconds,
  startTime: 0,
  endTime: 0,
});

const GLIDE = { maxSeconds: 0.13, minSpanSemitones: 3 };

describe("dropGlides", () => {
  it("removes a short passing tone between two distant notes", () => {
    const kept = dropGlides(
      [segment(60, 0.4), segment(65, 0.05), segment(72, 0.4)],
      GLIDE,
    );
    expect(kept.map((s) => s.midi)).toEqual([60, 72]);
  });

  it("keeps a short note that is not between its neighbours", () => {
    const kept = dropGlides(
      [segment(60, 0.4), segment(76, 0.05), segment(72, 0.4)],
      GLIDE,
    );
    expect(kept.map((s) => s.midi)).toEqual([60, 76, 72]);
  });

  it("keeps a long note even when it sits between its neighbours", () => {
    const kept = dropGlides(
      [segment(60, 0.4), segment(65, 0.4), segment(72, 0.4)],
      GLIDE,
    );
    expect(kept.map((s) => s.midi)).toEqual([60, 65, 72]);
  });

  it("keeps a short note when the neighbours are close together", () => {
    // C to D leaves room for exactly one chromatic step, and a fast chromatic run
    // is real music — a brief C sharp there is a note, not a slide.
    const kept = dropGlides(
      [segment(60, 0.4), segment(61, 0.05), segment(62, 0.4)],
      GLIDE,
    );
    expect(kept.map((s) => s.midi)).toEqual([60, 61, 62]);
  });

  it("removes both intermediates of a two-step scoop", () => {
    const kept = dropGlides(
      [segment(60, 0.4), segment(64, 0.05), segment(68, 0.05), segment(72, 0.4)],
      GLIDE,
    );
    expect(kept.map((s) => s.midi)).toEqual([60, 72]);
  });

  it("never removes the first or last segment", () => {
    const kept = dropGlides([segment(65, 0.05), segment(72, 0.4)], GLIDE);
    expect(kept).toHaveLength(2);
  });
});
