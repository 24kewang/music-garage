"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import { gapBetween, shiftFor, targetIndex, type RowBox } from "@/shared/lib/reorder";

/**
 * Drag-to-reorder for the track list.
 *
 * Owns the pointer gesture; the geometry lives in `reorder.ts`, pure and tested.
 * The division of labour here is the same one the playhead and meters use: the
 * dragged row's transform is written **straight to the DOM** every frame, and
 * only the target slot lives in React state, so a drag costs a handful of
 * renders rather than sixty a second.
 */

/** Anything a press should mean something else on: controls, and text. */
const NO_DRAG = 'input, button, select, textarea, [role="slider"], [data-no-drag]';

interface DragState {
  id: number;
  fromIndex: number;
  toIndex: number;
  /**
   * How far a sibling moves to open the slot — the dragged row's height plus
   * the list gap. Held in state rather than read from the measurement ref so
   * `offsetFor` stays a pure function of state during render. Null until the
   * rows have been measured.
   */
  shiftPx: number | null;
}

interface Gesture {
  id: number;
  fromIndex: number;
  pointerId: number;
  /** Pointer position in list-content coordinates when the press began. */
  grabContentY: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  started: boolean;
  /** Touch presses wait for the long-press timer before they may start. */
  armed: boolean;
  longPress: ReturnType<typeof setTimeout> | null;
}

export interface TrackDrag {
  listRef: (node: HTMLDivElement | null) => void;
  onRowPointerDown: (index: number, id: number, event: React.PointerEvent) => void;
  /** True while any row is being dragged — rows must not expand meanwhile. */
  active: boolean;
  draggingId: number | null;
  /**
   * Pixels each row translates to open the destination slot, by index.
   * Precomputed rather than a function the list calls during render.
   */
  offsets: readonly number[];
}

