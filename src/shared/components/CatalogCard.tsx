import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { CatalogEntry, CatalogStatus } from "@/shared/catalog";
import { GameIcon } from "@/shared/icons";
import styles from "./CatalogCard.module.css";

const STATUS_LABEL: Record<CatalogStatus, string> = {
  playable: "Ready",
  "in-progress": "In progress",
  planned: "Planned",
};

const STATUS_CLASS: Record<CatalogStatus, string> = {
  playable: styles.statusPlayable,
  "in-progress": styles.statusInProgress,
  planned: styles.statusPlanned,
};

/**
 * A gallery card for anything in the catalog — a game or a tool. The section it
 * belongs to shows only in the `href` and `meta` the caller passes; the card itself
 * doesn't know the difference.
 */
export default function CatalogCard({
  entry,
  href,
  /** Position in the grid, used to stagger the entrance. */
  index = 0,
  /** Footer line: a game's player count, a tool's requirement. Omitted when empty. */
  meta,
  /** Call-to-action verb; a tool is opened, not played. */
  cta = "Play",
}: {
  entry: CatalogEntry;
  href: string;
  index?: number;
  meta?: string;
  cta?: string;
}) {
  return (
    <Link
      href={href}
      className={styles.card}
      style={{ "--stagger": `${index * 70}ms` } as React.CSSProperties}
    >
      <div className={styles.top}>
        <span className={styles.icon} aria-hidden="true">
          <GameIcon id={entry.iconId} size={22} weight="duotone" />
        </span>
        <span className={`${styles.status} ${STATUS_CLASS[entry.status]}`}>
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      <h2 className={styles.title}>{entry.title}</h2>
      <p className={styles.blurb}>{entry.blurb}</p>

      <div className={styles.foot}>
        {meta && <span className={styles.meta}>{meta}</span>}
        <span className={styles.cta} aria-hidden="true">
          {cta}
          <ArrowRightIcon size={14} weight="bold" className={styles.ctaArrow} />
        </span>
      </div>
    </Link>
  );
}
