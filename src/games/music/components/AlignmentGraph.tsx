"use client";

import { config } from "../config";
import { buildGraph, describeAlignment, type Cell } from "../lib/graph";
import type { AlignStep } from "../score/align";
import styles from "./AlignmentGraph.module.css";

/**
 * The attempt drawn over the melody it was trying to be.
 *
 * SVG rather than canvas: a few dozen cells, static, and the strokes want
 * `var(--color-…)` directly. A canvas would force colour literals into JavaScript,
 * which the styling rules rule out outright.
 *
 * No axes, no gridlines, no pitch labels — only the two shapes, which is what the
 * brief asks for and is also the honest presentation. The attempt is drawn at
 * whatever transposition scored best, so an absolute pitch scale alongside it would
 * be actively misleading.
 *
 * The geometry all comes from `lib/graph.ts`, which is tested.
 */

export default function AlignmentGraph({
  target,
  shifted,
  steps,
}: {
  target: readonly number[];
  shifted: readonly number[];
  steps: readonly AlignStep[];
}) {
  const { width, height } = config.graph;
  const geometry = buildGraph(target, shifted, steps, config.graph);

  if (geometry.ops.length === 0) return null;

  /** The vertical joins between one cell and the next in the same line. */
  const risers = (cells: readonly (Cell | null)[]) => {
    const out: { x: number; y0: number; y1: number; index: number }[] = [];
    let previous: Cell | null = null;
    let previousIndex = -1;

    cells.forEach((cell, index) => {
      // Only join cells that are actually adjacent. A gap left by a missed or extra
      // note must stay a gap — it is doing as much work as the colours are.
      if (cell && previous && index === previousIndex + 1 && previous.y !== cell.y) {
        out.push({ x: cell.x0, y0: previous.y, y1: cell.y, index });
      }
      if (cell) {
        previous = cell;
        previousIndex = index;
      }
    });
    return out;
  };

  return (
    <svg
      className={styles.graph}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describeAlignment(steps)}
    >
      {/* The melody, underneath: thin and neutral, a reference rather than a verdict. */}
      <g className={styles.target}>
        {risers(geometry.target).map((riser) => (
          <line
            key={`tr-${riser.index}`}
            x1={riser.x}
            y1={riser.y0}
            x2={riser.x}
            y2={riser.y1}
          />
        ))}
        {geometry.target.map((cell, index) =>
          cell === null ? null : (
            <line
              key={`t-${index}`}
              x1={cell.x0}
              y1={cell.y}
              x2={cell.x1}
              y2={cell.y}
              data-missed={geometry.ops[index] === "del" || undefined}
            />
          ),
        )}
      </g>

      {/* The attempt, over the top, coloured cell by cell from the alignment. */}
      <g className={styles.attempt}>
        {risers(geometry.attempt).map((riser) => (
          <line
            key={`ar-${riser.index}`}
            x1={riser.x}
            y1={riser.y0}
            x2={riser.x}
            y2={riser.y1}
          />
        ))}
        {geometry.attempt.map((cell, index) =>
          cell === null ? null : (
            <g key={`a-${index}`} data-op={geometry.ops[index]}>
              <line x1={cell.x0} y1={cell.y} x2={cell.x1} y2={cell.y} />
              {/*
               * A mark on every cell that is not a match, so the difference between
               * right and wrong survives being read without colour.
               */}
              {geometry.ops[index] !== "match" && (
                <circle cx={(cell.x0 + cell.x1) / 2} cy={cell.y} r={4} />
              )}
            </g>
          ),
        )}
      </g>
    </svg>
  );
}