export function useTrackDrag({
  count,
  lockedFrom,
  onMove,
}: {
  count: number;
  /** First pinned index — an in-progress track and everything below it. */
  lockedFrom: number;
  onMove: (id: number, toIndex: number) => void;
}): TrackDrag {
  const [drag, setDrag] = useState<DragState | null>(null);

  const listNode = useRef<HTMLDivElement | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const boxes = useRef<RowBox[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const autoScroll = useRef<number | null>(null);
  /** Latest props, so the window listeners don't need rebinding. */
  const latest = useRef({ count, lockedFrom, onMove });

  useEffect(() => {
    latest.current = { count, lockedFrom, onMove };
  });

  const listRef = useCallback((node: HTMLDivElement | null) => {
    listNode.current = node;
  }, []);

  /** Rows in DOM order, which is render order, which is `session.tracks` order. */
  const rowNodes = useCallback(
    () =>
      Array.from(
        listNode.current?.querySelectorAll<HTMLElement>("[data-track-row]") ?? [],
      ),
    [],
  );

  /**
   * Measure after the commit that starts the drag — by then every row has
   * collapsed, so these are the heights in play for the whole gesture.
   * Coordinates are relative to the list's content, not the viewport, so
   * auto-scrolling doesn't invalidate them.
   */
  useLayoutEffect(() => {
    if (!drag || drag.shiftPx !== null) return;
    const nodes = rowNodes();
    boxes.current = nodes.map((node) => ({
      top: node.offsetTop,
      height: node.offsetHeight,
    }));
    draggedNode.current = nodes[drag.fromIndex] ?? null;
    const box = boxes.current[drag.fromIndex];
    dragRef.current = {
      ...drag,
      shiftPx: box ? box.height + gapBetween(boxes.current) : 0,
    };
    setDrag(dragRef.current);
  }, [drag, rowNodes]);

  const contentY = useCallback((clientY: number) => {
    const list = listNode.current;
    if (!list) return clientY;
    return clientY - list.getBoundingClientRect().top + list.scrollTop;
  }, []);

  const paint = useCallback(() => {
    const g = gesture.current;
    const node = draggedNode.current;
    if (!g || !g.started || !node) return;
    node.style.transform = `translateY(${contentY(g.clientY) - g.grabContentY}px)`;
  }, [contentY]);

  /** Recompute which slot the row is over, from its dragged center. */
  const updateTarget = useCallback(() => {
    const g = gesture.current;
    const d = dragRef.current;
    if (!g || !d || !g.started) return;
    const box = boxes.current[d.fromIndex];
    if (!box) return;
    const centerY = box.top + box.height / 2 + (contentY(g.clientY) - g.grabContentY);
    const to = targetIndex(boxes.current, d.fromIndex, centerY, latest.current.lockedFrom - 1);
    if (to === d.toIndex) return;
    dragRef.current = { ...d, toIndex: to };
    setDrag(dragRef.current);
  }, [contentY]);

  /**
   * Scroll when the pointer nears an edge — with twenty tracks in a scrolling
   * list, dragging from the bottom to the top is impossible without it.
   */
  const stopAutoScroll = useCallback(() => {
    if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  }, []);

  const runAutoScroll = useCallback(() => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      autoScroll.current = requestAnimationFrame(step);

      const list = listNode.current;
      const g = gesture.current;
      if (!list || !g || !g.started) return;

      const rect = list.getBoundingClientRect();
      const { edgePx, autoScrollPxPerSecond } = config.drag;
      const overTop = edgePx - (g.clientY - rect.top);
      const overBottom = edgePx - (rect.bottom - g.clientY);
      let velocity = 0;
      if (overTop > 0) velocity = -(overTop / edgePx) * autoScrollPxPerSecond;
      else if (overBottom > 0) velocity = (overBottom / edgePx) * autoScrollPxPerSecond;
      if (velocity !== 0) list.scrollTop += velocity * dt;

      paint();
      updateTarget();
    };
    autoScroll.current = requestAnimationFrame(step);
  }, [paint, updateTarget]);

  const finish = useCallback(
    (commit: boolean) => {
      const g = gesture.current;
      const d = dragRef.current;
      gesture.current = null;
      dragRef.current = null;
      draggedNode.current = null;
      stopAutoScroll();
      if (g?.longPress) clearTimeout(g.longPress);

      // Clear the dragged row's inline transform, and suppress transitions for
      // one frame: the reorder and the reset land together, so without this
      // every row animates from its drag offset while the DOM order has
      // already changed, and the list visibly swims.
      // Cleared straight off the DOM rather than through the row ref array,
      // which the compiler treats as frozen once it has been closed over.
      const list = listNode.current;
      if (list) {
        list.dataset.dropping = "true";
        list.querySelectorAll<HTMLElement>("[data-track-row]").forEach((node) => {
          node.style.transform = "";
        });
      }
      if (commit && g?.started && d) latest.current.onMove(d.id, d.toIndex);
      setDrag(null);
      requestAnimationFrame(() => {
        if (list) delete list.dataset.dropping;
      });
    },
    [stopAutoScroll],
  );

  /** Promote an armed press into a real drag. */
  const begin = useCallback(() => {
    const g = gesture.current;
    if (!g || g.started) return;
    g.started = true;
    dragRef.current = {
      id: g.id,
      fromIndex: g.fromIndex,
      toIndex: g.fromIndex,
      shiftPx: null,
    };
    setDrag(dragRef.current);
    runAutoScroll();
  }, [runAutoScroll]);

  // One set of window listeners for the lifetime of the hook. They read through
  // `gesture`/`latest`, so nothing has to rebind mid-drag.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.clientY = event.clientY;

      if (!g.started) {
        const dx = Math.abs(event.clientX - g.startClientX);
        const dy = Math.abs(event.clientY - g.startClientY);
        if (!g.armed) {
          // Moving before the long press fires means they meant to scroll.
          if (Math.hypot(dx, dy) > config.drag.longPressSlopPx) finish(false);
          return;
        }
        if (Math.hypot(dx, dy) < config.drag.thresholdPx) return;
        begin();
      }

      // Only once a drag is genuinely running: before that the list must be
      // free to scroll normally.
      event.preventDefault();
      paint();
      updateTarget();
    };

    const onUp = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      finish(true);
    };

    const onCancel = () => {
      if (gesture.current) finish(false);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [begin, finish, paint, updateTarget]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const onRowPointerDown = useCallback(
    (index: number, id: number, event: React.PointerEvent) => {
      if (gesture.current) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      // Nothing at or below an in-progress track may be picked up.
      if (index >= latest.current.lockedFrom) return;
      const target = event.target as HTMLElement;
      if (target.closest?.(NO_DRAG)) return;

      const touch = event.pointerType === "touch";
      gesture.current = {
        id,
        fromIndex: index,
        pointerId: event.pointerId,
        grabContentY: contentY(event.clientY),
        clientY: event.clientY,
        startClientX: event.clientX,
        startClientY: event.clientY,
        started: false,
        // A mouse press is armed at once and waits only for the move
        // threshold; touch has to be held, so a swipe still scrolls.
        armed: !touch,
        longPress: null,
      };

      if (touch) {
        gesture.current.longPress = setTimeout(() => {
          const g = gesture.current;
          if (!g) return;
          g.armed = true;
          g.longPress = null;
          begin();
        }, config.drag.longPressMs);
      }
    },
    [begin, contentY],
  );

  const offsets = useMemo(() => {
    const shift = drag?.shiftPx;
    if (!drag || shift == null) return new Array<number>(count).fill(0);
    return Array.from({ length: count }, (_, index) =>
      shiftFor(index, drag.fromIndex, drag.toIndex, shift),
    );
  }, [drag, count]);

  return {
    listRef,
    onRowPointerDown,
    active: drag !== null,
    draggingId: drag?.id ?? null,
    offsets,
  };
}
