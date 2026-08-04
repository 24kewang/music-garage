import { describe, expect, it } from "vitest";
import { midiToFrequency, parseNoteName } from "@/shared/audio";
import { config } from "../config";
import { polar } from "./geometry";
import {
  intonationNeedleDeg,
  intonationTicks,
  midiToNeedleDeg,
  pitchNeedleDeg,
  pitchTicks,
} from "./modes";

const MAX = config.geometry.scaleMaxDeg;
const C4 = parseNoteName("C4")!;
const C5 = parseNoteName("C5")!;

describe("pitchNeedleDeg", () => {
  it("puts the low note at the left edge and the high note at the right", () => {
    expect(pitchNeedleDeg(midiToFrequency(C4), C4, C5)).toBeCloseTo(-MAX, 6);
    expect(pitchNeedleDeg(midiToFrequency(C5), C4, C5)).toBeCloseTo(MAX, 6);
  });

  it("puts the midpoint of the range at the centre", () => {
    // F#4 is six semitones into a one-octave range.
    expect(pitchNeedleDeg(midiToFrequency(C4 + 6), C4, C5)).toBeCloseTo(0, 6);
  });

  it("is linear in semitones, not in hertz", () => {
    // A quarter of an octave up should sit a quarter of the way across, even though
    // frequency has risen by much less than a quarter of the range in Hz.
    expect(pitchNeedleDeg(midiToFrequency(C4 + 3), C4, C5)).toBeCloseTo(-MAX / 2, 6);
  });

  it("tracks pitches between semitones", () => {
    const quarterToneSharp = midiToFrequency(C4 + 6.5);
    const deg = pitchNeedleDeg(quarterToneSharp, C4, C5);
    expect(deg).toBeGreaterThan(0);
    expect(deg).toBeLessThan(midiToNeedleDeg(C4 + 7, C4, C5));
  });

  it("clips at both ends rather than running off the dial", () => {
    expect(pitchNeedleDeg(midiToFrequency(C4 - 24), C4, C5)).toBe(-MAX);
    expect(pitchNeedleDeg(midiToFrequency(C5 + 24), C4, C5)).toBe(MAX);
  });

  it("survives a degenerate range instead of dividing by zero", () => {
    expect(pitchNeedleDeg(midiToFrequency(C4), C4, C4)).toBe(0);
  });
});

describe("intonationNeedleDeg", () => {
  it("centres a perfectly in-tune note", () => {
    expect(intonationNeedleDeg(0, 50)).toBe(0);
  });

  it("pushes sharp to the right and flat to the left", () => {
    expect(intonationNeedleDeg(25, 50)).toBeCloseTo(MAX / 2, 6);
    expect(intonationNeedleDeg(-25, 50)).toBeCloseTo(-MAX / 2, 6);
  });

  it("reaches the edges at ±span", () => {
    expect(intonationNeedleDeg(50, 50)).toBeCloseTo(MAX, 6);
    expect(intonationNeedleDeg(-10, 10)).toBeCloseTo(-MAX, 6);
  });

  it("clips beyond the span, so a narrow span magnifies small errors", () => {
    expect(intonationNeedleDeg(40, 10)).toBe(MAX);
    expect(intonationNeedleDeg(-40, 10)).toBe(-MAX);
  });

  it("survives a zero span", () => {
    expect(intonationNeedleDeg(20, 0)).toBe(0);
  });
});

