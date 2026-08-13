"use client";

import { useEffect, useRef } from "react";
import { resolveAltShortcut, resolveShortcut } from "./shortcuts";
import type { SessionEvent, SessionState } from "./session";

/**
 * Binds the keyboard shortcuts. The mapping itself lives in `shortcuts.ts`,
 * pure and tested; this is only the guarding.
 */
export function useShortcuts({
  session,
  dispatch,
  enabled,
}: {
  session: SessionState;
  dispatch: (event: SessionEvent) => void;
  /** False while a modal owns the screen. */
  enabled: boolean;
}): void {
  const latest = useRef({ session, dispatch, enabled });
  useEffect(() => {
    latest.current = { session, dispatch, enabled };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { session: state, dispatch: send, enabled: on } = latest.current;
      if (!on) return;
      // Holding a key must fire once, not sixty times.
      if (event.repeat) return;
      // Leave the browser's own chords alone. Alt is ours, but only for the
      // reorder pair — everything else with Alt still belongs to the browser.
      if (event.ctrlKey || event.metaKey) return;

      // Never while typing. This is also what stops the Enter that commits a
      // track rename from starting the loop: the keydown's target is still the
      // field, even though it blurs a moment later.
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target?.tagName &&
          ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(target.tagName))
      ) {
        return;
      }

      // Escape belongs to whatever panel or dialog is open, if one is — closing
      // the settings panel shouldn't also drop the track selection.
      if (event.key === "Escape" && document.querySelector('[role="dialog"]')) return;

      const action = event.altKey
        ? resolveAltShortcut(event.key, state)
        : resolveShortcut(event.key, state);
      if (!action) return;
      // Stops Space scrolling the page, and stops it firing twice when the
      // record button happens to hold focus.
      event.preventDefault();
      send(action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
