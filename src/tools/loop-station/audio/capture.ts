/**
 * Main-thread side of the capture worklet: converts `currentTime` marks into
 * frame numbers and turns extraction requests into promises.
 */
export class CaptureBus {
  private readonly node: AudioWorkletNode;
  private readonly sampleRate: number;
  /** The worklet's first block: frame number ↔ context time. */
  private origin: { frame: number; time: number } | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, (samples: Float32Array) => void>();

  /** Latest input peak from the worklet, for the meter. */
  peak = 0;
  /**
   * Subscribers to the per-block RMS. Two features want it — calibration and
   * auto-detect — so the detailed-level mode is reference-counted rather than
   * flag-based; otherwise whichever finished last would switch it off under
   * the other.
   */
  private readonly levelListeners = new Set<(time: number, rms: number) => void>();

  constructor(node: AudioWorkletNode, sampleRate: number) {
    this.node = node;
    this.sampleRate = sampleRate;
    node.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "start") {
        this.origin = { frame: msg.frame, time: msg.time };
      } else if (msg.type === "level") {
        this.peak = msg.peak;
        // Onset detection wants RMS — a peak is too twitchy to threshold on.
        for (const listener of this.levelListeners) listener(msg.time, msg.rms);
      } else if (msg.type === "segment") {
        const resolve = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve?.(msg.samples);
      }
    };
  }

  private frameAt(time: number): number {
    if (!this.origin) return 0;
    return this.origin.frame + Math.round((time - this.origin.time) * this.sampleRate);
  }

  /**
   * Extract `[fromTime, toTime)` from the ring. Resolves once the worklet has
   * written up to `toTime` — immediately for the past, later for a window
   * extending into the future (the post-roll padding).
   */
  extract(fromTime: number, toTime: number): Promise<Float32Array> {
    const id = this.nextRequestId++;
    const startFrame = this.frameAt(fromTime);
    const endFrame = this.frameAt(toTime);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.node.port.postMessage({ type: "extract", id, startFrame, endFrame });
    });
  }

  /**
   * Receive every ~2.7ms block's RMS for as long as the returned unsubscribe
   * hasn't been called. The worklet only posts at that rate while somebody is
   * listening.
   */
  addLevelListener(listener: (time: number, rms: number) => void): () => void {
    this.levelListeners.add(listener);
    if (this.levelListeners.size === 1) this.setDetailedLevel(true);
    return () => {
      this.levelListeners.delete(listener);
      if (this.levelListeners.size === 0) this.setDetailedLevel(false);
    };
  }

  private setDetailedLevel(on: boolean): void {
    this.node.port.postMessage({ type: "detail", on });
  }

  dispose(): void {
    this.node.port.onmessage = null;
    this.levelListeners.clear();
    this.pending.clear();
  }
}
