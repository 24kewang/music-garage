import GameCard from "@/shared/components/GameCard";
import { GAMES } from "@/games/registry";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Trumpet Tuck&apos;s</p>
        <h1 className={styles.title}>Music Garage</h1>
        <p className={styles.subtitle}>
          A collection of small games for people who like making music together. Enjoy :D
        </p>
      </section>

      <section>
        <h2 className={styles.sectionLabel}>Games</h2>
        {GAMES.length === 0 ? (
          <p className={styles.empty}>No games registered yet.</p>
        ) : (
          <div className={styles.grid}>
            {GAMES.map((game, index) => (
              <GameCard key={game.slug} game={game} index={index} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
