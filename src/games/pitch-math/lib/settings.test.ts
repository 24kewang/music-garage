import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, coerceSettings, type Settings } from "./settings";

describe("DEFAULT_SETTINGS", () => {
  it("starts in absolute mode at concert pitch with full names", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      mode: "absolute",
      transposition: "C",
      abbreviate: false,
    });
  });
});

describe("coerceSettings", () => {
  it("accepts a complete, valid object", () => {
    const stored: Settings = {
      mode: "relative",
      transposition: "Bb",
      abbreviate: true,
    };
    expect(coerceSettings(stored)).toEqual(stored);
  });

  it("falls back to defaults for anything that isn't an object", () => {
    for (const raw of [null, undefined, 42, "settings", []]) {
      expect(coerceSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("keeps the valid fields when one is bad", () => {
    // The point of coercing field by field: a setting that has drifted shouldn't cost
    // the player the ones that are still fine.
    const result = coerceSettings({
      mode: "relative",
      transposition: "Q#",
      abbreviate: true,
    });

    expect(result.mode).toBe("relative");
    expect(result.abbreviate).toBe(true);
    expect(result.transposition).toBe(DEFAULT_SETTINGS.transposition);
  });

  it("rejects a mode that isn't one of the two", () => {
    expect(coerceSettings({ mode: "fuzzy" }).mode).toBe(DEFAULT_SETTINGS.mode);
  });

  it("rejects a transposition that isn't offered", () => {
    expect(coerceSettings({ transposition: "G" }).transposition).toBe("C");
    for (const transposition of ["C", "Bb", "Eb", "F"]) {
      expect(coerceSettings({ transposition }).transposition).toBe(transposition);
    }
  });

  it("won't take a truthy non-boolean as a checkbox value", () => {
    expect(coerceSettings({ abbreviate: "yes" }).abbreviate).toBe(false);
    expect(coerceSettings({ abbreviate: 1 }).abbreviate).toBe(false);
    expect(coerceSettings({ abbreviate: false }).abbreviate).toBe(false);
    expect(coerceSettings({ abbreviate: true }).abbreviate).toBe(true);
  });

  it("never returns the defaults object itself", () => {
    // Handing back the shared constant would let a later edit mutate the defaults.
    const result = coerceSettings(null);
    expect(result).not.toBe(DEFAULT_SETTINGS);
    result.mode = "relative";
    expect(DEFAULT_SETTINGS.mode).toBe("absolute");
  });

  it("ignores unknown fields rather than passing them through", () => {
    const result = coerceSettings({ mode: "relative", legacyOption: true });
    expect(Object.keys(result).sort()).toEqual([
      "abbreviate",
      "mode",
      "transposition",
    ]);
  });
});
