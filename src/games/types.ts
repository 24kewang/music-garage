import type { CatalogEntry, CatalogStatus } from "@/shared/catalog";

/**
 * The contract every game in the garage implements.
 *
 * A game's manifest is the only thing the app shell knows about it. The shell uses
 * it to build the Games menu and the home gallery; it never imports game internals.
 * The shared fields live in `@/shared/catalog` so tools can be listed by the same
 * components.
 */

export type GameStatus = CatalogStatus;

export interface GameManifest extends CatalogEntry {
  minPlayers?: number;
  maxPlayers?: number;
}

/** Where a game lives, derived from its slug so routes are never hand-typed. */
export function gameHref(manifest: GameManifest): string {
  return `/games/${manifest.slug}`;
}
