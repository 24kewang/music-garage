import type { MetadataRoute } from "next";
import { SITE } from "@/shared/site";

/**
 * Required by `output: "export"`: metadata routes are Route Handlers under the hood,
 * and a static export has to be told they hold still.
 */
export const dynamic = "force-static";

/**
 * Written to `out/robots.txt` at build time. Everything here is public and static,
 * so there is nothing to disallow.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
