/**
 * The slot-machine spin, as data.
 *
 * The whole animation is planned up front — target picked first, then a list of
 * texture swaps whose gaps stretch from fast to slow — so the component just walks
 * the steps with timeouts. Planning is pure and takes an injected `random`, which is
 * what makes the deceleration and the forced landing testable in Node.
 */

export interface SpinStep {
  /** Delay since the previous step (or since the spin started, for the first). */
  delayMs: number;
  /** Index into the checked-paths array to display at this step. */
  pathIndex: number;
}

export interface SpinTuning {
  durationMs: number;
  startIntervalMs: number;
  endIntervalMs: number;
  easeExponent: number;
  minSteps: number;
}

/** Uniform pick of the excerpt the spin will land on. */
export function pickTargetIndex(count: number, random: () => number): number {
  if (count <= 0) throw new Error("cannot pick from an empty list");
  return Math.min(count - 1, Math.floor(random() * count));
}

/**
 * Plan the swaps. Gaps grow from `startIntervalMs` to `endIntervalMs` along an
 * ease-out curve over `durationMs` (so the reel decelerates), never fewer than
 * `minSteps` steps, no index shown twice in a row, and the last step is always
 * the target.
 */
export function buildSpinPlan(
  count: number,
  targetIndex: number,
  tuning: SpinTuning,
  random: () => number,
): SpinStep[] {
  if (count <= 0) throw new Error("cannot spin an empty list");

  const easeOut = (u: number) => 1 - (1 - u) ** tuning.easeExponent;
  const intervalAt = (elapsed: number) => {
    const u = Math.min(1, elapsed / tuning.durationMs);
    return (
      tuning.startIntervalMs +
      (tuning.endIntervalMs - tuning.startIntervalMs) * easeOut(u)
    );
  };

  const steps: SpinStep[] = [];
  let elapsed = 0;
  let previous = -1;

  const pushStep = (delayMs: number, pathIndex: number) => {
    steps.push({ delayMs, pathIndex });
    previous = pathIndex;
  };

  const nextIndex = () => {
    if (count === 1) return 0;
    let index = Math.min(count - 1, Math.floor(random() * count));
    if (index === previous) index = (index + 1) % count;
    return index;
  };

  for (;;) {
    const delay = intervalAt(elapsed);
    const wouldEnd = elapsed + delay >= tuning.durationMs;
    if (wouldEnd && steps.length + 1 >= tuning.minSteps) break;
    elapsed += delay;
    pushStep(delay, nextIndex());
  }

  // The landing step: always the target, never a repeat of the frame before it.
  if (previous === targetIndex && count > 1) {
    const filler = nextIndex();
    pushStep(intervalAt(elapsed), filler === targetIndex ? (filler + 1) % count : filler);
  }
  pushStep(intervalAt(tuning.durationMs), targetIndex);

  return steps;
}
