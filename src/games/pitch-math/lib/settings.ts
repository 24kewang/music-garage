/**
 * Player settings: how guesses are judged, and how the reveal is written.
 *
 * Same contract as the other game in the garage — defaults are always playable, and a
 * stored value that has since become invalid costs only its own field, never the whole
 * configuration.
 */

import { INTERVAL_MODES, type IntervalMode } from "./intervals";
import { TRANSPOSITIONS, type Transposition } from "./spelling";

export interface Settings {
  /** Absolute is the default: one right answer, measured from the lower note. */
  mode: IntervalMode;
  /** The players' instrument, which decides how the reveal spells the notes. */
  transposition: Transposition;
  /** Short button labels ("m3"), which let the whole board fit on one row. */
  abbreviate: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "absolute",
  transposition: "C",
  abbreviate: false,
};

export const STORAGE_KEY = "music-garage:pitch-math:settings";

function isMode(value: unknown): value is IntervalMode {
  return typeof value === "string" && (INTERVAL_MODES as readonly string[]).includes(value);
}

function isTransposition(value: unknown): value is Transposition {
  return typeof value === "string" && (TRANSPOSITIONS as readonly string[]).includes(value);
}

/**
 * Take whatever was stored and produce usable settings, field by field.
 *
 * Anything missing or malformed falls back to its own default rather than failing the
 * whole load.
 */
export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };

  const candidate = raw as Partial<Record<keyof Settings, unknown>>;
  const settings: Settings = { ...DEFAULT_SETTINGS };

  if (isMode(candidate.mode)) settings.mode = candidate.mode;
  if (isTransposition(candidate.transposition)) {
    settings.transposition = candidate.transposition;
  }
  if (typeof candidate.abbreviate === "boolean") {
    settings.abbreviate = candidate.abbreviate;
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
