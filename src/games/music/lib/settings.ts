import type { Player } from "./rules";

/**
 * Everything the settings panel owns, and how it survives a reload.
 *
 * The same defensive contract as the other games: SSR-safe, corrupt-safe, and a
 * stored value that has since gone out of range costs only its own field rather
 * than the whole configuration.
 *
 * Letters live here rather than in the round. That is deliberate and it is what
 * makes two of the brief's requirements work at once — scores are editable in the
 * panel, and a game in progress survives an accidental refresh. The round holds only
 * the things that cannot be persisted anyway: which phase, whose turn, and the
 * recordings. One owner, one door.
 */

export const STORAGE_KEY = "music-garage:music:settings";

/** Boxes on the board. Fixed — who is *playing* is the active checkbox's job. */
export const PLAYER_COUNT = 4;

/** The longest word, and so the most letters anyone can hold. */
export const MAX_LETTERS = 5;

/**
 * The fewest players that may be switched on at once.
 *
 * Enforced here rather than only in the panel, so a blob written by an older build or
 * edited by hand cannot come back with a roster that has nobody to play against.
 */
export const MIN_ACTIVE = 2;

export type Tolerance = "strict" | "loose";

export interface Settings {
  /** In board order: top-to-bottom in the panel is left-to-right on screen. */
  players: Player[];
  /** The word being spelled out. 1–5 letters. */
  word: string;
  tolerance: Tolerance;
}

export function defaultPlayers(): Player[] {
  return Array.from({ length: PLAYER_COUNT }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    letters: 0,
    active: true,
  }));
}

export const DEFAULT_SETTINGS: Settings = {
  players: defaultPlayers(),
  word: "MUSIC",
  tolerance: "strict",
};

/**
 * Clean up a word into something the board can spell.
 *
 * Letters only, uppercased, capped at five. An empty result falls back to the
 * default rather than being allowed through: a zero-length word would make
 * `letters < word.length` false for everybody and eliminate the entire roster at
 * nil-all.
 */
export function coerceWord(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_SETTINGS.word;
  const letters = raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, MAX_LETTERS);
  return letters.length === 0 ? DEFAULT_SETTINGS.word : letters;
}

function coercePlayer(raw: unknown, index: number, usedIds: Set<string>): Player {
  const fallback = defaultPlayers()[index];
  if (typeof raw !== "object" || raw === null) return fallback;

  const candidate = raw as Partial<Record<keyof Player, unknown>>;

  // A duplicate id would break resolution by id — reordering rows in the panel
  // would start handing the melody to the wrong person — so it is reassigned
  // rather than trusted.
  const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const id = rawId.length > 0 && !usedIds.has(rawId) ? rawId : fallback.id;
  usedIds.add(id);

  const rawName = typeof candidate.name === "string" ? candidate.name.trim() : "";

  const letters =
    typeof candidate.letters === "number" && Number.isFinite(candidate.letters)
      ? Math.min(MAX_LETTERS, Math.max(0, Math.floor(candidate.letters)))
      : 0;

  return {
    id,
    name: rawName.length > 0 ? rawName.slice(0, 24) : fallback.name,
    letters,
    active: typeof candidate.active === "boolean" ? candidate.active : true,
  };
}

/** Always exactly `PLAYER_COUNT` players: a short list is padded, a long one cut. */
export function coercePlayers(raw: unknown): Player[] {
  const list = Array.isArray(raw) ? raw : [];
  const usedIds = new Set<string>();

  return enforceMinimumActive(
    Array.from({ length: PLAYER_COUNT }, (_, index) =>
      coercePlayer(list[index], index, usedIds),
    ),
  );
}

export function activeCount(players: readonly Player[]): number {
  return players.reduce((total, player) => total + (player.active ? 1 : 0), 0);
}

/** Whether this player may be switched off without breaching the floor. */
export function canDeactivate(players: readonly Player[], id: string): boolean {
  const player = players.find((candidate) => candidate.id === id);
  if (player === undefined || !player.active) return false;
  return activeCount(players) > MIN_ACTIVE;
}

/**
 * Switch players back on, from the top, until the floor is met.
 *
 * Top-down rather than by any cleverer rule: the panel's order is the board's order,
 * so the players who come back are the ones nearest the left of the board, which is
 * where somebody looking for them will look.
 */
export function enforceMinimumActive(players: readonly Player[]): Player[] {
  const next = players.map((player) => ({ ...player }));
  for (const player of next) {
    if (activeCount(next) >= MIN_ACTIVE) break;
    player.active = true;
  }
  return next;
}

export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_SETTINGS, players: defaultPlayers() };
  }

  const candidate = raw as Partial<Record<keyof Settings, unknown>>;

  return {
    players: coercePlayers(candidate.players),
    word: coerceWord(candidate.word),
    tolerance: candidate.tolerance === "loose" ? "loose" : "strict",
  };
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SETTINGS, players: defaultPlayers() };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS, players: defaultPlayers() };
    return coerceSettings(JSON.parse(raw));
  } catch {
    // Corrupt JSON, or storage blocked by the browser.
    return { ...DEFAULT_SETTINGS, players: defaultPlayers() };
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota. Not worth interrupting a game over.
  }
}
