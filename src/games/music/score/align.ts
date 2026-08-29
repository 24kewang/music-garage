/**
 * Weighted global alignment (Needleman–Wunsch) over two note sequences.
 *
 * Pure arithmetic on number arrays — no audio anywhere near it, which is what makes
 * the invariants below assertable directly rather than inferable from how a round
 * felt.
 */

export type Op = "match" | "sub" | "del" | "ins";

export interface AlignStep {
  op: Op;
  /** Index into the target, or -1 when the attempt inserted a note. */
  targetIndex: number;
  /** Index into the attempt, or -1 when the attempt missed one. */
  attemptIndex: number;
  cost: number;
}

export interface Alignment {
  cost: number;
  steps: AlignStep[];
}

export interface AlignCosts {
  /** Cost per semitone of a substitution. */
  subSlope: number;
  /** Ceiling on a substitution's cost. */
  subCeiling: number;
  /** Cost of a missing or extra note. */
  indel: number;
}

/**
 * What it costs to have played `delta` semitones away from the note wanted.
 *
 * The ceiling must stay **strictly below `2 * indel`**. This is the one constraint
 * the whole cost model rests on: at or above it, the aligner discovers that any
 * badly wrong note is cheaper as a deletion plus an insertion, interval weighting
 * stops having any effect at all, and — just as bad for the player looking at the
 * failure graph — one wrong note stops reading as one wrong note and becomes a hole
 * in one line beside a spike in the other.
 */
export function substitutionCost(delta: number, costs: AlignCosts): number {
  if (delta === 0) return 0;
  return Math.min(costs.subSlope * Math.abs(delta), costs.subCeiling);
}

/** Traceback directions, stored per cell. */
const DIAGONAL = 0;
const UP = 1;
const LEFT = 2;

export function align(
  target: readonly number[],
  attempt: readonly number[],
  costs: AlignCosts,
): Alignment {
  const n = target.length;
  const m = attempt.length;
  const width = m + 1;

  // Flat typed arrays rather than nested ones. Sequences are tens of notes long so
  // this is not about speed; it keeps the indexing explicit and the traceback
  // allocation-free.
  const cost = new Float64Array((n + 1) * width);
  const from = new Uint8Array((n + 1) * width);

  for (let j = 1; j <= m; j++) {
    cost[j] = j * costs.indel;
    from[j] = LEFT;
  }
  for (let i = 1; i <= n; i++) {
    cost[i * width] = i * costs.indel;
    from[i * width] = UP;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diagonal =
        cost[(i - 1) * width + (j - 1)] +
        substitutionCost(attempt[j - 1] - target[i - 1], costs);
      const up = cost[(i - 1) * width + j] + costs.indel;
      const left = cost[i * width + (j - 1)] + costs.indel;

      // The diagonal wins ties deliberately. When a substitution costs exactly what
      // an indel pair costs, "one wrong note" is the reading a player recognizes.
      let best = diagonal;
      let direction = DIAGONAL;
      if (up < best) {
        best = up;
        direction = UP;
      }
      if (left < best) {
        best = left;
        direction = LEFT;
      }

      cost[i * width + j] = best;
      from[i * width + j] = direction;
    }
  }

  const steps: AlignStep[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    // Along the top or left edge there is only one legal move left.
    const direction = i === 0 ? LEFT : j === 0 ? UP : from[i * width + j];

    if (direction === DIAGONAL) {
      const stepCost = substitutionCost(attempt[j - 1] - target[i - 1], costs);
      steps.push({
        op: stepCost === 0 ? "match" : "sub",
        targetIndex: i - 1,
        attemptIndex: j - 1,
        cost: stepCost,
      });
      i--;
      j--;
    } else if (direction === UP) {
      steps.push({ op: "del", targetIndex: i - 1, attemptIndex: -1, cost: costs.indel });
      i--;
    } else {
      steps.push({ op: "ins", targetIndex: -1, attemptIndex: j - 1, cost: costs.indel });
      j--;
    }
  }

  steps.reverse();
  return { cost: cost[n * width + m], steps };
}
