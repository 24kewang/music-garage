import { describe, expect, it } from "vitest";
import { fadeEdges } from "./fade";
import { assembleChunks, trimToOnset } from "./trim";

const RATE = 1000;

/** A ramp, so a slice can be identified by the values in it. */
const counting = (length: number, from = 0) =>
  Float32Array.from({ length }, (_, i) => from + i);

describe("assembleChunks", () => {
  it("joins the chunks in order", () => {
    const joined = assembleChunks([
      Float32Array.from([1, 2]),
      Float32Array.from([3]),
      Float32Array.from([4, 5]),
    ]);
    expect(Array.from(joined)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles no chunks at all", () => {
    expect(assembleChunks([])).toHaveLength(0);
  });

  it("ignores an empty chunk in the middle", () => {
    const joined = assembleChunks([
      Float32Array.from([1]),
      new Float32Array(0),
      Float32Array.from([2]),
    ]);
    expect(Array.from(joined)).toEqual([1, 2]);
  });
});

describe("trimToOnset", () => {
  it("cuts to the onset, less the pre-roll", () => {
    // Onset half a second in, 100 ms of pre-roll: keep from sample 400.
    const trimmed = trimToOnset(counting(1000), RATE, 0, 0.5, 100);
    expect(trimmed).toHaveLength(600);
    expect(trimmed[0]).toBe(400);
  });

  it("keeps everything when the onset is at the very start", () => {
    const trimmed = trimToOnset(counting(500), RATE, 0, 0, 100);
    expect(trimmed).toHaveLength(500);
    expect(trimmed[0]).toBe(0);
  });

  it("clamps when the pre-roll is longer than the head", () => {
    // Only 50 ms of audio before the onset but 200 ms of pre-roll wanted.
    const trimmed = trimToOnset(counting(500), RATE, 0, 0.05, 200);
    expect(trimmed).toHaveLength(500);
  });

  it("accounts for a capture that started after time zero", () => {
    // The audio clock does not restart per recording, so the offset is what matters.
    const trimmed = trimToOnset(counting(1000), RATE, 10, 10.5, 100);
    expect(trimmed[0]).toBe(400);
  });

  it("defends against an onset before the capture began", () => {
    const trimmed = trimToOnset(counting(300), RATE, 5, 4, 0);
    expect(trimmed).toHaveLength(300);
  });

  it("defends against an onset past the end of the clip", () => {
    const trimmed = trimToOnset(counting(300), RATE, 0, 99, 0);
    expect(trimmed).toHaveLength(0);
  });

  it("copies rather than viewing the original", () => {
    const source = counting(100);
    const trimmed = trimToOnset(source, RATE, 0, 0.05, 0);
    trimmed[0] = -1;
    expect(source[50]).toBe(50);
  });
});

describe("fadeEdges", () => {
  it("ramps both ends and leaves the middle alone", () => {
    const samples = new Float32Array(100).fill(1);
    fadeEdges(samples, RATE, 10);

    expect(samples[0]).toBe(0);
    expect(samples[99]).toBe(0);
    expect(samples[50]).toBe(1);
    expect(samples[5]).toBeCloseTo(0.5, 6);
  });

  it("does nothing for a zero-length fade", () => {
    const samples = new Float32Array(10).fill(1);
    fadeEdges(samples, RATE, 0);
    expect(Array.from(samples).every((value) => value === 1)).toBe(true);
  });

  it("does not let the two ramps overlap on a very short clip", () => {
    // Asking for a 100 ms fade on a 6 ms clip must not double-attenuate the middle.
    const samples = new Float32Array(6).fill(1);
    fadeEdges(samples, RATE, 100);

    for (const value of samples) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("survives an empty clip", () => {
    expect(() => fadeEdges(new Float32Array(0), RATE, 10)).not.toThrow();
  });
});
