import { describe, expect, it } from "vitest";
import { config } from "../config";
import { align, substitutionCost, type AlignStep } from "./align";

const COSTS = config.score;

const ops = (steps: readonly AlignStep[]) => steps.map((step) => step.op);
const errors = (steps: readonly AlignStep[]) => steps.filter((s) => s.op !== "match");

describe("substitutionCost", () => {
  it("is free for the right note", () => {
    expect(substitutionCost(0, COSTS)).toBe(0);
  });

  it("charges by the semitone, either direction", () => {
    expect(substitutionCost(2, COSTS)).toBeCloseTo(0.5, 10);
    expect(substitutionCost(-2, COSTS)).toBeCloseTo(0.5, 10);
  });

  it("stops at the ceiling", () => {
    expect(substitutionCost(24, COSTS)).toBe(COSTS.subCeiling);
  });

  it("keeps the ceiling strictly under a pair of indels", () => {
    // The constraint the whole cost model rests on. If this ever fails, every large
    // substitution silently becomes a deletion plus an insertion.
    expect(COSTS.subCeiling).toBeLessThan(2 * COSTS.indel);
  });
});

describe("align", () => {
  it("costs nothing to play it exactly right", () => {
    const { cost, steps } = align([60, 62, 64], [60, 62, 64], COSTS);
    expect(cost).toBe(0);
    expect(ops(steps)).toEqual(["match", "match", "match"]);
  });

  it("charges one substitution for one wrong note", () => {
    const { cost, steps } = align([60, 62, 64], [60, 63, 64], COSTS);

    expect(cost).toBeCloseTo(COSTS.subSlope, 10);
    expect(errors(steps)).toHaveLength(1);
    expect(errors(steps)[0]).toMatchObject({ op: "sub", targetIndex: 1, attemptIndex: 1 });
  });

  it("does not decompose a large substitution into an indel pair", () => {
    // The invariant the ceiling exists to protect. Fifteen semitones out is well
    // past where an uncapped cost would prefer del + ins, and the player must still
    // see one wrong note rather than a hole beside a spike.
    const { cost, steps } = align([60, 62, 64], [60, 77, 64], COSTS);

    expect(errors(steps)).toHaveLength(1);
    expect(errors(steps)[0].op).toBe("sub");
    expect(cost).toBeCloseTo(COSTS.subCeiling, 10);
    expect(steps.some((step) => step.op === "del" || step.op === "ins")).toBe(false);
  });

  it("prefers a substitution when it ties with an indel pair", () => {
    // At exactly 2 x indel the two readings cost the same; the diagonal tie-break
    // is what keeps "one wrong note" the answer.
    const tied = { subSlope: 2, subCeiling: 2, indel: 1 };
    expect(errors(align([60], [67], tied).steps)[0].op).toBe("sub");
  });

  it("charges one deletion for a missed note", () => {
    const { cost, steps } = align([60, 62, 64], [60, 64], COSTS);

    expect(cost).toBeCloseTo(COSTS.indel, 10);
    expect(errors(steps)).toHaveLength(1);
    expect(errors(steps)[0]).toMatchObject({ op: "del", targetIndex: 1, attemptIndex: -1 });
  });

  it("charges one insertion for an extra note", () => {
    const { cost, steps } = align([60, 64], [60, 62, 64], COSTS);

    expect(cost).toBeCloseTo(COSTS.indel, 10);
    expect(errors(steps)).toHaveLength(1);
    expect(errors(steps)[0]).toMatchObject({ op: "ins", targetIndex: -1, attemptIndex: 1 });
  });

  it("handles an empty attempt as all deletions", () => {
    const { cost, steps } = align([60, 62, 64], [], COSTS);
    expect(cost).toBeCloseTo(3 * COSTS.indel, 10);
    expect(ops(steps)).toEqual(["del", "del", "del"]);
  });

  it("handles an empty target as all insertions", () => {
    const { steps } = align([], [60, 62], COSTS);
    expect(ops(steps)).toEqual(["ins", "ins"]);
  });

  it("handles two empty sequences", () => {
    expect(align([], [], COSTS)).toEqual({ cost: 0, steps: [] });
  });

  it("costs a near miss less than a wild one", () => {
    const near = align([60, 62, 64], [60, 63, 64], COSTS).cost;
    const wild = align([60, 62, 64], [60, 70, 64], COSTS).cost;
    expect(near).toBeLessThan(wild);
  });

  it("keeps the path consistent with both sequences", () => {
    // The graph walks this path and indexes both arrays with it, so all three
    // properties below are load-bearing rather than tidiness.
    const random = (seed: number) => {
      let state = seed >>> 0;
      return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    };
    const next = random(7);

    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(next() * 8);
      const m = 1 + Math.floor(next() * 8);
      const target = Array.from({ length: n }, () => 55 + Math.floor(next() * 20));
      const attempt = Array.from({ length: m }, () => 55 + Math.floor(next() * 20));

      const { steps, cost } = align(target, attempt, COSTS);

      const consumedTarget = steps
        .filter((s) => s.targetIndex >= 0)
        .map((s) => s.targetIndex);
      const consumedAttempt = steps
        .filter((s) => s.attemptIndex >= 0)
        .map((s) => s.attemptIndex);

      // Every note of both sequences is accounted for, exactly once.
      expect(consumedTarget).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(consumedAttempt).toEqual(Array.from({ length: m }, (_, i) => i));
      // And the reported cost really is the sum of the path.
      expect(steps.reduce((sum, step) => sum + step.cost, 0)).toBeCloseTo(cost, 10);
    }
  });
});
