/**
 * Player settings: what drives the needle, and the parameters for each mode.
 *
 * Defaults are always usable, and invalid input never commits — between them, the
 * game stays playable no matter what the player types or how they leave the popup.
 */

import { parseNoteName } from "@/shared/audio";

export type NeedleMode = "manual" | "pitch" | "intonation";

export const NEEDLE_MODES: readonly NeedleMode[] = ["manual", "pitch", "intonation"];

export interface Settings {
  mode: NeedleMode;
  /** Low end of the pitch-mode range, as a note name — maps to the left of the dial. */
  pitchLow: string;
  /** High end, mapping to the right of the dial. */
  pitchHigh: string;
  /** Half-width of the intonation scale, in cents either side of center. */
  intonationSpanCents: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "manual",
  pitchLow: "C4",
  pitchHigh: "C5",
  intonationSpanCents: 50,
};

/**
 * Floor of 10 because the scale is labeled every `config.ticks.labelStepCents`
 * (10) cents — a narrower span would draw a scale with no labels on it at all.
 */
export const MIN_SPAN_CENTS = 10;
export const MAX_SPAN_CENTS = 50;
/** A range narrower than this can't produce a meaningful scale. */
export const MIN_RANGE_SEMITONES = 1;

export const STORAGE_KEY = "music-garage:musical-wavelength:settings";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parse and range-check the two pitch-mode note names. */
export function validatePitchRange(
  low: string,
  high: string,
): Validated<{ lowMidi: number; highMidi: number }> {
  const lowMidi = parseNoteName(low);
  if (lowMidi === null) {
    return { ok: false, error: `"${low.trim()}" isn't a note name. Try C4 or Bb3.` };
  }

  const highMidi = parseNoteName(high);
  if (highMidi === null) {
    return { ok: false, error: `"${high.trim()}" isn't a note name. Try C5 or F#5.` };
  }

  if (highMidi - lowMidi < MIN_RANGE_SEMITONES) {
    return {
      ok: false,
      error: "The high note must be above the low note.",
    };
  }

  return { ok: true, value: { lowMidi, highMidi } };
}

/** Parse and range-check the intonation span. */
export function validateSpan(text: string | number): Validated<number> {
  const value = typeof text === "number" ? text : Number(text.trim());

  if (!Number.isFinite(value) || (typeof text === "string" && text.trim() === "")) {
    return { ok: false, error: "Enter a number of cents." };
  }
  if (!Number.isInteger(value)) {
    return { ok: false, error: "Use a whole number of cents." };
  }
  if (value < MIN_SPAN_CENTS || value > MAX_SPAN_CENTS) {
    return {
      ok: false,
      error: `Span must be between ${MIN_SPAN_CENTS} and ${MAX_SPAN_CENTS} cents.`,
    };
  }

  return { ok: true, value };
}

function isNeedleMode(value: unknown): value is NeedleMode {
  return typeof value === "string" && (NEEDLE_MODES as readonly string[]).includes(value);
}

/**
 * Take whatever was stored and produce usable settings, field by field.
 *
 * Anything missing, malformed, or no longer valid falls back to its default rather
 * than failing the whole load — a settings file that has drifted shouldn't cost the
 * player the fields that are still fine.
 */
export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };

  const candidate = raw as Partial<Record<keyof Settings, unknown>>;
  const settings: Settings = { ...DEFAULT_SETTINGS };

  if (isNeedleMode(candidate.mode)) {
    settings.mode = candidate.mode;
  }

  if (typeof candidate.pitchLow === "string" && typeof candidate.pitchHigh === "string") {
    const range = validatePitchRange(candidate.pitchLow, candidate.pitchHigh);
    if (range.ok) {
      settings.pitchLow = candidate.pitchLow.trim();
      settings.pitchHigh = candidate.pitchHigh.trim();
    }
  }

  if (typeof candidate.intonationSpanCents === "number") {
    const span = validateSpan(candidate.intonationSpanCents);
    if (span.ok) settings.intonationSpanCents = span.value;
  }

  return settings;
}

/** Read stored settings. Safe on the server and against corrupt or blocked storage. */
export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    return coerceSettings(JSON.parse(stored));
  } catch {
    // Corrupt JSON, or storage blocked by the browser. Defaults still play.
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota. Not worth interrupting play over.
  }
}

/** True when the mode needs the microphone. */
export function needsMicrophone(mode: NeedleMode): boolean {
  return mode === "pitch" || mode === "intonation";
}
