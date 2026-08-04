import type { GameManifest } from "@/games/types";
import { manifest as musicalWavelength } from "@/games/musical-wavelength/manifest";

/**
 * Every game in the garage, in the order they appear in the tab bar and gallery.
 *
 * To add a game, see the "Adding a game" section of the README — the short version
 * is: create `src/games/<slug>/`, add a route adapter at
 * `src/app/games/<slug>/page.tsx`, then add its manifest to this array.
 */
export const GAMES: readonly GameManifest[] = [musicalWavelength];

export function getGame(slug: string): GameManifest | undefined {
  return GAMES.find((game) => game.slug === slug);
}
