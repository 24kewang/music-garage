"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gapBetween, shiftFor, targetIndex, type RowBox } from "@/shared/lib/reorder";
import { config } from "../config";

/**
 * Drag-to-reorder for the settings panel's player list.
 *
 * The geometry is the shared, tested `@/shared/lib/reorder`. What is here is only the
 * pointer gesture — and it is a good deal smaller than the Loop Station's, on purpose:
 * four rows in a panel that does not scroll need no edge auto-scrolling and no
 * arbitration between a swipe and a drag over a long list. Sharing that hook would
 * have meant carrying machinery with nothing to do.
 *
 * The division of labour is the one the Loop Station established, though, because it
 * is the right one: the dragged row's transform is written **straight to the DOM**
 * every frame and only the destination slot lives in React state, so a drag costs a
 * handful of renders rather than sixty a second.
 *
 * The gesture starts on the **handle only**. A row full of text fields and checkboxes
 * has no spare pointer surface to spend on dragging, and a whole-row grab meant every
 * press near an input was ambiguous. It also removes the swipe-versus-drag problem
 * outright, which is why there is no long-press wait here.
 *
 * Dragging is never the only way to reorder — the handle is a real button and the
 * arrow keys move the row. A pointer-only list is unreachable by keyboard.
 */

interface DragState {
  index: number;
  toIndex: number;
  /** Height of the dragged row plus the list gap. Null until measured. */
  shiftPx: number | null;
}

interface Gesture {
  index: number;
  pointerId: number;
  grabY: number;
  clientY: number;
  startX: number;
  startY: number;
  started: boolean;
}

export interface RowDrag {
  listRef: (node: HTMLElement | null) => void;
  /** Bind to the row's drag handle — nowhere else. */
  onHandlePointerDown: (index: number, event: React.PointerEvent) => void;
  active: boolean;
  draggingIndex: number | null;
  /** Pixels each row translates to open the destination slot, by index. */
  offsets: readonly number[];
}

export function useRowDrag({
  count,
  onMove,
}: {
  count: number;
  onMove: (from: number, to: number) => void;
}): RowDrag {
  const [drag, setDrag] = useState<DragState | null>(null);

  const listNode = useRef<HTMLElement | null>(null);
  const draggedNode = useRef<HTMLElement | null>(null);
  const boxes = useRef<RowBox[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const latest = useRef({ count, onMove });

  useEffect(() => {
    latest.current = { count, onMove };
  });

  const listRef = useCallback((node: HTMLElement | null) => {
    listNode.current = node;
  }, []);

  const rowNodes = useCallback(
    () =>
      Array.from(listNode.current?.querySelectorAll<HTMLElement>("[data-row]") ?? []),
    [],
  );

  /** Measure after the commit that starts the drag — these hold for the gesture. */
  useLayoutEffect(() => {
    if (!drag || drag.shiftPx !== null) return;

    const nodes = rowNodes();
    boxes.current = nodes.map((node) => ({
      top: node.offsetTop,
      height: node.offsetHeight,
    }));
    draggedNode.current = nodes[drag.index] ?? null;

    const box = boxes.current[drag.index];
    dragRef.current = {
      ...drag,
      shiftPx: box ? box.height + gapBetween(boxes.current) : 0,
    };
    setDrag(dragRef.current);
  }, [drag, rowNodes]);

  /** List-content coordinates, so nothing is invalidated by the page scrolling. */
  const contentY = useCallback((clientY: number) => {
    const list = listNode.current;
    if (!list) return clientY;
    return clientY - list.getBoundingClientRect().top;
  }, []);

  const paint = useCallback(() => {
    const g = gesture.current;
    const node = draggedNode.current;
    if (!g || !g.started || !node) return;
    node.style.transform = `translateY(${contentY(g.clientY) - g.grabY}px)`;
  }, [contentY]);

  const updateTarget = useCallback(() => {
    const g = gesture.current;
    const d = dragRef.current;
    if (!g || !d || !g.started) return;

    const box = boxes.current[d.index];
    if (!box) return;

    const centreY = box.top + box.height / 2 + (contentY(g.clientY) - g.grabY);
    const to = targetIndex(boxes.current, d.index, centreY);
    if (to === d.toIndex) return;

    dragRef.current = { ...d, toIndex: to };
    setDrag(dragRef.current);
  }, [contentY]);

  const finish = useCallback((commit: boolean) => {
    const g = gesture.current;
    const d = dragRef.current;
    gesture.current = null;
    dragRef.current = null;
    draggedNode.current = null;

    // Clear the inline transforms and suppress transitions for one frame: the
    // reorder and the reset land together, and without this every row animates
    // from its drag offset while the DOM order has already changed — the list
    // visibly swims.
    const list = listNode.current;
    if (list) {
      list.dataset.dropping = "true";
      list
        .querySelectorAll<HTMLElement>("[data-row]")
        .forEach((node) => (node.style.transform = ""));
    }

    if (commit && g?.started && d && d.toIndex !== d.index) {
      latest.current.onMove(d.index, d.toIndex);
    }

    setDrag(null);
    requestAnimationFrame(() => {
      if (list) delete list.dataset.dropping;
    });
  }, []);

  const begin = useCallback(() => {
    const g = gesture.current;
    if (!g || g.started) return;
    g.started = true;
    dragRef.current = { index: g.index, toIndex: g.index, shiftPx: null };
    setDrag(dragRef.current);
  }, []);

  // One set of window listeners for the hook's lifetime; they read through refs, so
  // nothing has to rebind mid-drag.
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      g.clientY = event.clientY;

      if (!g.started) {
        // A small threshold, so that clicking the handle to focus it for the arrow
        // keys does not count as a drag.
        const dx = Math.abs(event.clientX - g.startX);
        const dy = Math.abs(event.clientY - g.startY);
        if (Math.hypot(dx, dy) < config.drag.thresholdPx) return;
        begin();
      }

      // Only once a drag is genuinely running: before that the panel must stay free
      // to scroll normally.
      event.preventDefault();
      paint();
      updateTarget();
    };

    const onPointerUp = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      finish(true);
    };

    const onCancel = () => {
      if (gesture.current) finish(false);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [begin, finish, paint, updateTarget]);

  const onHandlePointerDown = useCallback(
    (index: number, event: React.PointerEvent) => {
      if (gesture.current) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;

      // Every pointer type arms at once. The handle is a dedicated surface with
      // `touch-action: none` on it, so there is no swipe-to-scroll to disambiguate
      // from and nothing a long press would buy.
      gesture.current = {
        index,
        pointerId: event.pointerId,
        grabY: contentY(event.clientY),
        clientY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
      };
    },
    [contentY],
  );

  const offsets = useMemo(() => {
    const shift = drag?.shiftPx;
    if (!drag || shift == null) return new Array<number>(count).fill(0);
    return Array.from({ length: count }, (_, index) =>
      shiftFor(index, drag.index, drag.toIndex, shift),
    );
  }, [drag, count]);

  return {
    listRef,
    onHandlePointerDown,
    active: drag !== null,
    draggingIndex: drag?.index ?? null,
    offsets,
  };
}
