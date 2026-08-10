import { describe, expect, it } from "vitest";

import { isImagePath, normalizePath, splitSegments } from "./paths";

const EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

describe("normalizePath", () => {
  it("strips leading slashes and ./", () => {
    expect(normalizePath("/a/b.png")).toBe("a/b.png");
    expect(normalizePath("./a/b.png")).toBe("a/b.png");
  });

  it("converts backslashes and collapses empty segments", () => {
    expect(normalizePath("a\\b\\c.png")).toBe("a/b/c.png");
    expect(normalizePath("a//b///c.png")).toBe("a/b/c.png");
  });

  it("leaves an already-normal path alone", () => {
    expect(normalizePath("a/b/c.png")).toBe("a/b/c.png");
  });
});

describe("splitSegments", () => {
  it("splits a nested path", () => {
    expect(splitSegments("a/b/c.png")).toEqual(["a", "b", "c.png"]);
  });

  it("handles a bare file name", () => {
    expect(splitSegments("c.png")).toEqual(["c.png"]);
  });
});

describe("isImagePath", () => {
  it("accepts allowlisted extensions case-insensitively", () => {
    expect(isImagePath("a/b.PNG", EXTENSIONS)).toBe(true);
    expect(isImagePath("a/b.jpeg", EXTENSIONS)).toBe(true);
  });

  it("rejects other extensions and extensionless names", () => {
    expect(isImagePath("a/b.pdf", EXTENSIONS)).toBe(false);
    expect(isImagePath("a/noext", EXTENSIONS)).toBe(false);
    expect(isImagePath("a/trailingdot.", EXTENSIONS)).toBe(false);
  });

  it("uses only the last extension", () => {
    expect(isImagePath("a/b.png.pdf", EXTENSIONS)).toBe(false);
    expect(isImagePath("a/b.pdf.png", EXTENSIONS)).toBe(true);
  });
});
