import Game from "@/games/pitch-math/Game";
import { manifest } from "@/games/pitch-math/manifest";

export const metadata = {
  title: manifest.title,
  description: manifest.blurb,
};

export default function Page() {
  return <Game />;
}
