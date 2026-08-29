import type { MetadataRoute } from "next";
import { SITE } from "@/shared/site";

/**
 * Required by `output: "export"`: metadata routes are Route Handlers under the hood,
 * and a static export has to be told they hold still.
 */
export const dynamic = "force-static";

/**
 * Web app manifest, written to `out/manifest.webmanifest`. Colors are the literal
 * values behind `--color-bg` and `--color-accent` — a manifest is JSON served to the
 * operating system, so it cannot read a CSS custom property. If those tokens change
 * in `tokens.css`, change them here too.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0d0d16",
    theme_color: "#0d0d16",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
