import type { MetadataRoute } from "next";
import { GAMES } from "@/games/registry";
import { gameHref } from "@/games/types";
import { SITE } from "@/shared/site";
import { TOOLS } from "@/tools/registry";
import { toolHref } from "@/tools/types";

/**
 * Required by `output: "export"`: metadata routes are Route Handlers under the hood,
 * and a static export has to be told they hold still.
 */
export const dynamic = "force-static";

/**
 * Built from the registries, not from a hand-kept list — registering a game is
 * already what puts it in the nav and the gallery, and this makes it what puts the
 * game in the sitemap too. One place to forget instead of three.
 *
 * `lastModified` is deliberately absent: a static export has no per-route history to
 * read, and stamping every URL with the build time would tell crawlers that the whole
 * site changed on every deploy.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "monthly", priority: 1 },

    ...GAMES.map((game) => ({
      url: `${SITE.url}${gameHref(game)}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),

    ...TOOLS.map((tool) => ({
      url: `${SITE.url}${toolHref(tool)}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),

    { url: `${SITE.url}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
