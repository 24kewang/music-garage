import type { ToolManifest } from "@/tools/types";
import { manifest as loopStation } from "@/tools/loop-station/manifest";

/**
 * Every tool in the garage, in the order they appear in the Tools menu and gallery.
 *
 * To add a tool, mirror the "Adding a game" recipe in the README with `tools` in
 * place of `games`: create `src/tools/<slug>/`, add a route adapter at
 * `src/app/tools/<slug>/page.tsx`, then add its manifest to this array.
 */
export const TOOLS: readonly ToolManifest[] = [loopStation];

export function getTool(slug: string): ToolManifest | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
