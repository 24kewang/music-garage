import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { gameHref, type GameManifest, type GameStatus } from "@/games/types";
import { GameIcon } from "@/shared/icons";
import styles from "./GameCard.module.css";

const STATUS_LABEL: Record<GameStatus, string> = {
  playable: "Ready to play",
  "in-progress": "In progress",
  planned: "Planned",
};

const STATUS_CLASS: Record<GameStatus, string> = {
  playable: styles.statusPlayable,
  "in-progress": styles.statusInProgress,
  planned: styles.statusPlanned,
};

export default function GameCard({
  game,
  /** Position in the grid, used to stagger the entrance. */
  index = 0,
}: {
  game: GameManifest;
  index?: number;
}) {
  return (
    <Link
      href={gameHref(game)}
      className={styles.card}
      style={{ "--stagger": `${index * 70}ms` } as React.CSSProperties}
    >
      <div className={styles.top}>
        <span className={styles.icon} aria-hidden="true">
          <GameIcon id={game.iconId} size={22} weight="duotone" />
        </span>
        <span className={`${styles.status} ${STATUS_CLASS[game.status]}`}>
          {STATUS_LABEL[game.status]}
        </span>
      </div>

      <h2 className={styles.title}>{game.title}</h2>
      <p className={styles.blurb}>{game.blurb}</p>

      <div className={styles.foot}>
        {game.minPlayers && game.maxPlayers && (
          <span className={styles.meta}>
            {game.minPlayers}–{game.maxPlayers} players
          </span>
        )}
        <span className={styles.cta} aria-hidden="true">
          Play
          <ArrowRight size={14} weight="bold" className={styles.ctaArrow} />
        </span>
      </div>
    </Link>
  );
}
