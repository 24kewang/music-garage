import { describe, expect, it } from "vitest";
import { resample } from "./resample";

describe("resample", () => {
  it("returns the same array when the rates match", () => {
    const samples = new Float32Array([0, 0.5, 1]);
    expect(resample(samples, 48000, 48000)).toBe(samples);
  });

  it("scales the length by the rate ratio, holding the duration", () => {
    // One second in stays one second out, whichever way the rate moves.
    expect(resample(new Float32Array(48000), 48000, 44100)).toHaveLength(44100);
    expect(resample(new Float32Array(44100), 44100, 48000)).toHaveLength(48000);
  });

  it("keeps the endpoints", () => {
    const samples = new Float32Array([1, 0, 0, 0, -1]);
    const out = resample(samples, 4, 8);
    expect(out[0]).toBeCloseTo(1);
    expect(out[out.length - 1]).toBeCloseTo(-1);
  });

  it("interpolates linearly when doubling", () => {
    const out = resample(new Float32Array([0, 1]), 1, 2);
    // Source positions 0, 0.5, 1 → 0, 0.5, 1 (the last clamps to the end).
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0.5);
  });

  it("preserves a ramp's shape across a real rate change", () => {
    const samples = new Float32Array(1000);
    for (let i = 0; i < samples.length; i++) samples[i] = i / (samples.length - 1);
    const out = resample(samples, 48000, 44100);
    // Every sample should still sit on the same line, within interpolation error.
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(i / (out.length - 1), 2);
    }
  });

  it("handles an empty buffer", () => {
    expect(resample(new Float32Array(0), 48000, 44100)).toHaveLength(0);
  });
});
