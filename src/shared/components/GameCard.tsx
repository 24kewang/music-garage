import Link from "next/link";
import { gameHref, type GameManifest, type GameStatus } from "@/games/types";
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

export default function GameCard({ game }: { game: GameManifest }) {
  return (
    <Link href={gameHref(game)} className={styles.card}>
      <div className={styles.top}>
        <span className={styles.icon} aria-hidden="true">
          {game.icon}
        </span>
        <h2 className={styles.title}>{game.title}</h2>
      </div>

      <p className={styles.blurb}>{game.blurb}</p>

      <div className={styles.meta}>
        <span className={`${styles.status} ${STATUS_CLASS[game.status]}`}>
          {STATUS_LABEL[game.status]}
        </span>
        {game.minPlayers && game.maxPlayers && (
          <span>
            {game.minPlayers}–{game.maxPlayers} players
          </span>
        )}
      </div>
    </Link>
  );
}
