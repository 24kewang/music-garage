import { describe, expect, it } from "vitest";
import { createPitchDetector, detectPitch } from "./pitch";
import { frequencyToNote } from "./notes";

const SAMPLE_RATE = 48000;
const BUFFER_SIZE = 4096; // matches the analyser fftSize used by useMicrophone

/** A pure sine wave, the simplest thing a pitch detector should nail. */
function sine(frequency: number, amplitude = 0.5): Float32Array {
  const buffer = new Float32Array(BUFFER_SIZE);
  for (let i = 0; i < BUFFER_SIZE; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);
  }
  return buffer;
}

/**
 * A sawtooth-ish tone with harmonics — closer to a real voice or instrument, and the
 * case where naive autocorrelation is prone to octave errors.
 */
function harmonicTone(fundamental: number, amplitude = 0.5): Float32Array {
  const buffer = new Float32Array(BUFFER_SIZE);
  for (let i = 0; i < BUFFER_SIZE; i++) {
    let sample = 0;
    for (let h = 1; h <= 6; h++) {
      sample += Math.sin((2 * Math.PI * fundamental * h * i) / SAMPLE_RATE) / h;
    }
    buffer[i] = amplitude * sample;
  }
  return buffer;
}

function noise(amplitude = 0.5): Float32Array {
  const buffer = new Float32Array(BUFFER_SIZE);
  for (let i = 0; i < BUFFER_SIZE; i++) {
    buffer[i] = amplitude * (Math.random() * 2 - 1);
  }
  return buffer;
}

describe("detectPitch", () => {
  const detector = createPitchDetector(BUFFER_SIZE);

  it.each([110, 220, 440, 880])("detects a %i Hz sine within 1 Hz", (frequency) => {
    const result = detectPitch(detector, sine(frequency), SAMPLE_RATE);
    expect(result).not.toBeNull();
    expect(result!.frequency).toBeCloseTo(frequency, 0);
    expect(result!.clarity).toBeGreaterThan(0.95);
  });

  it("detects the fundamental of a harmonic tone, not a harmonic of it", () => {
    const result = detectPitch(detector, harmonicTone(196), SAMPLE_RATE); // G3
    expect(result).not.toBeNull();
    // Within a few cents of the fundamental — an octave error would land at 98 or 392.
    expect(result!.frequency).toBeGreaterThan(190);
    expect(result!.frequency).toBeLessThan(202);
  });

  it("feeds frequencyToNote to give the expected note name", () => {
    const result = detectPitch(detector, sine(261.63), SAMPLE_RATE);
    const note = frequencyToNote(result!.frequency)!;
    expect(note.name).toBe("C");
    expect(note.octave).toBe(4);
    expect(Math.abs(note.cents)).toBeLessThan(5);
  });

  it("returns null for white noise", () => {
    expect(detectPitch(detector, noise(), SAMPLE_RATE)).toBeNull();
  });

  it("returns null for silence", () => {
    expect(detectPitch(detector, new Float32Array(BUFFER_SIZE), SAMPLE_RATE)).toBeNull();
  });

  it("returns null for a very quiet signal", () => {
    // Well below the -50 dBFS default floor.
    expect(detectPitch(detector, sine(440, 0.0005), SAMPLE_RATE)).toBeNull();
  });

  it("puts the volume floor where the dBFS option says", () => {
    // -40 dBFS is an RMS of 0.01, so a sine needs amplitude 0.01 * sqrt(2) to reach it.
    const floor = createPitchDetector(BUFFER_SIZE, { minVolumeDecibels: -40 });
    const justBelow = sine(440, 0.01 * Math.SQRT2 * 0.8);
    const justAbove = sine(440, 0.01 * Math.SQRT2 * 1.2);

    expect(detectPitch(floor, justBelow, SAMPLE_RATE)).toBeNull();
    expect(detectPitch(floor, justAbove, SAMPLE_RATE)).not.toBeNull();
  });

  it("rejects pitches outside the configured range", () => {
    // 440 Hz is real, but excluded by a deliberately narrow range.
    const result = detectPitch(detector, sine(440), SAMPLE_RATE, {
      minFrequency: 50,
      maxFrequency: 300,
    });
    expect(result).toBeNull();
  });

  it("honours a lowered clarity threshold", () => {
    const clean = detectPitch(detector, sine(440), SAMPLE_RATE, { minClarity: 0.99 });
    expect(clean).not.toBeNull();
  });
});
