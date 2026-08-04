import type { NeedleMode } from "../lib/settings";
import { needsMicrophone } from "../lib/settings";
import type { Phase } from "../lib/useDial";
import styles from "./Captions.module.css";

/**
 * The hint strip under the dial, in the design's styling. The hints change with the
 * phase so they always describe what's actually possible right now.
 */
export default function Captions({
  phase,
  mode,
  micBlocked,
}: {
  phase: Phase;
  mode: NeedleMode;
  micBlocked: boolean;
}) {
  const hints = hintsFor(phase, mode, micBlocked);

  return (
    <div className={styles.strip}>
      {hints.map((hint, index) => (
        <span key={hint} className={styles.item}>
          {index > 0 && <span className={styles.dot} aria-hidden="true" />}
          <span>{hint}</span>
        </span>
      ))}
    </div>
  );
}

function hintsFor(phase: Phase, mode: NeedleMode, micBlocked: boolean): string[] {
  if (phase === "setup") {
    return [
      "Scroll or drag the wheel to set the target",
      "Open the cover to see where it landed",
      "Give your clue, then press start",
    ];
  }

  if (phase === "guess") {
    if (micBlocked) {
      return [
        "The microphone is blocked",
        "Allow it, or switch to manual in settings",
        "Slide the handle to reveal",
      ];
    }

    return [
      needsMicrophone(mode)
        ? mode === "pitch"
          ? "Play or sing to move the needle"
          : "Play or sing — sharp goes right, flat goes left"
        : "Drag near the needle to aim",
      needsMicrophone(mode) ? "Press the hub to lock it" : "The wheel is locked",
      "Slide the handle to reveal",
    ];
  }

  return ["Scroll or drag the wheel to play again"];
}
