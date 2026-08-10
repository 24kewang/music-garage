import type { Texture } from "three";
import { readFileBlob } from "./opfs";

/**
 * Excerpt images as GPU textures.
 *
 * Decoding goes blob → ImageBitmap → CanvasTexture, so no object URLs exist to
 * revoke. `three` is only imported at runtime inside the loader — nothing here
 * drags the 3D stack into pages that never reach the filter screen.
 */

export interface LoadedTexture {
  texture: Texture;
  /** width / height — what bottom-aligned plane sizing needs. */
  aspect: number;
  dispose(): void;
}

export async function loadTexture(blob: Blob): Promise<LoadedTexture> {
  const [{ CanvasTexture, SRGBColorSpace }, bitmap] = await Promise.all([
    import("three"),
    // `imageOrientation: "flipY"` is load-bearing, and its absence is silent.
    // three sets UNPACK_FLIP_Y_WEBGL from `texture.flipY`, but WebGL *ignores* that
    // flag for ImageBitmap sources — orientation is baked in at decode time. Without
    // this the excerpt arrives with its top row at v=0 and renders upside-down, while
    // the canvas-drawn text planes (which do honour flipY) look fine.
    createImageBitmap(blob, {
      imageOrientation: "flipY",
      colorSpaceConversion: "none",
    }),
  ]);
  const texture = new CanvasTexture(bitmap);
  // Already flipped above; false keeps it correct if a browser ever honours the flag.
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  return {
    texture,
    aspect: bitmap.width / bitmap.height,
    dispose() {
      texture.dispose();
      bitmap.close();
    },
  };
}

/**
 * Cache of loaded textures keyed by library path. `ensure` before a spin makes the
 * swaps instant; `prune` after a selection change keeps memory bounded.
 */
export class TexturePool {
  private textures = new Map<string, LoadedTexture>();
  private pending = new Map<string, Promise<void>>();
  private disposed = false;

  /** Load every path not already cached. Failures are skipped, not fatal. */
  async ensure(paths: readonly string[]): Promise<void> {
    await Promise.all(paths.map((path) => this.load(path)));
  }

  private load(path: string): Promise<void> {
    if (this.textures.has(path)) return Promise.resolve();
    let inFlight = this.pending.get(path);
    if (!inFlight) {
      inFlight = readFileBlob(path)
        .then(loadTexture)
        .then((loaded) => {
          this.pending.delete(path);
          // The pool may have been torn down while this load was in flight.
          if (this.disposed) loaded.dispose();
          else this.textures.set(path, loaded);
        })
        .catch(() => {
          this.pending.delete(path);
        });
      this.pending.set(path, inFlight);
    }
    return inFlight;
  }

  get(path: string): LoadedTexture | undefined {
    return this.textures.get(path);
  }

  /** Drop (and dispose) everything not in `keep`. */
  prune(keep: ReadonlySet<string>): void {
    for (const [path, loaded] of this.textures) {
      if (!keep.has(path)) {
        loaded.dispose();
        this.textures.delete(path);
      }
    }
  }

  disposeAll(): void {
    this.disposed = true;
    for (const loaded of this.textures.values()) loaded.dispose();
    this.textures.clear();
  }
}
