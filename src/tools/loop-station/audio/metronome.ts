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
 *
 * Everything already scheduled is remembered, because a grid change has to be
 * able to take it back: the lookahead runs 100ms ahead, so at the count-in →
 * recording handover the first beat would otherwise already be booked under the
 * old grid and get booked again under the new one — an audible flam on the most
 * important click in the interaction.
 */
export class Metronome {
  private readonly context: BaseAudioContext;
  private readonly gain: GainNode;
  private readonly accentClick: AudioBuffer;
  private readonly beatClick: AudioBuffer;

  private grid: { anchor: number; beatSeconds: number; beatsPerBar: number } | null = null;
  private scheduledUntil = 0;
  /** Clicks booked but not yet played, so a grid change can cancel them. */
  private booked: { time: number; source: AudioBufferSourceNode }[] = [];

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = config.metronome.gain;
    this.gain.connect(output);
    this.accentClick = makeClick(context, config.metronome.accentHz);
    this.beatClick = makeClick(context, config.metronome.beatHz);
  }

  /**
   * Set (or change) the click grid. A changed grid takes back anything it has
   * already booked and starts scheduling afresh.
   *
   * Beat 1 of every bar is accented, always. The count-in needs no special case:
   * it is snapped to a bar line of this same grid and lasts exactly one bar, so
   * ordinary accenting puts an accent on its first click, none on the rest, and
   * resumes in step the moment recording starts.
   */
  setGrid(anchor: number, tempo: number, beatsPerBar: number): void {
    const beatSeconds = 60 / tempo;
    const g = this.grid;
    if (g && g.anchor === anchor && g.beatSeconds === beatSeconds && g.beatsPerBar === beatsPerBar) {
      return;
    }
    this.grid = { anchor, beatSeconds, beatsPerBar };
    this.cancelBooked();
    this.scheduledUntil = this.context.currentTime;
  }

  /** Silence, including clicks already booked inside the lookahead window. */
  clear(): void {
    this.grid = null;
    this.cancelBooked();
  }

  /** Schedule every click in (scheduledUntil, until]. Called each scheduler tick. */
  scheduleWindow(until: number): void {
    if (!this.grid) return;
    const { anchor, beatSeconds, beatsPerBar } = this.grid;
    const from = Math.max(this.context.currentTime, this.scheduledUntil);
    let k = Math.ceil((from - anchor) / beatSeconds - 1e-9);
    for (; anchor + k * beatSeconds <= until; k++) {
      const time = anchor + k * beatSeconds;
      if (time < from) continue;
      // Beats before the anchor (k < 0) only occur pre-loop; accent normally.
      const accent = ((k % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
      const source = this.context.createBufferSource();
      source.buffer = accent ? this.accentClick : this.beatClick;
      source.connect(this.gain);
      source.start(time);
      this.booked.push({ time, source });
    }
    this.scheduledUntil = until;
  }

  /** Stop anything booked that hasn't sounded yet, and forget what has. */
  private cancelBooked(): void {
    const now = this.context.currentTime;
    for (const { time, source } of this.booked) {
      if (time <= now) continue;
      try {
        source.stop();
      } catch {
        // Already stopped or never started; nothing to take back.
      }
    }
    this.booked = [];
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
