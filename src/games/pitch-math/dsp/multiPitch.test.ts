import { describe, expect, it } from "vitest";
import { parseNoteName } from "@/shared/audio";
import { config } from "../config";
import { foldSemitones } from "../lib/intervals";
import {
  cancel,
  detect,
  detectionMidis,
  detectionSemitones,
  octaveEvidence,
  salience,
  type Detection,
} from "./multiPitch";
import { buildNoteGrid } from "./noteGrid";
import { analyzeSpectrum, planSpectrum } from "./spectrum";
import { mix, noise, tone } from "./synth";

/**
 * A smaller transform than the game uses. 8192 points at 44.1 kHz is 5.4 Hz per bin —
 * coarser than production, so anything that passes here has margin to spare, and the
 * suite stays quick enough to run on every save.
 */
const SAMPLE_RATE = 44100;
const SIZE = 8192;

const plan = planSpectrum(SIZE);
const grid = buildNoteGrid(SAMPLE_RATE, SIZE);

const midi = (name: string) => parseNoteName(name)!;

/** Play a set of notes together and ask the detector what it heard. */
function hear(
  notes: {
    midi: number;
    amplitude?: number;
    cents?: number;
    rolloff?: number;
    /** Offsets a second player's tone so two identical notes don't sum coherently. */
    phase?: number;
  }[],
  extra: Float64Array | null = null,
): Detection {
  const parts = notes.map((note) =>
    tone(note.midi, SAMPLE_RATE, SIZE, {
      amplitude: note.amplitude ?? 1,
      cents: note.cents ?? 0,
      rolloff: note.rolloff ?? 1,
      phase: note.phase ?? 0,
    }),
  );

  const samples = extra ? mix(...parts, extra) : mix(...parts);
  return detect(samples, analyzeSpectrum(plan, samples, SAMPLE_RATE), grid);
}

/** The interval the detector would hand to the guessing board. */
function heardInterval(detection: Detection): number | null {
  const semitones = detectionSemitones(detection);
  return semitones === null ? null : foldSemitones(semitones);
}

describe("salience", () => {
  it("peaks at the note that was played", () => {
    const samples = tone(midi("A4"), SAMPLE_RATE, SIZE);
    const { magnitude } = analyzeSpectrum(plan, samples, SAMPLE_RATE);

    const scores = grid.candidates.map((candidate) => salience(magnitude, candidate));
    const best = grid.candidates[scores.indexOf(Math.max(...scores))];

    expect(best.midi).toBe(midi("A4"));
  });

  it("prefers the fundamental over its own octave", () => {
    // The classic failure: A5's harmonics are a subset of A4's, so a detector that
    // just sums harmonics can pick the octave up. The 1/h weighting is what stops it.
    const samples = tone(midi("A4"), SAMPLE_RATE, SIZE);
    const { magnitude } = analyzeSpectrum(plan, samples, SAMPLE_RATE);

    const scoreFor = (note: string) => {
      const candidate = grid.candidates.find((c) => c.midi === midi(note))!;
      return salience(magnitude, candidate);
    };

    expect(scoreFor("A4")).toBeGreaterThan(scoreFor("A5"));
  });
});

describe("cancel", () => {
  it("reduces the canceled note's own score", () => {
    const samples = tone(midi("C4"), SAMPLE_RATE, SIZE);
    const { magnitude } = analyzeSpectrum(plan, samples, SAMPLE_RATE);
    const candidate = grid.candidates.find((c) => c.midi === midi("C4"))!;

    const before = salience(magnitude, candidate);
    const after = salience(cancel(magnitude, candidate), candidate);

    expect(after).toBeLessThan(before);
  });

  it("leaves a shared harmonic partly standing", () => {
    // The perfect-5th case in miniature: C4's 3rd harmonic sits on G4's 2nd. If
    // canceling C4 flattened that bin, G4 would vanish with it.
    const samples = mix(
      tone(midi("C4"), SAMPLE_RATE, SIZE),
      tone(midi("G4"), SAMPLE_RATE, SIZE),
    );
    const { magnitude } = analyzeSpectrum(plan, samples, SAMPLE_RATE);

    const c4 = grid.candidates.find((c) => c.midi === midi("C4"))!;
    const g4 = grid.candidates.find((c) => c.midi === midi("G4"))!;

    expect(salience(cancel(magnitude, c4), g4)).toBeGreaterThan(0);
  });
});

