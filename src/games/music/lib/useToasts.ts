"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";

/**
 * A short-lived queue of notices.
 *
 * There is no toast anywhere else in the garage — the other games say things with a
 * single `aria-live` line, because they only ever have one thing to say. MUSIC has a
 * result to announce on every attempt, and those arrive faster than a fixed line can
 * be read, so they stack and expire instead.
 */

export type ToastTone = "success" | "failure" | "neutral";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface Toasts {
  toasts: readonly Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

export function useToasts(): Toasts {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = "neutral") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), config.toast.durationMs),
      );
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  // Captured into a local, because the ref's `current` is not what it was by the
  // time an unmount cleanup runs.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return { toasts, push, dismiss, clear };
}
