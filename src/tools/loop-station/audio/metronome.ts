import { config } from "../config";

/**
 * Metronome clicks, scheduled sample-accurately through the lookahead pattern.
 *
 * The grid is `anchor + k × beatSeconds` with beat one of each bar accented.
 * `scheduleWindow` is called every scheduler tick; `scheduledUntil` guarantees a
 * click is scheduled exactly once even though tick windows overlap. Clicks route
 * around the master chain — a muted master must not silence the count-in — but
 * into whatever output node the caller passes, so they share the master's final
 * stage and therefore its latency.
 */
export class Metronome {
  private readonly context: BaseAudioContext;
  private readonly gain: GainNode;
  private readonly accentClick: AudioBuffer;
  private readonly beatClick: AudioBuffer;

  private grid: {
    anchor: number;
    beatSeconds: number;
    beatsPerBar: number;
    accented: boolean;
  } | null = null;
  private scheduledUntil = 0;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = config.metronome.gain;
    this.gain.connect(output);
    this.accentClick = makeClick(context, config.metronome.accentHz);
    this.beatClick = makeClick(context, config.metronome.beatHz);
  }

  /**
   * Set (or change) the click grid. A changed grid starts scheduling afresh.
   *
   * `accented` false makes every click the plain voice — the count-in uses it,
   * so a downbeat can't imply the loop has already started. The grid *position*
   * is untouched, so accents resume exactly in step when recording begins.
   */
  setGrid(anchor: number, tempo: number, beatsPerBar: number, accented = true): void {
    const beatSeconds = 60 / tempo;
    const g = this.grid;
    if (
      g &&
      g.anchor === anchor &&
      g.beatSeconds === beatSeconds &&
      g.beatsPerBar === beatsPerBar &&
      g.accented === accented
    ) {
      return;
    }
    this.grid = { anchor, beatSeconds, beatsPerBar, accented };
    this.scheduledUntil = this.context.currentTime;
  }

  /** Silence. Clicks already scheduled inside the lookahead window still play. */
  clear(): void {
    this.grid = null;
  }

  /** Schedule every click in (scheduledUntil, until]. Called each scheduler tick. */
  scheduleWindow(until: number): void {
    if (!this.grid) return;
    const { anchor, beatSeconds, beatsPerBar, accented } = this.grid;
    const from = Math.max(this.context.currentTime, this.scheduledUntil);
    let k = Math.ceil((from - anchor) / beatSeconds - 1e-9);
    for (; anchor + k * beatSeconds <= until; k++) {
      const time = anchor + k * beatSeconds;
      if (time < from) continue;
      // Beats before the anchor (k < 0) only occur pre-loop; accent normally.
      const accent = accented && ((k % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
      const source = this.context.createBufferSource();
      source.buffer = accent ? this.accentClick : this.beatClick;
      source.connect(this.gain);
      source.start(time);
    }
    this.scheduledUntil = until;
  }
}

/** A short decaying sine — clickier than an oscillator envelope and cheaper. */
function makeClick(context: BaseAudioContext, frequency: number): AudioBuffer {
  const length = Math.ceil(config.metronome.clickSeconds * context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / context.sampleRate;
    const envelope = Math.exp(-t / (config.metronome.clickSeconds / 5));
    data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope;
  }
  return buffer;
}
