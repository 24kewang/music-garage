import { describe, expect, it } from "vitest";

import { checkedFiles, coerceExcluded } from "./selection";

describe("coerceExcluded", () => {
  it("keeps string entries of an array", () => {
    expect([...coerceExcluded(["a.png", "b/c.png"])].sort()).toEqual([
      "a.png",
      "b/c.png",
    ]);
  });

  it("drops non-string entries individually", () => {
    expect([...coerceExcluded(["a.png", 3, null, {}, "b.png"])].sort()).toEqual([
      "a.png",
      "b.png",
    ]);
  });

  it("falls back to empty for non-arrays", () => {
    expect(coerceExcluded(undefined).size).toBe(0);
    expect(coerceExcluded("a.png").size).toBe(0);
    expect(coerceExcluded({ excluded: [] }).size).toBe(0);
  });
});

describe("checkedFiles", () => {
  it("checks everything not excluded", () => {
    const checked = checkedFiles(["a.png", "b.png", "c.png"], new Set(["b.png"]));
    expect([...checked].sort()).toEqual(["a.png", "c.png"]);
  });

  it("checks everything when the excluded set is empty (new-upload default)", () => {
    const checked = checkedFiles(["a.png", "b.png"], new Set());
    expect(checked.size).toBe(2);
  });

  it("ignores stale exclusions for files that no longer exist", () => {
    const checked = checkedFiles(["a.png"], new Set(["gone.png"]));
    expect(checked.has("a.png")).toBe(true);
  });
});
