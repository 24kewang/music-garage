"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { buildSpinPlan, pickTargetIndex } from "./spin";

/**
 * The slot machine, independent of what draws it.
 *
 * Both modes — the AR filter and the plain on-screen picker — need the same intro →
 * spinning → result machine, the same fast-to-slow cadence and the same vibrate-reject,
 * so it lives here rather than being copied into each screen. Everything medium-specific
 * arrives as a callback: preloading, what a step shows, and what happens at spin start.
 *
 * The cadence runs on its own chained timeouts and is deliberately *not* tied to any
 * render loop — it only decides which excerpt is current.
 */

export type SpinPhase = "intro" | "spinning" | "result";

export interface SpinReelOptions {
  /** Checked excerpt paths, in stable library order. */
  checked: readonly string[];
  /** Whether the medium can display anything yet (camera ready / images loadable). */
  ready: boolean;
  spinning: boolean;
  onSpinningChange: (spinning: boolean) => void;
  /** Load these before the first swap, so no step lands on an unloaded excerpt. */
  preload: (paths: readonly string[]) => Promise<void>;
  /** Called once the plan is loaded, before the first swap. */
  onSpinStart?: () => void;
  /** Show this excerpt now. */
  show: (path: string) => void;
}

export interface SpinReel {
  phase: SpinPhase;
  /** The excerpt the last spin landed on; null until one has. */
  landed: string | null;
  /** True for one animation's length after a rejected press. */
  shaking: boolean;
  spin: () => void;
  /** Drop pending swaps — for when the medium is being torn down under us. */
  cancel: () => void;
}

export function useSpinReel(options: SpinReelOptions): SpinReel {
  const [phase, setPhase] = useState<SpinPhase>("intro");
  const [landed, setLanded] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  // Synced in an effect rather than written during render: the react-hooks/refs rule
  // rejects render-time ref writes. spin() only ever runs from a click, by which point
  // effects have flushed, so the ref is current when it matters.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const cancel = useCallback(() => {
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => cancel, [cancel]);

  const spin = useCallback(() => {
    const { checked, ready, spinning, onSpinningChange, preload, onSpinStart, show } =
      optionsRef.current;
    if (spinning || !ready) return;

    if (checked.length === 0) {
      navigator.vibrate?.([...config.reject.vibratePattern]);
      setShaking(true);
      window.setTimeout(() => setShaking(false), config.reject.shakeMs);
      return;
    }

    onSpinningChange(true);
    setPhase("spinning");
    setLanded(null);

    const target = pickTargetIndex(checked.length, Math.random);
    const plan = buildSpinPlan(checked.length, target, config.spin, Math.random);

    void preload([...new Set(plan.map((step) => checked[step.pathIndex]))]).then(
      () => {
        onSpinStart?.();

        let elapsed = 0;
        for (const [index, step] of plan.entries()) {
          elapsed += step.delayMs;
          const path = checked[step.pathIndex];
          const isLast = index === plan.length - 1;
          const id = window.setTimeout(() => {
            show(path);
            if (isLast) {
              setLanded(path);
              setPhase("result");
              onSpinningChange(false);
            }
          }, elapsed);
          timeoutsRef.current.push(id);
        }
      },
      () => {
        setPhase("intro");
        onSpinningChange(false);
      },
    );
  }, []);

  return { phase, landed, shaking, spin, cancel };
}
