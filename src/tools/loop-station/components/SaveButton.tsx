"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FloppyDiskIcon, TrashIcon } from "@phosphor-icons/react";
import { config } from "../config";
import type { SaveStatus } from "../lib/useLoopStation";
import styles from "./SaveButton.module.css";

const LABEL: Record<SaveStatus, string> = {
  idle: "Save",
  saving: "Saving…",
  saved: "Saved!",
  deleted: "Deleted!",
  error: "Save failed",
};

/**
 * Writes the loop to browser storage, and — held down — deletes it.
 *
 * A short press saves. Holding past `deleteArmMs` turns the button red and
 * starts a two-second fill; letting go before it completes does nothing at all.
 *
 * The fill is painted by rAF rather than a CSS transition on purpose:
 * `globals.css` clamps every transition to 0.01ms under `prefers-reduced-motion`,
 * which would erase the gesture's only feedback — and this bar isn't decoration,
 * it *is* the timer, so it also has to stay exactly in step with the moment the
 * delete fires rather than being a second clock that can disagree.
 */
export default function SaveButton({
  status,
  dirty,
  hasSave,
  trackCount,
  onSave,
  onDelete,
}: {
  status: SaveStatus;
  dirty: boolean;
  hasSave: boolean;
  trackCount: number;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [arming, setArming] = useState(false);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  /** Set once the hold armed, so releasing doesn't also fire the click. */
  const consumedClick = useRef(false);

  const canSave = trackCount > 0;
  const canDelete = hasSave && status !== "saving";
  const busy = status === "saving";

  const stop = useCallback(() => {
    if (armTimer.current) clearTimeout(armTimer.current);
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    armTimer.current = null;
    raf.current = null;
    setArming(false);
    if (fillRef.current) fillRef.current.style.transform = "scaleX(0)";
  }, []);

  useEffect(() => stop, [stop]);

  const beginHold = useCallback(() => {
    if (!canDelete) return;
    armTimer.current = setTimeout(() => {
      armTimer.current = null;
      consumedClick.current = true;
      setArming(true);

      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / config.save.deleteHoldMs);
        if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
        if (progress < 1) {
          raf.current = requestAnimationFrame(step);
          return;
        }
        raf.current = null;
        stop();
        onDelete();
      };
      raf.current = requestAnimationFrame(step);
    }, config.save.deleteArmMs);
  }, [canDelete, onDelete, stop]);

  const label = arming ? "Delete Saved" : LABEL[status];
  const title = arming
    ? "Keep holding to delete"
    : canDelete
      ? canSave
        ? "Click to save · hold to delete the saved loop"
        : "Hold to delete the saved loop"
      : dirty
        ? "Unsaved changes"
        : "The loop is saved";

  return (
    <button
      type="button"
      className={styles.button}
      data-status={status}
      data-arming={arming || undefined}
      disabled={busy || (!canSave && !canDelete)}
      title={title}
      aria-label={title}
      onPointerDown={beginHold}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A hold that armed has already had its say.
        if (consumedClick.current) {
          consumedClick.current = false;
          return;
        }
        if (canSave) onSave();
      }}
    >
      <span ref={fillRef} className={styles.fill} aria-hidden="true" />
      <span className={styles.content}>
        {arming ? (
          <TrashIcon size={13} weight="bold" aria-hidden="true" />
        ) : (
          <FloppyDiskIcon size={13} weight="bold" aria-hidden="true" />
        )}
        {label}
        {dirty && status === "idle" && !arming && (
          <span className={styles.dot} aria-label="unsaved changes" />
        )}
      </span>
    </button>
  );
}
