/**
 * Geometry for dragging a row of a vertical list into a new slot.
 *
 * Shared because two features reorder lists this way — the Loop Station's tracks
 * and MUSIC's player order — and the fiddly parts are identical in both. Kept pure
 * and free of the DOM so which slot the pointer is over, and how far each sibling
 * has to move to open it, are Node-testable rather than only discoverable by
 * dragging things in a browser.
 *
 * All coordinates are **list-content** coordinates (`offsetTop`/`offsetHeight`
 * inside the scrolling list), never viewport ones, so auto-scrolling mid-drag
 * doesn't invalidate a measurement.
 */

export interface RowBox {
  /** Distance from the top of the list's content to the top of the row. */
  top: number;
  height: number;
}

/** Move one item, returning a new array. Out-of-range indices are clamped. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const target = Math.min(next.length - 1, Math.max(0, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

const center = (row: RowBox) => row.top + row.height / 2;

/**
 * Which slot the dragged row currently occupies, given where its center has
 * been dragged to.
 *
 * Counting how many *other* rows sit above that center gives the destination
 * index directly — it is the position the row would land in after being removed
 * and re-inserted, which is exactly what `moveItem` does. Counting rather than
 * accumulating means variable row heights need no special handling and the
 * result never drifts over a long drag.
 *
 * `maxIndex` is the floor, for lists with pinned rows at the bottom — the Loop
 * Station pins an in-progress track and everything below it — so the slot is
 * capped just above them. Lists with nothing pinned can leave it at its default.
 */
export function targetIndex(
  rows: readonly RowBox[],
  fromIndex: number,
  centerY: number,
  maxIndex: number = rows.length - 1,
): number {
  let index = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i === fromIndex) continue;
    if (center(rows[i]) < centerY) index++;
  }
  return Math.min(Math.max(0, maxIndex), Math.max(0, index));
}

/**
 * How far the row at `index` translates while a drag is in flight.
 *
 * Only the rows between the origin and the destination move, and they all move
 * by the same amount — the space the dragged row vacates. The dragged row
 * itself returns 0 here; it follows the pointer instead.
 */
export function shiftFor(
  index: number,
  fromIndex: number,
  toIndex: number,
  shiftPx: number,
): number {
  if (index === fromIndex) return 0;
  if (toIndex > fromIndex && index > fromIndex && index <= toIndex) return -shiftPx;
  if (toIndex < fromIndex && index >= toIndex && index < fromIndex) return shiftPx;
  return 0;
}

/**
 * The vertical gap between rows, read off two measured rows rather than
 * hardcoded, so it follows whatever the stylesheet's gap token is.
 */
export function gapBetween(rows: readonly RowBox[]): number {
  if (rows.length < 2) return 0;
  return Math.max(0, rows[1].top - (rows[0].top + rows[0].height));
}
