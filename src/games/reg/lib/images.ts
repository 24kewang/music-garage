import { readFileBlob } from "./opfs";

/**
 * Excerpt images as decoded DOM images, for the camera-free mode.
 *
 * The counterpart to `textures.ts`, which feeds the same files to WebGL. That one
 * deliberately has no object URLs to manage — an `ImageBitmap` needs none — whereas an
 * `<img>` does, so this is the one place in the game with URL lifetimes to get right:
 * every `dispose()` revokes, and the pool revokes everything it still holds on teardown.
 */

export interface LoadedImage {
  /** Decoded and ready; assigning its `src` to a rendered <img> paints immediately. */
  element: HTMLImageElement;
  /** width / height. */
  aspect: number;
  dispose(): void;
}

export async function loadImage(blob: Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob);
  const element = new Image();
  element.src = url;
  try {
    // Awaiting the decode is what keeps a mid-spin swap from flashing a blank frame —
    // the DOM equivalent of preloading a texture. A loaded-but-undecoded image still
    // costs a decode on first paint, and at 70ms a step that shows.
    await element.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return {
    element,
    aspect: element.naturalWidth / element.naturalHeight,
    dispose() {
      URL.revokeObjectURL(url);
    },
  };
}

/**
 * Cache of decoded images keyed by library path. Same contract as `TexturePool`:
 * `ensure` before a spin makes the swaps instant, `prune` after a selection change keeps
 * memory bounded.
 */
export class ImagePool {
  private images = new Map<string, LoadedImage>();
  private pending = new Map<string, Promise<void>>();
  private disposed = false;

  /** Load every path not already cached. Failures are skipped, not fatal. */
  async ensure(paths: readonly string[]): Promise<void> {
    await Promise.all(paths.map((path) => this.load(path)));
  }

  private load(path: string): Promise<void> {
    if (this.images.has(path)) return Promise.resolve();
    let inFlight = this.pending.get(path);
    if (!inFlight) {
      inFlight = readFileBlob(path)
        .then(loadImage)
        .then((loaded) => {
          this.pending.delete(path);
          // The pool may have been torn down while this load was in flight.
          if (this.disposed) loaded.dispose();
          else this.images.set(path, loaded);
        })
        .catch(() => {
          this.pending.delete(path);
        });
      this.pending.set(path, inFlight);
    }
    return inFlight;
  }

  get(path: string): LoadedImage | undefined {
    return this.images.get(path);
  }

  /** Drop (and revoke) everything not in `keep`. */
  prune(keep: ReadonlySet<string>): void {
    for (const [path, loaded] of this.images) {
      if (!keep.has(path)) {
        loaded.dispose();
        this.images.delete(path);
      }
    }
  }

  disposeAll(): void {
    this.disposed = true;
    for (const loaded of this.images.values()) loaded.dispose();
    this.images.clear();
  }
}
