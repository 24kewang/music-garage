"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "../config";
import { excerptName } from "../lib/names";
import {
  createRegScene,
  type BoxPlacement,
  type RegScene,
} from "../lib/mindarScene";
import { buildSpinPlan, pickTargetIndex } from "../lib/spin";
import { TexturePool } from "../lib/textures";
import ExcerptOverlay from "./ExcerptOverlay";
import styles from "./FilterScreen.module.css";

type CameraState = "starting" | "ready" | "denied" | "failed";
type Phase = "intro" | "spinning" | "result";

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
}) {
  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [phase, setPhase] = useState<Phase>("intro");
  const [shaking, setShaking] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  /** The excerpt the last spin landed on — the caption and overlay both need it. */
  const [landed, setLanded] = useState<string | null>(null);
  const [overlayPath, setOverlayPath] = useState<string | null>(null);
  const [overImage, setOverImage] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RegScene | null>(null);
  const poolRef = useRef<TexturePool | null>(null);
  const timeoutsRef = useRef<number[]>([]);
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
      for (const id of timeoutsRef.current) window.clearTimeout(id);
      timeoutsRef.current = [];
      sceneRef.current?.stop();
      sceneRef.current = null;
      pool.disposeAll();
      poolRef.current = null;
    };
  }, [retryKey]);

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

  const spin = async () => {
    const scene = sceneRef.current;
    const pool = poolRef.current;
    if (spinning || cameraState !== "ready" || !scene || !pool) return;

    if (checked.length === 0) {
      navigator.vibrate?.([...config.reject.vibratePattern]);
      setShaking(true);
      window.setTimeout(() => setShaking(false), config.reject.shakeMs);
      return;
    }

    onSpinningChange(true);
    setPhase("spinning");
    setLanded(null);
    setOverImage(false);
    try {
      const target = pickTargetIndex(checked.length, Math.random);
      const plan = buildSpinPlan(checked.length, target, config.spin, Math.random);
      await pool.ensure([...new Set(plan.map((step) => checked[step.pathIndex]))]);

      scene.setCaption(null);
      scene.setMode("image");

      let elapsed = 0;
      plan.forEach((step, index) => {
        elapsed += step.delayMs;
        const path = checked[step.pathIndex];
        const isLast = index === plan.length - 1;
        const id = window.setTimeout(() => {
          const loaded = pool.get(path);
          if (loaded) scene.setImage(loaded);
          if (isLast) {
            // The caption follows from `landed` in the effect above.
            setLanded(path);
            setPhase("result");
            onSpinningChange(false);
          }
        }, elapsed);
        timeoutsRef.current.push(id);
      });
    } catch {
      setPhase("intro");
      onSpinningChange(false);
    }
  };

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

      <button
        type="button"
        className={`${styles.spin} ${shaking ? styles.spinShake : ""}`}
        // The overlay's backdrop covers this too; disabling keeps it off the tab order
        // as well.
        disabled={spinning || cameraState !== "ready" || overlayPath !== null}
        onClick={() => void spin()}
      >
        {spinning ? "Spinning…" : phase === "result" ? "Spin again" : "Spin"}
      </button>

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
