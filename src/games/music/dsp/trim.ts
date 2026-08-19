/**
 * Turning the worklet's stream of chunks into the clip that gets transcribed.
 *
 * Pure on purpose. The worklet stays dumb — it only moves samples — and the fiddly
 * question of where a recording actually begins is answered here, in TypeScript that
 * can be tested on hand-built arrays rather than only by pressing a button and
 * listening.
 */

/** Join the chunks in the order they arrived. */
export function assembleChunks(chunks: readonly Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;

  const out = new Float32Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Cut the clip down to what the player actually meant to record.
 *
 * The onset gate necessarily fires a few blocks into the attack — it has to hear the
 * level *hold* before it believes it — so cutting exactly at the reported onset
 * shaves the transient off the first note. `preRollMs` puts it back.
 *
 * Both ends are guarded rather than trusted: an onset earlier than the capture
 * started, or a pre-roll longer than the audio in front of the onset, clamp to the
 * beginning instead of producing a negative index and an empty clip.
 */
export function trimToOnset(
  samples: Float32Array,
  sampleRate: number,
  captureStartTime: number,
  onsetTime: number,
  preRollMs: number,
): Float32Array {
  const preRoll = Math.max(0, Math.round((preRollMs / 1000) * sampleRate));
  const sinceStart = Math.round((onsetTime - captureStartTime) * sampleRate);

  const from = Math.min(samples.length, Math.max(0, sinceStart - preRoll));
  // A copy rather than a subarray: the result outlives the capture buffers, and a
  // view would pin the whole recording in memory to keep a slice of it.
  return samples.slice(from);
}
