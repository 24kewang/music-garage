/**
 * Pure loop arithmetic. Everything here takes plain numbers and returns plain
 * numbers, so every boundary rule the session depends on is pinned by a Node test.
 *
 * The master clock is `AudioContext.currentTime`; every function that takes a `time`
 * expects a value from that clock. `anchorTime` is the instant loop iteration 0
 * began — boundary N is `anchorTime + N * loopLength`, always computed fresh from
 * the anchor rather than accumulated, so error can't build up over iterations.
 */

/** Seconds in one master loop. */
export function loopLengthSeconds(tempo: number, beats: number, bars: number): number {
  return (bars * beats * 60) / tempo;
}

/** Seconds in one partition — the slice the multiplier divides the loop into. */
export function partitionLength(loopLength: number, multiplier: number): number {
  return loopLength / multiplier;
}

/**
 * The multipliers offered for a bar count: every divisor, so a partition is always
 * a whole number of bars and boundaries land on bar lines.
 */
export function divisorsOf(bars: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= bars; i++) {
    if (bars % i === 0) out.push(i);
  }
  return out;
}

/** Loop phase at `time`, in [0, loopLength). Times before the anchor wrap negative-safe. */
export function phaseAt(anchorTime: number, loopLength: number, time: number): number {
  const raw = (time - anchorTime) % loopLength;
  return raw < 0 ? raw + loopLength : raw;
}

/**
 * The first partition boundary at or after `time`. A time exactly on a boundary
 * returns that boundary, so recording armed at the anchor starts immediately.
 */
export function nextPartitionBoundary(
  anchorTime: number,
  loopLength: number,
  multiplier: number,
  time: number,
): number {
  const part = partitionLength(loopLength, multiplier);
  const k = Math.ceil((time - anchorTime) / part - 1e-9);
  return anchorTime + Math.max(0, k) * part;
}

/**
 * When the spawn loop of a track whose first partition began at `segmentStart`
 * ends: the master boundary that closes the loop iteration the segment started in.
 * Until then the track is "recording-still-in-progress" — set, audible, but not
 * selectable or editable.
 */
export function spawnLoopEnd(
  anchorTime: number,
  loopLength: number,
  segmentStart: number,
): number {
  const n = Math.floor((segmentStart - anchorTime) / loopLength + 1e-9);
  return anchorTime + (n + 1) * loopLength;
}

/**
 * Free mode: the loop the user played is `bars / multiplier` bars long, so
 *
 *   tempo = beatsInFreeLoop / freeSeconds * 60
 *         = (bars * beatsPerBar / multiplier) / freeSeconds * 60
 */
export function freeModeTempo(
  freeSeconds: number,
  beatsPerBar: number,
  bars: number,
  multiplier: number,
): number {
  const beatsInFreeLoop = (bars * beatsPerBar) / multiplier;
  return (beatsInFreeLoop / freeSeconds) * 60;
}

/** Times of every metronome click in one loop, with beat 1 of each bar accented. */
export function beatGrid(
  tempo: number,
  beats: number,
  bars: number,
): { offset: number; accent: boolean }[] {
  const beatSeconds = 60 / tempo;
  const grid: { offset: number; accent: boolean }[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < beats; beat++) {
      grid.push({ offset: (bar * beats + beat) * beatSeconds, accent: beat === 0 });
    }
  }
  return grid;
}
