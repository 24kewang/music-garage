import { describe, expect, it } from "vitest";
import { config } from "../config";
import { align } from "../score/align";
import { compare } from "../score/compare";
import { buildGraph, describeAlignment, type Cell } from "./graph";

const OPTIONS = config.graph;
const COSTS = config.score;

const defined = (cells: readonly (Cell | null)[]) =>
  cells.filter((cell): cell is Cell => cell !== null);

describe("buildGraph", () => {
  it("gives every step the same width", () => {
    const target = [60, 62, 64, 65];
    const { steps } = align(target, target, COSTS);
    const { target: cells } = buildGraph(target, target, steps, OPTIONS);

    const widths = defined(cells).map((cell) => cell.x1 - cell.x0);
    for (const width of widths) {
      expect(width).toBeCloseTo(OPTIONS.width / steps.length, 10);
    }
  });

  it("spans the full width, edge to edge", () => {
    const target = [60, 64, 67];
    const { steps } = align(target, target, COSTS);
    const cells = defined(buildGraph(target, target, steps, OPTIONS).target);

    expect(cells[0].x0).toBe(0);
    expect(cells[cells.length - 1].x1).toBeCloseTo(OPTIONS.width, 10);
  });

  it("draws higher pitches higher up the panel", () => {
    const target = [60, 72];
    const { steps } = align(target, target, COSTS);
    const [low, high] = defined(buildGraph(target, target, steps, OPTIONS).target);

    // SVG y grows downwards, so the higher note has the smaller coordinate.
    expect(high.y).toBeLessThan(low.y);
  });

  it("keeps the two lines parallel through the alignment", () => {
    const target = [60, 62, 64];
    const attempt = [60, 62, 64];
    const { steps } = align(target, attempt, COSTS);
    const geometry = buildGraph(target, attempt, steps, OPTIONS);

    expect(geometry.target).toHaveLength(steps.length);
    expect(geometry.attempt).toHaveLength(steps.length);
    expect(geometry.ops).toHaveLength(steps.length);
  });

  it("leaves a gap in the attempt where a note was missed", () => {
    const target = [60, 62, 64];
    const attempt = [60, 64];
    const { steps } = align(target, attempt, COSTS);
    const geometry = buildGraph(target, attempt, steps, OPTIONS);

    const hole = geometry.ops.indexOf("del");
    expect(hole).toBeGreaterThanOrEqual(0);
    // The target keeps its cell there; the attempt has nothing to draw. That hole
    // is what makes the error visible with the colors ignored.
    expect(geometry.attempt[hole]).toBeNull();
    expect(geometry.target[hole]).not.toBeNull();
  });

  it("leaves a gap in the target where an extra note was played", () => {
    const target = [60, 64];
    const attempt = [60, 62, 64];
    const { steps } = align(target, attempt, COSTS);
    const geometry = buildGraph(target, attempt, steps, OPTIONS);

    const extra = geometry.ops.indexOf("ins");
    expect(geometry.target[extra]).toBeNull();
    expect(geometry.attempt[extra]).not.toBeNull();
  });

  it("gives an inserted note real width rather than wedging it into a boundary", () => {
    const target = [60, 64];
    const attempt = [60, 62, 64];
    const { steps } = align(target, attempt, COSTS);
    const geometry = buildGraph(target, attempt, steps, OPTIONS);

    const extra = geometry.ops.indexOf("ins");
    const cell = geometry.attempt[extra] as Cell;
    expect(cell.x1 - cell.x0).toBeCloseTo(OPTIONS.width / steps.length, 10);
  });

  it("does not divide by zero on a unison phrase", () => {
    const target = [60, 60, 60];
    const { steps } = align(target, target, COSTS);
    const cells = defined(buildGraph(target, target, steps, OPTIONS).target);

    for (const cell of cells) {
      expect(Number.isFinite(cell.y)).toBe(true);
      // Flat phrase, flat line, drawn down the middle.
      expect(cell.y).toBeCloseTo(OPTIONS.height / 2, 6);
    }
  });

  it("does not blow up a two-semitone phrase to fill the panel", () => {
    const narrow = buildGraph([60, 62], [60, 62], align([60, 62], [60, 62], COSTS).steps, OPTIONS);
    const wide = buildGraph([48, 72], [48, 72], align([48, 72], [48, 72], COSTS).steps, OPTIONS);

    const spread = (cells: readonly (Cell | null)[]) => {
      const ys = defined(cells).map((cell) => cell.y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(spread(narrow.target)).toBeLessThan(spread(wide.target));
  });

  it("handles a single note", () => {
    const { steps } = align([60], [60], COSTS);
    const cells = defined(buildGraph([60], [60], steps, OPTIONS).target);

    expect(cells).toHaveLength(1);
    expect(Number.isFinite(cells[0].y)).toBe(true);
  });

  it("pins a wildly out-of-range note to the edge rather than producing NaN", () => {
    const target = [60, 62, 64];
    // Two octaves clear of the phrase, and past the shift search, so it survives.
    const attempt = [60, 96, 64];
    const { alignment, shifted } = compare(target, attempt, COSTS);
    const geometry = buildGraph(target, shifted, alignment.steps, OPTIONS);

    const cells = defined(geometry.attempt);
    for (const cell of cells) {
      expect(Number.isFinite(cell.y)).toBe(true);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThanOrEqual(OPTIONS.height);
    }
    expect(cells.some((cell) => cell.clamped)).toBe(true);
  });

  it("keeps the target's own shape readable when the attempt is wild", () => {
    const target = [60, 62, 64];
    const wild = buildGraph(target, [60, 96, 64], align(target, [60, 96, 64], COSTS).steps, OPTIONS);
    const tame = buildGraph(target, target, align(target, target, COSTS).steps, OPTIONS);

    // Same target, same range: the outlier must not have rescaled anything.
    expect(defined(wild.target).map((c) => c.y)).toEqual(
      defined(tame.target).map((c) => c.y),
    );
  });

  it("returns nothing for an empty alignment", () => {
    expect(buildGraph([], [], [], OPTIONS)).toEqual({ target: [], attempt: [], ops: [] });
  });

  it("survives an empty target with notes in the attempt", () => {
    const { steps } = align([], [60, 64], COSTS);
    const cells = defined(buildGraph([], [60, 64], steps, OPTIONS).attempt);

    expect(cells).toHaveLength(2);
    for (const cell of cells) expect(Number.isFinite(cell.y)).toBe(true);
  });
});

describe("describeAlignment", () => {
  it("counts a perfect copy", () => {
    const { steps } = align([60, 62, 64], [60, 62, 64], COSTS);
    expect(describeAlignment(steps)).toBe("3 of 3 notes matched.");
  });

  it("names each kind of mistake", () => {
    const { steps } = align([60, 62, 64, 65], [60, 63, 65, 90], COSTS);
    const description = describeAlignment(steps);

    expect(description).toMatch(/notes matched/);
    expect(description).toMatch(/wrong|missed|extra/);
  });

  it("says something for an empty comparison", () => {
    expect(describeAlignment([])).toBe("Nothing to compare.");
  });
});
