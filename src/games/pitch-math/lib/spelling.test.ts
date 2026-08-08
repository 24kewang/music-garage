import { describe, expect, it } from "vitest";
import { parseNoteName } from "@/shared/audio";
import { foldSemitones } from "./intervals";
import {
  NAME_SEPARATOR,
  TRANSPOSITIONS,
  TRANSPOSITION_LABELS,
  revealNames,
  writtenName,
  type Transposition,
} from "./spelling";

const midi = (name: string) => parseNoteName(name)!;

/**
 * Join names with the real separator rather than retyping it — its spaces are
 * non-breaking and look identical to ordinary ones in a source file.
 */
const joined = (...names: string[]) => names.join(NAME_SEPARATOR);

describe("writtenName", () => {
  it("leaves concert pitch alone", () => {
    expect(writtenName(midi("C4"), "C")).toBe("C");
    expect(writtenName(midi("A4"), "C")).toBe("A");
    expect(writtenName(midi("F#4"), "C")).toBe("F#");
  });

  it("writes a Bb instrument a tone above what it sounds", () => {
    // A trumpet sounding a concert Bb is reading a C.
    expect(writtenName(midi("Bb3"), "Bb")).toBe("C");
    expect(writtenName(midi("C4"), "Bb")).toBe("D");
    expect(writtenName(midi("G4"), "Bb")).toBe("A");
  });

  it("writes an Eb instrument a major 6th above", () => {
    // An alto sax sounding a concert Eb is reading a C.
    expect(writtenName(midi("Eb4"), "Eb")).toBe("C");
    expect(writtenName(midi("C4"), "Eb")).toBe("A");
  });

  it("writes an F instrument a perfect 5th above", () => {
    // A horn sounding a concert F is reading a C.
    expect(writtenName(midi("F3"), "F")).toBe("C");
    expect(writtenName(midi("C4"), "F")).toBe("G");
  });

  it("spells accidentals as flats for transposing instruments", () => {
    // "A#" is technically the same pitch, but no trumpeter reads it that way.
    expect(writtenName(midi("Ab3"), "Bb")).toBe("Bb");
    expect(writtenName(midi("B3"), "Bb")).toBe("Db");
    expect(writtenName(midi("E4"), "Eb")).toBe("Db");
  });

  it("never prints an octave number", () => {
    for (const transposition of TRANSPOSITIONS) {
      for (let note = 24; note <= 108; note++) {
        expect(writtenName(note, transposition)).not.toMatch(/\d/);
      }
    }
  });

  it("gives the same name to every octave of a pitch", () => {
    for (const transposition of TRANSPOSITIONS) {
      const low = writtenName(midi("C2"), transposition);
      for (const note of ["C3", "C4", "C5", "C6"]) {
        expect(writtenName(midi(note), transposition)).toBe(low);
      }
    }
  });

  it("shifts every pitch by the same amount, whatever the transposition", () => {
    // The transposition must be a rigid shift: if it weren't, two notes could move by
    // different amounts and the printed pair would imply the wrong interval.
    for (const transposition of TRANSPOSITIONS) {
      const names = Array.from({ length: 12 }, (_, pitchClass) =>
        writtenName(60 + pitchClass, transposition),
      );
      expect(new Set(names).size).toBe(12);
    }
  });
});

describe("revealNames", () => {
  it("puts the lower sounding note on the left", () => {
    expect(revealNames([midi("G4"), midi("C4")], "C").text).toBe(joined("C", "G"));
    expect(revealNames([midi("C4"), midi("G4")], "C").text).toBe(joined("C", "G"));
  });

  it("separates the pair with non-breaking spaces, checked by code point", () => {
    // These characters are indistinguishable from ordinary spaces and a hyphen in a
    // source file, so the assertion goes through code points rather than a literal.
    expect([...NAME_SEPARATOR].map((char) => char.codePointAt(0))).toEqual([
      0x00a0, // no-break space
      0x2013, // en dash
      0x00a0,
    ]);
  });

  it("keeps sounding order even when the written names would sort differently", () => {
    // Sounding C4 then G4 on an Eb instrument reads A then E. Sorting the *names*
    // would flip them and misrepresent which note was lower.
    const reveal = revealNames([midi("C4"), midi("G4")], "Eb");
    expect(reveal.names).toEqual(["A", "E"]);
  });

  it("shows a unison once", () => {
    const reveal = revealNames([midi("A4"), midi("A4")], "C");
    expect(reveal.names).toEqual(["A"]);
    expect(reveal.text).toBe("A");
  });

  it("shows an octave twice", () => {
    // Deliberately different from a unison: the repeated name is the point.
    const reveal = revealNames([midi("A3"), midi("A4")], "C");
    expect(reveal.names).toEqual(["A", "A"]);
    expect(reveal.text).toBe(joined("A", "A"));
  });

  it("handles a single detected note", () => {
    expect(revealNames([midi("D4")], "C").names).toEqual(["D"]);
  });

  it("never changes the interval, only the names", () => {
    // The load-bearing property: transposition is presentation. If it altered the
    // distance between the notes, the button that scores would change with it.
    const pair = [midi("C4"), midi("G4")];
    const truth = foldSemitones(pair[1] - pair[0]);

    for (const transposition of TRANSPOSITIONS) {
      const shifted = pair.map((note) => note + (transposition === "C" ? 0 : 3));
      expect(foldSemitones(shifted[1] - shifted[0])).toBe(truth);
      expect(revealNames(pair, transposition).names).toHaveLength(2);
    }
  });
});

describe("TRANSPOSITIONS", () => {
  it("offers C first, as the default", () => {
    expect(TRANSPOSITIONS[0]).toBe("C");
  });

  it("labels every option", () => {
    for (const transposition of TRANSPOSITIONS) {
      expect(TRANSPOSITION_LABELS[transposition as Transposition]).toBeTruthy();
    }
  });
});
