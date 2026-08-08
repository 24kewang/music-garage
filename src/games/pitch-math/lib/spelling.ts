/**
 * How the two detected notes are written out on the reveal.
 *
 * Two things happen here, and neither affects who won the round: the sounding pitch is
 * shifted into the player's written pitch, and the accidental is spelled the way that
 * instrument's players actually read it.
 */

import { NOTE_NAMES } from "@/shared/audio";

export type Transposition = "C" | "Bb" | "Eb" | "F";

export const TRANSPOSITIONS: readonly Transposition[] = ["C", "Bb", "Eb", "F"];

/**
 * Semitones to add to a sounding pitch to get the written one.
 *
 * A Bb trumpet reading a written C sounds a Bb — a tone lower — so the written note is
 * a tone above what came out of the bell. Eb and F instruments work the same way, a
 * major 6th and a perfect 5th above respectively. Octave doesn't matter here: the
 * reveal prints pitch names without an octave number.
 */
const WRITTEN_OFFSET: Record<Transposition, number> = {
  C: 0,
  Bb: 2,
  Eb: 9,
  F: 7,
};

/** Human label for the settings dropdown. */
export const TRANSPOSITION_LABELS: Record<Transposition, string> = {
  C: "C (concert pitch)",
  Bb: "B♭",
  Eb: "E♭",
  F: "F",
};

/**
 * Flat spellings, indexed by pitch class.
 *
 * `NOTE_NAMES` from the shared module is all sharps, which is right for concert pitch
 * but reads wrong to anyone on a transposing instrument — a trumpeter expects "B♭",
 * not "A♯". Naturals are identical in both, so only the five accidentals differ.
 */
const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

/** Positive modulo, so pitch classes stay in 0–11 for any MIDI number. */
function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/**
 * Write a sounding MIDI note as the player of `transposition` would read it.
 *
 * No octave number — the game is about the interval, and an octave number would only
 * invite arguments about which register someone was in.
 */
export function writtenName(midi: number, transposition: Transposition): string {
  const written = pitchClass(midi + WRITTEN_OFFSET[transposition]);
  // Concert-pitch players get the sharps they already read; everyone else gets flats.
  const names = transposition === "C" ? NOTE_NAMES : FLAT_NAMES;
  return names[written];
}

/** What the reveal line shows, once the notes are known. */
export interface RevealNames {
  /** One name for a unison, two otherwise — lower sounding note first. */
  names: readonly string[];
  /** Joined for display, e.g. "C – G". */
  text: string;
}

/**
 * What sits between the two names: an en dash held by non-breaking spaces, so the pair
 * never wraps mid-interval.
 *
 * Exported because those spaces are invisible in a source file — anything that needs to
 * match this string should reference it rather than retype it.
 */
export const NAME_SEPARATOR =" – ";

/**
 * Build the reveal line from the sounding MIDI numbers.
 *
 * The lower **sounding** note goes on the left. Sorting by written name instead would
 * reorder the pair on some transpositions, which would be a lie about what was played.
 *
 * A unison collapses to a single name — printing it twice would look like a mistake.
 * An octave deliberately does not: the same name twice is exactly what an octave is.
 */
export function revealNames(
  midis: readonly number[],
  transposition: Transposition,
): RevealNames {
  const sorted = [...midis].sort((a, b) => a - b);
  const unison = sorted.length === 2 && sorted[0] === sorted[1];
  const shown = unison ? sorted.slice(0, 1) : sorted;

  const names = shown.map((midi) => writtenName(midi, transposition));
  return { names, text: names.join(NAME_SEPARATOR) };
}
