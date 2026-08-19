import { describe, expect, it } from "vitest";
import { createOnsetGate } from "./onset";

const OPTIONS = { threshold: 0.02, holdBlocks: 3, graceUntil: 0 };

/** Feed a series of levels at 10 ms intervals, collecting whatever fires. */
function run(levels: readonly number[], options = OPTIONS): (number | null)[] {
  const gate = createOnsetGate(options);
  return levels.map((rms, index) => gate.push(index * 0.01, rms));
}

describe("createOnsetGate", () => {
  it("stays quiet through silence", () => {
    expect(run([0, 0, 0, 0.001, 0]).every((hit) => hit === null)).toBe(true);
  });

  it("fires once the level has held for the whole run", () => {
    const hits = run([0, 0.1, 0.1, 0.1, 0.1]);
    expect(hits[1]).toBeNull();
    expect(hits[2]).toBeNull();
    // Third loud block confirms it; the reported time is the first one's.
    expect(hits[3]).toBeCloseTo(0.01, 6);
  });

  it("does not fire on a single loud block", () => {
    expect(run([0, 0.5, 0, 0.5, 0, 0.5, 0]).every((hit) => hit === null)).toBe(true);
  });

  it("restarts the run when the level drops back", () => {
    const hits = run([0.1, 0.1, 0, 0.1, 0.1, 0.1]);
    // The first pair is abandoned; the second run of three fires, reporting its start.
    expect(hits.slice(0, 5).every((hit) => hit === null)).toBe(true);
    expect(hits[5]).toBeCloseTo(0.03, 6);
  });

  it("fires at most once", () => {
    const gate = createOnsetGate(OPTIONS);
    const loud = Array.from({ length: 10 }, (_, i) => gate.push(i * 0.01, 0.5));
    expect(loud.filter((hit) => hit !== null)).toHaveLength(1);
    expect(gate.fired).toBe(true);
  });

  it("ignores everything inside the grace period", () => {
    // A burst that would otherwise fire, entirely before the grace expires.
    const hits = run([0.5, 0.5, 0.5, 0.5, 0, 0], { ...OPTIONS, graceUntil: 0.05 });
    expect(hits.every((hit) => hit === null)).toBe(true);
  });

  it("fires normally once the grace period has passed", () => {
    const levels = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const hits = run(levels, { ...OPTIONS, graceUntil: 0.05 });
    expect(hits[7]).toBeCloseTo(0.05, 6);
  });
});
