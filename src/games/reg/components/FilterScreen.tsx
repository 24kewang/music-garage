"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { excerptName } from "../lib/names";
import {
  createRegScene,
  type BoxPlacement,
  type RegScene,
} from "../lib/mindarScene";
import { TexturePool } from "../lib/textures";
import { useSpinReel } from "../lib/useSpinReel";
import ExcerptOverlay from "./ExcerptOverlay";
import SpinButton from "./SpinButton";
import styles from "./FilterScreen.module.css";

type CameraState = "starting" | "ready" | "denied" | "failed";

/**
 * The filter itself: MindAR's camera feed filling the viewport, the SPIN button,
 * and the intro → spinning → result state machine. The slot-machine cadence runs on
 * its own timeouts — the render loop just keeps drawing whatever texture is current.
 */
export default function FilterScreen({
  checked,
  placement,
  showCaption,
  spinning,
  onSpinningChange,
  onOverlayChange,
  onBusyChange,
}: {
  /** Checked excerpt paths, in stable library order. */
  checked: readonly string[];
  /** Where the box sits and how big it is; applied live. */
  placement: BoxPlacement;
  /** Whether the excerpt's name is drawn under it, and shown in the overlay. */
  showCaption: boolean;
  spinning: boolean;
  onSpinningChange: (spinning: boolean) => void;
  /** Lets the shell lock the settings gear while the enlarged view is open. */
  onOverlayChange: (open: boolean) => void;
  /** Lets the shell lock the camera-mode switch while the camera is starting. */
  onBusyChange: (busy: boolean) => void;
}) {
  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [retryKey, setRetryKey] = useState(0);
  const [overlayPath, setOverlayPath] = useState<string | null>(null);
  const [overImage, setOverImage] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RegScene | null>(null);
  const poolRef = useRef<TexturePool | null>(null);
  // Mirrors the latest placement so scene creation can read it without the camera
  // effect depending on it — a dependency there would restart the webcam on every
  // slider tick. Seeded with the first value, then kept current by the effect below,
  // which is declared first so the ref is fresh before the scene is ever built.
  const placementRef = useRef(placement);

  // Slider drags land here. The scene may not exist yet, which is fine — creation
  // reads placementRef, so nothing is missed.
  useEffect(() => {
    placementRef.current = placement;
    sceneRef.current?.setPlacement(placement);
  }, [placement]);

  const preload = useCallback(async (paths: readonly string[]) => {
    await poolRef.current?.ensure(paths);
  }, []);

  const onSpinStart = useCallback(() => {
    sceneRef.current?.setCaption(null);
    sceneRef.current?.setMode("image");
  }, []);

  const show = useCallback((path: string) => {
    const loaded = poolRef.current?.get(path);
    if (loaded) sceneRef.current?.setImage(loaded);
  }, []);

  const reel = useSpinReel({
    checked,
    ready: cameraState === "ready",
    spinning,
    onSpinningChange,
    preload,
    onSpinStart,
    show,
  });
  const { phase, landed, shaking, cancel } = reel;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const pool = new TexturePool();
    poolRef.current = pool;

    void createRegScene(container, config.scene, placementRef.current).then(
      async (scene) => {
        sceneRef.current = scene;
        try {
          await scene.start();
          if (cancelled) {
            scene.stop(); // Unmounted while the permission prompt was up.
          } else {
            setCameraState("ready");
          }
        } catch (error) {
          if (!cancelled) {
            setCameraState(isPermissionDenied(error) ? "denied" : "failed");
          }
        }
      },
      () => {
        if (!cancelled) setCameraState("failed");
      },
    );

    return () => {
      cancelled = true;
      // Without this a queued swap would call setImage on a disposed scene.
      cancel();
      sceneRef.current?.stop();
      sceneRef.current = null;
      pool.disposeAll();
      poolRef.current = null;
    };
  }, [retryKey, cancel]);

  // Keep the texture cache tracking the selection so SPIN starts instantly. Above
  // the preload cap, spins load just their own plan's textures instead.
  useEffect(() => {
    const pool = poolRef.current;
    if (!pool || cameraState !== "ready" || spinning) return;
    pool.prune(new Set(checked));
    if (checked.length <= config.spin.maxPreloadedTextures) {
      void pool.ensure(checked);
    }
  }, [checked, cameraState, spinning]);

  // The caption is derived rather than set once at the end of a spin, so switching it
  // off in the settings takes effect on the excerpt already showing.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || phase !== "result" || landed === null) return;
    scene.setCaption(
      showCaption
        ? excerptName(landed, config.names.maxLength, config.names.separator)
        : null,
    );
  }, [showCaption, landed, phase]);

  // Tell the shell to lock the gear while the enlarged view is up.
  useEffect(() => {
    onOverlayChange(overlayPath !== null);
  }, [overlayPath, onOverlayChange]);

  // And to lock the camera-mode switch until the camera has settled either way. Both
  // "denied" and "failed" release it, so a refused camera doesn't trap the player here.
  useEffect(() => {
    onBusyChange(cameraState === "starting");
    return () => onBusyChange(false);
  }, [cameraState, onBusyChange]);

  /** Only the landed excerpt is clickable, and only where it actually is. */
  const canOpen =
    phase === "result" && !spinning && landed !== null && overlayPath === null;

  return (
    <div className={styles.screen}>
      <div
        ref={containerRef}
        className={`${styles.camera} ${overImage ? styles.cameraOverImage : ""}`}
        // Click rather than pointerdown: the overlay's own dismiss listener binds on
        // pointerdown, and opening on the earlier event invites it to fire on the tail
        // of the very gesture that opened it.
        onClick={(event) => {
          if (!canOpen) return;
          if (sceneRef.current?.hitTestImage(event.clientX, event.clientY)) {
            setOverlayPath(landed);
          }
        }}
        onPointerMove={(event) => {
          // Hover is the affordance; touch has none, and tracking it during a drag
          // would just flicker.
          if (event.pointerType === "touch") return;
          const over =
            canOpen === true &&
            sceneRef.current?.hitTestImage(event.clientX, event.clientY) === true;
          setOverImage(over);
        }}
        onPointerLeave={() => setOverImage(false)}
      />

      {cameraState === "starting" && (
        <p className={styles.status}>Starting camera…</p>
      )}
      {(cameraState === "denied" || cameraState === "failed") && (
        <div className={styles.errorCard}>
          <p>
            {cameraState === "denied"
              ? "The filter needs the camera, and permission was denied. Allow camera access for this site, then try again."
              : "The camera couldn't be started. Close other apps that might be using it, then try again."}
          </p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              setCameraState("starting");
              setRetryKey((key) => key + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      <SpinButton
        phase={phase}
        spinning={spinning}
        shaking={shaking}
        // The overlay's backdrop covers this too; disabling keeps it off the tab order
        // as well.
        disabled={spinning || cameraState !== "ready" || overlayPath !== null}
        onClick={() => {
          setOverImage(false);
          reel.spin();
        }}
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

function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}
