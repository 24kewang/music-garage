/**
 * The energy gate that decides when a take actually starts.
 *
 * The capture worklet posts one RMS value per 128-frame block (~2.7 ms at 48 kHz)
 * and this runs on the main thread, so the whole decision stays in testable
 * TypeScript and the worklet stays dumb.
 *
 * Deliberately *not* the Loop Station's `createOnsetDetector`, which solves a
 * different problem — repeated attacks with a running noise floor and a refractory
 * window. This is a one-shot gate: it fires once, on the first sound that is loud
 * enough for long enough to be someone starting to play, and never again.
 */

export interface OnsetOptions {
  /** Absolute RMS a block must reach. */
  threshold: number;
  /**
   * Consecutive blocks that must stay above it. A single loud block is a knock, a
   * click or a pop; a note holds.
   */
  holdBlocks: number;
  /** Blocks arriving before this time are ignored, in seconds. */
  graceUntil: number;
}

export interface OnsetGate {
  /**
   * Feed one block. Returns the time of the onset — the time of the *first* block
   * of the run, not the one that completed it — on the block that confirms it, and
   * `null` every other time. Only ever returns non-null once.
   */
  push(time: number, rms: number): number | null;
  /** True once it has fired. */
  readonly fired: boolean;
}

export function createOnsetGate(options: OnsetOptions): OnsetGate {
  let run = 0;
  /** Time of the first block of the current above-threshold run. */
  let runStart = 0;
  let fired = false;

  return {
    get fired() {
      return fired;
    },
    push(time: number, rms: number): number | null {
      if (fired) return null;
      if (time < options.graceUntil) return null;

      if (rms < options.threshold) {
        run = 0;
        return null;
      }

      if (run === 0) runStart = time;
      run++;

      if (run < options.holdBlocks) return null;

      fired = true;
      // The run's *start* is the onset. Reporting the block that confirmed it would
      // put the mark a hold-length into the attack, and the pre-roll would then be
      // spent undoing that rather than catching the transient.
      return runStart;
    },
  };
}
