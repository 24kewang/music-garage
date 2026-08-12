import { config } from "../config";

/**
 * A generated impulse response for the shared reverb: a stereo burst of noise
 * with an exponential decay. Algorithmic rather than a sample file because
 * `public/` ships no audio assets and nothing should be fetched from a CDN.
 *
 * Note the envelope below is `exp(-decay · t · seconds)` where `t = i/length`,
 * so the seconds cancel: **RT60 = 6.9 / irDecay, independent of irSeconds.**
 * `irDecay` is the length knob; `irSeconds` only decides how much of the tail
 * is kept before it is cut off.
 */
export function makeImpulseResponse(context: BaseAudioContext): AudioBuffer {
  const seconds = config.reverb.irSeconds;
  const decay = config.reverb.irDecay;
  const length = Math.ceil(seconds * context.sampleRate);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t * seconds);
    }
  }
  return buffer;
}
