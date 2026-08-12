"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDismiss, type DismissReason } from "@/shared/hooks/useDismiss";
import styles from "./ConfirmDialog.module.css";

/**
 * A modal confirmation for an action that can't be undone.
 *
 * Focus lands on Cancel rather than Confirm, so a stray Enter can't destroy
 * anything; Escape returns focus to whatever opened it, an outside click
 * doesn't (that belongs to whatever was clicked). Both routes come from the
 * shared `useDismiss`, which reports which happened.
 */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Receives the reason so the caller can restore focus on Escape only. */
  onCancel: (reason?: DismissReason) => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const dismiss = useCallback((reason: DismissReason) => onCancel(reason), [onCancel]);
  useDismiss(true, cardRef, dismiss);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div className={styles.backdrop}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="loop-station-confirm-title"
      >
        <h2 id="loop-station-confirm-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancel}
            onClick={() => onCancel()}
          >
            Cancel
          </button>
          <button type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
