import { describe, expect, it } from "vitest";
import {
  formatMidi,
  formatNote,
  frequencyToMidi,
  frequencyToNote,
  midiToFrequency,
  midiToNoteName,
  midiToOctave,
  parseNoteName,
} from "./notes";

describe("frequencyToMidi / midiToFrequency", () => {
  it("anchors A4 = 440 Hz at MIDI 69", () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 10);
    expect(midiToFrequency(69)).toBeCloseTo(440, 10);
  });

  it("places middle C (C4, MIDI 60) at 261.63 Hz", () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(frequencyToMidi(261.6256)).toBeCloseTo(60, 3);
  });

  it("treats an octave as 12 semitones", () => {
    expect(midiToFrequency(81)).toBeCloseTo(880, 10); // A5
    expect(midiToFrequency(57)).toBeCloseTo(220, 10); // A3
  });

  it("round-trips across the usable range", () => {
    for (let midi = 21; midi <= 108; midi++) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 9);
    }
  });

  it("honours a non-standard concert pitch", () => {
    expect(midiToFrequency(69, 415)).toBeCloseTo(415, 10);
    expect(frequencyToMidi(415, 415)).toBeCloseTo(69, 10);
  });
});

describe("midiToNoteName / midiToOctave", () => {
  it("names the octave boundary correctly", () => {
    // B3 → C4 is where the octave number ticks over.
    expect(midiToNoteName(59)).toBe("B");
    expect(midiToOctave(59)).toBe(3);
    expect(midiToNoteName(60)).toBe("C");
    expect(midiToOctave(60)).toBe(4);
  });

  it("handles the bottom of the MIDI range", () => {
    expect(midiToNoteName(0)).toBe("C");
    expect(midiToOctave(0)).toBe(-1);
  });

  it("names accidentals with sharps", () => {
    expect(midiToNoteName(61)).toBe("C#");
    expect(midiToNoteName(70)).toBe("A#");
  });
});

describe("frequencyToNote", () => {
  it("reports an exact pitch as zero cents", () => {
    const note = frequencyToNote(440)!;
    expect(note.name).toBe("A");
    expect(note.octave).toBe(4);
    expect(note.midi).toBe(69);
    expect(note.cents).toBeCloseTo(0, 6);
    expect(formatNote(note)).toBe("A4");
  });

  it("reports a sharp pitch as positive cents", () => {
    // 25 cents above A4.
    const note = frequencyToNote(midiToFrequency(69.25))!;
    expect(note.midi).toBe(69);
    expect(note.cents).toBeCloseTo(25, 6);
  });

  it("reports a flat pitch as negative cents", () => {
    const note = frequencyToNote(midiToFrequency(68.7))!;
    expect(note.midi).toBe(69);
    expect(note.cents).toBeCloseTo(-30, 6);
  });

  it("snaps to the nearer neighbour past the halfway point", () => {
    const note = frequencyToNote(midiToFrequency(69.6))!;
    expect(note.midi).toBe(70);
    expect(note.name).toBe("A#");
    expect(note.cents).toBeCloseTo(-40, 6);
  });

  it("keeps cents within ±50", () => {
    for (let midi = 40; midi < 80; midi += 0.1) {
      const note = frequencyToNote(midiToFrequency(midi))!;
      expect(Math.abs(note.cents)).toBeLessThanOrEqual(50.000001);
    }
  });

  it("returns null for frequencies that cannot be a note", () => {
    expect(frequencyToNote(0)).toBeNull();
    expect(frequencyToNote(-100)).toBeNull();
    expect(frequencyToNote(Number.NaN)).toBeNull();
    expect(frequencyToNote(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("parseNoteName", () => {
  it("parses naturals", () => {
    expect(parseNoteName("A4")).toBe(69);
    expect(parseNoteName("C4")).toBe(60);
    expect(parseNoteName("C-1")).toBe(0);
  });

  it("parses sharps and flats, ASCII and Unicode", () => {
    expect(parseNoteName("C#4")).toBe(61);
    expect(parseNoteName("C♯4")).toBe(61);
    expect(parseNoteName("Bb4")).toBe(70);
    expect(parseNoteName("B♭4")).toBe(70);
  });

  it("treats enharmonic spellings as the same pitch", () => {
    expect(parseNoteName("A#4")).toBe(parseNoteName("Bb4"));
    expect(parseNoteName("E4")).toBe(parseNoteName("Fb4"));
    expect(parseNoteName("B4")).toBe(parseNoteName("Cb5"));
  });

  it("stacks repeated accidentals", () => {
    expect(parseNoteName("Bbb4")).toBe(69);
    expect(parseNoteName("C##4")).toBe(62);
  });

  it("is case-insensitive and tolerates whitespace", () => {
    expect(parseNoteName("a4")).toBe(69);
    expect(parseNoteName("  bb4  ")).toBe(70);
  });

  it("rejects anything that is not a note name", () => {
    for (const bad of ["", "H4", "A", "4", "A4.5", "Ab", "hello", "A 4", "#4"]) {
      expect(parseNoteName(bad)).toBeNull();
    }
  });

  it("rejects pitches outside the MIDI range", () => {
    expect(parseNoteName("C-2")).toBeNull();
    expect(parseNoteName("C10")).toBeNull();
  });

  it("round-trips with formatMidi across the usable range", () => {
    for (let midi = 21; midi <= 108; midi++) {
      expect(parseNoteName(formatMidi(midi))).toBe(midi);
    }
  });
});
