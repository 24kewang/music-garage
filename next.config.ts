import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * The site is a static export: `next build` writes `out/`, which a Cloudflare
   * Worker serves through an assets binding. Nothing here needs a server — every
   * game is a client component and there are no route handlers.
   *
   * Consequence worth knowing before you reach for them: `headers()`, `redirects()`
   * and `rewrites()` in this file do nothing under `output: "export"`. Security
   * headers live in `public/_headers`, which Workers parses at the edge.
   */
  output: "export",

  turbopack: {
    resolveAlias: {
      // mind-ar's bundled TensorFlow.js has Node-only fallback paths that
      // require("fs"). They never run in the browser, but Turbopack still has to
      // resolve them — point them at an empty stub for browser bundles only.
      fs: { browser: "./src/shared/shims/empty.js" },
    },
  },
};

export default nextConfig;
