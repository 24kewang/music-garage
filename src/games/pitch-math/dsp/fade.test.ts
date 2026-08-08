import { describe, expect, it } from "vitest";
import { fadeEdges } from "./fade";

const SAMPLE_RATE = 48000;

/** A clip of constant 1s, so any change is entirely the fade's doing. */
const flat = (length: number) => new Float32Array(length).fill(1);

describe("fadeEdges", () => {
  it("silences the very first and last sample", () => {
    // The two points that would otherwise be a step from silence.
    const samples = fadeEdges(flat(4800), SAMPLE_RATE, 8);
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(0);
  });

  it("ramps up at the start and down at the end", () => {
    const samples = fadeEdges(flat(4800), SAMPLE_RATE, 8);
    const fade = Math.floor((8 / 1000) * SAMPLE_RATE);

    for (let i = 1; i < fade; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
      expect(samples[samples.length - 1 - i]).toBeGreaterThan(
        samples[samples.length - i],
      );
    }
  });

  it("leaves the middle of the clip alone", () => {
    const samples = fadeEdges(flat(4800), SAMPLE_RATE, 8);
    const fade = Math.floor((8 / 1000) * SAMPLE_RATE);

    for (let i = fade; i < samples.length - fade; i++) {
      expect(samples[i]).toBe(1);
    }
  });

  it("reaches full level by the end of the ramp", () => {
    const samples = fadeEdges(flat(4800), SAMPLE_RATE, 8);
    const fade = Math.floor((8 / 1000) * SAMPLE_RATE);
    expect(samples[fade]).toBe(1);
  });

  it("is symmetric", () => {
    const samples = fadeEdges(flat(4800), SAMPLE_RATE, 8);
    for (let i = 0; i < 100; i++) {
      expect(samples[i]).toBeCloseTo(samples[samples.length - 1 - i], 6);
    }
  });

  it("never scales any sample by more than 1", () => {
    // A ramp that amplified would be a bug, not a fade.
    const samples = fadeEdges(flat(4800), SAMPLE_RATE, 8);
    for (const value of samples) expect(value).toBeLessThanOrEqual(1);
  });

  it("keeps the ramps from overlapping on a very short clip", () => {
    // 10 samples with an 8 ms (384-sample) request: naively both ramps would cover the
    // whole clip and every sample would be scaled twice, dipping the middle to nothing.
    const samples = fadeEdges(flat(10), SAMPLE_RATE, 8);
    expect(Math.max(...samples)).toBeGreaterThan(0);
    for (const value of samples) expect(value).toBeLessThanOrEqual(1);
  });

  it("does nothing when asked for no fade", () => {
    expect([...fadeEdges(flat(64), SAMPLE_RATE, 0)]).toEqual(Array(64).fill(1));
    expect([...fadeEdges(flat(64), SAMPLE_RATE, -5)]).toEqual(Array(64).fill(1));
  });

  it("survives an empty clip and a zero sample rate", () => {
    expect(fadeEdges(new Float32Array(0), SAMPLE_RATE, 8)).toHaveLength(0);
    expect([...fadeEdges(flat(8), 0, 8)]).toEqual(Array(8).fill(1));
  });

  it("preserves the sign of the waveform", () => {
    // Fading is a gain change, not a rectifier.
    const samples = new Float32Array(4800);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 2 === 0 ? 0.5 : -0.5;

    fadeEdges(samples, SAMPLE_RATE, 8);

    for (let i = 1; i < samples.length; i++) {
      if (samples[i] === 0) continue;
      expect(Math.sign(samples[i])).toBe(i % 2 === 0 ? 1 : -1);
    }
  });

  it("works in place and returns the same array", () => {
    const samples = flat(4800);
    expect(fadeEdges(samples, SAMPLE_RATE, 8)).toBe(samples);
  });
});
