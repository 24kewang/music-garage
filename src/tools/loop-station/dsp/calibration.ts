/**
 * Round-trip-latency estimation from onsets played against a metronome.
 *
 * The player reacts to what they hear (late by the output latency) and their
 * sound reaches the graph late again (input latency), so each onset lands
 * `outputLatency + inputLatency + human error` after its click. The human error
 * is roughly symmetric around zero; averaging over enough beats cancels it and
 * leaves the round-trip latency.
 */

/**
 * Signed offset from an onset to the click it answers, given the click grid.
 * Wrapped into (-beat/4, 3·beat/4]: latency is positive, so most of the window
 * leans late, but a quarter-beat of "early" is kept for players who anticipate.
 */
export function clickOffset(onsetTime: number, gridAnchor: number, beatSeconds: number): number {
  let offset = (onsetTime - gridAnchor) % beatSeconds;
  if (offset < 0) offset += beatSeconds;
  if (offset > 0.75 * beatSeconds) offset -= beatSeconds;
  return offset;
}

/** Offsets further than this fraction of a beat from the click are mis-hits. */
export function isOutlier(offset: number, beatSeconds: number, beatFraction: number): boolean {
  return Math.abs(offset) > beatFraction * beatSeconds;
}

/** Mean after dropping `trimFraction` of the values from each end. */
export function trimmedMean(values: number[], trimFraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * trimFraction);
  const kept = sorted.slice(drop, sorted.length - drop);
  if (kept.length === 0) return null;
  return kept.reduce((sum, v) => sum + v, 0) / kept.length;
}

export interface CalibrationEstimate {
  /** Round-trip latency in seconds, or null while there's too little to say. */
  rtlSeconds: number | null;
  /** Usable (non-outlier) hits so far. */
  count: number;
}

export function estimateRtl(
  offsets: number[],
  options: { trimFraction: number; minSamples: number },
): CalibrationEstimate {
  if (offsets.length < options.minSamples) {
    return { rtlSeconds: null, count: offsets.length };
  }
  return { rtlSeconds: trimmedMean(offsets, options.trimFraction), count: offsets.length };
}
