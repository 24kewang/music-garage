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
  /** Set during calibration to receive every ~2.7ms block's RMS. */
  onLevel: ((time: number, rms: number) => void) | null = null;

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
        this.onLevel?.(msg.time, msg.rms);
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

  setCalibrating(on: boolean): void {
    this.node.port.postMessage({ type: "calibrate", on });
  }

  dispose(): void {
    this.node.port.onmessage = null;
    this.pending.clear();
  }
}
