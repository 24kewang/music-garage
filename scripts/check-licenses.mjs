/**
 * Dependency license audit.
 *
 * Reads package-lock.json rather than walking node_modules, and that choice is
 * load-bearing: npm's v3 lockfile carries a `license` field for every resolved
 * package, whereas a node_modules walk reports whatever happens to be installed on
 * this machine. On Windows that means ~106 false UNKNOWNs, because the
 * platform-specific optional binaries for other operating systems were never
 * unpacked. The lockfile is also offline, dependency-free, and identical across CI
 * runners.
 *
 *   node scripts/check-licenses.mjs --check     fail on copyleft or undeclared
 *   node scripts/check-licenses.mjs --notices   regenerate THIRD-PARTY-NOTICES.md
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCKFILE = join(ROOT, "package-lock.json");
const NOTICES = join(ROOT, "THIRD-PARTY-NOTICES.md");

/**
 * Licenses that would impose obligations this project is not set up to meet —
 * either source disclosure on a shipped bundle, or share-alike on our own text.
 */
const DENIED = [
  /^GPL-/i,
  /^AGPL-/i,
  /^SSPL/i,
  /^EPL-/i,
  /^CDDL-/i,
  /^CC-BY-SA-/i,
  /^BUSL-/i,
  /^Commons-Clause/i,
];

/**
 * Narrowly scoped exceptions. Each is a package that has actually been looked at,
 * with the reason it is safe recorded here rather than in a commit message.
 * Anything not on this list that trips DENIED fails the build.
 */
const ALLOWED = new Map([
  [
    /^@img\/sharp-/,
    "LGPL-3.0 prebuilt libvips binaries, pulled in by next as OPTIONAL dependencies " +
      "of sharp. Build-time image optimization only: dynamically linked, unmodified, " +
      "never present in the client bundle. This site is a static export and does not " +
      "use next/image at all, so they are never even exercised.",
  ],
  [
    /^axe-core$/,
    "MPL-2.0, dev-only — reached through eslint-config-next > eslint-plugin-jsx-a11y. " +
      "MPL is file-level copyleft and imposes nothing on our own code; it never ships.",
  ],
]);

/** Licenses carrying an attribution requirement that THIRD-PARTY-NOTICES.md satisfies. */
const ATTRIBUTION_REQUIRED = [/^Apache-2\.0/i, /^CC-BY-4\.0/i, /^BSD-/i, /^MIT/i, /^ISC/i];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeLicense(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  // Very old packages use a `licenses` array of objects.
  if (Array.isArray(value)) {
    const parts = value.map((v) => (typeof v === "string" ? v : v?.type)).filter(Boolean);
    return parts.length ? parts.join(" OR ") : null;
  }
  return value.type ?? null;
}

function loadPackages() {
  let lock;
  try {
    lock = JSON.parse(readFileSync(LOCKFILE, "utf8"));
  } catch (error) {
    fail(`Could not read ${LOCKFILE}: ${error.message}`);
  }
  if (!(lock.lockfileVersion >= 3)) {
    fail(`package-lock.json is lockfileVersion ${lock.lockfileVersion}; this needs 3 or newer.`);
  }

  const marker = "node_modules/";
  const packages = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    // The root project itself has no license to audit, and link entries resolve elsewhere.
    if (path === "" || entry.link) continue;

    const at = path.lastIndexOf(marker);
    const name = entry.name ?? (at === -1 ? path : path.slice(at + marker.length));

    packages.push({
      name,
      version: entry.version ?? "unknown",
      license: normalizeLicense(entry.license ?? entry.licenses),
      dev: Boolean(entry.dev),
      optional: Boolean(entry.optional),
      path,
    });
  }
  // The root entry records what this project itself declares, which is how a
  // devDependency stays identifiable after npm has collapsed its flags.
  const devDependencies = new Set(Object.keys(lock.packages?.[""]?.devDependencies ?? {}));

  return { packages, devDependencies };
}

