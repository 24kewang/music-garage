import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
