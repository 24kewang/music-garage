import { config } from "../config";
import type { BusState, SessionState } from "../lib/session";
import { CaptureBus } from "./capture";
import { Metronome } from "./metronome";
import { makeImpulseResponse } from "./reverb";

/**
 * The audio engine: one `AudioContext` for capture *and* playback, so input and
 * output share the hardware sample clock and cannot drift apart over minutes.
 *
 * Graph:
 *
 *   mic → capture worklet                                (never to the speakers)
 *   track src → srcFade → trackVol → busInput            (dry)
 *                          trackVol → trackSend → reverbIn
 *   busInput → busVol → masterIn                          (dry)
 *              busVol → busSend → reverbIn
 *   reverbIn → convolver → reverbReturn → masterIn
 *   masterIn → masterVol → limiter → destination
 *   metronome ──────────────────────↗    (bypasses the master, shares the limiter)
 *
 * One convolver for the whole instrument, fed by sends: per-track convolver
 * inserts would each smear their tail across the loop seam, and a shared
 * send/return is also far cheaper.
 *
 * Buffer swaps are phase-preserving rather than boundary-queued: every baked
 * buffer is exactly one master loop long, so the right offset is computable at
 * any instant, and a short equal-power crossfade makes the switch inaudible.
 * A delay slider therefore feels live instead of waiting up to a whole loop.
 */

interface EngineTrack {
  volume: GainNode;
  send: GainNode;
  active: { source: AudioBufferSourceNode; fade: GainNode } | null;
  buffer: AudioBuffer | null;
  busId: number;
}

interface EngineBus {
  input: GainNode;
  volume: GainNode;
  send: GainNode;
  analyser: AnalyserNode;
}

export class LoopEngine {
  readonly context: AudioContext;
  readonly capture: CaptureBus;
  readonly metronome: Metronome;

  private readonly stream: MediaStream;
  private readonly micSource: MediaStreamAudioSourceNode;
  private readonly workletNode: AudioWorkletNode;
  private readonly masterIn: GainNode;
  private readonly masterVol: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly masterAnalyser: AnalyserNode;
  private readonly reverbIn: GainNode;
  private readonly reverbReturn: GainNode;

  private readonly tracks = new Map<number, EngineTrack>();
  private readonly buses = new Map<number, EngineBus>();
  private readonly meterFrame = new Float32Array(512);

  private transport: { anchor: number; loopSeconds: number } | null = null;

