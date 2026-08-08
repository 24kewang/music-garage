"use client";

import { useEffect, type RefObject } from "react";

/** Which of the two ways the overlay was dismissed. */
export type DismissReason = "escape" | "outside";

/**
 * Close an open overlay on Escape, or on a pointer landing outside it.
 *
 * Every popover in the garage needs exactly this, and it had been written out three
 * times — once per menu — which is three chances for one of them to quietly lose the
 * Escape handler.
 *
 * Listens on `pointerdown` rather than `click` so the overlay closes as the press
 * begins; waiting for the full click lets a drag that started outside still land
 * inside. Nothing is bound at all while `open` is false.
 *
 * The reason matters, which is why it is passed on. Dismissing with Escape should
 * usually put focus back on the trigger, since the keyboard user has nowhere else to
 * be — but doing that on an outside click would snatch focus away from whatever they
 * just deliberately clicked on.
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: (reason: DismissReason) => void,
): void {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss("escape");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss("outside");
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onDismiss, open, ref]);
}
