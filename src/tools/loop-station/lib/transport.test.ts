import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
  beatGrid,
  divisorsOf,
  freeModeTempo,
  loopLengthSeconds,
  nextPartitionBoundary,
  partitionLength,
  phaseAt,
  spawnLoopEnd,
} from "./transport";

describe("loopLengthSeconds", () => {
  it("computes bars × beats × 60/tempo", () => {
    // 4 bars of 4/4 at 120 BPM: 16 beats at half a second each.
    expect(loopLengthSeconds(120, 4, 4)).toBeCloseTo(8);
  });

  it("stays under the configured ceiling at the slowest sensible settings", () => {
    // The UI must reject combinations above maxLoopSeconds; this documents that
    // the extreme corner really does exceed it, so the guard is not dead code.
    const worst = loopLengthSeconds(
      config.transport.minTempo,
      config.transport.maxBeats,
      config.transport.maxBars,
    );
    expect(worst).toBeGreaterThan(config.transport.maxLoopSeconds);
  });
});

describe("divisorsOf", () => {
  it("offers every divisor of the bar count", () => {
    expect(divisorsOf(4)).toEqual([1, 2, 4]);
    expect(divisorsOf(6)).toEqual([1, 2, 3, 6]);
    expect(divisorsOf(8)).toEqual([1, 2, 4, 8]);
    expect(divisorsOf(1)).toEqual([1]);
  });

  it("gives a prime bar count only itself and one", () => {
    expect(divisorsOf(5)).toEqual([1, 5]);
    expect(divisorsOf(7)).toEqual([1, 7]);
  });
});

describe("phaseAt", () => {
  it("wraps within the loop", () => {
    expect(phaseAt(10, 4, 10)).toBeCloseTo(0);
    expect(phaseAt(10, 4, 13)).toBeCloseTo(3);
    expect(phaseAt(10, 4, 14)).toBeCloseTo(0);
    expect(phaseAt(10, 4, 23)).toBeCloseTo(1);
  });

  it("handles times before the anchor", () => {
    expect(phaseAt(10, 4, 9)).toBeCloseTo(3);
  });
});

describe("nextPartitionBoundary", () => {
  const anchor = 100;
  const loop = 8;

  it("returns the time itself when already on a boundary", () => {
    expect(nextPartitionBoundary(anchor, loop, 1, 100)).toBeCloseTo(100);
    expect(nextPartitionBoundary(anchor, loop, 2, 104)).toBeCloseTo(104);
  });

  it("x1 waits for the next full loop", () => {
    expect(nextPartitionBoundary(anchor, loop, 1, 101)).toBeCloseTo(108);
    expect(nextPartitionBoundary(anchor, loop, 1, 107.9)).toBeCloseTo(108);
  });

  it("x2 waits for the next half-loop", () => {
    expect(nextPartitionBoundary(anchor, loop, 2, 101)).toBeCloseTo(104);
    expect(nextPartitionBoundary(anchor, loop, 2, 105)).toBeCloseTo(108);
  });

  it("x4 waits for the next quarter-loop", () => {
    expect(nextPartitionBoundary(anchor, loop, 4, 100.5)).toBeCloseTo(102);
  });

  it("never returns a boundary before the anchor", () => {
    expect(nextPartitionBoundary(anchor, loop, 2, 90)).toBeCloseTo(100);
  });

  it("is immune to float drift just before a boundary", () => {
    // A time a hair before the boundary (scheduler jitter) must not skip a
    // whole partition.
    const boundary = anchor + 3 * partitionLength(loop, 4);
    expect(nextPartitionBoundary(anchor, loop, 4, boundary - 1e-12)).toBeCloseTo(boundary);
  });
});

describe("spawnLoopEnd", () => {
  const anchor = 50;
  const loop = 10;

  it("closes at the end of the iteration the segment started in", () => {
    expect(spawnLoopEnd(anchor, loop, 50)).toBeCloseTo(60);
    expect(spawnLoopEnd(anchor, loop, 55)).toBeCloseTo(60);
    expect(spawnLoopEnd(anchor, loop, 60)).toBeCloseTo(70);
    expect(spawnLoopEnd(anchor, loop, 69.9)).toBeCloseTo(70);
  });
});

describe("freeModeTempo", () => {
  it("recovers the tempo the player actually held", () => {
    // A free loop meant as 4 bars of 4/4 (x1) played over exactly 8s is 120 BPM.
    expect(freeModeTempo(8, 4, 4, 1)).toBeCloseTo(120);
  });

  it("scales with the multiplier", () => {
    // The same 4-bar/4-beat settings with x2: the free loop is only 2 bars,
    // so 4 seconds of playing means the same 120 BPM.
    expect(freeModeTempo(4, 4, 4, 2)).toBeCloseTo(120);
    // And x4 over 2 seconds.
    expect(freeModeTempo(2, 4, 4, 4)).toBeCloseTo(120);
  });

  it("round-trips with loopLengthSeconds", () => {
    // loopLength at the derived tempo must equal multiplier × free length.
    const free = 3.7;
    const tempo = freeModeTempo(free, 3, 6, 2);
    expect(loopLengthSeconds(tempo, 3, 6)).toBeCloseTo(2 * free);
  });
});

describe("beatGrid", () => {
  it("emits bars × beats clicks with beat one of each bar accented", () => {
    const grid = beatGrid(120, 3, 2);
    expect(grid).toHaveLength(6);
    expect(grid.map((g) => g.accent)).toEqual([true, false, false, true, false, false]);
    // 120 BPM → half-second beats.
    expect(grid.map((g) => g.offset)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it("spans exactly one loop", () => {
    const tempo = config.transport.defaultTempo;
    const grid = beatGrid(tempo, 4, 4);
    const last = grid[grid.length - 1];
    expect(last.offset + 60 / tempo).toBeCloseTo(loopLengthSeconds(tempo, 4, 4));
  });
});
