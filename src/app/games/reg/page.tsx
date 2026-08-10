import Game from "@/games/reg/Game";
import { manifest } from "@/games/reg/manifest";

export const metadata = {
  title: manifest.title,
  description: manifest.blurb,
};

export default function Page() {
  return <Game />;
}
