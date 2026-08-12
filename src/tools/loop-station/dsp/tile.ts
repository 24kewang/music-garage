import { fadeInGain, fadeOutGain } from "./crossfade";

/**
 * Bakes a track's padded recording into one master-loop-length buffer.
 *
 * Layout: `reps` copies of the content window are laid at their exact partition
 * boundaries, every seam (including the wrap from the last copy back to the
 * first) gets an equal-power crossfade, and an optional overwrite is punched in
 * on top. Works on bare Float32Arrays so it runs under Node in tests.
 *
 * The padding is what makes all of it possible: the fade *out* at a seam plays
 * the recording's genuine continuation (post-roll) rather than a synthetic tail,
 * the fade *in* before an overwrite plays its genuine lead-in (pre-roll), and
 * the delay nudge just moves the content window inside the padded recording.
 * Reads that run off either end of a recording return silence, so extreme delay
 * values degrade to a plain fade instead of crashing or wrapping garbage.
 */

export interface OverwriteBake {
  /** Padded overwrite recording. */
  segment: Float32Array;
  padFrames: number;
  delayFrames: number;
  /** Punch bounds within the loop; endFrame may equal loopFrames. */
  startFrame: number;
  endFrame: number;
}

export interface BakeInput {
  /** Padded track recording. */
  segment: Float32Array;
  padFrames: number;
  delayFrames: number;
  reps: number;
  loopFrames: number;
  fadeFrames: number;
  overwrite?: OverwriteBake | null;
}

/** Sample with silence beyond the recording's ends. */
function at(segment: Float32Array, index: number): number {
  return index >= 0 && index < segment.length ? segment[index] : 0;
}

export function bakeTrack(input: BakeInput): Float32Array {
  const { segment, padFrames, delayFrames, reps, loopFrames, fadeFrames } = input;
  const out = new Float32Array(loopFrames);
  const contentStart = padFrames + delayFrames;

  // Tile boundaries. Rounding per-boundary (rather than accumulating a float
  // width) keeps every copy at its exact partition position.
  const boundary = (k: number) => Math.round((k * loopFrames) / reps);

  for (let k = 0; k < reps; k++) {
    const from = boundary(k);
    const to = boundary(k + 1);
    for (let i = from; i < to; i++) {
      out[i] = at(segment, contentStart + (i - from));
    }
  }

  // Crossfade every seam. The incoming side is copy k's head; the outgoing side
  // is the previous copy's natural continuation past its own end.
  for (let k = 0; k < reps; k++) {
    const seam = boundary(k);
    const prevLength = k === 0 ? boundary(reps) - boundary(reps - 1) : seam - boundary(k - 1);
    for (let j = 0; j < fadeFrames; j++) {
      const t = j / fadeFrames;
      const position = (seam + j) % loopFrames;
      const incoming = at(segment, contentStart + j);
      const outgoing = at(segment, contentStart + prevLength + j);
      out[position] = fadeInGain(t) * incoming + fadeOutGain(t) * outgoing;
    }
  }

  if (input.overwrite) punchIn(out, input.overwrite, fadeFrames);

  return out;
}

/**
 * Punch-in replace: inside the bounds only the overwrite plays; the original
 * fades out into it and back in after it, using the overwrite's own pre/post
 * roll so the joins are real audio, not synthetic ramps.
 */
function punchIn(out: Float32Array, ow: OverwriteBake, fadeFrames: number): void {
  const loopFrames = out.length;
  const contentStart = ow.padFrames + ow.delayFrames;
  const length = ow.endFrame - ow.startFrame;

  // Lead-in: original out, overwrite's pre-roll in. Wraps if the punch starts
  // near phase zero.
  for (let j = 0; j < fadeFrames; j++) {
    const t = j / fadeFrames;
    const position = (ow.startFrame - fadeFrames + j + loopFrames) % loopFrames;
    const incoming = at(ow.segment, contentStart - fadeFrames + j);
    out[position] = fadeOutGain(t) * out[position] + fadeInGain(t) * incoming;
  }

  // Body: replace outright.
  for (let i = 0; i < length; i++) {
    out[ow.startFrame + i] = at(ow.segment, contentStart + i);
  }

  // Tail: overwrite's post-roll out, original back in. Wraps when the punch ran
  // to the loop's end.
  for (let j = 0; j < fadeFrames; j++) {
    const t = j / fadeFrames;
    const position = (ow.endFrame + j) % loopFrames;
    const outgoing = at(ow.segment, contentStart + length + j);
    out[position] = fadeInGain(t) * out[position] + fadeOutGain(t) * outgoing;
  }
}
