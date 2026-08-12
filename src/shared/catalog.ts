import type { IconId } from "@/shared/icons";

/**
 * The fields the app shell needs to list something — a game, a tool — in the nav
 * menus and the home gallery. Both `GameManifest` and `ToolManifest` extend this,
 * which is what lets `CatalogCard` and `NavMenu` serve both sections without either
 * knowing which one it is rendering.
 */

export type CatalogStatus =
  /** Finished enough to use. */
  | "playable"
  /** Being built — reachable, but not finished. */
  | "in-progress"
  /** Registered so it shows up, but there's nothing behind it yet. */
  | "planned";

export interface CatalogEntry {
  /**
   * URL segment. Must match BOTH the folder under its section (`src/games/` or
   * `src/tools/`) and the route folder under `src/app/`. Enforced by each
   * section's `registry.test.ts`.
   */
  slug: string;
  /** Display name, used in the nav menu and the gallery card. */
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
  status: CatalogStatus;
}
