import type { Mesh, MeshBasicMaterial, CanvasTexture } from "three";
import type { RegConfig } from "../config";
import type { LoadedTexture } from "./textures";

/**
 * The "where the box goes" half of the filter: everything three.js and MindAR.
 *
 * MindAR owns the renderer, scene, camera, video element and tracking loop — this
 * module never re-implements any of it. It hangs one group off the forehead anchor
 * (which already carries head position, rotation and scale) and exposes a handful of
 * verbs for the React side: start, stop, where the box sits, what mode it's in, and
 * what it shows. React never touches a mesh.
 */

export type BoxMode = "intro" | "image";

/** Where the box sits relative to the head, and how big it is. */
export interface BoxPlacement {
  x: number;
  y: number;
  z: number;
  /** Uniform multiplier on the whole box — image and caption together. */
  scale: number;
}

export interface RegScene {
  /** Requests the camera and begins tracking. Rejects if permission is denied. */
  start(): Promise<void>;
  /** Halts the loop and releases the camera (webcam light off). */
  stop(): void;
  /** Live-tunable placement; safe to call every frame of a slider drag. */
  setPlacement(placement: BoxPlacement): void;
  setMode(mode: BoxMode): void;
  /** Show an excerpt image, bottom-aligned to the shared line above the head. */
  setImage(loaded: LoadedTexture): void;
  /** Caption under the image; null hides it. */
  setCaption(text: string | null): void;
  /** Is this viewport point on the excerpt image? False whenever it isn't showing. */
  hitTestImage(clientX: number, clientY: number): boolean;
}

type SceneConfig = RegConfig["scene"];
type TextStyle = SceneConfig["intro"] | SceneConfig["caption"];

