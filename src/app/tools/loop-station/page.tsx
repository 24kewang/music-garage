import LoopStation from "@/tools/loop-station/LoopStation";
import { manifest } from "@/tools/loop-station/manifest";

export const metadata = {
  title: manifest.title,
  description: manifest.blurb,
};

export default function Page() {
  return <LoopStation />;
}
