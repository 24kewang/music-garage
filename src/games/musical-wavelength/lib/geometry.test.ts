import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WEDGES,
  angleAt,
  bandEdgeDeg,
  clamp,
  coverRimPath,
  discPath,
  localPoint,
  norm,
  polar,
  scallopPath,
  wedgePath,
  windowPath,
} from "./geometry";
import { config } from "../config";

describe("angle convention", () => {
  it("puts 0° straight up and positive clockwise", () => {
    expect(polar(100, 0)).toEqual({ x: 0, y: -100 });
    expect(polar(100, 90).x).toBeCloseTo(100, 6);
    expect(polar(100, 90).y).toBeCloseTo(0, 6);
    expect(polar(100, 180).y).toBeCloseTo(100, 6);
    expect(polar(100, -90).x).toBeCloseTo(-100, 6);
  });

  it("round-trips through angleAt", () => {
    for (const deg of [-179, -90, -33.3, 0, 12.5, 90, 179]) {
      expect(angleAt(polar(300, deg))).toBeCloseTo(deg, 6);
    }
  });
});

describe("norm", () => {
  it("wraps into [-180, 180)", () => {
    expect(norm(0)).toBe(0);
    expect(norm(190)).toBeCloseTo(-170, 10);
    expect(norm(-190)).toBeCloseTo(170, 10);
    expect(norm(540)).toBeCloseTo(-180, 10);
    expect(norm(3600 + 45)).toBeCloseTo(45, 10);
  });
});

