import { describe, expect, it } from "vitest";
import { collapse, quantize, tuningOffset } from "./sequence";

describe("tuningOffset", () => {
  it("is zero for pitches already on the grid", () => {
    expect(tuningOffset([60, 62, 64])).toBe(0);
  });

  it("finds a consistent flatness", () => {
    expect(tuningOffset([59.6, 61.6, 63.6])).toBeCloseTo(-0.4, 6);
  });

  it("finds a consistent sharpness", () => {
    expect(tuningOffset([60.3, 62.3, 64.3])).toBeCloseTo(0.3, 6);
  });

  it("is not dragged off by one wild segment", () => {
    expect(tuningOffset([60.1, 62.1, 64.1, 70.45])).toBeCloseTo(0.1, 6);
  });

  it("is zero for an empty performance", () => {
    expect(tuningOffset([])).toBe(0);
  });
});

describe("quantize", () => {
  it("rounds pitches that are already close to the grid", () => {
    expect(quantize([60.05, 61.95, 64.1]).notes).toEqual([60, 62, 64]);
  });

  it("keeps the intervals of a consistently flat singer", () => {
    // Every note 40 cents flat. Rounded directly these land on 60, 62, 63, 65 —
    // the third interval collapses from 2 semitones to 1 and the melody is wrong.
    const flat = [60.6, 62.6, 63.6, 65.6].map((pitch) => pitch - 1);
    const { notes, tuningOffset: offset } = quantize(flat);

    expect(offset).toBeCloseTo(-0.4, 6);
    expect(notes).toEqual([60, 62, 63, 65]);
  });

  it("preserves the octave a leap was played in", () => {
    expect(quantize([60, 72]).notes).toEqual([60, 72]);
  });

  it("handles an empty performance", () => {
    expect(quantize([])).toEqual({ notes: [], tuningOffset: 0 });
  });
});

describe("collapse", () => {
  it("keeps one event per run of identical pitches", () => {
    expect(collapse([60, 60, 62])).toEqual([60, 62]);
  });

  it("preserves an oscillating figure", () => {
    expect(collapse([60, 62, 60, 62])).toEqual([60, 62, 60, 62]);
  });

  it("collapses a long hold to a single note", () => {
    expect(collapse([64, 64, 64, 64, 64])).toEqual([64]);
  });

  it("leaves a sequence with no repeats alone", () => {
    expect(collapse([60, 62, 64, 65])).toEqual([60, 62, 64, 65]);
  });

  it("handles an empty sequence", () => {
    expect(collapse([])).toEqual([]);
  });
});
