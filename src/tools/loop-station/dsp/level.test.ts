import { describe, expect, it } from "vitest";
import { config } from "../config";
import { meterFraction, peaks } from "./level";

describe("peaks", () => {
  it("takes the max magnitude per bucket", () => {
    const samples = new Float32Array(100);
    samples[10] = 0.8;
    samples[60] = -0.9;
    const envelope = peaks(samples, 2);
    // Normalised against the loudest bucket, so the 0.9 becomes 1.
    expect(envelope[1]).toBeCloseTo(1);
    expect(envelope[0]).toBeCloseTo(0.8 / 0.9);
  });

  it("never returns a bar above 1, even when the buffer clips past it", () => {
    // Baked buffers exceed 1.0 wherever a crossfade sums correlated audio.
    // Unnormalised, a bar like this drove `height: 140%` and blew out the row.
    const samples = new Float32Array(200).fill(0.3);
    samples[120] = 1.4;
    const envelope = peaks(samples, 8);
    expect(Math.max(...envelope)).toBeCloseTo(1);
    for (const bar of envelope) expect(bar).toBeLessThanOrEqual(1);
  });

  it("normalises a quiet take up so it stays legible", () => {
    const samples = new Float32Array(100).fill(0.2);
    expect(Math.max(...peaks(samples, 4))).toBeCloseTo(1);
  });

  it("leaves a near-silent buffer flat rather than amplifying its noise", () => {
    const tiny = config.ui.waveFloor / 10;
    const samples = new Float32Array(100).fill(tiny);
    const envelope = peaks(samples, 4);
    expect(Math.max(...envelope)).toBeCloseTo(tiny / config.ui.waveFloor);
    expect(Math.max(...envelope)).toBeLessThan(0.2);
  });

  it("handles an empty buffer", () => {
    expect(peaks(new Float32Array(0), 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("meterFraction", () => {
  it("pins silence to the bottom and full scale to the top", () => {
    expect(meterFraction(0)).toBe(0);
    expect(meterFraction(1)).toBeCloseTo(1);
  });

  it("puts a −6 dB signal near the top, not halfway", () => {
    expect(meterFraction(0.5)).toBeCloseTo(1 - 6.02 / 48, 2);
  });

  it("lifts realistic material well clear of the floor", () => {
    // RMS 0.1–0.2 is where real playing sits. Linearly that was a fifth of the
    // meter; on the dB scale it is two thirds and up.
    expect(meterFraction(0.1)).toBeGreaterThan(0.55);
    expect(meterFraction(0.2)).toBeGreaterThan(0.65);
  });

  it("bottoms out at the configured floor", () => {
    const atFloor = 10 ** (config.ui.meterFloorDb / 20);
    expect(meterFraction(atFloor)).toBeCloseTo(0);
    expect(meterFraction(atFloor / 2)).toBe(0);
  });

  it("is monotonic", () => {
    let previous = -1;
    for (const amplitude of [0.001, 0.01, 0.05, 0.1, 0.3, 0.6, 1]) {
      const value = meterFraction(amplitude);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
