import { describe, expect, it } from "vitest";
import { fadeInGain, fadeOutGain } from "./crossfade";
import { bakeTrack, type BakeInput } from "./tile";

/**
 * A padded "recording" whose value at every index *is* the index, so a test can
 * read a baked sample and know exactly which source frame it came from.
 */
function rampSegment(padFrames: number, contentFrames: number): Float32Array {
  const seg = new Float32Array(padFrames * 2 + contentFrames);
  for (let i = 0; i < seg.length; i++) seg[i] = i;
  return seg;
}

function base(overrides: Partial<BakeInput> = {}): BakeInput {
  const padFrames = 100;
  const contentFrames = 400;
  return {
    segment: rampSegment(padFrames, contentFrames),
    padFrames,
    delayFrames: 0,
    reps: 1,
    loopFrames: 400,
    fadeFrames: 8,
    ...overrides,
  };
}

describe("crossfade gains", () => {
  it("are equal-power: in² + out² = 1 across the fade", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(fadeInGain(t) ** 2 + fadeOutGain(t) ** 2).toBeCloseTo(1);
    }
  });
});

describe("bakeTrack", () => {
  it("copies the content window at zero delay", () => {
    const out = bakeTrack(base());
    // Mid-loop, past the seam fade: sample i should be content frame i,
    // which lives at padFrames + i in the ramp.
    expect(out[200]).toBe(100 + 200);
    expect(out[399]).toBe(100 + 399);
  });

  it("shifts the window by the delay", () => {
    const out = bakeTrack(base({ delayFrames: 50 }));
    expect(out[200]).toBe(100 + 50 + 200);
    const early = bakeTrack(base({ delayFrames: -50 }));
    expect(early[200]).toBe(100 - 50 + 200);
  });

  it("tiles reps copies at exact partition boundaries", () => {
    const out = bakeTrack(base({ reps: 4 }));
    // Each 100-frame tile restarts the content. Check just past each seam fade.
    for (const k of [0, 1, 2, 3]) {
      expect(out[k * 100 + 50]).toBe(100 + 50);
    }
  });

  it("crossfades every seam with the recording's real continuation", () => {
    const fadeFrames = 8;
    const out = bakeTrack(base({ reps: 2, fadeFrames }));
    // Seam at frame 200 (start of copy 2): incoming = content head, outgoing =
    // frame 200 of content continuing into what follows it in the recording.
    const j = 4;
    const t = j / fadeFrames;
    const incoming = 100 + j; // content start + j
    const outgoing = 100 + 200 + j; // continuation past the copy's 200-frame end
    expect(out[200 + j]).toBeCloseTo(fadeInGain(t) * incoming + fadeOutGain(t) * outgoing);
  });

  it("crossfades the wrap-around seam at frame zero", () => {
    const fadeFrames = 8;
    const out = bakeTrack(base({ reps: 2, fadeFrames }));
    const j = 2;
    const t = j / fadeFrames;
    const incoming = 100 + j;
    const outgoing = 100 + 200 + j; // the last copy's continuation
    expect(out[j]).toBeCloseTo(fadeInGain(t) * incoming + fadeOutGain(t) * outgoing);
  });

  it("reads silence, not garbage, when the delay pushes past the padding", () => {
    // Maximum delay uses the very end of the recording; the seam fade's
    // outgoing side runs off the buffer and must come back as 0.
    const out = bakeTrack(base({ delayFrames: 100, fadeFrames: 8 }));
    const j = 4;
    const t = j / 8;
    // outgoing index = contentStart(200) + prevLength(400) + j = 604+ ≥ length (600).
    expect(out[j]).toBeCloseTo(fadeInGain(t) * (200 + j) + fadeOutGain(t) * 0);
  });

  it("punches an overwrite in as a replace, not a mix", () => {
    const owPad = 50;
    const owContent = 100;
    const ow = new Float32Array(owPad * 2 + owContent).fill(-1);
    const out = bakeTrack(
      base({
        overwrite: {
          segment: ow,
          padFrames: owPad,
          delayFrames: 0,
          startFrame: 150,
          endFrame: 250,
        },
      }),
    );
    // Inside the punch: only overwrite audio.
    expect(out[200]).toBe(-1);
    // Well outside the punch (past the fades): the original, untouched.
    expect(out[100]).toBe(100 + 100);
    expect(out[300]).toBe(100 + 300);
    // In the lead-in fade the original is fading, not full.
    const j = 4;
    const t = j / 8;
    const original = 100 + (150 - 8 + j);
    expect(out[150 - 8 + j]).toBeCloseTo(fadeOutGain(t) * original + fadeInGain(t) * -1);
  });

  it("wraps the overwrite tail fade when the punch runs to the loop end", () => {
    const owPad = 50;
    const ow = new Float32Array(owPad * 2 + 100).fill(-1);
    const out = bakeTrack(
      base({
        overwrite: {
          segment: ow,
          padFrames: owPad,
          delayFrames: 0,
          startFrame: 300,
          endFrame: 400,
        },
      }),
    );
    // The tail fade lands at frames 0..7, wrapping cleanly instead of writing
    // past the buffer. What it blends against is the loop's own wrap seam
    // crossfade (already baked in), and the overwrite's post-roll (-1).
    const j = 3;
    const t = j / 8;
    const seamValue = fadeInGain(t) * (100 + j) + fadeOutGain(t) * (100 + 400 + j);
    expect(out[j]).toBeCloseTo(fadeInGain(t) * seamValue + fadeOutGain(t) * -1);
    expect(out[350]).toBe(-1);
  });
});
