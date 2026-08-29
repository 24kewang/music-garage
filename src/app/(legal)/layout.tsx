import styles from "./legal.module.css";

/**
 * Prose styling shared by the terms and the privacy policy.
 *
 * A route group, so `/terms` and `/privacy` keep their short URLs — the `(legal)`
 * folder exists only to give the two pages one place to agree on measure and
 * heading rhythm, and never appears in a path.
 */
export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <article className={styles.doc}>{children}</article>;
}
