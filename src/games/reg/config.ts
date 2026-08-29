/**
 * Every tunable in the Random Excerpt Generator, in one place.
 *
 * The values here are the knobs the game was tuned with — spin feel, box placement,
 * name length — so tweaking the game never means hunting through components.
 */
export const config = {
  files: {
    /** Subdirectory of the origin's OPFS root. Namespaced so future games can use
     *  OPFS without colliding with this one's library. */
    opfsRoot: "reg",
    /** Extension allowlist, matched case-insensitively. Extensions rather than MIME
     *  types because drag-and-drop directory traversal sometimes yields files with an
     *  empty `type`. */
    imageExtensions: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"],
  },

  spin: {
    /** Total slot-machine spin length. */
    durationMs: 3000,
    /** Gap between texture swaps at full speed (spin start). */
    startIntervalMs: 70,
    /** Gap between swaps at the moment of landing. */
    endIntervalMs: 450,
    /** Curvature of the ease-out deceleration; higher = longer fast phase. */
    easeExponent: 2,
    /** Never fewer swaps than this, even with a short duration. */
    minSteps: 8,
    /** Above this many checked files, textures load per-spin instead of eagerly,
     *  so a huge library can't exhaust memory. */
    maxPreloadedTextures: 80,
  },

  scene: {
    /** MindAR face-mesh anchor 10 = top-center of the forehead — the "hat" anchor. */
    anchorIndex: 10,
    /** Local offset of the whole box from the anchor, in head space
     *  (face width = 1 unit): up one face-width, slightly forward of the crown. */
    boxOffset: { x: 0, y: 0.5, z: -0.5 },
    /** Target plane width for excerpt images, in head-space units. */
    imageWidth: 1.6,
    /** Tall images shrink to fit this height instead of towering. */
    maxImageHeight: 1.1,
    /** The shared line (group-local y) every image's bottom edge sits on,
     *  regardless of aspect ratio. */
    imageBottomY: 0,
    /** Vertical gap between the image's bottom edge and the caption's top edge. */
    captionGap: 0.08,
    /** No text block renders wider than this; long captions shrink to fit rather
     *  than being squeezed horizontally. */
    maxTextWidth: 1.8,
    /** Ceiling on supersampling of MindAR's render buffer. MindAR sizes the buffer to
     *  the camera frame and then CSS-stretches it, so the overlay needs raising to be
     *  legible — but MSAA at a huge buffer costs fill-rate on phones. */
    maxPixelRatio: 3,
    /** Caption (excerpt name) canvas-text styling. Canvas can't read CSS custom
     *  properties, so colors are literal here — keep them matching tokens.css. */
    caption: {
      fontPx: 48,
      /** Width at which text wraps to the next line. */
      maxWidthPx: 1024,
      /** Lines a caption may wrap onto before it just runs long. */
      maxLines: 2,
      color: "#f2f3f7",
      background: "rgba(13, 13, 22, 0.72)",
      /** Rendered height of one line of caption, in head-space units. */
      worldHeight: 0.18,
    },
    /** Intro text shown before the first spin. */
    intro: {
      text: "Random Excerpt Generator",
      fontPx: 64,
      maxWidthPx: 1280,
      maxLines: 2,
      color: "#f2f3f7",
      background: "rgba(13, 13, 22, 0.72)",
      /** Rendered height of one line of intro text, in head-space units. */
      worldHeight: 0.3,
    },
    /** MindAR one-euro filter knobs; undefined = library defaults. */
    filter: {
      minCF: undefined as number | undefined,
      beta: undefined as number | undefined,
    },
  },

  /** Bounds for the player-adjustable placement sliders in the settings panel.
   *  Offsets are in head space (face width = 1 unit); defaults come from
   *  `scene.boxOffset` and 100%. */
  tuning: {
    offsetX: { min: -1.5, max: 1.5, step: 0.05 },
    offsetY: { min: -0.5, max: 2.5, step: 0.05 },
    offsetZ: { min: -2, max: 1, step: 0.05 },
    scalePercent: { min: 50, max: 250, step: 5 },
    /** Dragging a slider fires ~60 events a second; the scene follows every one,
     *  but the storage write waits this long after the last change. */
    saveDebounceMs: 250,
  },

  names: {
    /** Longest excerpt caption before folders start being dropped. */
    maxLength: 100,
    /** Joins folder names and file name in the caption. */
    separator: " - ",
  },

  overlay: {
    /** Height-to-width ratio above which the enlarged excerpt stops being fitted to the
     *  screen and scrolls at full width instead. Fitting a tall strip of systems to the
     *  viewport height leaves it a few centimeters wide and unreadable. */
    scrollAboveRatio: 2,
  },

  reject: {
    /** navigator.vibrate pattern when SPIN is pressed with nothing checked. */
    vibratePattern: [60, 40, 60],
    /** Length of the visual shake on the SPIN button (desktop has no vibration). */
    shakeMs: 300,
  },
} as const;

export type RegConfig = typeof config;
