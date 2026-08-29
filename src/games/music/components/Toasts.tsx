"use client";

import { XIcon } from "@phosphor-icons/react";
import type { Toast } from "../lib/useToasts";
import styles from "./Toasts.module.css";

/**
 * The notice stack.
 *
 * Bottom center, not top: the top fifty pixels of every page belong to the header's
 * hover zone, and a toast landing there would pull the header open every time
 * somebody reached for it.
 *
 * One `role="status"` live region wrapping the stack rather than one per toast —
 * a fresh live region per message is announced inconsistently across screen readers,
 * where additions to a standing region are not. Polite throughout: results arrive on
 * every attempt, and an assertive announcement each time would interrupt rather than
 * inform.
 */

export default function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast} data-tone={toast.tone}>
          <p className={styles.message}>{toast.message}</p>
          <button
            type="button"
            className={styles.close}
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            <XIcon size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
