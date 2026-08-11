"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { ImagePool } from "../lib/images";
import { excerptSegments } from "../lib/names";
import { useSpinReel } from "../lib/useSpinReel";
import ExcerptOverlay from "./ExcerptOverlay";
import SpinButton from "./SpinButton";
import styles from "./StageScreen.module.css";

/**
 * The camera-free mode: the same slot machine, drawn as ordinary DOM.
 *
 * No camera, no WebGL, no MindAR — and because `three` and `mind-ar` only ever arrive
 * through dynamic imports inside `createRegScene` / `loadTexture`, neither of which this
 * screen calls, none of the 3D stack loads here at all. This is the path that works with
 * the camera denied and with no network.
 */
export default function StageScreen({
  checked,
  scalePercent,
  showCaption,
  spinning,
  onSpinningChange,
  onOverlayChange,
}: {
  /** Checked excerpt paths, in stable library order. */
  checked: readonly string[];
  /** The Filter tab's size slider, as a percentage. */
  scalePercent: number;
  showCaption: boolean;
  spinning: boolean;
  onSpinningChange: (spinning: boolean) => void;
  onOverlayChange: (open: boolean) => void;
}) {
  /** The frame on screen, as a URL: what renders must come from state, not the pool. */
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [overlayPath, setOverlayPath] = useState<string | null>(null);
  const poolRef = useRef<ImagePool | null>(null);

  useEffect(() => {
    const pool = new ImagePool();
    poolRef.current = pool;
    return () => {
      pool.disposeAll();
      poolRef.current = null;
    };
  }, []);

  const preload = useCallback(async (paths: readonly string[]) => {
    await poolRef.current?.ensure(paths);
  }, []);

  // Runs from the reel's timeouts, so reading the pool here is not a render-time read.
  // Same guard as the camera path: a failed load leaves the previous frame up.
  const show = useCallback((path: string) => {
    const loaded = poolRef.current?.get(path);
    if (loaded) setFrameSrc(loaded.element.src);
  }, []);

  const { phase, landed, shaking, spin } = useSpinReel({
    checked,
    // Nothing to wait for — there is no camera to start, and the pool exists before any
    // click can reach spin().
    ready: true,
    spinning,
    onSpinningChange,
    preload,
    show,
  });

  // Keep the cache tracking the selection so SPIN starts instantly, with the same
  // preload cap the camera mode uses.
  useEffect(() => {
    const pool = poolRef.current;
    if (!pool || spinning) return;
    pool.prune(new Set(checked));
    if (checked.length <= config.spin.maxPreloadedTextures) {
      void pool.ensure(checked);
    }
  }, [checked, spinning]);

  useEffect(() => {
    onOverlayChange(overlayPath !== null);
  }, [overlayPath, onOverlayChange]);

  const canOpen = phase === "result" && !spinning && landed !== null;
  // The whole path, unabbreviated: DOM text wraps, so there is no plane width to fit
  // and no reason to drop folders the way the 3D caption has to.
  const caption =
    landed === null ? null : excerptSegments(landed).join(config.names.separator);

  return (
    <div className={styles.screen}>
      <div
        className={styles.stage}
        // The size slider scales the whole stage rather than the image alone, so the
        // caption grows with it exactly as it does in the filter.
        style={{ "--stage-scale": scalePercent / 100 } as React.CSSProperties}
      >
        {frameSrc !== null ? (
          // next/image has nothing to offer a runtime blob: URL from the browser's own
          // file storage, with no server in the loop to optimise through.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frameSrc}
            alt={caption ?? "Excerpt"}
            className={`${styles.image} ${canOpen ? styles.imageOpenable : ""}`}
            onClick={() => {
              if (canOpen) setOverlayPath(landed);
            }}
          />
        ) : (
          <p className={styles.intro}>{config.scene.intro.text}</p>
        )}

        {phase === "result" && showCaption && caption !== null && (
          <p className={styles.caption}>{caption}</p>
        )}
      </div>

      <SpinButton
        phase={phase}
        spinning={spinning}
        shaking={shaking}
        disabled={spinning || overlayPath !== null}
        onClick={spin}
      />

      {overlayPath !== null && (
        <ExcerptOverlay
          path={overlayPath}
          showName={showCaption}
          onClose={() => setOverlayPath(null)}
        />
      )}
    </div>
  );
}
