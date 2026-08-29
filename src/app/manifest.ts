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
    /*
     * PNG, not the SVG: Android's installer and the splash screen want raster at
     * known sizes, and 192 + 512 is the pair every install prompt looks for.
     * Generated from `public/icon.svg` by `npm run icons`.
     *
     * No `purpose: "maskable"` entry on purpose. A maskable icon has to keep its
     * artwork inside a 40% safe zone because Android crops to whatever shape the
     * launcher uses; our note glyph runs close to the edges, so declaring it
     * maskable would get the beams clipped. Better an icon Android letterboxes
     * than one it cuts into.
     */
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