/** An SPDX expression is only a problem if every branch of it is. */
function splitExpression(expression) {
  return expression
    .replace(/[()]/g, " ")
    .split(/\s+(?:AND|OR)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function exemption(name) {
  for (const [pattern, reason] of ALLOWED) if (pattern.test(name)) return reason;
  return null;
}

function check(packages) {
  const denied = [];
  const unknown = [];

  for (const pkg of packages) {
    if (!pkg.license) {
      if (!exemption(pkg.name)) unknown.push(pkg);
      continue;
    }
    const offending = splitExpression(pkg.license).filter((part) =>
      DENIED.some((rule) => rule.test(part)),
    );
    if (offending.length === 0) continue;
    if (exemption(pkg.name)) continue;
    denied.push({ ...pkg, offending });
  }

  const counts = new Map();
  for (const pkg of packages) {
    const key = pkg.license ?? "UNDECLARED";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`Audited ${packages.length} resolved packages from package-lock.json.\n`);
  for (const [license, count] of summary.slice(0, 12)) {
    console.log(`  ${String(count).padStart(4)}  ${license}`);
  }
  if (summary.length > 12) {
    console.log(`  ${String(summary.length - 12).padStart(4)}  further license expressions`);
  }
  console.log("");

  const exempted = packages.filter((pkg) => exemption(pkg.name));
  if (exempted.length > 0) {
    console.log(`Exempted (${exempted.length}) — reviewed, reasons recorded in this script:`);
    const seen = new Set();
    for (const pkg of exempted) {
      const reason = exemption(pkg.name);
      if (seen.has(reason)) continue;
      seen.add(reason);
      const group = exempted.filter((other) => exemption(other.name) === reason);
      const siblings = group.length > 1 ? " (and siblings)" : "";
      console.log(`  ${group.length}x  ${group[0].name}${siblings} — ${group[0].license}`);
    }
    console.log("");
  }

  if (unknown.length > 0) {
    console.error(`FAIL: ${unknown.length} package(s) with no declared license:`);
    for (const pkg of unknown) console.error(`  ${pkg.name}@${pkg.version}  (${pkg.path})`);
  }
  if (denied.length > 0) {
    console.error(`FAIL: ${denied.length} package(s) under a disallowed license:`);
    for (const pkg of denied) {
      const scope = `${pkg.dev ? "dev" : "prod"}${pkg.optional ? ", optional" : ""}`;
      console.error(`  ${pkg.name}@${pkg.version}  ${pkg.license}  (${scope})`);
      console.error(`    ${pkg.path}`);
    }
    console.error("\nIf one is genuinely safe, add it to ALLOWED in this script with the reason.");
  }

  if (unknown.length > 0 || denied.length > 0) process.exit(1);
  console.log("OK — no disallowed or undeclared licenses.");
}

function notices(packages, devDependencies) {
  // Attribution is owed for what we distribute, so dev-only packages are out of
  // scope. Optional platform binaries are excluded for the same reason: a static
  // export ships none of them.
  //
  // The `devDependencies` check is not redundant with `pkg.dev`. When a package is
  // reachable both as a devDependency and as some production dependency's optional
  // one, npm collapses the flags on the single install location to the least
  // restrictive pair — `dev: false, optional: false` — and the lockfile can no longer
  // say it is ours for building only. `sharp` is exactly that: our icon generator
  // depends on it, and so does next, optionally, for image optimization this site
  // never uses. What the project declares about its own dependencies is the better
  // evidence, so it wins.
  const shipped = packages.filter(
    (pkg) => !pkg.dev && !pkg.optional && !devDependencies.has(pkg.name),
  );

  const byName = new Map();
  for (const pkg of shipped) {
    const existing = byName.get(pkg.name);
    if (!existing || existing.version < pkg.version) byName.set(pkg.name, pkg);
  }

  const grouped = new Map();
  for (const pkg of [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const key = pkg.license ?? "UNDECLARED";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(pkg);
  }

  const lines = [
    "# Third-party notices",
    "",
    "Music Garage itself is MIT licensed — see [LICENSE](LICENSE). It is built on the",
    "open-source packages listed below, each of which remains under its own license and",
    "copyright. This file exists to satisfy the attribution requirements of those",
    "licenses, principally Apache-2.0's NOTICE clause and CC-BY-4.0's attribution clause.",
    "",
    "Generated by `npm run licenses:notices` from `package-lock.json` — do not edit by",
    "hand. Development-only and platform-specific optional packages are excluded, since",
    "neither is distributed with the site.",
    "",
    "Two Apache-2.0 components deserve a specific mention because they are fetched at",
    "runtime rather than bundled: Google's MediaPipe Tasks Vision WASM runtime and its",
    "`face_landmarker` model, loaded by MindAR when the Random Excerpt Generator's camera",
    "filter is switched on. See the privacy policy for what that request discloses.",
    "",
    `${byName.size} distributed packages across ${grouped.size} distinct license expressions.`,
    "",
  ];

  for (const [license, pkgs] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`## ${license}`, "");
    if (ATTRIBUTION_REQUIRED.some((rule) => rule.test(license))) {
      lines.push("_Requires attribution; this listing is that attribution._", "");
    }
    for (const pkg of pkgs) lines.push(`- \`${pkg.name}\` ${pkg.version}`);
    lines.push("");
  }

  writeFileSync(NOTICES, lines.join("\n"));
  console.log(`Wrote ${NOTICES} — ${byName.size} distributed packages.`);
}

const mode = process.argv[2];
const { packages, devDependencies } = loadPackages();
if (mode === "--notices") notices(packages, devDependencies);
else if (mode === "--check") check(packages);
else fail("Usage: node scripts/check-licenses.mjs --check | --notices");
