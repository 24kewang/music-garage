import { describe, expect, it } from "vitest";
import { config } from "../config";
import { clickOffset, estimateRtl, isOutlier, trimmedMean } from "./calibration";
import { createOnsetDetector } from "./onset";

const BEAT = 60 / config.calibration.tempo;

describe("clickOffset", () => {
  it("measures lateness against the nearest click", () => {
    expect(clickOffset(10.12, 10, BEAT)).toBeCloseTo(0.12);
    expect(clickOffset(10 + BEAT + 0.2, 10, BEAT)).toBeCloseTo(0.2);
  });

  it("keeps a quarter-beat of early anticipation as negative", () => {
    expect(clickOffset(10 + BEAT - 0.05, 10, BEAT)).toBeCloseTo(-0.05);
  });

  it("treats very late hits as late, not early", () => {
    // Bluetooth-sized latency: 60% of a beat is still a positive offset.
    expect(clickOffset(10 + 0.6 * BEAT, 10, BEAT)).toBeCloseTo(0.6 * BEAT);
  });
});

describe("estimateRtl", () => {
  it("recovers a known RTL from noisy onsets with outliers injected", () => {
    const rtl = 0.14;
    const anchor = 5;
    // Simulated player: hits every beat with ±30ms of human error.
    const noise = [0.02, -0.025, 0.01, -0.03, 0.03, -0.01, 0.005, -0.015, 0.02, -0.02, 0.025, 0.0];
    const offsets = noise.map((n, i) =>
      clickOffset(anchor + i * BEAT + rtl + n, anchor, BEAT),
    );
    // Two mis-hits, far off the click.
    const withOutliers = [...offsets, 0.45 * BEAT + 0.1, -0.4 * BEAT];
    const usable = withOutliers.filter(
      (o) => !isOutlier(o, BEAT, config.calibration.outlierBeatFraction),
    );
    const estimate = estimateRtl(usable, {
      trimFraction: config.calibration.trimFraction,
      minSamples: config.calibration.minSamples,
    });
    expect(estimate.rtlSeconds).not.toBeNull();
    expect(estimate.rtlSeconds!).toBeCloseTo(rtl, 2);
  });

  it("offers nothing before minSamples", () => {
    const estimate = estimateRtl([0.1, 0.1], {
      trimFraction: config.calibration.trimFraction,
      minSamples: config.calibration.minSamples,
    });
    expect(estimate.rtlSeconds).toBeNull();
    expect(estimate.count).toBe(2);
  });
});

describe("trimmedMean", () => {
  it("drops the extremes", () => {
    expect(trimmedMean([1, 1, 1, 1, 100], 0.2)).toBeCloseTo(1);
    expect(trimmedMean([], 0.2)).toBeNull();
  });
});

describe("onset detector", () => {
  const options = {
    threshold: config.calibration.onsetThreshold,
    riseRatio: config.calibration.onsetRiseRatio,
    refractorySeconds: config.calibration.refractoryMs / 1000,
  };
  const BLOCK = 128 / 48000;

  it("fires once per attack, at the rising edge", () => {
    const detector = createOnsetDetector(options);
    const fired: number[] = [];
    let t = 0;
    // Quiet noise floor…
    for (let i = 0; i < 100; i++, t += BLOCK) detector.update(t, 0.005);
    // …then an attack that decays.
    const attack = [0.5, 0.45, 0.4, 0.3, 0.2, 0.1, 0.05, 0.02];
    for (const level of attack) {
      if (detector.update(t, level)) fired.push(t);
      t += BLOCK;
    }
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeCloseTo(100 * BLOCK);
  });

  it("respects the refractory window, then fires again", () => {
    const detector = createOnsetDetector(options);
    let t = 0;
    for (let i = 0; i < 50; i++, t += BLOCK) detector.update(t, 0.005);
    expect(detector.update(t, 0.5)).toBe(true);
    t += BLOCK;
    // A second attack immediately after is swallowed.
    expect(detector.update(t, 0.5)).toBe(false);
    // After the refractory window (and decay back to quiet), it fires again.
    t += options.refractorySeconds;
    for (let i = 0; i < 200; i++, t += BLOCK) detector.update(t, 0.005);
    expect(detector.update(t, 0.5)).toBe(true);
  });

  it("ignores loud-but-steady input", () => {
    const detector = createOnsetDetector(options);
    let t = 0;
    let fired = 0;
    for (let i = 0; i < 300; i++, t += BLOCK) {
      if (detector.update(t, 0.4)) fired++;
    }
    // The first block is a rise from silence; after that the floor catches up.
    expect(fired).toBeLessThanOrEqual(1);
  });
});
