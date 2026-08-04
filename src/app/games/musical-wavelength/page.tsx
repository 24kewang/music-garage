import Game from "@/games/musical-wavelength/Game";
import { manifest } from "@/games/musical-wavelength/manifest";

export const metadata = {
  title: manifest.title,
  description: manifest.blurb,
};

export default function Page() {
  return <Game />;
}
