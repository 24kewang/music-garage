"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GAMES } from "@/games/registry";
import { gameHref } from "@/games/types";
import styles from "./TabNav.module.css";

/**
 * Top tab bar. Built entirely from the game registry, so registering a game is
 * enough to make it appear here.
 */
export default function TabNav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            🎵
          </span>
          <span className={styles.brandText}>Music Garage</span>
        </Link>

        <nav className={styles.tabs} aria-label="Games">
          <Tab href="/" label="Home" active={pathname === "/"} />
          {GAMES.map((game) => (
            <Tab
              key={game.slug}
              href={gameHref(game)}
              label={game.title}
              icon={game.icon}
              badge={game.status === "playable" ? undefined : "soon"}
              active={pathname === gameHref(game)}
            />
          ))}
        </nav>
      </div>
    </header>
  );
}

function Tab({
  href,
  label,
  icon,
  badge,
  active,
}: {
  href: string;
  label: string;
  icon?: string;
  badge?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.tab} ${active ? styles.tabActive : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {icon && (
        <span className={styles.tabIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
      {badge && <span className={styles.pill}>{badge}</span>}
    </Link>
  );
}
