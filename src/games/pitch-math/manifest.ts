import type { GameManifest } from "@/games/types";

export const manifest: GameManifest = {
  slug: "pitch-math",
  title: "Pitch Math",
  blurb:
    "Both players sound a note at once. First to name the interval out loud gets to answer.",
  iconId: "waveSine",
  status: "playable",
  minPlayers: 2,
  maxPlayers: 2,
};

export default manifest;
