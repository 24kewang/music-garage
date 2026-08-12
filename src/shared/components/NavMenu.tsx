"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { CatalogEntry, CatalogStatus } from "@/shared/catalog";
import { useDismiss, type DismissReason } from "@/shared/hooks/useDismiss";
import { GameIcon } from "@/shared/icons";
import styles from "./NavMenu.module.css";

const CLOSE_DELAY_MS = 180;

const STATUS_LABEL: Record<CatalogStatus, string> = {
  playable: "Ready",
  "in-progress": "In progress",
  planned: "Planned",
};

/**
 * A catalog dropdown — the Games menu, the Tools menu.
 *
 * Opens on hover for pointers that have one, and on click or Enter for everyone else —
 * a hover-only menu is simply unusable on a phone. Arrow keys walk the items and
 * Escape closes it, returning focus to the trigger.
 */
export default function NavMenu({
  label,
  items,
  hrefFor,
  pathPrefix,
  onOpenChange,
}: {
  /** Trigger text and the menu's accessible name. */
  label: string;
  items: readonly CatalogEntry[];
  hrefFor: (entry: CatalogEntry) => string;
  /** Marks the trigger active when the current route lives under this prefix. */
  pathPrefix: string;
  /** Lets the header stay revealed while the menu is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const openMenu = useCallback(() => {
    cancelClose();
    setOpenState(true);
  }, [cancelClose, setOpenState]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenState(false), CLOSE_DELAY_MS);
  }, [cancelClose, setOpenState]);

  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Escape returns focus to the trigger, so a keyboard user doesn't lose their place
   * in the header. An outside click deliberately does not — focus belongs to whatever
   * they just clicked on.
   */
  const dismiss = useCallback(
    (reason: DismissReason) => {
      setOpenState(false);
      if (reason === "escape") triggerRef.current?.focus();
    },
    [setOpenState],
  );

  useDismiss(open, rootRef, dismiss);

  /** Arrow keys move between items; the trigger's Down arrow enters the list. */
  const focusItem = (index: number) => {
    const focusable = itemRefs.current.filter(Boolean);
    if (focusable.length === 0) return;
    const wrapped = (index + focusable.length) % focusable.length;
    focusable[wrapped]?.focus();
  };

  const onItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    }
  };

  const menuIsCurrent = pathname.startsWith(pathPrefix);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") openMenu();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") scheduleClose();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${menuIsCurrent ? styles.triggerActive : ""} ${
          open ? styles.triggerOpen : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpenState(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
            // Wait for the panel to mount before reaching into it.
            requestAnimationFrame(() => focusItem(0));
          }
        }}
      >
        {label}
        <CaretDownIcon
          size={13}
          weight="bold"
          className={styles.caret}
          aria-hidden="true"
        />
      </button>

      {/*
       * Kept mounted so the exit transition can play; `inert` and pointer-events are
       * what stop a hidden menu from swallowing clicks or focus.
       */}
      <div
        id={menuId}
        role="menu"
        aria-label={label}
        className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
        inert={!open}
      >
        <div className={styles.panelInner}>
          {items.map((entry, index) => {
            const href = hrefFor(entry);
            const active = pathname === href;

            return (
              <Link
                key={entry.slug}
                href={href}
                role="menuitem"
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className={`${styles.item} ${active ? styles.itemActive : ""}`}
                aria-current={active ? "page" : undefined}
                onKeyDown={(event) => onItemKeyDown(event, index)}
                onClick={() => setOpenState(false)}
                tabIndex={open ? 0 : -1}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  <GameIcon id={entry.iconId} size={18} weight="duotone" />
                </span>
                <span className={styles.itemBody}>
                  <span className={styles.itemTitle}>
                    {entry.title}
                    {entry.status !== "playable" && (
                      <span className={styles.itemPill}>{STATUS_LABEL[entry.status]}</span>
                    )}
                  </span>
                  <span className={styles.itemBlurb}>{entry.blurb}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
