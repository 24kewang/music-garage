import { describe, expect, it } from "vitest";
import { melody, phrase, silence } from "./synth";
import { transcribe } from "./transcribe";

const RATE = 48000;

describe("transcribe", () => {
  it("hears a clean melody as the notes that were played", () => {
    const notes = [60, 62, 64, 65, 67];
    expect(transcribe(melody(notes, RATE, 0.4), RATE).notes).toEqual(notes);
  });

  it("hears the same melody transposed as the same shape", () => {
    const played = [60, 62, 64, 65, 67];
    const up = played.map((note) => note + 7);

    const heard = transcribe(melody(up, RATE, 0.4), RATE).notes;
    expect(heard).toEqual(up);
    // Same intervals, which is the only thing scoring will look at.
    const intervals = (seq: number[]) => seq.slice(1).map((n, i) => n - seq[i]);
    expect(intervals(heard)).toEqual(intervals(played));
  });

  it("is unmoved by vibrato", () => {
    const buffer = phrase(
      [65, 67, 69, 71].map((midi) => ({
        midi,
        seconds: 0.5,
        vibratoSemitones: 0.4,
        vibratoHz: 5.5,
      })),
      RATE,
    );
    expect(transcribe(buffer, RATE).notes).toEqual([65, 67, 69, 71]);
  });

  it("does not invent notes out of a portamento between them", () => {
    const buffer = phrase(
      [
        { midi: 60, seconds: 0.5 },
        { midi: 72, seconds: 0.5, glideSeconds: 0.25 },
        { midi: 60, seconds: 0.5, glideSeconds: 0.25 },
      ],
      RATE,
    );
    expect(transcribe(buffer, RATE).notes).toEqual([60, 72, 60]);
  });

  it("does not let a rest re-articulate a repeated note", () => {
    // Rhythm is discarded by design, so two takes of the same pitch either side of
    // a silence are one event — a gap must not be able to fake a repeat.
    const buffer = phrase(
      [
        { midi: 64, seconds: 0.4, gapSeconds: 0.3 },
        { midi: 64, seconds: 0.4, gapSeconds: 0.3 },
        { midi: 67, seconds: 0.4 },
      ],
      RATE,
    );
    expect(transcribe(buffer, RATE).notes).toEqual([64, 67]);
  });

  it("survives a consistently flat performance with its intervals intact", () => {
    const flat = [60, 62, 64, 65].map((midi) => midi - 0.4);
    const buffer = phrase(
      flat.map((midi) => ({ midi, seconds: 0.4 })),
      RATE,
    );
    const result = transcribe(buffer, RATE);

    expect(result.notes).toEqual([60, 62, 64, 65]);
    expect(result.tuningOffset).toBeLessThan(0);
  });

  it("copes with a noisy room", () => {
    const buffer = phrase(
      [62, 64, 66, 67].map((midi) => ({ midi, seconds: 0.45 })),
      RATE,
      0.01,
    );
    expect(transcribe(buffer, RATE).notes).toEqual([62, 64, 66, 67]);
  });

  it("hears nothing in silence", () => {
    expect(transcribe(silence(1, RATE), RATE).notes).toEqual([]);
  });

  it("hears nothing in a buffer too short to analyze", () => {
    expect(transcribe(new Float32Array(256), RATE).notes).toEqual([]);
  });

  it("keeps the intermediate artifacts for the debug view", () => {
    const result = transcribe(melody([60, 64, 67], RATE, 0.4), RATE);

    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.contour.length).toBeGreaterThan(0);
    expect(result.segments).toHaveLength(3);
  });

  it("agrees with itself at 44.1 kHz", () => {
    const notes = [60, 62, 64, 65, 67];
    expect(transcribe(melody(notes, 44100, 0.4), 44100).notes).toEqual(notes);
  });
});
