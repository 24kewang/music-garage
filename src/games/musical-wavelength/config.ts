/**
 * Every tunable of the Musical Wavelength dial, in one place.
 *
 * Components read from here rather than embedding literals, so the look and feel can
 * be retuned without hunting through JSX. Values marked "design" come from the
 * Wavelength Dial design and changing them is a deliberate deviation from it.
 */

export const config = {
  /**
   * SVG canvas. The design's viewBox; `localPoint` converts pointer coordinates into
   * these user units, so changing the size means changing the conversion too.
   */
  viewBox: {
    minX: -500,
    minY: -380,
    width: 1000,
    height: 830,
  },

  geometry: {
    /** Radius of the target wheel face — the bands are drawn on this circle. */
    wheelRadius: 300,
    /** The scalloped outer plate behind the wheel. */
    scallopRadius: 336,
    /** Bump radius of each scallop notch. */
    scallopBumpRadius: 24,
    /** Number of scallop notches around the plate. */
    scallopCount: 44,
    /** Inner circle drawn just inside the scallops. */
    wheelRimRadius: 301,
    /** Outer edge of the dark housing donut. */
    housingRadius: 322,
    /** Radius at which band score labels sit. */
    bandLabelRadius: 262,
    /** Needle length, from the centre outward. */
    needleLength: 244,
    /** Needle travel limit either side of vertical. Manual aiming uses all of it. */
    needleMaxDeg: 88,
    /**
     * Half-span of the tick scale, and so of needle travel in the audio modes.
     *
     * Held inside needleMaxDeg so the outermost labels clear the window's straight
     * edge. Out at 88° a label sits only ~8 units above that edge and is rotated to
     * run almost vertically, so its own length carries it across — moving it radially
     * inward makes that worse, not better. Pulling the span in is the fix.
     */
    scaleMaxDeg: 86.5,
    /** Centre button. */
    buttonRadius: 63,
    buttonRingRadius: 52,
    /** Cover handle, drawn to the right of centre at coverDeg = 0. */
    handle: { x: 250, y: -38, width: 235, height: 36, radius: 18 },
    /** The trapezoid the dial sits in. */
    base: { topHalfWidth: 200, bottomHalfWidth: 300, depth: 430 },
  },

  /**
   * Half-width of the entire scoring zone, in degrees.
   *
   * ⬅ Resize the target here. Every band scales with it, and because the wedges and
   * the scoring are both generated from these numbers, they move together.
   */
  targetHalfWidthDeg: 24,

  /**
   * Scoring bands, innermost first. `edgeFraction` is each band's outer edge as a
   * fraction of `targetHalfWidthDeg`, so band N spans
   * bands[N-1].edgeFraction … bands[N].edgeFraction either side of centre.
   *
   * The outermost band must end at 1 — that's the edge of the target.
   */
  bands: [
    { edgeFraction: 0.2, score: 4, fill: "#5b8797", labelFill: "#f1ece2" },
    { edgeFraction: 0.6, score: 3, fill: "#dd5748", labelFill: "#16172f" },
    { edgeFraction: 1.0, score: 2, fill: "#e0ad42", labelFill: "#16172f" },
  ],

  /**
   * Rotations at which a full band group is drawn. The design has two, mirrored, so
   * an arbitrary wheel angle always brings one into the window.
   */
  bandGroupsDeg: [0, 180],

  palette: {
    pageBackground: "#edeae3",
    wheelFace: "#f1ece2",
    wheelPlateStroke: "#cdc7b9",
    wheelRimStroke: "#d8d2c4",

    cover: "#a3d6cd",
    coverHighlight: "#ffffff",
    coverHandle: "#8ec4bc",
    coverHandleStroke: "#6ea8a0",
    coverHandleGrip: "#5f9a93",

    housing: "#141733",
    speckleLight: "#f2efe6",
    speckleDark: "#e8e4d8",
    bezelShade: "#cfcabc",

    needle: "#b9373b",
    needleShadow: "#8f2a2d",

    buttonHighlight: "#e2585a",
    buttonMid: "#c8383c",
    buttonShadow: "#9d2225",
    buttonRing: "#8b1d20",
    buttonLabel: "#5e0f11",

    ink: "#16172f",
    muted: "#8d887e",
  },

  motion: {
    /** Per-frame easing of the cover toward its snap target. Higher = snappier. */
    coverLerp: 0.14,
    /** Degrees within which the cover is considered settled. */
    coverSnapEpsilonDeg: 0.3,
    /** Cover angle past which a release snaps open rather than closed. */
    coverOpenThresholdDeg: -90,
    /** Fully open cover angle. */
    coverOpenDeg: -180,
    /** Degrees of wheel rotation per unit of wheel-scroll delta. */
    scrollSensitivity: 0.18,
    /** How close to the needle a pointer must land to grab it instead of the wheel. */
    needleGrabDeg: 16,
    /** Pointer must land within this annulus to drag anything. */
    dragMinRadius: 66,
    dragMaxRadius: 320,
  },

  /** Tick scale drawn on the closed cover in pitch and intonation modes. */
  ticks: {
    /** Radius of the tick baseline; ticks extend inward from here. */
    outerRadius: 286,
    majorLength: 26,
    minorLength: 13,
    majorWidth: 3,
    minorWidth: 1.5,
    majorColor: "#4a8079",
    minorColor: "#5f9a93",
    labelColor: "#2f5f59",
    labelRadius: 242,
    labelSize: 19,
    /** Pitch mode: subdivisions drawn between adjacent semitones. */
    minorTicksPerSemitone: 4,
    /**
     * Pitch mode: label every Nth semitone. Raise it for wide ranges so labels don't
     * collide; 1 labels every semitone.
     */
    labelEverySemitones: 1,
    /** Pitch mode: above this many semitones, labels auto-thin to stay readable. */
    autoThinAboveSemitones: 14,
    /** Intonation mode: cents between labelled major ticks. */
    labelStepCents: 10,
    /** Intonation mode: minor ticks drawn between adjacent labels. */
    minorTicksPerLabel: 5,
    /** Minor ticks closer together than this are dropped rather than drawn as mush. */
    minMinorSpacingDeg: 1.6,
  },

  reveal: {
    /** How long the scored band pulses. */
    glowDurationMs: 3000,
    /** One full bright→dim→bright cycle. */
    glowPulseMs: 900,
    /** Blur radius of the glow filter. */
    glowBlur: 9,
    glowColor: "#ffffff",
  },

  confetti: {
    /** Fired only on a maximum score. */
    pieceCount: 160,
    /** Burst origin as a fraction of the viewport — roughly the dial's hub. */
    originX: 0.5,
    originY: 0.48,
    /** Initial speed range, px/s. */
    minSpeed: 420,
    maxSpeed: 900,
    /** Half-angle of the upward burst cone, in degrees. */
    spreadDeg: 62,
    /** Downward acceleration, px/s². */
    gravity: 900,
    /** Per-second velocity retention. Lower = more air resistance. */
    drag: 0.72,
    /** Piece lifetime range, seconds. */
    minLifetime: 1.6,
    maxLifetime: 2.8,
    minSize: 6,
    maxSize: 13,
    /** Spin rate range, revolutions/s. */
    minSpin: 0.4,
    maxSpin: 2.2,
    colors: ["#e0ad42", "#dd5748", "#5b8797", "#a3d6cd", "#b9373b", "#f1ece2"],
  },

  audio: {
    /** Passed through to usePitchDetector. */
    smoothingFrames: 5,
    holdMs: 250,
    updateIntervalMs: 40,
    minClarity: 0.88,
  },

  defaults: {
    /** Needle resting angle when a round starts, in degrees. */
    needleStartDeg: 0,
    /** Wheel angle on first load. */
    wheelStartDeg: 0,
  },
} as const;

export type DialConfig = typeof config;
