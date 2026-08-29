/**
 * Site-level facts, in one place.
 *
 * The canonical URL is written here and nowhere else — the root layout's
 * `metadataBase`, `robots.ts`, `sitemap.ts`, `manifest.ts`, the footer and both legal
 * pages all read it from here, so pointing the site at a different domain is a
 * one-line change rather than a search-and-replace.
 *
 * `NEXT_PUBLIC_SITE_URL` is read at build time (this is a static export, so there is
 * no runtime to read it later). Cloudflare Workers Builds supplies it as a build
 * variable; see HOSTING.md.
 */

/**
 * The live domain, and the default rather than a placeholder.
 *
 * This used to be a `pages.dev` stand-in on the theory that preview deployments should
 * not emit production canonicals. That was the wrong trade: the guarded-against failure
 * was speculative, and the failure it caused was real — production shipped for a while
 * declaring `<link rel="canonical">`, `og:url` and every sitemap entry on a host that
 * did not resolve, which tells search engines not to index the site at all.
 *
 * A missing build variable should degrade to a correct site, not a silently broken one.
 * `NEXT_PUBLIC_SITE_URL` still overrides for anything served elsewhere.
 */
const FALLBACK_URL = "https://music.trumpettuck.com";

export const SITE = {
  name: "Music Garage",
  /** Shown above the wordmark on the home page. */
  eyebrow: "Trumpet Tuck's",
  description:
    "A collection of games and tools for people who like making music and having fun together.",

  /** No trailing slash — everything below concatenates paths onto it. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_URL).replace(/\/+$/, ""),

  publisher: "Kevin Wang",
  repoUrl: "https://github.com/24kewang/music-garage",

  /**
   * Shown on the terms and privacy pages. Bump this by hand whenever either
   * document changes in substance — an automatic build date would claim a revision
   * on every deploy, which is worse than useless for a legal document.
   */
  legalLastUpdated: "28 August 2026",

  /**
   * Year of first publication, for the footer's copyright line. Deliberately a
   * literal rather than `new Date().getFullYear()`: this is a static export, so a
   * computed year is baked in at build time and then recomputed in the browser at
   * hydration — which disagree for anyone loading the site after New Year's. A
   * fixed year of first publication is also the conventional form.
   */
  copyrightYear: 2026,
} as const;

/** Where a visitor reports a problem. There is no support inbox; the repo is it. */
export const ISSUES_URL = `${SITE.repoUrl}/issues`;
