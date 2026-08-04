import { describe, expect, it } from "vitest";
import { MAX_SCORE, scoreAt, scoreValue } from "./scoring";

describe("scoreAt", () => {
  it("scores the centre band highest", () => {
    expect(scoreAt(0, 0)?.score).toBe(4);
    expect(scoreAt(3, 0)?.score).toBe(4);
    expect(scoreAt(-3, 0)?.score).toBe(4);
  });

  it("scores the middle bands", () => {
    expect(scoreAt(5, 0)?.score).toBe(3);
    expect(scoreAt(-5, 0)?.score).toBe(3);
    expect(scoreAt(10, 0)?.score).toBe(3);
  });

  it("scores the outer bands", () => {
    expect(scoreAt(14, 0)?.score).toBe(2);
    expect(scoreAt(-14, 0)?.score).toBe(2);
    expect(scoreAt(17.9, 0)?.score).toBe(2);
  });

  it("misses outside the target zone", () => {
    expect(scoreAt(18.1, 0)).toBeNull();
    expect(scoreAt(-30, 0)).toBeNull();
    expect(scoreAt(88, 0)).toBeNull();
  });

  it("follows the wheel as it rotates", () => {
    // Target rotated 40° clockwise: the needle has to follow it to still score.
    expect(scoreAt(40, 40)?.score).toBe(4);
    expect(scoreAt(0, 40)).toBeNull();
    expect(scoreAt(45, 40)?.score).toBe(3);
  });

  it("scores against the mirrored band group", () => {
    // The second group sits 180° round, so a half-turn of the wheel brings it up.
    const landing = scoreAt(0, 180);
    expect(landing?.score).toBe(4);
    expect(landing?.groupDeg).toBe(180);
  });

  it("handles wheel angles that wrap past ±180", () => {
    expect(scoreAt(0, 360)?.score).toBe(4);
    expect(scoreAt(0, -360)?.score).toBe(4);
    // -170 and 190 are the same angle; the needle is dead on the target.
    expect(scoreAt(-170, 190)?.score).toBe(4);
    // Straddling the wrap point without lining up is still a miss.
    expect(scoreAt(170, -170)).toBeNull();
  });

  it("reports which wedge was hit so the reveal can glow it", () => {
    expect(scoreAt(-14, 0)?.wedgeIndex).toBe(0);
    expect(scoreAt(0, 0)?.wedgeIndex).toBe(2);
    expect(scoreAt(14, 0)?.wedgeIndex).toBe(4);
  });

  it("puts band boundaries in exactly one wedge", () => {
    // 3.6° is shared between the centre and right-middle wedge; whichever wins, the
    // result must be deterministic and a real band rather than a miss.
    const landing = scoreAt(3.6, 0);
    expect(landing).not.toBeNull();
    expect([3, 4]).toContain(landing!.score);
  });
});

describe("scoreValue", () => {
  it("treats a miss as zero", () => {
    expect(scoreValue(null)).toBe(0);
    expect(scoreValue(scoreAt(0, 0))).toBe(4);
  });
});

describe("MAX_SCORE", () => {
  it("is the centre band's score", () => {
    expect(MAX_SCORE).toBe(4);
  });
});
