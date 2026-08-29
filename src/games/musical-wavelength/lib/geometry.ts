/**
 * Dial geometry: the angle convention, coordinate conversion, and the generated
 * band wedges.
 *
 * The design ships hand-written SVG path strings for the wheel. We regenerate them
 * from `config.bands` instead of copying them, so the drawn wedges and the scoring
 * logic are guaranteed to describe the same shape. `geometry.test.ts` pins the
 * generated coordinates to the design's values.
 *
 * Pure — no React, no DOM beyond an optional bounding rect. Unit-testable.
 */

import { config } from "../config";

export interface Point {
  x: number;
  y: number;
}

export interface Wedge {
  /** Leading edge, degrees from the wheel's center line (negative = left). */
  startDeg: number;
  /** Trailing edge. */
  endDeg: number;
  /** Angle of the score label. */
  labelDeg: number;
  score: number;
  fill: string;
  labelFill: string;
}

const DEG = Math.PI / 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Wrap an angle into [-180, 180). */
export function norm(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Point on a circle in the dial's convention: 0° is straight up, positive is
 * clockwise — matching SVG's `rotate()` so generated geometry and transforms agree.
 */
export function polar(radius: number, deg: number): Point {
  return {
    x: radius * Math.sin(deg * DEG),
    y: -radius * Math.cos(deg * DEG),
  };
}

/** Inverse of {@link polar}: the angle of a point, in the same convention. */
export function angleAt(p: Point): number {
  return (Math.atan2(p.x, -p.y) * 180) / Math.PI;
}

/** Convert client coordinates to SVG user units. */
export function localPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number },
): Point {
  const scale = config.viewBox.width / rect.width;
  return {
    x: (clientX - rect.left) * scale + config.viewBox.minX,
    y: (clientY - rect.top) * scale + config.viewBox.minY,
  };
}

function round(value: number): number {
  // Two decimals is well below the resolution of the rendered dial and keeps the
  // generated path strings short.
  return Math.round(value * 100) / 100;
}

/**
 * Wedge for one scoring band, as an SVG path: center → outer edge → arc → close.
 * Mirrors the design's `M 0 0 L … A 300 300 0 0 1 … Z`.
 */
export function wedgePath(startDeg: number, endDeg: number, radius: number): string {
  const from = polar(radius, startDeg);
  const to = polar(radius, endDeg);
  // sweep-flag 1: clockwise, matching the increasing-angle direction.
  return `M 0 0 L ${round(from.x)} ${round(from.y)} A ${radius} ${radius} 0 0 1 ${round(
    to.x,
  )} ${round(to.y)} Z`;
}

/**
 * The scalloped outer plate: points evenly spaced on a circle, joined by small arcs
 * that bulge outward.
 */
export function scallopPath(
  radius: number,
  bumpRadius: number,
  count: number,
): string {
  const parts: string[] = [`M ${radius} 0`];
  for (let i = 1; i <= count; i++) {
    const angle = (i / count) * 2 * Math.PI;
    const x = round(radius * Math.cos(angle));
    const y = round(radius * Math.sin(angle));
    parts.push(`A ${bumpRadius} ${bumpRadius} 0 0 1 ${x} ${y}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** A band's outer edge in degrees, scaled from its share of the whole target. */
export function bandEdgeDeg(index: number): number {
  return config.targetHalfWidthDeg * config.bands[index].edgeFraction;
}

/**
 * The five band wedges in the design's draw order: outermost-left inward to the
 * center, then back out to the right.
 */
export function buildWedges(): Wedge[] {
  const { bands } = config;
  const wedges: Wedge[] = [];

  const make = (startDeg: number, endDeg: number, band: (typeof bands)[number]) => ({
    startDeg,
    endDeg,
    labelDeg: (startDeg + endDeg) / 2,
    score: band.score,
    fill: band.fill,
    labelFill: band.labelFill,
  });

  // Left half, outermost band first.
  for (let i = bands.length - 1; i >= 1; i--) {
    wedges.push(make(-bandEdgeDeg(i), -bandEdgeDeg(i - 1), bands[i]));
  }
  // The center band straddles the line.
  wedges.push(make(-bandEdgeDeg(0), bandEdgeDeg(0), bands[0]));
  // Right half, innermost band first.
  for (let i = 1; i < bands.length; i++) {
    wedges.push(make(bandEdgeDeg(i - 1), bandEdgeDeg(i), bands[i]));
  }

  return wedges;
}

/** Built once — the wedge list is static for a given config. */
export const WEDGES: readonly Wedge[] = buildWedges();

// -------------------------------------------------------- the window and the lid

/**
 * The opening in the housing — and, identically, the outline of the cover that closes
 * over it. A plain upper semicircle, as the design has it.
 *
 * Both the housing's window and the cover fill are drawn from this one function. That
 * is the whole safety argument: identical shapes cannot leave a gap, and a gap would
 * show a sliver of the wheel through the closed lid and give the target away.
 */
export function windowPath(radius: number = config.geometry.wheelRadius): string {
  return `M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0 Z`;
}

/** The cover's curved rim, for the highlight stroke — the same arc, left open. */
export function coverRimPath(radius: number = config.geometry.wheelRadius): string {
  return `M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0`;
}

/** Full circle as a path, for the housing's outer disc. */
export function discPath(radius: number): string {
  return (
    `M 0 ${-radius} A ${radius} ${radius} 0 1 0 0 ${radius} ` +
    `A ${radius} ${radius} 0 1 0 0 ${-radius} Z`
  );
}
