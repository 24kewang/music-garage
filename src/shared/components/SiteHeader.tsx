"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MusicNotesIcon } from "@phosphor-icons/react";
import GamesMenu from "./GamesMenu";
import styles from "./SiteHeader.module.css";

/** How long the header waits before collapsing, so a brief overshoot doesn't hide it. */
const HIDE_DELAY_MS = 220;

/**
 * The site header. Sits collapsed above the viewport and slides down when the pointer
 * reaches the top of the screen, staying put while the pointer is anywhere inside it —
 * including the games dropdown, which is a DOM child so it can't trigger the header's
 * own pointer-leave.
 *
 * Hover alone would strand anyone on a touch device, so there are three ways in:
 *
 *  - pointer into the strip at the top of the screen (fine pointers),
 *  - keyboard focus reaching the header, which pins it open,
 *  - coarse pointers, where CSS drops the transform entirely and the header is simply
 *    always visible.
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const [revealed, setRevealed] = useState(false);
  /** Held open by keyboard focus or an open menu, regardless of the pointer. */
  const [pinned, setPinned] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const reveal = useCallback(() => {
    cancelHide();
    setRevealed(true);
  }, [cancelHide]);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(() => setRevealed(false), HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  // No collapse-on-navigation: the menu releases its pin when an item is clicked, and
  // if the pointer is still over the header it *should* stay put. Forcing it shut
  // would yank it away from under the cursor.
  const open = revealed || pinned;

  return (
    <>
      {/*
       * Invisible catcher along the very top. Separate from the header so it stays
       * hittable while the header itself is translated out of view.
       */}
      <div
        className={styles.hoverZone}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") reveal();
        }}
        aria-hidden="true"
      />

      <header
        className={`${styles.header} ${open ? styles.headerOpen : ""}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") reveal();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") scheduleHide();
        }}
        // Tabbing in holds it open; tabbing out lets it go.
        onFocus={() => setPinned(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPinned(false);
          }
        }}
      >
        <div className={styles.inner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <MusicNotesIcon size={20} weight="fill" />
            </span>
            <span className={styles.brandText}>Music Garage</span>
          </Link>

          <nav className={styles.nav} aria-label="Main">
            <Link
              href="/"
              className={`${styles.link} ${pathname === "/" ? styles.linkActive : ""}`}
              aria-current={pathname === "/" ? "page" : undefined}
            >
              Home
            </Link>

            <GamesMenu onOpenChange={setPinned} />
          </nav>
        </div>
      </header>

      {/* The sliver that stays put, so the header is discoverable rather than a secret. */}
      <div className={`${styles.peek} ${open ? styles.peekHidden : ""}`} aria-hidden="true" />
    </>
  );
}