describe("detect — two separate notes", () => {
  const cases: [string, string, string, number][] = [
    ["a minor 2nd", "C4", "C#4", 1],
    ["a major 2nd", "C4", "D4", 2],
    ["a minor 3rd", "A3", "C4", 3],
    ["a major 3rd", "C4", "E4", 4],
    ["a perfect 4th", "C4", "F4", 5],
    ["a tritone", "C4", "F#4", 6],
    ["a perfect 5th", "C4", "G4", 7],
    ["a minor 6th", "C4", "Ab4", 8],
    ["a major 6th", "C4", "A4", 9],
    ["a minor 7th", "C4", "Bb4", 10],
    ["a major 7th", "C4", "B4", 11],
  ];

  it.each(cases)("hears %s", (_label, low, high, semitones) => {
    const detection = hear([{ midi: midi(low) }, { midi: midi(high) }]);

    expect(detection.kind).toBe("two");
    expect(heardInterval(detection)).toBe(semitones);
  });

  it("reports the lower note first, whichever was louder", () => {
    const detection = hear([
      { midi: midi("G4"), amplitude: 1 },
      { midi: midi("C4"), amplitude: 0.6 },
    ]);

    expect(detectionMidis(detection)).toEqual([midi("C4"), midi("G4")]);
  });

  it("hears a perfect 5th rather than collapsing it to one note", () => {
    // The hard case the cancellation ceiling exists for: over-subtract the lower
    // note and its 3rd harmonic takes the upper note's 2nd with it.
    const detection = hear([{ midi: midi("C4") }, { midi: midi("G4") }]);
    expect(detection.kind).toBe("two");
    expect(heardInterval(detection)).toBe(7);
  });

  it("hears a perfect 4th the same way", () => {
    const detection = hear([{ midi: midi("D4") }, { midi: midi("G4") }]);
    expect(detection.kind).toBe("two");
    expect(heardInterval(detection)).toBe(5);
  });
});

describe("detect — the awkward cases", () => {
  it("calls two identical notes a unison", () => {
    const detection = hear([{ midi: midi("A4") }, { midi: midi("A4"), phase: 1 }]);
    expect(detection.kind).toBe("unison");
    expect(heardInterval(detection)).toBe(0);
  });

  it("calls a note and its octave an octave", () => {
    // Cannot be separated by subtraction — the upper note owns no bin of its own —
    // so this rests entirely on the even/odd harmonic signature.
    const detection = hear([{ midi: midi("A3") }, { midi: midi("A4") }]);
    expect(detection.kind).toBe("octave");
    expect(heardInterval(detection)).toBe(12);
  });

  it("keeps unison and octave apart", () => {
    const unison = hear([{ midi: midi("C4") }, { midi: midi("C4") }]);
    const octave = hear([{ midi: midi("C4") }, { midi: midi("C5") }]);

    expect(heardInterval(unison)).toBe(0);
    expect(heardInterval(octave)).toBe(12);
  });

  it("names both notes of an octave", () => {
    const detection = hear([{ midi: midi("A3") }, { midi: midi("A4") }]);
    expect(detectionMidis(detection)).toEqual([midi("A3"), midi("A3") + 12]);
  });

  it("names a unison as the same note twice", () => {
    const detection = hear([{ midi: midi("A4") }, { midi: midi("A4") }]);
    expect(detectionMidis(detection)).toEqual([midi("A4"), midi("A4")]);
  });
});

describe("detect — real-world tolerance", () => {
  it("survives players being out of tune", () => {
    // Nobody plays at exactly 440. Both notes are pushed well off, in opposite
    // directions, and the interval must still come out right.
    const detection = hear([
      { midi: midi("C4"), cents: -22 },
      { midi: midi("E4"), cents: 18 },
    ]);

    expect(detection.kind).toBe("two");
    expect(heardInterval(detection)).toBe(4);
  });

  it("survives one player being much quieter", () => {
    const detection = hear([
      { midi: midi("C4"), amplitude: 1 },
      { midi: midi("A4"), amplitude: 0.45 },
    ]);

    expect(heardInterval(detection)).toBe(9);
  });

  it("survives room noise", () => {
    const detection = hear(
      [{ midi: midi("D4") }, { midi: midi("A4") }],
      noise(SIZE, 0.05),
    );

    expect(heardInterval(detection)).toBe(7);
  });

  it("works low down, where the bins are tightest", () => {
    // Adjacent semitones near C2 are about 4 Hz apart — under one bin at this size.
    const detection = hear([{ midi: midi("C3") }, { midi: midi("G3") }]);
    expect(heardInterval(detection)).toBe(7);
  });

  it("works with different instrument timbres", () => {
    // A bright reedy tone against a nearly-pure one.
    const detection = hear([
      { midi: midi("C4"), rolloff: 0.7 },
      { midi: midi("F4"), rolloff: 2.5 },
    ]);

    expect(heardInterval(detection)).toBe(5);
  });
});

