import type { IconId } from "@/shared/icons";

/**
 * The contract every game in the garage implements.
 *
 * A game's manifest is the only thing the app shell knows about it. The shell uses
 * it to build the tab bar and the home gallery; it never imports game internals.
 */

export type GameStatus =
  /** Finished enough to play. */
  | "playable"
  /** Being built — reachable, but not finished. */
  | "in-progress"
  /** Registered so it shows up, but there's nothing behind it yet. */
  | "planned";

export interface GameManifest {
  /**
   * URL segment for the game. Must match BOTH the folder name under `src/games/`
   * and the route folder under `src/app/games/`. Enforced by `registry.test.ts`.
   */
  slug: string;
  /** Display name, used in the tab bar and the gallery card. */
  title: string;
  /** One-line description shown on the gallery card. */
  blurb: string;
  /**
   * Icon for the card and the nav menu, by id — see `@/shared/icons`.
   *
   * An id rather than a component so manifests stay plain data, and typed so a name
   * that isn't in the set fails the build.
   */
  iconId: IconId;
  status: GameStatus;
  minPlayers?: number;
  maxPlayers?: number;
}

/** Where a game lives, derived from its slug so routes are never hand-typed. */
export function gameHref(manifest: GameManifest): string {
  return `/games/${manifest.slug}`;
}
