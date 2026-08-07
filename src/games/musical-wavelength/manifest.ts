import type { GameManifest } from "@/games/types";

export const manifest: GameManifest = {
  slug: "musical-wavelength",
  title: "Musical Wavelength",
  blurb:
    "One player describes where the hidden target is. The other answers by ear — played, sung, or by hand.",
  iconId: "target",
  status: "playable",
  minPlayers: 2,
  maxPlayers: 12,
};

export default manifest;
