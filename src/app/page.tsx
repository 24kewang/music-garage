import CatalogCard from "@/shared/components/CatalogCard";
import { GAMES } from "@/games/registry";
import { gameHref } from "@/games/types";
import { TOOLS } from "@/tools/registry";
import { toolHref } from "@/tools/types";
import styles from "./page.module.css";

/** A game for exactly two reads "2 players", not "2–2 players". */
function playersLabel(min?: number, max?: number): string | undefined {
  if (!min || !max) return undefined;
  return `${min === max ? min : `${min}–${max}`} player${min === 1 && max === 1 ? "" : "s"}`;
}

export default function Home() {
  return (
    <>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Trumpet Tuck&apos;s</p>
        <h1 className={styles.title}>Music Garage</h1>
        <p className={styles.subtitle}>
          A collection of games and tools for people who like making music and having fun together. Enjoy :D
        </p>
      </section>

      <div className={styles.sections}>
        <section>
          <h2 className={styles.sectionLabel}>Games</h2>
          {GAMES.length === 0 ? (
            <p className={styles.empty}>No games registered yet.</p>
          ) : (
            <div className={styles.grid}>
              {GAMES.map((game, index) => (
                <CatalogCard
                  key={game.slug}
                  entry={game}
                  href={gameHref(game)}
                  index={index}
                  meta={playersLabel(game.minPlayers, game.maxPlayers)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className={styles.sectionLabel}>Tools</h2>
          {TOOLS.length === 0 ? (
            <p className={styles.empty}>No tools registered yet.</p>
          ) : (
            <div className={styles.grid}>
              {TOOLS.map((tool, index) => (
                <CatalogCard
                  key={tool.slug}
                  entry={tool}
                  href={toolHref(tool)}
                  // Continue the stagger so the second section arrives after the first.
                  index={GAMES.length + index}
                  meta={tool.requires}
                  cta="Open"
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
