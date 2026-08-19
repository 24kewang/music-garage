import { describe, expect, it } from "vitest";
import { config } from "../config";
import { melody, phrase, silence } from "./synth";
import { trackPitch } from "./track";

const OPTIONS = config.capture;

/** Voiced frames only — the unvoiced ones carry a null. */
const voiced = (frames: ReturnType<typeof trackPitch>) =>
  frames.filter((frame) => frame.midi !== null);

describe("trackPitch", () => {
  it("reads a steady tone as the note that was played", () => {
    const frames = trackPitch(melody([69], 48000, 0.5), 48000, OPTIONS);
    const heard = voiced(frames);

    expect(heard.length).toBeGreaterThan(20);
    for (const frame of heard) {
      expect(frame.midi).toBeCloseTo(69, 0);
    }
  });

  it("finds no pitch in silence", () => {
    const frames = trackPitch(silence(0.5, 48000), 48000, OPTIONS);
    expect(voiced(frames)).toHaveLength(0);
  });

  it("returns nothing for a buffer shorter than one window", () => {
    expect(trackPitch(new Float32Array(512), 48000, OPTIONS)).toEqual([]);
  });

  it("spaces frames one hop apart, timed at the window centre", () => {
    const frames = trackPitch(melody([60], 48000, 0.3), 48000, OPTIONS);
    const hop = OPTIONS.hopMs / 1000;

    expect(frames[0].time).toBeCloseTo(OPTIONS.frameSamples / 2 / 48000, 6);
    expect(frames[1].time - frames[0].time).toBeCloseTo(hop, 6);
  });

  it("agrees with itself at 44.1 kHz and 48 kHz", () => {
    // Sample-rate independence is not decorative: every window in `config` is
    // specified in milliseconds precisely so the two do not diverge.
    const at = (rate: number) => {
      const heard = voiced(trackPitch(melody([64], rate, 0.5), rate, OPTIONS));
      return heard[Math.floor(heard.length / 2)].midi as number;
    };
    expect(at(44100)).toBeCloseTo(at(48000), 1);
  });

  it("tracks a note through vibrato without losing it", () => {
    const buffer = phrase(
      [{ midi: 67, seconds: 0.8, vibratoSemitones: 0.5, vibratoHz: 5.5 }],
      48000,
    );
    const heard = voiced(trackPitch(buffer, 48000, OPTIONS));

    expect(heard.length).toBeGreaterThan(40);
    // It should swing around the note, not wander off it.
    const mean = heard.reduce((sum, f) => sum + (f.midi as number), 0) / heard.length;
    expect(mean).toBeCloseTo(67, 0);
  });
});
