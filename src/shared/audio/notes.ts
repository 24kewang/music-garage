/**
 * Music-theory conversions: frequency ↔ MIDI ↔ note name, plus cents deviation.
 *
 * Pure functions, no browser APIs — this file is directly unit-testable and safe to
 * import from anywhere, including server components.
 */

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

/** Concert pitch. Exposed so a game can retune (baroque 415, etc.) later. */
export const DEFAULT_A4 = 440;

/** MIDI note number of A4. The anchor every other conversion hangs off. */
const A4_MIDI = 69;

export interface DetectedNote {
  /** Nearest equal-tempered note, e.g. "A". */
  name: NoteName;
  /** Scientific pitch notation octave — A4 = 440 Hz sits in octave 4. */
  octave: number;
  /** Nearest MIDI note number (integer). */
  midi: number;
  /**
   * Signed deviation from that note in cents, within (-50, +50].
   * Negative means flat, positive means sharp.
   */
  cents: number;
  /** The frequency this was derived from, unrounded. */
  frequency: number;
}

/**
 * Fractional MIDI number for a frequency. Fractional on purpose — the fraction is
 * what makes the cents calculation possible.
 */
export function frequencyToMidi(frequency: number, a4: number = DEFAULT_A4): number {
  return A4_MIDI + 12 * Math.log2(frequency / a4);
}

export function midiToFrequency(midi: number, a4: number = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Note name for a MIDI number, e.g. 69 → "A". */
export function midiToNoteName(midi: number): NoteName {
  // Modulo that stays positive for MIDI numbers below 0.
  const index = ((Math.round(midi) % 12) + 12) % 12;
  return NOTE_NAMES[index];
}

/** Scientific pitch octave for a MIDI number. MIDI 60 (C4) → 4. */
export function midiToOctave(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

/**
 * Full description of the nearest note to a frequency.
 *
 * Returns `null` for frequencies that can't be a note (zero, negative, non-finite),
 * so callers don't have to guard before calling.
 */
export function frequencyToNote(
  frequency: number,
  a4: number = DEFAULT_A4,
): DetectedNote | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;

  const exactMidi = frequencyToMidi(frequency, a4);
  const midi = Math.round(exactMidi);

  return {
    name: midiToNoteName(midi),
    octave: midiToOctave(midi),
    midi,
    // 100 cents per semitone; exactMidi - midi is the fractional part.
    cents: (exactMidi - midi) * 100,
    frequency,
  };
}

/** Human-readable label, e.g. "A4" or "F#3". */
export function formatNote(note: DetectedNote): string {
  return `${note.name}${note.octave}`;
}

/** Label for a MIDI number directly, e.g. 69 → "A4". The inverse of parseNoteName. */
export function formatMidi(midi: number): string {
  return `${midiToNoteName(midi)}${midiToOctave(midi)}`;
}

/** Semitone offset of each letter above C, so C=0 … B=11. */
const LETTER_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Matches scientific pitch notation: a letter, any run of accidentals, an octave.
 * The octave may be negative (C-1 is MIDI 0).
 */
const NOTE_PATTERN = /^([A-Ga-g])([#b♯♭]*)(-?\d+)$/;

/**
 * Parse a note name like "A4", "Bb4", "C#5" or "F♯3" into a MIDI number.
 *
 * Case-insensitive on the letter, tolerant of surrounding whitespace, and accepts
 * both ASCII (`#`, `b`) and Unicode (`♯`, `♭`) accidentals. Multiple accidentals
 * stack, so "Bbb4" is a double flat.
 *
 * Returns `null` for anything unparseable or outside the MIDI range, so callers can
 * use it directly as input validation.
 */
export function parseNoteName(text: string): number | null {
  const match = NOTE_PATTERN.exec(text.trim());
  if (!match) return null;

  const [, letter, accidentals, octave] = match;

  let semitone = LETTER_SEMITONES[letter.toUpperCase()];
  for (const accidental of accidentals) {
    semitone += accidental === "#" || accidental === "♯" ? 1 : -1;
  }

  // MIDI 0 is C-1, so octave 4 (containing A4 = 69) starts at MIDI 60.
  const midi = (Number(octave) + 1) * 12 + semitone;

  return midi >= 0 && midi <= 127 ? midi : null;
}
