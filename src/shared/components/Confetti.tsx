"use client";

import { useEffect, useRef } from "react";
import styles from "./Confetti.module.css";

/**
 * Everything about the look of a burst. Passed in rather than imported so each game
 * can match its own palette — the dial's confetti is cream and teal, Pitch Math's is
 * indigo.
 */
export interface ConfettiConfig {
  pieceCount: number;
  /** Fallback origin, as a fraction of the viewport, when no `origin` is given. */
  originX: number;
  originY: number;
  /** Initial speed range, px/s. */
  minSpeed: number;
  maxSpeed: number;
  /** Half-angle of the upward burst cone, in degrees. */
  spreadDeg: number;
  /** Downward acceleration, px/s². */
  gravity: number;
  /** Per-second velocity retention. Lower = more air resistance. */
  drag: number;
  /** Piece lifetime range, seconds. */
  minLifetime: number;
  maxLifetime: number;
  minSize: number;
  maxSize: number;
  /** Spin rate range, revolutions/s. */
  minSpin: number;
  maxSpin: number;
  colors: readonly string[];
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  age: number;
  lifetime: number;
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * A one-shot celebratory burst, drawn on a full-screen overlay canvas.
 *
 * Hand-rolled rather than pulled from a library so every part of the look is tunable
 * from the game's own config.
 *
 * Fires whenever `burstKey` changes to a new non-null value, so repeating the same
 * result sets it off again.
 */
export default function Confetti({
  burstKey,
  config,
  origin,
}: {
  burstKey: number | null;
  config: ConfettiConfig;
  /**
   * Where to burst from, in viewport pixels. Given when the celebration belongs to a
   * particular element — a button that was just pressed — rather than to the screen.
   */
  origin?: { x: number; y: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * Read inside the effect but deliberately not a dependency: only `burstKey` should
   * fire a burst. A new config object on a re-render must not launch confetti.
   */
  const settingsRef = useRef({ config, origin });
  useEffect(() => {
    settingsRef.current = { config, origin };
  });

  useEffect(() => {
    if (burstKey === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const { config: settings, origin: from } = settingsRef.current;

    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);

    const originX = from ? from.x : width * settings.originX;
    const originY = from ? from.y : height * settings.originY;

    const pieces: Piece[] = Array.from({ length: settings.pieceCount }, () => {
      // Upward cone, spread either side of straight up.
      const angle =
        -Math.PI / 2 +
        ((Math.random() * 2 - 1) * settings.spreadDeg * Math.PI) / 180;
      const speed = between(settings.minSpeed, settings.maxSpeed);

      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: between(settings.minSize, settings.maxSize),
        color: settings.colors[Math.floor(Math.random() * settings.colors.length)],
        rotation: Math.random() * Math.PI * 2,
        spin:
          between(settings.minSpin, settings.maxSpin) * (Math.random() < 0.5 ? -1 : 1),
        age: 0,
        lifetime: between(settings.minLifetime, settings.maxLifetime),
      };
    });

    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      // Seconds, capped so a backgrounded tab doesn't teleport everything offscreen.
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;

      context.clearRect(0, 0, width, height);
      let alive = false;

      for (const piece of pieces) {
        piece.age += dt;
        if (piece.age >= piece.lifetime) continue;
        alive = true;

        piece.vy += settings.gravity * dt;
        const damping = Math.pow(settings.drag, dt);
        piece.vx *= damping;
        piece.vy *= damping;

        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.rotation += piece.spin * Math.PI * 2 * dt;

        // Fade out over the last third of the piece's life.
        const remaining = 1 - piece.age / piece.lifetime;
        context.globalAlpha = Math.min(1, remaining * 3);

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        // Squashed vertically as it spins, so pieces read as flakes rather than blocks.
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        context.restore();
      }

      context.globalAlpha = 1;

      if (alive) {
        frame = requestAnimationFrame(tick);
      } else {
        context.clearRect(0, 0, width, height);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
    };
  }, [burstKey]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