export async function createRegScene(
  container: HTMLElement,
  cfg: SceneConfig,
  placement: BoxPlacement,
): Promise<RegScene> {
  // Both imports are dynamic so the 3D stack (three + MindAR's embedded tfjs and
  // face model) only ever loads on the filter screen, never during SSR.
  const [THREE, { MindARThree }] = await Promise.all([
    import("three"),
    import("mind-ar/dist/mindar-face-three.prod.js"),
  ]);

  const mindar = new MindARThree({
    container,
    // MindAR's own chrome is off because it appends its overlays to `document.body`,
    // not to our container, and `mindar.stop()` never hides them. Any teardown during
    // start() therefore left its 120px loader spinning in the body forever, over a page
    // whose camera screen had already unmounted. We render "Starting camera…" and our
    // own error card anyway, so these were only ever visible as that bug.
    uiLoading: "no",
    uiScanning: "no",
    uiError: "no",
    filterMinCF: cfg.filter.minCF ?? null,
    filterBeta: cfg.filter.beta ?? null,
  });
  const { renderer, scene, camera } = mindar;

  // Anisotropic filtering is the difference between readable and mushy notation once
  // the head tilts. Set as the module default rather than per texture because it is
  // part of three's texture cache key — changing it later reallocates the texture —
  // and every texture in this game is created after this line runs. getMaxAnisotropy
  // returns 0, not 1, when the extension is missing.
  THREE.Texture.DEFAULT_ANISOTROPY = Math.max(
    1,
    renderer.capabilities.getMaxAnisotropy(),
  );

  const anchor = mindar.addAnchor(cfg.anchorIndex);
  const box = new THREE.Group();
  anchor.group.add(box);

  const applyPlacement = (next: BoxPlacement) => {
    box.position.set(next.x, next.y, next.z);
    // Scale the group, not the planes: a node's own scale doesn't move its own
    // position, so the box stays planted at the offset and grows around its origin —
    // which is the image's bottom edge. No plane sizing needs recomputing.
    box.scale.setScalar(next.scale);
  };
  applyPlacement(placement);

  // Image plane: unit geometry, scaled per texture so every image's bottom edge
  // sits on the same head-space line no matter its aspect ratio.
  const imageMaterial = new THREE.MeshBasicMaterial({ transparent: true });
  const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), imageMaterial);
  imagePlane.visible = false;
  box.add(imagePlane);

  const makeTextPlane = () => {
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.visible = false;
    box.add(mesh);
    return mesh as Mesh & { material: MeshBasicMaterial };
  };
  const introPlane = makeTextPlane();
  const captionPlane = makeTextPlane();

  const setText = (
    plane: Mesh & { material: MeshBasicMaterial },
    text: string,
    style: TextStyle,
    position: "above" | "below",
  ) => {
    (plane.material.map as CanvasTexture | null)?.dispose();
    const canvas = drawTextCanvas(text, style);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    plane.material.map = texture;
    plane.material.needsUpdate = true;

    // One line's worth of canvas maps to `worldHeight`, so glyphs come out the same
    // physical size whether the caption wrapped or not.
    const pxPerUnit = singleLineHeight(style) / style.worldHeight;
    let worldW = canvas.width / pxPerUnit;
    let worldH = canvas.height / pxPerUnit;
    if (worldW > cfg.maxTextWidth) {
      // Shrink both axes together — squeezing one is what made long names look wrong.
      const shrink = cfg.maxTextWidth / worldW;
      worldW *= shrink;
      worldH *= shrink;
    }

    plane.scale.set(worldW, worldH, 1);
    plane.position.y =
      position === "above"
        ? cfg.imageBottomY + worldH / 2
        : cfg.imageBottomY - cfg.captionGap - worldH / 2;
  };

  setText(introPlane, cfg.intro.text, cfg.intro, "above");
  introPlane.visible = true;

  /**
   * Raise the render buffer to match what the canvas is actually displayed at.
   *
   * MindAR sizes the buffer to the *camera frame* and then CSS-stretches the canvas
   * to cover the container, so devicePixelRatio cancels out and the overlay is drawn
   * at whatever the webcam happens to offer — a 1280-wide stream on a 1920 viewport
   * is a 1.5x upscale. setPixelRatio re-runs setSize with updateStyle: false, so
   * MindAR's own CSS sizing is left alone, and the projection only depends on aspect,
   * which doesn't change.
   */
  const applyPixelRatio = () => {
    const cssWidth = parseFloat(renderer.domElement.style.width);
    const frameWidth = mindar.video?.videoWidth ?? 0;
    if (!(cssWidth > 0) || frameWidth <= 0) return;
    const needed = (cssWidth * window.devicePixelRatio) / frameWidth;
    renderer.setPixelRatio(Math.min(Math.max(needed, 1), cfg.maxPixelRatio));
  };

  // Reused across every hit test, including one per pointer move.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let resizeFrame = 0;
  const onResize = () => {
    // MindAR registered its own resize listener first, so its _resize has already
    // written the new CSS width by the time this runs. Coalesce to one per frame.
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(applyPixelRatio);
  };

  let started = false;
  // Teardown is reachable twice: the effect's cleanup can fire while start() is still
  // awaiting the camera, and the resolved start() then tears down again. Disposal must
  // not run twice.
  let stopped = false;

  /** Release the camera by hand, for the window where mindar.stop() would throw. */
  const releaseCamera = () => {
    const source = mindar.video?.srcObject;
    if (source instanceof MediaStream) {
      for (const track of source.getTracks()) track.stop();
    }
    mindar.video?.remove();
  };

  return {
    async start() {
      try {
        await mindar.start();
      } catch (error) {
        // Nothing was acquired, but the leaked resize listener still needs neutering.
        if (stopped) mindar.video = null;
        throw error;
      }

      if (stopped) {
        // Torn down while the camera was starting. stop() skipped mindar.stop() because
        // `started` was still false, so the tracks it has just acquired are live and
        // nothing else will ever release them — the webcam light would stay on.
        mindar.stop();
        mindar.video = null;
        return;
      }

      started = true;
      applyPixelRatio();
      window.addEventListener("resize", onResize);
      renderer.setAnimationLoop(() => renderer.render(scene, camera));
    },

    stop() {
      if (stopped) return;
      stopped = true;
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(resizeFrame);
      if (started) {
        mindar.stop();
        // MindAR binds its own resize listener inline, so it can never be removed, and
        // its guard only bails when `video` is falsy — stop() merely detaches the
        // element. Without this, a later resize runs setSize(0, 0) on the dead instance
        // and keeps this whole scene graph alive.
        mindar.video = null;
      } else {
        // Mid-start: mindar.stop() would throw reading tracks off a null srcObject, so
        // release whatever exists by hand. `video` is deliberately left in place —
        // _startVideo may still be awaiting getUserMedia, and nulling it makes its
        // `this.video.srcObject = stream` throw, stranding a live stream that nothing
        // holds a reference to and nothing can switch off. start() nulls it instead,
        // once the stream has actually been released.
        releaseCamera();
      }
      started = false;

      // Our own geometry, materials and text textures. The excerpt textures belong to
      // the TexturePool, which disposes them itself — never `imageMaterial.map` here.
      imagePlane.geometry.dispose();
      imageMaterial.dispose();
      for (const plane of [introPlane, captionPlane]) {
        (plane.material.map as CanvasTexture | null)?.dispose();
        plane.geometry.dispose();
        plane.material.dispose();
      }

      // Frees three's caches and its canvas listeners. Deliberately NOT followed by
      // `forceContextLoss()`: MindAR never removes the canvas it appended to the
      // container, so a torn-down instance's canvas is still in the DOM, still
      // absolutely positioned over the feed. Killing its context makes it paint as a
      // blank white sheet instead of staying transparent — which is a white screen
      // where the camera should be, every time in development, where Strict Mode
      // mounts twice. The context here is left to be collected with the canvas.
      renderer.dispose();
    },

    setPlacement: applyPlacement,

    setMode(mode) {
      introPlane.visible = mode === "intro";
      imagePlane.visible = mode === "image" && imageMaterial.map !== null;
      if (mode === "intro") captionPlane.visible = false;
    },

    setImage(loaded) {
      imageMaterial.map = loaded.texture;
      imageMaterial.needsUpdate = true;

      const planeW = Math.min(cfg.imageWidth, cfg.maxImageHeight * loaded.aspect);
      const planeH = planeW / loaded.aspect;
      imagePlane.scale.set(planeW, planeH, 1);
      imagePlane.position.y = cfg.imageBottomY + planeH / 2;
      imagePlane.visible = true;
    },

    setCaption(text) {
      if (text === null) {
        captionPlane.visible = false;
        return;
      }
      setText(captionPlane, text, cfg.caption, "below");
      captionPlane.visible = true;
    },

    /**
     * The excerpt moves with the head, so "did they click the image" is a real ray
     * cast rather than a rectangle check.
     *
     * Sound for two reasons worth not undoing: MindAR leaves the WebGL canvas free of
     * CSS transforms (only the <video> gets the mirroring), so canvas-rect coordinates
     * map straight onto what's drawn; and the render loop keeps world matrices at most
     * one frame stale. A far-turned head leaves the plane back-facing and the cast
     * misses, which is right — the excerpt isn't readable from there either.
     */
    hitTestImage(clientX, clientY) {
      if (!imagePlane.visible) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(imagePlane, false).length > 0;
    },
  };
}

