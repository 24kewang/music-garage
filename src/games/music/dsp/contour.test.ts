import { describe, expect, it } from "vitest";
import { concatenate, medianFilter, pointsForMs, type ContourPoint } from "./contour";
import type { Frame } from "./track";

const frame = (midi: number | null, time: number): Frame => ({
  midi,
  time,
  clarity: midi === null ? 0 : 0.95,
});

const point = (midi: number, time = 0): ContourPoint => ({ midi, time });

describe("concatenate", () => {
  it("drops unvoiced frames and joins what is left", () => {
    const frames = [frame(60, 0), frame(null, 0.01), frame(62, 0.02), frame(null, 0.03)];
    expect(concatenate(frames)).toEqual([
      { midi: 60, time: 0 },
      { midi: 62, time: 0.02 },
    ]);
  });

  it("closes over a silence rather than leaving a hole", () => {
    // Two takes of the same note either side of a rest must join into one run, or
    // the rest would re-articulate a note the game has decided rests cannot.
    const frames = [
      frame(60, 0),
      frame(null, 0.01),
      frame(null, 0.02),
      frame(null, 0.03),
      frame(60, 0.04),
    ];
    const contour = concatenate(frames);
    expect(contour.map((p) => p.midi)).toEqual([60, 60]);
    // The original clock times survive for the debug view even though the pipeline
    // no longer treats them as adjacent in time.
    expect(contour.map((p) => p.time)).toEqual([0, 0.04]);
  });

  it("returns nothing when every frame is unvoiced", () => {
    expect(concatenate([frame(null, 0), frame(null, 0.01)])).toEqual([]);
  });
});

describe("medianFilter", () => {
  it("removes a single-frame octave spike", () => {
    const contour = [60, 60, 72, 60, 60].map((m) => point(m));
    expect(medianFilter(contour, 3).map((p) => p.midi)).toEqual([60, 60, 60, 60, 60]);
  });

  it("leaves a clean contour alone", () => {
    const contour = [60, 60, 60, 60].map((m) => point(m));
    expect(medianFilter(contour, 3).map((p) => p.midi)).toEqual([60, 60, 60, 60]);
  });

  it("outvotes a spike sitting on the very first frame", () => {
    // The window truncates at the edge rather than padding with copies of it.
    // Padding would let the spike outvote its own neighbours, and the first frame
    // is precisely where an attack transient puts one.
    const contour = [72, 60, 60, 60].map((m) => point(m));
    expect(medianFilter(contour, 5).map((p) => p.midi)).toEqual([60, 60, 60, 60]);
  });

  it("rounds an even kernel up to an odd one", () => {
    const contour = [60, 72, 60].map((m) => point(m));
    expect(medianFilter(contour, 2)).toEqual(medianFilter(contour, 3));
  });

  it("survives a kernel of one and an empty contour", () => {
    expect(medianFilter([point(60)], 1).map((p) => p.midi)).toEqual([60]);
    expect(medianFilter([], 5)).toEqual([]);
  });

  it("preserves the clock time of every point", () => {
    const contour = [point(60, 1), point(72, 2), point(60, 3)];
    expect(medianFilter(contour, 3).map((p) => p.time)).toEqual([1, 2, 3]);
  });

  it("does not survive a step edge as a mean would", () => {
    // A real note change must stay a step, not become a ramp.
    const contour = [60, 60, 60, 67, 67, 67].map((m) => point(m));
    expect(medianFilter(contour, 3).map((p) => p.midi)).toEqual([60, 60, 60, 67, 67, 67]);
  });
});

describe("pointsForMs", () => {
  it("converts a duration into a whole number of hops, never zero", () => {
    expect(pointsForMs(50, 10)).toBe(5);
    expect(pointsForMs(1, 10)).toBe(1);
  });
});
