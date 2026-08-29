import { describe, expect, it } from "vitest";
import { gapBetween, moveItem, shiftFor, targetIndex, type RowBox } from "./reorder";

/** Five rows of 60px with a 12px gap — the collapsed track list. */
function evenRows(count = 5, height = 60, gap = 12): RowBox[] {
  return Array.from({ length: count }, (_, i) => ({ top: i * (height + gap), height }));
}

/** Rows of differing heights, as an overwrite marker or an expanded row makes. */
const unevenRows: RowBox[] = [
  { top: 0, height: 60 },
  { top: 72, height: 90 },
  { top: 174, height: 60 },
  { top: 246, height: 120 },
];

const center = (row: RowBox) => row.top + row.height / 2;

describe("moveItem", () => {
  it("moves an item down", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op for the same index", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("clamps a target past either end", () => {
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
  });

  it("returns a copy, leaving the input alone", () => {
    const original = ["a", "b", "c"];
    expect(moveItem(original, 0, 2)).not.toBe(original);
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("ignores an out-of-range source", () => {
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("targetIndex", () => {
  const rows = evenRows();

  it("holds its place when the row hasn't moved", () => {
    expect(targetIndex(rows, 2, center(rows[2]))).toBe(2);
  });

  it("takes the next slot down once it passes that row's center", () => {
    // Just short of row 3's center: still slot 2.
    expect(targetIndex(rows, 2, center(rows[3]) - 1)).toBe(2);
    // Past it: slot 3.
    expect(targetIndex(rows, 2, center(rows[3]) + 1)).toBe(3);
  });

  it("takes the next slot up once it passes above that row's center", () => {
    expect(targetIndex(rows, 2, center(rows[1]) + 1)).toBe(2);
    expect(targetIndex(rows, 2, center(rows[1]) - 1)).toBe(1);
  });

  it("clamps at both ends of the list", () => {
    expect(targetIndex(rows, 2, -10_000)).toBe(0);
    expect(targetIndex(rows, 2, 10_000)).toBe(rows.length - 1);
  });

  it("works with rows of differing heights", () => {
    // Dragging the first row down past the tall second row.
    expect(targetIndex(unevenRows, 0, center(unevenRows[1]) - 1)).toBe(0);
    expect(targetIndex(unevenRows, 0, center(unevenRows[1]) + 1)).toBe(1);
    // And all the way to the bottom.
    expect(targetIndex(unevenRows, 0, center(unevenRows[3]) + 1)).toBe(3);
  });

  it("caps at the floor so nothing lands below an in-progress track", () => {
    // Row 4 is in-progress, so the last usable slot is 3.
    const floor = 3;
    expect(targetIndex(rows, 0, 10_000, floor)).toBe(3);
    expect(targetIndex(rows, 0, center(rows[4]) + 1, floor)).toBe(3);
    // Slots above the floor are unaffected.
    expect(targetIndex(rows, 0, center(rows[2]) + 1, floor)).toBe(2);
  });

  it("pins everything to slot 0 when only the first row is free", () => {
    expect(targetIndex(rows, 0, 10_000, 0)).toBe(0);
  });
});

describe("shiftFor", () => {
  const shift = 72;

  it("moves the rows in between up when dragging down", () => {
    // Row 1 dragged to slot 3: rows 2 and 3 slide up to fill the gap.
    expect(shiftFor(0, 1, 3, shift)).toBe(0);
    expect(shiftFor(1, 1, 3, shift)).toBe(0); // the dragged row follows the pointer
    expect(shiftFor(2, 1, 3, shift)).toBe(-shift);
    expect(shiftFor(3, 1, 3, shift)).toBe(-shift);
    expect(shiftFor(4, 1, 3, shift)).toBe(0);
  });

  it("moves the rows in between down when dragging up", () => {
    // Row 3 dragged to slot 1: rows 1 and 2 slide down.
    expect(shiftFor(0, 3, 1, shift)).toBe(0);
    expect(shiftFor(1, 3, 1, shift)).toBe(shift);
    expect(shiftFor(2, 3, 1, shift)).toBe(shift);
    expect(shiftFor(3, 3, 1, shift)).toBe(0);
    expect(shiftFor(4, 3, 1, shift)).toBe(0);
  });

  it("moves nothing when the row is back in its own slot", () => {
    for (let i = 0; i < 5; i++) expect(shiftFor(i, 2, 2, shift)).toBe(0);
  });
});

describe("gapBetween", () => {
  it("reads the gap off two measured rows", () => {
    expect(gapBetween(evenRows(3, 60, 12))).toBe(12);
    expect(gapBetween(unevenRows)).toBe(12);
  });

  it("is zero when there aren't two rows to compare", () => {
    expect(gapBetween([])).toBe(0);
    expect(gapBetween([{ top: 0, height: 60 }])).toBe(0);
  });
});
