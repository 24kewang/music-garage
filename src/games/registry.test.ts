import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICONS } from "@/shared/icons";
import { GAMES, getGame } from "./registry";
import { gameHref } from "./types";

/**
 * Guards the three-part contract for adding a game: a folder under `src/games/`, a
 * route adapter under `src/app/games/`, and an entry in the registry. Two of the
 * three can drift silently otherwise — a registered game with no route 404s, and a
 * route with no registry entry never appears in the tab bar.
 */

const SRC = join(process.cwd(), "src");

describe("game registry", () => {
  it("has at least one game", () => {
    expect(GAMES.length).toBeGreaterThan(0);
  });

  it("has unique slugs", () => {
    const slugs = GAMES.map((game) => game.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses url-safe slugs", () => {
    for (const game of GAMES) {
      expect(game.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(GAMES.map((game) => game.slug))(
    "%s has a game folder and a route adapter",
    (slug) => {
      expect(existsSync(join(SRC, "games", slug))).toBe(true);
      expect(existsSync(join(SRC, "app", "games", slug, "page.tsx"))).toBe(true);
    },
  );

  it("gives every game the fields the shell renders", () => {
    for (const game of GAMES) {
      expect(game.title).toBeTruthy();
      expect(game.blurb).toBeTruthy();
      expect(["playable", "in-progress", "planned"]).toContain(game.status);
    }
  });

  it("points every game at an icon that exists", () => {
    // Typing catches this at build time; the test catches it if the icon set is
    // pruned without updating the manifests that referenced it.
    for (const game of GAMES) {
      expect(Object.keys(ICONS)).toContain(game.iconId);
    }
  });

  it("looks games up by slug", () => {
    const first = GAMES[0];
    expect(getGame(first.slug)).toBe(first);
    expect(getGame("no-such-game")).toBeUndefined();
  });

  it("derives hrefs from slugs", () => {
    for (const game of GAMES) {
      expect(gameHref(game)).toBe(`/games/${game.slug}`);
    }
  });
});
