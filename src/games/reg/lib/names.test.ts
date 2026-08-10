import { describe, expect, it } from "vitest";

import { excerptName, excerptSegments, truncateExcerptName } from "./names";

describe("excerptSegments", () => {
  it("splits folders and strips the extension", () => {
    expect(excerptSegments("orchestral/mahler/Symphony No. 5.png")).toEqual([
      "orchestral",
      "mahler",
      "Symphony No. 5",
    ]);
  });

  it("keeps a dotless file name whole", () => {
    expect(excerptSegments("a/score")).toEqual(["a", "score"]);
  });

  it("keeps a leading dot (hidden-file style) intact", () => {
    expect(excerptSegments(".hidden")).toEqual([".hidden"]);
  });
});

describe("truncateExcerptName", () => {
  it("returns the full name when it fits", () => {
    expect(truncateExcerptName(["a", "b", "song"], 20)).toBe("a - b - song");
  });

  it("drops the longest folder first, regardless of depth", () => {
    // "short - longestfolder - mid - song" (34) → drop "longestfolder" first.
    const segments = ["short", "longestfolder", "mid", "song"];
    expect(truncateExcerptName(segments, 24)).toBe("short - mid - song");
  });

  it("breaks folder-length ties by dropping the leftmost", () => {
    const segments = ["aaa", "bbb", "song"];
    expect(truncateExcerptName(segments, 12)).toBe("bbb - song");
  });

  it("never drops the file name, even when a folder is shorter", () => {
    const segments = ["ab", "a very long file name indeed"];
    expect(truncateExcerptName(segments, 28)).toBe(
      "a very long file name indeed",
    );
  });

  it("ellipsis-truncates the file name once no folders remain", () => {
    expect(truncateExcerptName(["folder", "unabbreviatable name"], 10)).toBe(
      "unabbrevi…",
    );
    expect(truncateExcerptName(["folder", "unabbreviatable name"], 10)).toHaveLength(10);
  });

  it("handles tiny budgets", () => {
    expect(truncateExcerptName(["abc"], 1)).toBe("…");
    expect(truncateExcerptName(["abc"], 0)).toBe("…");
  });
});

describe("excerptName", () => {
  it("composes the pipeline", () => {
    expect(excerptName("orchestral/mahler/Symphony No. 5.png", 42)).toBe(
      "orchestral - mahler - Symphony No. 5",
    );
  });

  it("supports a custom separator", () => {
    expect(excerptName("a/b/c.png", 42, " / ")).toBe("a / b / c");
  });
});