const LINE_SPACING = 1.25;

function textFont(style: TextStyle): string {
  return `600 ${style.fontPx}px Poppins, system-ui, sans-serif`;
}

/** Canvas height of a one-line block, including padding — the world-scale reference. */
function singleLineHeight(style: TextStyle): number {
  return style.fontPx * LINE_SPACING + verticalPadding(style) * 2;
}

function verticalPadding(style: TextStyle): number {
  return style.fontPx * 0.35;
}

/**
 * Word-wrap into at most `maxLines` lines, breaking at `maxWidthPx`.
 *
 * Once the last allowed line is reached the rest is appended to it rather than
 * dropped — that line just runs long, and the caller shrinks the plane to fit. The
 * alternative, condensing glyphs to a maximum width, is what made long names look
 * distorted.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    const mustBreak =
      current !== "" &&
      ctx.measureText(candidate).width > maxWidthPx &&
      lines.length + 1 < maxLines;
    if (mustBreak) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

/** Render wrapped text to a canvas: rounded backdrop, centered lines. */
function drawTextCanvas(text: string, style: TextStyle): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = textFont(style);
  const padX = style.fontPx * 0.6;
  const padY = verticalPadding(style);
  const lineHeight = style.fontPx * LINE_SPACING;

  ctx.font = font;
  const lines = wrapText(ctx, text, style.maxWidthPx, style.maxLines);
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));

  canvas.width = Math.ceil(widest + padX * 2);
  canvas.height = Math.ceil(lineHeight * lines.length + padY * 2);

  // Resizing resets canvas state, so styles are set after.
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = style.background;
  const radius = Math.min(canvas.height / 4, canvas.width / 4);
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
  ctx.fill();

  ctx.fillStyle = style.color;
  lines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, padY + lineHeight * (index + 0.5));
  });

  return canvas;
}
