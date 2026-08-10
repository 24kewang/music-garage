import { describe, expect, it } from "vitest";

import { buildSpinPlan, pickTargetIndex, type SpinTuning } from "./spin";

/** Deterministic LCG so plans are reproducible across runs. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const TUNING: SpinTuning = {
  durationMs: 3000,
  startIntervalMs: 70,
  endIntervalMs: 450,
  easeExponent: 2,
  minSteps: 8,
};

describe("pickTargetIndex", () => {
  it("stays in range across the random span", () => {
    expect(pickTargetIndex(5, () => 0)).toBe(0);
    expect(pickTargetIndex(5, () => 0.999999)).toBe(4);
    expect(pickTargetIndex(1, () => 0.5)).toBe(0);
  });

  it("throws on an empty list", () => {
    expect(() => pickTargetIndex(0, () => 0.5)).toThrow();
  });
});

describe("buildSpinPlan", () => {
  it("always lands on the target", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const random = seededRandom(seed);
      const target = pickTargetIndex(7, random);
      const plan = buildSpinPlan(7, target, TUNING, random);
      expect(plan[plan.length - 1].pathIndex).toBe(target);
    }
  });

  it("decelerates: delays never shrink", () => {
    const plan = buildSpinPlan(7, 3, TUNING, seededRandom(42));
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].delayMs).toBeGreaterThanOrEqual(plan[i - 1].delayMs);
    }
    expect(plan[0].delayMs).toBeLessThan(plan[plan.length - 1].delayMs);
  });

  it("never shows the same excerpt twice in a row", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const plan = buildSpinPlan(3, 1, TUNING, seededRandom(seed));
      for (let i = 1; i < plan.length; i += 1) {
        expect(plan[i].pathIndex).not.toBe(plan[i - 1].pathIndex);
      }
    }
  });

  it("runs for roughly the configured duration", () => {
    const plan = buildSpinPlan(7, 2, TUNING, seededRandom(7));
    const total = plan.reduce((sum, step) => sum + step.delayMs, 0);
    expect(total).toBeGreaterThan(TUNING.durationMs * 0.8);
    expect(total).toBeLessThan(TUNING.durationMs + 2 * TUNING.endIntervalMs);
  });

  it("honours minSteps even when the duration is tiny", () => {
    const plan = buildSpinPlan(
      5,
      0,
      { ...TUNING, durationMs: 100 },
      seededRandom(3),
    );
    expect(plan.length).toBeGreaterThanOrEqual(TUNING.minSteps);
  });

  it("handles a single-file library", () => {
    const plan = buildSpinPlan(1, 0, TUNING, seededRandom(9));
    expect(plan.every((step) => step.pathIndex === 0)).toBe(true);
    expect(plan[plan.length - 1].pathIndex).toBe(0);
  });

  it("stays within bounds for every step", () => {
    const plan = buildSpinPlan(4, 3, TUNING, seededRandom(11));
    for (const step of plan) {
      expect(step.pathIndex).toBeGreaterThanOrEqual(0);
      expect(step.pathIndex).toBeLessThan(4);
    }
  });
});
