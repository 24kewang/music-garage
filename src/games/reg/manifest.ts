import type { GameManifest } from "@/games/types";

export const manifest: GameManifest = {
  slug: "reg",
  title: "Random Excerpt Generator (REG)",
  blurb:
    "An AR filter that floats a random excerpt from your own library above your head.",
  iconId: "shuffle",
  status: "playable",
  minPlayers: 1,
  maxPlayers: 1,
};

export default manifest;