describe("pitchTicks", () => {
  it("puts a major tick on every semitone", () => {
    const majors = pitchTicks(C4, C5).filter((tick) => tick.major);
    expect(majors).toHaveLength(13); // 12 semitones, inclusive of both ends
    expect(majors[0].deg).toBeCloseTo(-MAX, 6);
    expect(majors[majors.length - 1].deg).toBeCloseTo(MAX, 6);
  });

  it("labels majors with note names, low to high", () => {
    const labels = pitchTicks(C4, C5)
      .filter((tick) => tick.label)
      .map((tick) => tick.label);
    expect(labels[0]).toBe("C4");
    expect(labels[labels.length - 1]).toBe("C5");
    expect(labels).toContain("F#4");
  });

  it("lines ticks up with where the needle actually sits", () => {
    const a4 = parseNoteName("A4")!;
    const tick = pitchTicks(C4, C5).find((t) => t.label === "A4");
    expect(tick!.deg).toBeCloseTo(pitchNeedleDeg(midiToFrequency(a4), C4, C5), 6);
  });

  it("thins labels on wide ranges so they don't collide", () => {
    const wide = pitchTicks(parseNoteName("C2")!, parseNoteName("C6")!);
    const majors = wide.filter((t) => t.major);
    const labelled = wide.filter((t) => t.label);
    expect(majors.length).toBe(49);
    expect(labelled.length).toBeLessThan(majors.length);
  });

  it("drops minor ticks when they would be too dense to read", () => {
    const wide = pitchTicks(parseNoteName("C1")!, parseNoteName("C7")!);
    expect(wide.every((tick) => tick.major)).toBe(true);
  });

  it("returns nothing for a degenerate range", () => {
    expect(pitchTicks(C4, C4)).toEqual([]);
  });
});

/**
 * The window is a plain semicircle, so anything drawn below its straight edge (y > 0)
 * is clipped. The outermost label is the one at risk: it sits close to that edge and
 * is rotated to run almost vertically, so its own length is what carries it across.
 *
 * This is why the scale stops short of the needle's full travel. It fires if anyone
 * later widens `scaleMaxDeg` or grows the label.
 */
describe("outermost label clearance", () => {
  const { labelRadius, labelSize } = config.ticks;

  /** Lowest point of a label of `chars` characters, placed at the end of the scale. */
  function lowestPoint(chars: number): number {
    // Rough metrics: glyphs average ~0.6em wide, and the em box is labelSize tall.
    const halfWidth = (chars * labelSize * 0.6) / 2;
    const halfHeight = labelSize / 2;

    const centre = polar(labelRadius, MAX);
    const radians = (MAX * Math.PI) / 180;
    // Rotated by MAX about its own centre: the text runs along (cos, sin) and its
    // height lies along (-sin, cos).
    return (
      centre.y +
      Math.abs(Math.sin(radians)) * halfWidth +
      Math.abs(Math.cos(radians)) * halfHeight
    );
  }

  it("keeps the widest note name above the window's straight edge", () => {
    // "C#4" is the worst case a note name can produce.
    expect(lowestPoint(3)).toBeLessThan(0);
  });

  it("would clip at the needle's full travel, which is why the scale stops short", () => {
    expect(config.geometry.scaleMaxDeg).toBeLessThan(config.geometry.needleMaxDeg);
  });
});

describe("intonationTicks", () => {
  it("labels in cents with zero at the centre", () => {
    const labels = intonationTicks(50)
      .filter((tick) => tick.label)
      .map((tick) => tick.label);
    expect(labels).toEqual(["-50", "-40", "-30", "-20", "-10", "0", "10", "20", "30", "40", "50"]);
  });

  it("puts zero exactly at the centre of the dial", () => {
    const zero = intonationTicks(50).find((tick) => tick.label === "0");
    expect(zero!.deg).toBe(0);
  });

  it("is symmetric about the centre", () => {
    const ticks = intonationTicks(40);
    const degrees = ticks.map((tick) => tick.deg);
    for (const deg of degrees) {
      expect(degrees.some((other) => Math.abs(other + deg) < 1e-9)).toBe(true);
    }
  });

  it("is sorted left to right", () => {
    const degrees = intonationTicks(50).map((tick) => tick.deg);
    expect([...degrees].sort((a, b) => a - b)).toEqual(degrees);
  });

  it("handles a span that isn't a whole number of label steps", () => {
    const ticks = intonationTicks(25);
    const labels = ticks.filter((tick) => tick.label).map((tick) => tick.label);
    expect(labels).toEqual(["-20", "-10", "0", "10", "20"]);
    // Nothing runs off the end of the dial.
    expect(Math.max(...ticks.map((t) => Math.abs(t.deg)))).toBeLessThanOrEqual(MAX);
  });

  it("returns nothing for a zero span", () => {
    expect(intonationTicks(0)).toEqual([]);
  });
});
