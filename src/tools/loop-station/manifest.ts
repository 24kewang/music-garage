import type { ToolManifest } from "@/tools/types";

export const manifest: ToolManifest = {
  slug: "loop-station",
  title: "Loop Station",
  blurb:
    "Record loops over each other, live from the microphone. A loop pedal with tracks, buses and latency calibration.",
  iconId: "waveform",
  status: "playable",
  requires: "Microphone",
};

export default manifest;
