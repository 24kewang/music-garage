import { config } from "../config";

/**
 * Where the box sits above the head, and how big it is — the player's own tuning.
 *
 * Same defensive contract as the other games' settings modules: SSR-safe,
 * corrupt-safe, and a stored value that has since gone out of range costs only its
 * own field, never the whole configuration.
 */

export const STORAGE_KEY = "music-garage:reg:settings";

export interface Settings {
  /** Head-space offsets of the box from the forehead anchor (face width = 1 unit). */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** Overall size of the box — image and caption together — as a percentage. */
  scalePercent: number;
  /** Whether the excerpt's name is drawn under the image (and in the overlay). */
  showCaption: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  offsetX: config.scene.boxOffset.x,
  offsetY: config.scene.boxOffset.y,
  offsetZ: config.scene.boxOffset.z,
  scalePercent: 100,
  showCaption: true,
};

/** The bounds each field is checked against — the same ones the sliders use. */
export const BOUNDS = config.tuning;

type NumericField = "offsetX" | "offsetY" | "offsetZ" | "scalePercent";

/** A finite number inside its slider's range. */
export function isInRange(field: NumericField, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const { min, max } = BOUNDS[field];
  return value >= min && value <= max;
}

export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };

  const candidate = raw as Partial<Record<keyof Settings, unknown>>;
  const settings: Settings = { ...DEFAULT_SETTINGS };

  for (const field of [
    "offsetX",
    "offsetY",
    "offsetZ",
    "scalePercent",
  ] as const) {
    const value = candidate[field];
    if (isInRange(field, value)) settings[field] = value;
  }

  if (typeof candidate.showCaption === "boolean") {
    settings.showCaption = candidate.showCaption;
  }

  return settings;
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    return coerceSettings(JSON.parse(raw));
  } catch {
    // Corrupt JSON, or storage blocked by the browser.
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

/** What the scene needs: offsets as a vector, percentage as a multiplier. */
export function placementFromSettings(settings: Settings): {
  x: number;
  y: number;
  z: number;
  scale: number;
} {
  return {
    x: settings.offsetX,
    y: settings.offsetY,
    z: settings.offsetZ,
    scale: settings.scalePercent / 100,
  };
}