  private constructor(context: AudioContext, stream: MediaStream) {
    this.context = context;
    this.stream = stream;

    this.micSource = context.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(context, "loop-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: {
        ringFrames: Math.ceil(
          (config.transport.maxLoopSeconds +
            2 * config.capture.padSeconds +
            config.capture.ringSlackSeconds) *
            context.sampleRate,
        ),
        levelEveryBlocks: config.capture.levelEveryBlocks,
      },
    });
    // Deliberately no route to the destination — monitoring the mic would feed back.
    this.micSource.connect(this.workletNode);
    this.capture = new CaptureBus(this.workletNode, context.sampleRate);

    // Soft limiter on the way out: the master fader boosts past unity and the
    // reverb return is loud, so the sum can exceed full scale — where the
    // browser would hard-clip it into distortion rather than loudness.
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = config.limiter.thresholdDb;
    this.limiter.knee.value = config.limiter.kneeDb;
    this.limiter.ratio.value = config.limiter.ratio;
    this.limiter.attack.value = config.limiter.attackSeconds;
    this.limiter.release.value = config.limiter.releaseSeconds;
    this.limiter.connect(context.destination);

    this.masterVol = context.createGain();
    this.masterVol.connect(this.limiter);
    this.masterIn = context.createGain();
    this.masterIn.connect(this.masterVol);
    // Tapped post-limiter, so the meter shows what actually leaves the station
    // — a meter pinned at the top is then an honest "you're driving it too hard".
    this.masterAnalyser = context.createAnalyser();
    this.masterAnalyser.fftSize = 1024;
    this.limiter.connect(this.masterAnalyser);

    this.reverbIn = context.createGain();
    const convolver = context.createConvolver();
    convolver.buffer = makeImpulseResponse(context);
    this.reverbReturn = context.createGain();
    this.reverbIn.connect(convolver);
    convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.masterIn);

    // Into the limiter rather than straight to the destination: the click still
    // bypasses the master fader, mute and reverb (a muted master must not
    // silence a count-in), but it shares the output stage. The compressor adds
    // a few ms of lookahead latency, and calibration would mis-compensate if
    // the clicks it measures skipped a delay the loops go through.
    this.metronome = new Metronome(context, this.limiter);
  }

  /**
   * Requests the microphone (the permission prompt this page opens with) and
   * builds the graph. The context may come back `suspended` — autoplay policy
   * wants a gesture — in which case the caller shows a tap-to-start gate.
   */
  static async create(): Promise<LoopEngine> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException(
        "Microphone access needs a secure origin (https or localhost).",
        "SecurityError",
      );
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // All three mangle recordings and calibration. Same rule as shared audio.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    // Device-native sample rate; forcing one would add a resampling stage.
    const context = new AudioContext();
    try {
      await context.audioWorklet.addModule("/worklets/loop-capture.js");
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      await context.close().catch(() => {});
      throw error;
    }
    return new LoopEngine(context, stream);
  }

  now(): number {
    return this.context.currentTime;
  }

  async resume(): Promise<void> {
    if (this.context.state === "suspended") await this.context.resume();
  }

  /** The mic's device label, for the Bluetooth warning heuristic. */
  inputLabel(): string {
    return this.stream.getAudioTracks()[0]?.label ?? "";
  }

  onInputEnded(handler: () => void): void {
    this.stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", handler);
    });
  }

  // -------------------------------------------------------------------------
  // Topology

  /** Create/remove bus nodes to match state. Idempotent; called after dispatch. */
  syncBuses(buses: readonly BusState[]): void {
    for (const bus of buses) {
      if (this.buses.has(bus.id)) continue;
      const input = this.context.createGain();
      const volume = this.context.createGain();
      const send = this.context.createGain();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      input.connect(volume);
      volume.connect(this.masterIn);
      volume.connect(send);
      send.connect(this.reverbIn);
      volume.connect(analyser);
      this.buses.set(bus.id, { input, volume, send, analyser });
    }
    for (const [id, bus] of this.buses) {
      if (buses.some((b) => b.id === id)) continue;
      bus.input.disconnect();
      bus.volume.disconnect();
      bus.send.disconnect();
      this.buses.delete(id);
    }
  }

  ensureTrack(trackId: number, busId: number): void {
    if (this.tracks.has(trackId)) {
      this.setTrackBus(trackId, busId);
      return;
    }
    const volume = this.context.createGain();
    const send = this.context.createGain();
    volume.connect(send);
    send.connect(this.reverbIn);
    const bus = this.buses.get(busId);
    if (bus) volume.connect(bus.input);
    this.tracks.set(trackId, { volume, send, active: null, buffer: null, busId });
  }

  setTrackBus(trackId: number, busId: number): void {
    const track = this.tracks.get(trackId);
    if (!track || track.busId === busId) return;
    const from = this.buses.get(track.busId);
    const to = this.buses.get(busId);
    if (from) track.volume.disconnect(from.input);
    if (to) track.volume.connect(to.input);
    track.busId = busId;
  }

  removeTrack(trackId: number): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    this.stopSource(track, this.context.currentTime);
    track.volume.disconnect();
    track.send.disconnect();
    this.tracks.delete(trackId);
  }

  // -------------------------------------------------------------------------
  // Playback

  /** Wrap a mono baked buffer for playback. */
  toAudioBuffer(samples: Float32Array): AudioBuffer {
    const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    return buffer;
  }

  /**
   * Give a track a (new) buffer. While the transport runs, the new source starts
   * a moment from now at the exact current loop phase, crossfading over the old
   * one — the master timeline never hiccups.
   */
  setTrackBuffer(trackId: number, buffer: AudioBuffer): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    track.buffer = buffer;
    if (!this.transport) return;

    const start = this.context.currentTime + config.mix.swapLeadSeconds;
    const fadeSeconds = config.mix.swapFadeSeconds;
    this.startSource(track, buffer, start, fadeSeconds);
  }

  startTransport(anchor: number, loopSeconds: number): void {
    this.transport = { anchor, loopSeconds };
    const start = this.context.currentTime + config.mix.swapLeadSeconds;
    for (const track of this.tracks.values()) {
      if (track.buffer) this.startSource(track, track.buffer, start, 0.003);
    }
  }

  stopTransport(): void {
    this.transport = null;
    const at = this.context.currentTime;
    for (const track of this.tracks.values()) {
      this.stopSource(track, at);
    }
  }

  /** Loop phase for the UI playhead, in [0, 1), or null while stopped. */
  playheadFraction(): number | null {
    if (!this.transport) return null;
    const { anchor, loopSeconds } = this.transport;
    const raw = ((this.context.currentTime - anchor) / loopSeconds) % 1;
    return raw < 0 ? raw + 1 : raw;
  }

  private startSource(
    track: EngineTrack,
    buffer: AudioBuffer,
    start: number,
    fadeSeconds: number,
  ): void {
    if (!this.transport) return;
    const { anchor, loopSeconds } = this.transport;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const fade = this.context.createGain();
    source.connect(fade);
    fade.connect(track.volume);

    let offset = (((start - anchor) % loopSeconds) + loopSeconds) % loopSeconds;
    // The baked buffer is the loop's length give or take a rounding; keep the
    // offset strictly inside it.
    offset = Math.min(offset, Math.max(0, buffer.duration - 1e-4));

    fade.gain.setValueAtTime(0, start);
    fade.gain.linearRampToValueAtTime(1, start + fadeSeconds);
    source.start(start, offset);

    const previous = track.active;
    if (previous) {
      previous.fade.gain.setValueAtTime(1, start);
      previous.fade.gain.linearRampToValueAtTime(0, start + fadeSeconds);
      previous.source.stop(start + fadeSeconds + 0.02);
    }
    track.active = { source, fade };
  }

  private stopSource(track: EngineTrack, at: number): void {
    const active = track.active;
    if (!active) return;
    // A tiny ramp so a mid-wave cut doesn't click.
    active.fade.gain.setTargetAtTime(0, at, config.mix.rampSeconds);
    active.source.stop(at + config.mix.rampSeconds * 4 + 0.02);
    track.active = null;
  }

  // -------------------------------------------------------------------------
  // Gains — recomputed wholesale from state after every dispatch; idempotent.

  applyGains(state: SessionState): void {
    const at = this.context.currentTime;
    const ramp = config.mix.rampSeconds;
    const anySolo = state.tracks.some((t) => t.soloed);

    for (const trackState of state.tracks) {
      const track = this.tracks.get(trackState.id);
      if (!track) continue;
      const busMuted = state.buses.find((b) => b.id === trackState.busId)?.muted ?? false;
      const audible = !trackState.muted && (!anySolo || trackState.soloed);
      const gain = audible ? (trackState.volume / 100) * config.mix.maxGain : 0;
      track.volume.gain.setTargetAtTime(gain, at, ramp);
      // The dry path dies with the bus, but the track send feeds the shared
      // reverb directly — zero it under a muted bus so the tail dies too.
      const send = audible && !busMuted ? trackState.reverb / 100 : 0;
      track.send.gain.setTargetAtTime(send, at, ramp);
    }

    for (const busState of state.buses) {
      const bus = this.buses.get(busState.id);
      if (!bus) continue;
      const gain = busState.muted ? 0 : (busState.volume / 100) * config.mix.maxGain;
      bus.volume.gain.setTargetAtTime(gain, at, ramp);
      bus.send.gain.setTargetAtTime(busState.muted ? 0 : busState.reverb / 100, at, ramp);
    }

    const master = state.master.muted ? 0 : (state.master.volume / 100) * config.mix.maxGain;
    this.masterVol.gain.setTargetAtTime(master, at, ramp);
    this.reverbReturn.gain.setTargetAtTime(
      (state.master.reverb / 100) * config.reverb.maxReturnGain,
      at,
      ramp,
    );
  }

  // -------------------------------------------------------------------------
  // Meters

  /** Peak amplitude at a bus's post-fader tap, 0..1. */
  busLevel(busId: number): number {
    const bus = this.buses.get(busId);
    return bus ? this.analyserPeak(bus.analyser) : 0;
  }

  masterLevel(): number {
    return this.analyserPeak(this.masterAnalyser);
  }

  inputLevel(): number {
    return this.capture.peak;
  }

  /**
   * Peak rather than RMS: RMS sits far below the signal's actual reach, which
   * is half of why the meters barely moved. The caller maps this to dB.
   */
  private analyserPeak(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.meterFrame as Float32Array<ArrayBuffer>);
    let peak = 0;
    const n = Math.min(analyser.fftSize, this.meterFrame.length);
    for (let i = 0; i < n; i++) {
      const v = Math.abs(this.meterFrame[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }

  // -------------------------------------------------------------------------

  dispose(): void {
    this.stopTransport();
    this.metronome.clear();
    this.capture.dispose();
    this.stream.getTracks().forEach((track) => track.stop());
    this.micSource.disconnect();
    this.workletNode.disconnect();
    this.context.close().catch(() => {});
  }
}
