import { describe, expect, it } from "vitest";
import {
  INTERVALS,
  OCTAVE,
  acceptedAnswers,
  foldSemitones,
  intervalAt,
  intervalLabel,
  invert,
  isCorrectGuess,
} from "./intervals";

describe("INTERVALS", () => {
  it("has one entry per semitone from unison to octave", () => {
    expect(INTERVALS).toHaveLength(13);
    expect(INTERVALS.map((i) => i.semitones)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("is indexed by semitone distance, so lookups need no search", () => {
    INTERVALS.forEach((interval, index) => {
      expect(interval.semitones).toBe(index);
    });
  });

  it("keeps unison and octave distinct", () => {
    // The whole reason there are thirteen buttons rather than twelve.
    expect(INTERVALS[0].name).toBe("Unison");
    expect(INTERVALS[12].name).toBe("Octave");
    expect(INTERVALS[0].abbr).not.toBe(INTERVALS[12].abbr);
  });

  it("gives every interval a distinct name and abbreviation", () => {
    expect(new Set(INTERVALS.map((i) => i.name)).size).toBe(13);
    expect(new Set(INTERVALS.map((i) => i.abbr)).size).toBe(13);
  });
});

describe("foldSemitones", () => {
  it("leaves everything on the board alone", () => {
    for (let semitones = 0; semitones <= OCTAVE; semitones++) {
      expect(foldSemitones(semitones)).toBe(semitones);
    }
  });

  it("folds compound intervals inward", () => {
    expect(foldSemitones(19)).toBe(7); // a 12th is a perfect 5th
    expect(foldSemitones(16)).toBe(4); // a 10th is a major 3rd
    expect(foldSemitones(13)).toBe(1);
  });

  it("keeps whole octaves reading as octaves, not unisons", () => {
    // The reason for the ((n - 1) % 12) + 1 shape: a plain modulo would turn two
    // octaves into a unison, which is the wrong answer on this board.
    expect(foldSemitones(24)).toBe(OCTAVE);
    expect(foldSemitones(36)).toBe(OCTAVE);
    expect(foldSemitones(48)).toBe(OCTAVE);
  });

  it("only ever lands on a real button", () => {
    for (let semitones = 0; semitones <= 60; semitones++) {
      const folded = foldSemitones(semitones);
      expect(folded).toBeGreaterThanOrEqual(0);
      expect(folded).toBeLessThanOrEqual(OCTAVE);
      expect(INTERVALS[folded]).toBeDefined();
    }
  });

  it("ignores direction — the distance is measured from the lower note", () => {
    expect(foldSemitones(-7)).toBe(7);
    expect(foldSemitones(-19)).toBe(7);
  });

  it("rounds a fractional distance to the nearest semitone", () => {
    expect(foldSemitones(6.9)).toBe(7);
    expect(foldSemitones(7.4)).toBe(7);
  });
});

describe("invert", () => {
  it("swaps an interval for its complement", () => {
    expect(invert(0)).toBe(12);
    expect(invert(12)).toBe(0);
    expect(invert(5)).toBe(7);
    expect(invert(7)).toBe(5);
    expect(invert(1)).toBe(11);
  });

  it("leaves the tritone alone — it is its own inversion", () => {
    expect(invert(6)).toBe(6);
  });

  it("is its own opposite", () => {
    for (let semitones = 0; semitones <= OCTAVE; semitones++) {
      expect(invert(invert(semitones))).toBe(semitones);
    }
  });
});

describe("acceptedAnswers", () => {
  it("takes exactly one answer in absolute mode", () => {
    for (let semitones = 0; semitones <= OCTAVE; semitones++) {
      expect(acceptedAnswers(semitones, "absolute")).toEqual([semitones]);
    }
  });

  it("takes exactly two in relative mode, except the tritone", () => {
    // The property the mode is defined by, checked across the whole board rather
    // than spot-checked.
    for (let semitones = 0; semitones <= OCTAVE; semitones++) {
      const answers = acceptedAnswers(semitones, "relative");
      expect(answers).toHaveLength(semitones === 6 ? 1 : 2);
    }
  });

  it("pairs each interval with its inversion", () => {
    expect(acceptedAnswers(0, "relative")).toEqual([0, 12]);
    expect(acceptedAnswers(12, "relative")).toEqual([12, 0]);
    expect(acceptedAnswers(5, "relative")).toEqual([5, 7]);
    expect(acceptedAnswers(7, "relative")).toEqual([7, 5]);
  });

  it("folds a compound interval before judging it", () => {
    expect(acceptedAnswers(19, "absolute")).toEqual([7]);
    expect(acceptedAnswers(19, "relative")).toEqual([7, 5]);
  });
});

describe("isCorrectGuess", () => {
  it("distinguishes unison from octave in absolute mode", () => {
    expect(isCorrectGuess(0, 0, "absolute")).toBe(true);
    expect(isCorrectGuess(12, 0, "absolute")).toBe(false);
    expect(isCorrectGuess(0, 12, "absolute")).toBe(false);
  });

  it("accepts either one in relative mode", () => {
    expect(isCorrectGuess(12, 0, "relative")).toBe(true);
    expect(isCorrectGuess(0, 12, "relative")).toBe(true);
  });

  it("accepts a 4th for a 5th only in relative mode", () => {
    expect(isCorrectGuess(5, 7, "absolute")).toBe(false);
    expect(isCorrectGuess(5, 7, "relative")).toBe(true);
  });

  it("does not let relative mode accept an unrelated interval", () => {
    // Loosening the rule must not turn into accepting everything.
    expect(isCorrectGuess(3, 7, "relative")).toBe(false);
    expect(isCorrectGuess(6, 7, "relative")).toBe(false);
  });

  it("accepts the tritone only for itself, in both modes", () => {
    for (const mode of ["absolute", "relative"] as const) {
      for (let guess = 0; guess <= OCTAVE; guess++) {
        expect(isCorrectGuess(guess, 6, mode)).toBe(guess === 6);
      }
    }
  });

  it("marks exactly the accepted answers right, board-wide", () => {
    for (const mode of ["absolute", "relative"] as const) {
      for (let truth = 0; truth <= OCTAVE; truth++) {
        const accepted = acceptedAnswers(truth, mode);
        for (let guess = 0; guess <= OCTAVE; guess++) {
          expect(isCorrectGuess(guess, truth, mode)).toBe(accepted.includes(guess));
        }
      }
    }
  });
});

describe("intervalAt", () => {
  it("names a distance, folding first", () => {
    expect(intervalAt(7).name).toBe("Perfect 5th");
    expect(intervalAt(19).name).toBe("Perfect 5th");
    expect(intervalAt(24).name).toBe("Octave");
  });
});

describe("intervalLabel", () => {
  it("switches between the full name and the abbreviation", () => {
    expect(intervalLabel(INTERVALS[3], false)).toBe("Minor 3rd");
    expect(intervalLabel(INTERVALS[3], true)).toBe("m3");
    expect(intervalLabel(INTERVALS[6], true)).toBe("TT");
  });

  it("keeps every abbreviation short enough for a compact row", () => {
    // Thirteen in a row only fits because these stay to two characters.
    for (const interval of INTERVALS) {
      expect(interval.abbr.length).toBeLessThanOrEqual(2);
    }
  });
});
