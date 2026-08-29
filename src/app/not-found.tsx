import type { Metadata } from "next";
import Link from "next/link";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The 404. Next serves this for any URL the app does not handle, and the static
 * export writes it to `out/404.html`, which the Worker returns with a real 404
 * status via `not_found_handling: "404-page"` in wrangler.jsonc.
 *
 * A server component on purpose: nothing here needs the pathname, and keeping it off
 * the client means the 404 costs no JavaScript beyond what the shell already loads.
 */
export default function NotFound() {
  return (
    <section className={styles.wrap}>
      {/*
       * A rest, in a garage full of music — the one thing on the site that makes no
       * sound. Hand-drawn rather than an icon: nothing in the Phosphor set says
       * "silence" and this is the one page where the joke is the point.
       */}
      <svg
        className={styles.rest}
        viewBox="175 573 8 21"
        role="img"
        aria-label="A musical rest"
      >
        <path
          d="M 181.69909,588.76398 C 182.47362,589.08988 182.3797,590.46481 181.42371,589.80261 C 180.70644,588.91354 179.33831,588.14481 178.34093,589.11155 C 177.5139,589.8776 177.78694,591.27023 178.71609,591.81509 C 179.37044,591.94893 179.86732,593.05704 178.79518,592.642 C 177.25015,592.11543 175.60062,590.79176 175.7257,588.99985 C 175.70261,587.7787 176.9577,587.02175 178.07209,587.106 C 178.52013,586.94555 179.75824,587.58632 179.70251,587.30253 C 178.94921,586.14553 178.08957,585.05126 177.41509,583.84762 C 177.17661,583.12078 177.69942,582.42905 177.9199,581.7502 C 178.39967,580.55313 178.93636,579.37651 179.37409,578.16438 C 179.41525,577.41801 178.75249,576.88912 178.40914,576.2772 C 178.01153,575.64334 177.49169,575.07309 177.20209,574.38225 C 177.22225,573.50455 178.13012,574.48596 178.37637,574.84393 C 179.45036,576.11832 180.57945,577.34906 181.61509,578.65383 C 182.30749,579.4973 181.66158,580.48525 181.32581,581.32734 C 180.82735,582.58309 180.19033,583.79167 179.82409,585.09323 C 179.77639,586.1646 180.5603,587.05185 181.06346,587.94062 C 181.25685,588.22883 181.47282,588.50112 181.69909,588.76398 z"
          fill="currentColor"
        />
      </svg>

      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Nothing playing here</h1>
      <p className={styles.blurb}>
        That page does not exist — it may have been renamed, or the link may have been
        mistyped. Everything that does exist is one click away.
      </p>

      <Link href="/" className={styles.action}>
        Back to the garage
      </Link>
    </section>
  );
}
