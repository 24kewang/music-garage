/**
 * Capture worklet for MUSIC.
 *
 * Records forward from the moment the node is connected and streams the samples to
 * the main thread in coalesced chunks, alongside one RMS reading per 128-frame block
 * for the onset gate and the level meter.
 *
 * Plain JS on purpose: worklets are loaded by URL (`/worklets/music-capture.js`),
 * outside the app bundle. And kept dumb, the same rule the Loop Station's worklet
 * follows — every decision (when a take starts, where to cut it, when the cap is up)
 * happens on the main thread in TypeScript that has tests. This file only moves
 * samples.
 *
 * Simpler than `loop-capture.js` and deliberately not sharing it: that one keeps a
 * ring buffer so button presses can be treated as time marks and audio extracted
 * from the *past*. MUSIC never looks backwards — a take runs from a press to a stop —
 * so a ring buffer would be machinery with nothing to do.
 *
 * Communication is postMessage rather than SharedArrayBuffer, because SAB needs
 * COOP/COEP headers that would break the REG game's cross-origin model fetches.
 * Chunks are transferred, so the copy is a pointer hand-off rather than the samples.
 *
 * Messages out:
 *   { type: "start", frame, time }   — once; maps the audio clock to a frame number.
 *   { type: "level", time, rms }     — every block, ~2.7 ms at 48 kHz.
 *   { type: "chunk", samples, final } — transferred.
 *
 * Messages in:
 *   { type: "stop" }                 — flush whatever is left, marked final.
 */
class MusicCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    // A whole number of 128-frame quanta, so a chunk boundary never splits a block.
    this.chunkFrames = opts.chunkFrames || 2048;
    this.chunk = new Float32Array(this.chunkFrames);
    this.filled = 0;
    this.started = false;
    this.stopped = false;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "stop") {
        this.stopped = true;
        this.flush(true);
      }
    };
  }

  flush(final) {
    if (this.filled === 0 && !final) return;

    const samples = this.chunk.slice(0, this.filled);
    this.chunk = new Float32Array(this.chunkFrames);
    this.filled = 0;
    this.port.postMessage({ type: "chunk", samples, final: !!final }, [samples.buffer]);
  }

  process(inputs) {
    if (this.stopped) {
      // Returning false lets the node be collected once the graph disconnects it.
      return false;
    }

    if (!this.started) {
      this.started = true;
      // currentFrame and currentTime are AudioWorkletGlobalScope globals. This pair
      // is what lets the main thread turn an onset time into a sample index.
      this.port.postMessage({ type: "start", frame: currentFrame, time: currentTime });
    }

    const channel = inputs[0] && inputs[0][0];
    const blockTime = currentTime;

    let sumSquares = 0;
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        const sample = channel[i];
        sumSquares += sample * sample;
        this.chunk[this.filled + i] = sample;
      }
      this.filled += channel.length;
    } else {
      // No input this quantum. Write real silence rather than leaving whatever the
      // buffer held, so a gap does not resurrect stale audio.
      for (let i = 0; i < 128; i++) this.chunk[this.filled + i] = 0;
      this.filled += 128;
    }

    if (this.filled >= this.chunkFrames) this.flush(false);

    // Every block, always: the onset gate needs the resolution, and this is one
    // very small message. There is no coarse mode because the node only exists
    // while a take is armed.
    this.port.postMessage({
      type: "level",
      time: blockTime,
      rms: channel ? Math.sqrt(sumSquares / channel.length) : 0,
    });

    return true;
  }
}

registerProcessor("music-capture", MusicCaptureProcessor);
