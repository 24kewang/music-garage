"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE } from "@/shared/site";
import styles from "./SiteFooter.module.css";

/**
 * Routes that own the whole viewport. Games are `min-height: 100dvh` and the loop
 * station is `position: fixed; inset: 0` with nothing scrolling, so a footer under
 * them is either below the fold or genuinely unreachable behind a fixed stage.
 *
 * The shell still knows nothing about individual games — only about the two route
 * namespaces it already owns, the same way SiteHeader's NavMenu does.
 */
const IMMERSIVE_PREFIXES = ["/games/", "/tools/"];

/**
 * Copyright and the legal links, on the pages that are documents rather than
 * instruments: the catalog, the terms, the privacy policy and the 404.
 *
 * The legal pages stay reachable from a game too — SiteHeader carries the same two
 * links, and it is on every route.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  if (IMMERSIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.copyright}>
          © {SITE.copyrightYear} {SITE.publisher}
        </p>

        <nav className={styles.links} aria-label="Legal and source">
          <Link href="/terms" className={styles.link}>
            Terms
          </Link>
          <Link href="/privacy" className={styles.link}>
            Privacy
          </Link>
          <a
            href={SITE.repoUrl}
            className={styles.link}
            target="_blank"
            rel="noreferrer noopener"
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
