import { describe, expect, it } from "vitest";
import { config } from "../config";
import { compare, normalizedError, scoreFromError } from "./compare";

const OPTIONS = { ...config.score };

describe("normalizedError", () => {
  it("divides by the longer sequence", () => {
    expect(normalizedError(2, 8, 4)).toBeCloseTo(0.25, 10);
    expect(normalizedError(2, 4, 8)).toBeCloseTo(0.25, 10);
  });

  it("is zero when there is nothing to compare", () => {
    expect(normalizedError(0, 0, 0)).toBe(0);
  });
});

describe("scoreFromError", () => {
  it("gives a perfect copy full marks", () => {
    expect(scoreFromError(0)).toBe(100);
  });

  it("falls as the error rises", () => {
    expect(scoreFromError(0.2)).toBe(80);
    expect(scoreFromError(0.5)).toBe(50);
  });

  it("never goes below zero", () => {
    expect(scoreFromError(1.5)).toBe(0);
  });
});

describe("compare", () => {
  const target = [60, 62, 64, 65, 67];

  it("gives a note-for-note copy full marks", () => {
    const result = compare(target, target, OPTIONS);
    expect(result.error).toBe(0);
    expect(result.score).toBe(100);
    expect(result.shift).toBe(0);
  });

  it("is key-agnostic", () => {
    const up = target.map((note) => note + 7);
    const result = compare(target, up, OPTIONS);

    expect(result.error).toBe(0);
    expect(result.score).toBe(100);
    // The shift is what gets ADDED to the attempt to line it up, so copying seven
    // semitones high needs seven taken back off. Pinned because this convention
    // inverts silently under a refactor and the graph would draw the wrong line.
    expect(result.shift).toBe(-7);
    expect(result.shifted).toEqual(target);
  });

  it("scores an octave away exactly as well as the original register", () => {
    const octave = target.map((note) => note + 12);
    expect(compare(target, octave, OPTIONS).error).toBe(
      compare(target, target, OPTIONS).error,
    );
  });

  it("prefers the smallest shift that explains an ambiguous phrase", () => {
    // A single note matches in every key. It must report the one they played in.
    expect(compare([60], [60], OPTIONS).shift).toBe(0);
  });

  it("charges for one wrong note", () => {
    const wrong = [60, 62, 65, 65, 67];
    const result = compare(target, wrong, OPTIONS);

    expect(result.error).toBeCloseTo(config.score.subSlope / 5, 10);
    expect(result.score).toBe(95);
  });

  it("does not let a short attempt score well against a long target", () => {
    // Three right notes out of five is not most of the way there. Normalizing by
    // the attempt's own length is exactly what this guards against.
    const result = compare(target, [60, 62, 64], OPTIONS);
    expect(result.error).toBeCloseTo((2 * config.score.indel) / 5, 10);
  });

  it("does not reward padding the attempt with junk", () => {
    const clean = compare(target, target, OPTIONS);
    const padded = compare(target, [...target, 40, 41], OPTIONS);
    expect(padded.error).toBeGreaterThan(clean.error);
  });

  it("keeps the winning shift when junk is added", () => {
    const up = target.map((note) => note + 5);
    expect(compare(target, [...up, 90], OPTIONS).shift).toBe(-5);
  });

  it("returns the worst score for an empty attempt", () => {
    const result = compare(target, [], OPTIONS);
    expect(result.error).toBeCloseTo(config.score.indel, 10);
    expect(result.score).toBe(0);
  });

  it("finds the best it can when the shift is out of range", () => {
    const far = target.map((note) => note + 30);
    const result = compare(target, far, { ...OPTIONS, maxShift: 12 });

    expect(result.error).toBeGreaterThan(0);
    expect(Math.abs(result.shift)).toBeLessThanOrEqual(12);
  });

  it("bottoms the scale out on a reversed melody", () => {
    // Playing the phrase backwards costs a full indel per note on average, which is
    // where the scale is defined to end. Pinned so a change to the cost model shows
    // up in the diff rather than silently moving where the thresholds sit.
    const result = compare(target, [...target].reverse(), OPTIONS);
    expect(result.error).toBeCloseTo(1, 10);
    expect(result.score).toBe(0);
  });

  it("puts a one-semitone slip inside the strict copy threshold", () => {
    // 0.25 over five notes is 0.05, half of the strict allowance.
    const slip = [60, 61, 64, 65, 67];
    expect(compare(target, slip, OPTIONS).error).toBeLessThanOrEqual(
      config.tolerance.strict.copy,
    );
  });

  it("puts a missing note outside the strict copy threshold", () => {
    // One indel over five notes is 0.2 — twice the strict allowance, and inside
    // the loose one, which is the difference the setting is there to make.
    const error = compare(target, [60, 62, 65, 67], OPTIONS).error;
    expect(error).toBeGreaterThan(config.tolerance.strict.copy);
    expect(error).toBeLessThanOrEqual(config.tolerance.loose.copy);
  });

  it("only lets an exact copy through the strict set threshold", () => {
    expect(compare(target, target, OPTIONS).error).toBeLessThanOrEqual(
      config.tolerance.strict.set,
    );
    expect(compare(target, [60, 61, 64, 65, 67], OPTIONS).error).toBeGreaterThan(
      config.tolerance.strict.set,
    );
  });
});
