/**
 * Site-level facts, in one place.
 *
 * The canonical URL is written here and nowhere else. The root layout's `metadataBase`,
 * `robots.ts`, `sitemap.ts`, `manifest.ts`, the footer and both legal pages all read it
 * from here, so moving the site to a different domain is a one-line change.
 *
 * `NEXT_PUBLIC_SITE_URL` is read at build time; this is a static export, so there is no
 * runtime to read it later. Cloudflare Workers Builds supplies it as a build variable.
 * See HOSTING.md.
 */

/**
 * The live domain, used as the default when no build variable is set.
 *
 * This was once a `pages.dev` placeholder, so that preview deployments could not claim
 * to be production. The variable was then never set, and production shipped with
 * `<link rel="canonical">`, `og:url` and every sitemap entry pointing at a host that
 * does not resolve, which tells search engines not to index the site.
 *
 * A missing build variable should still produce a working site, so the default is the
 * real domain. `NEXT_PUBLIC_SITE_URL` overrides it anywhere else.
 */
const FALLBACK_URL = "https://music.trumpettuck.com";

export const SITE = {
  name: "Music Garage",
  /** Shown above the wordmark on the home page. */
  eyebrow: "Trumpet Tuck's",
  description:
    "A collection of games and tools for people who like making music and having fun together.",

  /** No trailing slash; everything below concatenates paths onto it. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_URL).replace(/\/+$/, ""),

  publisher: "Kevin Wang",
  repoUrl: "https://github.com/24kewang/music-garage",

  /**
   * Shown on the terms and privacy pages. Update this by hand when either document
   * changes in substance. An automatic build date would claim a revision on every
   * deploy, which is misleading for a legal document.
   */
  legalLastUpdated: "6 September 2026",

  /**
   * Year of first publication, for the footer's copyright line. A literal rather than
   * `new Date().getFullYear()`: in a static export the computed year is baked in at
   * build time and then recomputed in the browser at hydration, and the two disagree
   * after New Year's. A fixed year is also the conventional form.
   */
  copyrightYear: 2026,
} as const;

/** Where a visitor reports a problem. There is no support inbox; the repo is it. */
export const ISSUES_URL = `${SITE.repoUrl}/issues`;
