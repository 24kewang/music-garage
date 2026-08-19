import Game from "@/games/music/Game";
import { manifest } from "@/games/music/manifest";

export const metadata = {
  title: manifest.title,
  description: manifest.blurb,
};

export default function Page() {
  return <Game />;
}