describe("clamp", () => {
  it("bounds on both sides and passes through in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("localPoint", () => {
  it("maps a client point into viewBox units", () => {
    // A 500px-wide render of a 1000-unit viewBox: 2 user units per CSS pixel.
    const rect = { left: 100, top: 50, width: 500 };

    // Top-left corner of the SVG is the viewBox origin.
    expect(localPoint(100, 50, rect)).toEqual({ x: -500, y: -380 });
    // 250px across is halfway, i.e. x = 0 in user units.
    expect(localPoint(350, 50, rect).x).toBeCloseTo(0, 6);
  });
});

/**
 * The design ships hand-written path coordinates. These assertions are what make
 * "generated from constants" safe: if the generated geometry ever stops matching the
 * design, this fails rather than silently drifting.
 */
describe("design fidelity", () => {
  const R = config.geometry.wheelRadius;

  it.each([
    [3.6, 18.8, -299.4],
    [10.8, 56.2, -294.7],
    [18.0, 92.7, -285.3],
  ])("band edge at %s° matches the design's coordinates", (deg, x, y) => {
    const point = polar(R, deg);
    expect(point.x).toBeCloseTo(x, 1);
    expect(point.y).toBeCloseTo(y, 1);
  });

  it("reproduces the design's outermost left wedge path", () => {
    // Design: M 0 0 L -92.7 -285.3 A 300 300 0 0 1 -56.2 -294.7 Z
    expect(wedgePath(-18, -10.8, R)).toBe(
      "M 0 0 L -92.71 -285.32 A 300 300 0 0 1 -56.21 -294.69 Z",
    );
  });

  it("reproduces the design's center wedge path", () => {
    // Design: M 0 0 L -18.8 -299.4 A 300 300 0 0 1 18.8 -299.4 Z
    expect(wedgePath(-3.6, 3.6, R)).toBe(
      "M 0 0 L -18.84 -299.41 A 300 300 0 0 1 18.84 -299.41 Z",
    );
  });

  it("starts the scallop path where the design does", () => {
    const path = scallopPath(336, 24, 44);
    // Design: M 336 0 A 24 24 0 0 1 332.6 47.8 …
    expect(path.startsWith("M 336 0 A 24 24 0 0 1 332.58 47.82")).toBe(true);
    // 44 bumps plus the closing Z.
    expect(path.match(/A /g)).toHaveLength(44);
    expect(path.endsWith("Z")).toBe(true);
  });
});

describe("WEDGES", () => {
  it("has one wedge per band, mirrored, with the center band shared", () => {
    // 3 bands → 5 wedges: 2 left, 1 center, 2 right.
    expect(WEDGES).toHaveLength(5);
    expect(WEDGES.map((w) => w.score)).toEqual([2, 3, 4, 3, 2]);
  });

  it("tiles the target zone without gaps or overlaps", () => {
    for (let i = 1; i < WEDGES.length; i++) {
      expect(WEDGES[i].startDeg).toBeCloseTo(WEDGES[i - 1].endDeg, 10);
    }
    // Derived, not literal, so this holds at whatever targetHalfWidthDeg is set to.
    expect(WEDGES[0].startDeg).toBeCloseTo(-config.targetHalfWidthDeg, 9);
    expect(WEDGES[WEDGES.length - 1].endDeg).toBeCloseTo(config.targetHalfWidthDeg, 9);
  });

  it("spans exactly targetHalfWidthDeg either side of center", () => {
    // The one knob that resizes the whole target.
    expect(WEDGES[0].startDeg).toBeCloseTo(-config.targetHalfWidthDeg, 9);
    expect(WEDGES[WEDGES.length - 1].endDeg).toBeCloseTo(config.targetHalfWidthDeg, 9);
  });

  it("scales every band edge with the total", () => {
    // Each edge stays at its configured fraction of the whole, whatever the total is.
    config.bands.forEach((band, index) => {
      expect(bandEdgeDeg(index)).toBeCloseTo(
        config.targetHalfWidthDeg * band.edgeFraction,
        9,
      );
    });
    expect(bandEdgeDeg(config.bands.length - 1)).toBeCloseTo(
      config.targetHalfWidthDeg,
      9,
    );
  });

  it("centers each label in its wedge", () => {
    for (const wedge of WEDGES) {
      expect(wedge.labelDeg).toBeCloseTo((wedge.startDeg + wedge.endDeg) / 2, 9);
    }
    // The center wedge straddles the line, so its label sits dead ahead.
    expect(WEDGES[2].labelDeg).toBeCloseTo(0, 9);
  });

  it("gives every wedge the same width", () => {
    // The configured fractions (0.2 / 0.6 / 1.0) make the five wedges equal, which is
    // what the design's 2-3-4-3-2 strip looks like. Derived so it survives a resize.
    const width = WEDGES[0].endDeg - WEDGES[0].startDeg;
    for (const wedge of WEDGES) {
      expect(wedge.endDeg - wedge.startDeg).toBeCloseTo(width, 9);
    }
    expect(width).toBeCloseTo((2 * config.targetHalfWidthDeg) / WEDGES.length, 9);
  });
});

/**
 * The lid has to fill the housing's opening exactly. A gap would show a sliver of the
 * wheel through the closed cover and give the target away, so this is a correctness
 * property, not a cosmetic one.
 */
describe("cover and window", () => {
  const { wheelRadius, housingRadius } = config.geometry;

  it("draws the lid and the opening from the same function", () => {
    // The whole safety argument: identical shapes cannot leave a gap. Checked at the
    // source, because the guarantee is that neither component grows its own path —
    // comparing windowPath() to itself would prove nothing.
    const components = join(process.cwd(), "src/games/musical-wavelength/components");
    for (const file of ["Cover.tsx", "Housing.tsx"]) {
      expect(readFileSync(join(components, file), "utf8")).toContain("windowPath()");
    }
  });

  it("is a plain upper semicircle", () => {
    const path = windowPath();
    expect(path).toBe(
      `M ${-wheelRadius} 0 A ${wheelRadius} ${wheelRadius} 0 0 1 ${wheelRadius} 0 Z`,
    );
    // Closes straight across the diameter: no notches, no detours along the edge.
    expect(path).not.toContain("L");
  });

  it("draws the rim highlight as the same arc, left open", () => {
    const rim = coverRimPath();
    expect(rim).toBe(
      `M ${-wheelRadius} 0 A ${wheelRadius} ${wheelRadius} 0 0 1 ${wheelRadius} 0`,
    );
    expect(`${rim} Z`).toBe(windowPath());
  });

  it("punches the window out of the housing disc", () => {
    // Two subpaths, relying on fill-rule: evenodd to leave the opening.
    const ring = `${discPath(housingRadius)} ${windowPath()}`;
    expect(ring.match(/M /g)).toHaveLength(2);
    expect(ring.startsWith(`M 0 ${-housingRadius}`)).toBe(true);
    expect(ring.endsWith(windowPath())).toBe(true);
  });

  it("keeps the base trapezoid clear of the window", () => {
    // The trapezoid isn't punched, so it must live entirely on the far side of the
    // straight edge or it would intrude into the opening.
    const { base } = config.geometry;
    expect(base.depth).toBeGreaterThan(0);
    expect(base.bottomHalfWidth).toBeGreaterThanOrEqual(base.topHalfWidth);
  });
});
