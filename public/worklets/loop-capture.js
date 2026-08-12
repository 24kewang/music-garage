/**
 * Always-on capture worklet for the Loop Station.
 *
 * Keeps the last N seconds of mic input in a ring buffer, stamped by the audio
 * clock's own frame counter, so button presses are *time marks* rather than
 * recording boundaries — extraction happens after the fact, with padding.
 *
 * Plain JS on purpose: worklets are loaded by URL (`/worklets/loop-capture.js`),
 * outside the app bundle. Kept dumb — all decisions (onset detection, offsets,
 * windows) happen on the main thread in testable TypeScript; this file only
 * moves samples. Communication is postMessage, not SharedArrayBuffer, because
 * SAB needs COOP/COEP headers that would break the REG game's cross-origin
 * model fetches; extraction happens once per recording, so one copy is nothing.
 *
 * Messages in:
 *   { type: "extract", id, startFrame, endFrame }
 *       → replies { type: "segment", id, samples } (transferred) once endFrame
 *         has been written; queued until then. Frames the ring no longer holds
 *         (or that precede the stream) come back as silence.
 *   { type: "calibrate", on }
 *       → switches level posts from every `levelEveryBlocks` blocks to every
 *         block, so main-thread onset detection gets ~2.7ms resolution.
 *
 * Messages out:
 *   { type: "start", frame, time }        — once; maps currentTime ↔ frame.
 *   { type: "level", time, rms, peak }    — peak drives the meter, rms drives
 *                                           calibration's onset detection.
 */
class LoopCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.ringFrames = opts.ringFrames || sampleRate * 70;
    this.levelEveryBlocks = opts.levelEveryBlocks || 8;
    this.ring = new Float32Array(this.ringFrames);
    this.startFrame = -1;
    this.writeFrame = 0;
    this.blockCount = 0;
    this.calibrating = false;
    this.pending = [];

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "extract") {
        this.pending.push(msg);
        this.flushPending();
      } else if (msg.type === "calibrate") {
        this.calibrating = !!msg.on;
      }
    };
  }

  flushPending() {
    const ready = [];
    const waiting = [];
    for (const req of this.pending) {
      (req.endFrame <= this.writeFrame ? ready : waiting).push(req);
    }
    this.pending = waiting;
    for (const req of ready) {
      const length = Math.max(0, req.endFrame - req.startFrame);
      const samples = new Float32Array(length);
      const oldest = this.writeFrame - this.ringFrames;
      for (let i = 0; i < length; i++) {
        const frame = req.startFrame + i;
        // Silence for frames before the stream began or already overwritten.
        if (frame >= this.startFrame && frame >= oldest && frame < this.writeFrame) {
          samples[i] = this.ring[((frame % this.ringFrames) + this.ringFrames) % this.ringFrames];
        }
      }
      this.port.postMessage({ type: "segment", id: req.id, samples }, [samples.buffer]);
    }
  }

  process(inputs) {
    if (this.startFrame < 0) {
      // currentFrame/currentTime are AudioWorkletGlobalScope globals; this pair
      // is what lets the main thread convert press times into frame numbers.
      this.startFrame = currentFrame;
      this.writeFrame = currentFrame;
      this.port.postMessage({ type: "start", frame: currentFrame, time: currentTime });
    }

    const channel = inputs[0] && inputs[0][0];
    const blockTime = currentTime;
    let sumSquares = 0;
    let peak = 0;

    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const sample = channel[i];
        this.ring[(this.writeFrame + i) % this.ringFrames] = sample;
        sumSquares += sample * sample;
        const magnitude = sample < 0 ? -sample : sample;
        if (magnitude > peak) peak = magnitude;
      }
      this.writeFrame += channel.length;
    } else {
      // No input this quantum: write real silence so an extraction spanning the
      // gap doesn't resurrect stale audio from a ring lap ago.
      for (let i = 0; i < 128; i++) {
        this.ring[(this.writeFrame + i) % this.ringFrames] = 0;
      }
      this.writeFrame += 128;
    }

    this.blockCount++;
    const every = this.calibrating ? 1 : this.levelEveryBlocks;
    if (this.blockCount % every === 0) {
      const rms = channel ? Math.sqrt(sumSquares / channel.length) : 0;
      this.port.postMessage({ type: "level", time: blockTime, rms, peak });
    }

    if (this.pending.length > 0) this.flushPending();

    return true;
  }
}

registerProcessor("loop-capture", LoopCaptureProcessor);
