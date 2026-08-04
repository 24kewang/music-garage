import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  coerceSettings,
  needsMicrophone,
  validatePitchRange,
  validateSpan,
} from "./settings";

describe("validatePitchRange", () => {
  it("accepts a valid ascending range", () => {
    const result = validatePitchRange("C4", "C5");
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ lowMidi: 60, highMidi: 72 });
  });

  it("accepts flats, sharps and stray whitespace", () => {
    expect(validatePitchRange(" bb3 ", "F#5").ok).toBe(true);
  });

  it("rejects note names it can't parse, naming the offender", () => {
    const low = validatePitchRange("H4", "C5");
    expect(low.ok).toBe(false);
    expect(!low.ok && low.error).toContain("H4");

    const high = validatePitchRange("C4", "banana");
    expect(high.ok).toBe(false);
    expect(!high.ok && high.error).toContain("banana");
  });

  it("rejects an inverted range", () => {
    expect(validatePitchRange("C5", "C4").ok).toBe(false);
  });

  it("rejects a range with no width", () => {
    expect(validatePitchRange("C4", "C4").ok).toBe(false);
  });

  it("accepts the narrowest useful range", () => {
    expect(validatePitchRange("C4", "C#4").ok).toBe(true);
  });

  it("rejects empty input", () => {
    expect(validatePitchRange("", "C5").ok).toBe(false);
  });
});

describe("validateSpan", () => {
  it("accepts whole numbers in range", () => {
    expect(validateSpan("50")).toEqual({ ok: true, value: 50 });
    expect(validateSpan(10)).toEqual({ ok: true, value: 10 });
    expect(validateSpan(" 25 ")).toEqual({ ok: true, value: 25 });
  });

  it("rejects values outside 10–50", () => {
    expect(validateSpan(0).ok).toBe(false);
    expect(validateSpan(51).ok).toBe(false);
    expect(validateSpan(-10).ok).toBe(false);
  });

  it("rejects spans too narrow to carry a label", () => {
    // The scale is labelled every 10 cents, so anything under that draws a bare scale.
    expect(validateSpan(1).ok).toBe(false);
    expect(validateSpan(9).ok).toBe(false);
  });

  it("rejects fractions and non-numbers", () => {
    expect(validateSpan("12.5").ok).toBe(false);
    expect(validateSpan("wide").ok).toBe(false);
    expect(validateSpan("").ok).toBe(false);
    expect(validateSpan("   ").ok).toBe(false);
  });
});

describe("coerceSettings", () => {
  it("returns defaults for anything that isn't an object", () => {
    expect(coerceSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a valid stored object", () => {
    const stored = {
      mode: "intonation",
      pitchLow: "A3",
      pitchHigh: "A5",
      intonationSpanCents: 20,
    };
    expect(coerceSettings(stored)).toEqual(stored);
  });

  it("keeps valid fields when others are corrupt", () => {
    const result = coerceSettings({
      mode: "pitch",
      pitchLow: "not-a-note",
      pitchHigh: "C5",
      intonationSpanCents: 999,
    });

    // The good field survives; the bad ones fall back rather than failing the load.
    expect(result.mode).toBe("pitch");
    expect(result.pitchLow).toBe(DEFAULT_SETTINGS.pitchLow);
    expect(result.pitchHigh).toBe(DEFAULT_SETTINGS.pitchHigh);
    expect(result.intonationSpanCents).toBe(DEFAULT_SETTINGS.intonationSpanCents);
  });

  it("rejects an unknown mode", () => {
    expect(coerceSettings({ mode: "telepathy" }).mode).toBe(DEFAULT_SETTINGS.mode);
  });

  it("rejects a stored range that is inverted", () => {
    const result = coerceSettings({ pitchLow: "C5", pitchHigh: "C4" });
    expect(result.pitchLow).toBe(DEFAULT_SETTINGS.pitchLow);
    expect(result.pitchHigh).toBe(DEFAULT_SETTINGS.pitchHigh);
  });

  it("never returns a config the game can't run", () => {
    for (const junk of [{}, { pitchLow: 5 }, { intonationSpanCents: "50" }, []]) {
      const result = coerceSettings(junk);
      expect(validatePitchRange(result.pitchLow, result.pitchHigh).ok).toBe(true);
      expect(validateSpan(result.intonationSpanCents).ok).toBe(true);
    }
  });
});

describe("needsMicrophone", () => {
  it("is true only for the audio-driven modes", () => {
    expect(needsMicrophone("manual")).toBe(false);
    expect(needsMicrophone("pitch")).toBe(true);
    expect(needsMicrophone("intonation")).toBe(true);
  });
});