describe("detect — nothing to hear", () => {
  it("reports silence", () => {
    const samples = new Float64Array(SIZE);
    const detection = detect(samples, analyzeSpectrum(plan, samples, SAMPLE_RATE), grid);

    expect(detection).toEqual({ kind: "none", reason: "silence" });
  });

  it("reports silence for a signal below the capture floor", () => {
    const samples = tone(midi("A4"), SAMPLE_RATE, SIZE, { amplitude: 0.0005 });
    const detection = detect(samples, analyzeSpectrum(plan, samples, SAMPLE_RATE), grid);

    expect(detection.kind).toBe("none");
  });

  it("gives no interval and no notes when it heard nothing", () => {
    const detection: Detection = { kind: "none", reason: "silence" };
    expect(detectionSemitones(detection)).toBeNull();
    expect(detectionMidis(detection)).toEqual([]);
  });
});

describe("octaveEvidence", () => {
  const evidenceFor = (samples: Float64Array, note: string) =>
    octaveEvidence(
      analyzeSpectrum(plan, samples, SAMPLE_RATE).magnitude,
      grid.candidates.find((c) => c.midi === midi(note))!,
    );

  /** Every timbre in the range a real instrument might land in. */
  const ROLLOFFS = [0.7, 1, 1.5, 2.5];
  const NOTES = ["C3", "A3", "C4", "E4", "A4", "C5"];

  it("sits near 1 for a lone note, whatever its timbre", () => {
    // The whole point of normalizing against the note's own harmonic decay: a raw
    // even-to-odd ratio swings from 0.19 to 0.74 across these same timbres, which is
    // why no threshold on it could separate one note from two.
    for (const note of NOTES) {
      for (const rolloff of ROLLOFFS) {
        const evidence = evidenceFor(tone(midi(note), SAMPLE_RATE, SIZE, { rolloff }), note);
        expect(evidence).toBeGreaterThan(0.9);
        expect(evidence).toBeLessThan(1.1);
      }
    }
  });

  it("rises well above 1 when an octave is stacked on top", () => {
    for (const note of NOTES) {
      for (const rolloff of ROLLOFFS) {
        const stacked = mix(
          tone(midi(note), SAMPLE_RATE, SIZE, { rolloff }),
          tone(midi(note) + 12, SAMPLE_RATE, SIZE, { rolloff }),
        );
        expect(evidenceFor(stacked, note)).toBeGreaterThan(1.5);
      }
    }
  });

  it("keeps a clear margin either side of the configured threshold", () => {
    // The measurement the threshold was chosen from. If a change to the spectrum or
    // the harmonic model narrows this gap, the octave/unison call starts coin-flipping
    // and this fails before anyone hears it.
    const threshold = config.detector.octaveEvidenceThreshold;

    let loneMax = 0;
    let octaveMin = Number.POSITIVE_INFINITY;

    for (const note of NOTES) {
      for (const rolloff of ROLLOFFS) {
        const alone = tone(midi(note), SAMPLE_RATE, SIZE, { rolloff });
        loneMax = Math.max(
          loneMax,
          evidenceFor(alone, note),
          // Noise must not push a lone note over the line either.
          evidenceFor(mix(alone, noise(SIZE, 0.05)), note),
        );
        octaveMin = Math.min(
          octaveMin,
          evidenceFor(
            mix(alone, tone(midi(note) + 12, SAMPLE_RATE, SIZE, { rolloff })),
            note,
          ),
        );
      }
    }

    expect(loneMax).toBeLessThan(threshold);
    expect(octaveMin).toBeGreaterThan(threshold);
    // Not merely on the right side of the line — comfortably so.
    expect(threshold / loneMax).toBeGreaterThan(1.15);
    expect(octaveMin / threshold).toBeGreaterThan(1.15);
  });

  it("is undefined-safe when there is nothing to fit", () => {
    expect(evidenceFor(new Float64Array(SIZE), "A4")).toBe(0);
  });
});
