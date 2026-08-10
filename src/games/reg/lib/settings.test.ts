import { describe, expect, it } from "vitest";

import {
  BOUNDS,
  DEFAULT_SETTINGS,
  coerceSettings,
  isInRange,
  placementFromSettings,
} from "./settings";

describe("isInRange", () => {
  it("accepts the bounds themselves", () => {
    expect(isInRange("offsetX", BOUNDS.offsetX.min)).toBe(true);
    expect(isInRange("offsetX", BOUNDS.offsetX.max)).toBe(true);
    expect(isInRange("scalePercent", 100)).toBe(true);
  });

  it("rejects values outside the range", () => {
    expect(isInRange("offsetX", BOUNDS.offsetX.max + 0.1)).toBe(false);
    expect(isInRange("offsetY", BOUNDS.offsetY.min - 0.1)).toBe(false);
    expect(isInRange("scalePercent", 0)).toBe(false);
    expect(isInRange("scalePercent", 1000)).toBe(false);
  });

  it("rejects non-finite and non-numbers", () => {
    expect(isInRange("offsetZ", Number.NaN)).toBe(false);
    expect(isInRange("offsetZ", Number.POSITIVE_INFINITY)).toBe(false);
    expect(isInRange("offsetZ", "0")).toBe(false);
    expect(isInRange("offsetZ", null)).toBe(false);
    expect(isInRange("offsetZ", undefined)).toBe(false);
  });
});

describe("coerceSettings", () => {
  it("adopts every valid field", () => {
    const stored = {
      offsetX: 0.5,
      offsetY: 1.25,
      offsetZ: -1,
      scalePercent: 150,
      showCaption: false,
    };
    expect(coerceSettings(stored)).toEqual(stored);
  });

  it("only accepts a real boolean for showCaption", () => {
    expect(coerceSettings({ showCaption: false }).showCaption).toBe(false);
    for (const junk of ["false", 0, 1, null]) {
      expect(coerceSettings({ showCaption: junk }).showCaption).toBe(true);
    }
  });

  it("defaults each bad field individually, keeping its siblings", () => {
    const result = coerceSettings({
      offsetX: 0.4,
      offsetY: 99,
      offsetZ: "close",
      scalePercent: 150,
    });
    expect(result.offsetX).toBe(0.4);
    expect(result.scalePercent).toBe(150);
    expect(result.offsetY).toBe(DEFAULT_SETTINGS.offsetY);
    expect(result.offsetZ).toBe(DEFAULT_SETTINGS.offsetZ);
  });

  it("rejects a stringified number, like the other games' settings do", () => {
    expect(coerceSettings({ scalePercent: "150" }).scalePercent).toBe(
      DEFAULT_SETTINGS.scalePercent,
    );
  });

  it("falls back entirely for non-objects", () => {
    expect(coerceSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("does not hand back a reference to the defaults", () => {
    const result = coerceSettings({});
    result.scalePercent = 250;
    expect(DEFAULT_SETTINGS.scalePercent).toBe(100);
  });

  it("never returns a config the filter can't render", () => {
    for (const junk of [
      {},
      [],
      { offsetX: "0" },
      { scalePercent: 0 },
      { offsetY: Number.NaN, offsetZ: Number.POSITIVE_INFINITY },
      { offsetX: 1e999 },
      { showCaption: "yes" },
    ]) {
      const result = coerceSettings(junk);
      expect(isInRange("offsetX", result.offsetX)).toBe(true);
      expect(isInRange("offsetY", result.offsetY)).toBe(true);
      expect(isInRange("offsetZ", result.offsetZ)).toBe(true);
      expect(isInRange("scalePercent", result.scalePercent)).toBe(true);
      expect(typeof result.showCaption).toBe("boolean");
    }
  });
});

describe("placementFromSettings", () => {
  it("turns the percentage into a multiplier", () => {
    expect(placementFromSettings({ ...DEFAULT_SETTINGS, scalePercent: 250 }).scale).toBe(
      2.5,
    );
    expect(placementFromSettings(DEFAULT_SETTINGS).scale).toBe(1);
  });

  it("passes the offsets through", () => {
    const placement = placementFromSettings({
      offsetX: -1,
      offsetY: 2,
      offsetZ: 0.5,
      scalePercent: 100,
      showCaption: true,
    });
    expect(placement).toEqual({ x: -1, y: 2, z: 0.5, scale: 1 });
  });

  it("defaults line up with the scene config", () => {
    expect(placementFromSettings(DEFAULT_SETTINGS)).toEqual({
      x: DEFAULT_SETTINGS.offsetX,
      y: DEFAULT_SETTINGS.offsetY,
      z: DEFAULT_SETTINGS.offsetZ,
      scale: 1,
    });
  });
});
