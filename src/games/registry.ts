import type { GameManifest } from "@/games/types";
import { manifest as musicalWavelength } from "@/games/musical-wavelength/manifest";
import { manifest as pitchMath } from "@/games/pitch-math/manifest";
import { manifest as reg } from "@/games/reg/manifest";

/**
 * Every game in the garage, in the order they appear in the Games menu and gallery.
 *
 * To add a game, see the "Adding a game" section of the README — the short version
 * is: create `src/games/<slug>/`, add a route adapter at
 * `src/app/games/<slug>/page.tsx`, then add its manifest to this array.
 */
export const GAMES: readonly GameManifest[] = [musicalWavelength, pitchMath, reg];

export function getGame(slug: string): GameManifest | undefined {
  return GAMES.find((game) => game.slug === slug);
}
