/**
 * Which excerpts are in play, persisted across sessions.
 *
 * Stores the *excluded* file paths, not the checked ones — so a freshly uploaded
 * file is checked by default (it isn't in the excluded set) and an empty or missing
 * store means "everything checked". Same defensive contract as the other games'
 * settings modules: SSR-safe, corrupt-safe, and storage failures never interrupt play.
 */

export const STORAGE_KEY = "music-garage:reg:selection";

/** Keep only the string entries of whatever was stored. */
export function coerceExcluded(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((entry): entry is string => typeof entry === "string"));
}

export function loadExcluded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    return coerceExcluded(JSON.parse(raw));
  } catch {
    // Corrupt JSON, or storage blocked by the browser.
    return new Set();
  }
}

/**
 * Persist the excluded set, intersected with the paths that still exist so
 * deletions don't leave stale exclusions accumulating forever.
 */
export function saveExcluded(
  excluded: ReadonlySet<string>,
  existingPaths: ReadonlySet<string>,
): void {
  if (typeof window === "undefined") return;
  try {
    const pruned = [...excluded].filter((path) => existingPaths.has(path));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Private mode or a full quota. Not worth interrupting play over.
  }
}

/** The checked set, derived: everything that exists and isn't excluded. */
export function checkedFiles(
  all: readonly string[],
  excluded: ReadonlySet<string>,
): Set<string> {
  return new Set(all.filter((path) => !excluded.has(path)));
}
