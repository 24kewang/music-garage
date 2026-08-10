/**
 * Stub for Node builtins referenced (but never executed) in browser bundles.
 *
 * mind-ar's bundled TensorFlow.js keeps Node-only fallback paths that
 * `require("fs")`; Turbopack resolves them even for browser targets, so
 * `next.config.ts` aliases them here. Nothing ever calls into this.
 */
const empty = {};
export default empty;
