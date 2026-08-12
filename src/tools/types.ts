import type { CatalogEntry, CatalogStatus } from "@/shared/catalog";

/**
 * The contract every tool in the garage implements.
 *
 * Tools are the utilities alongside the games — a loop station rather than a
 * guessing game. Like a game, a tool's manifest is the only thing the app shell
 * knows about it; unlike a game, a tool has no player counts.
 */

export type ToolStatus = CatalogStatus;

export interface ToolManifest extends CatalogEntry {
  /** What the tool needs from the visitor, shown on its card ("Microphone"). */
  requires?: string;
}

/** Where a tool lives, derived from its slug so routes are never hand-typed. */
export function toolHref(manifest: ToolManifest): string {
  return `/tools/${manifest.slug}`;
}
