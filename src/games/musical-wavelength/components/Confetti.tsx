"use client";

import { useEffect, useRef } from "react";
import { config } from "../config";
import styles from "./Confetti.module.css";

const { confetti } = config;

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
 * Hand-rolled rather than pulled from a library so every part of the look — colours,
 * count, spread, gravity, drag, lifetime — is tunable from `config.confetti` and can
 * be matched to the dial's palette.
 *
 * Fires whenever `burstKey` changes to a new non-null value, so a repeat maximum
 * score sets it off again.
 */
export default function Confetti({ burstKey }: { burstKey: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (burstKey === null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.scale(ratio, ratio);

    const originX = width * confetti.originX;
    const originY = height * confetti.originY;

    const pieces: Piece[] = Array.from({ length: confetti.pieceCount }, () => {
      // Upward cone, spread either side of straight up.
      const angle =
        -Math.PI / 2 +
        ((Math.random() * 2 - 1) * confetti.spreadDeg * Math.PI) / 180;
      const speed = between(confetti.minSpeed, confetti.maxSpeed);

      return {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: between(confetti.minSize, confetti.maxSize),
        color: confetti.colors[Math.floor(Math.random() * confetti.colors.length)],
        rotation: Math.random() * Math.PI * 2,
        spin: between(confetti.minSpin, confetti.maxSpin) * (Math.random() < 0.5 ? -1 : 1),
        age: 0,
        lifetime: between(confetti.minLifetime, confetti.maxLifetime),
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

        piece.vy += confetti.gravity * dt;
        const damping = Math.pow(confetti.drag, dt);
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
        context.fillRect(
          -piece.size / 2,
          -piece.size / 4,
          piece.size,
          piece.size / 2,
        );
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
