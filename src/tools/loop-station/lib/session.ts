import { config } from "../config";
import { moveItem } from "./reorder";
import {
  divisorsOf,
  freeModeTempo,
  loopLengthSeconds,
  nextPartitionBoundary,
  partitionLength,
  phaseAt,
  spawnLoopEnd,
} from "./transport";

/**
 * The loop station's state machine, as a pure reducer over
 * `(state, event, audioTime)`.
 *
 * Audio buffers never enter this module — recordings are referred to by segment id,
 * and the reducer returns *effects* telling the audio layer what to do (extract a
 * window from the ring buffer, re-bake a track, start the transport). That split is
 * what lets every discard, cancel and graduation rule in the spec be pinned by a
 * Node test instead of discovered in a browser.
 *
 * Times are `AudioContext.currentTime` values throughout. The reducer computes
 * boundary times *exactly* (from the anchor, never accumulated), so a clock event
 * arriving 25ms late still extracts sample-exact windows.
 */

// ---------------------------------------------------------------------------
// State

export interface OverwriteState {
  segmentId: number;
  /** Loop phase where the punch-in starts/ends, seconds. `endPhase` may equal the loop length. */
  startPhase: number;
  endPhase: number;
  /** Alignment nudge for the overwrite content only, independent of the track's. */
  delayMs: number;
}

export interface TrackState {
  id: number;
  name: string;
  busId: number;
  /** Repetitions tiled across the loop — the multiplier at record time. */
  reps: number;
  /** The padded recording this track plays, by id. Untouched by overwrites. */
  segmentId: number;
  /** Content seconds inside the padded segment (one repetition). */
  segmentSeconds: number;
  /** Alignment nudge for the whole original recording, ±padSeconds. */
  delayMs: number;
  volume: number;
  reverb: number;
  muted: boolean;
  soloed: boolean;
  /**
   * While set, the track is "recording-still-in-progress": audible, but not
   * selectable or editable, and re-recorded partitions replace it. Cleared (the
   * track "graduates") when the playhead passes this time, or immediately on stop.
   */
  spawnLoopEndTime: number | null;
  overwrite: OverwriteState | null;
}

export interface BusState {
  id: number;
  name: string;
  /**
   * Which of the bus hues this one wears, 0-based. Assigned as the smallest
   * unused index so deleting the middle bus and adding another reuses the freed
   * colour rather than drifting through the palette.
   */
  colorIndex: number;
  volume: number;
  reverb: number;
  muted: boolean;
}

/** One record-button session: the track it spawned (if any), and whether it is the
 *  quantized *initial* session whose premature death cancels everything. */
interface RecordSession {
  targetTrackId: number | null;
  isInitial: boolean;
}

export type Recording =
  | { kind: "off" }
  | { kind: "countIn"; startTime: number; endTime: number }
  | { kind: "free"; startTime: number }
  | { kind: "armed"; session: RecordSession; sinceTime: number }
  | {
      kind: "capturing";
      session: RecordSession;
      segStart: number;
      segEnd: number;
      reps: number;
    }
  /**
   * Auto-detect armed: listening for the player's first note. Has no due
   * transition, so it survives loop boundaries until something cancels it.
   */
  | { kind: "detecting"; trackId: number }
  | { kind: "overdub"; trackId: number; startTime: number; endBound: number };

export interface SessionState {
  playing: boolean;
  /** `currentTime` when loop iteration 0 began; null while no loop exists. */
  anchorTime: number | null;
  loopSeconds: number | null;
  /** May be fractional after a free-mode derivation. */
  tempo: number;
  beats: number;
  bars: number;
  metronomeOn: boolean;
  /** Grid for the free-running metronome before the first loop exists. */
  metroAnchor: number | null;
  multiplier: number;
  /** Overwrite waits for the first note played instead of punching in at once. */
  autoDetect: boolean;
  recording: Recording;
  tracks: TrackState[];
  buses: BusState[];
  /** Which bus new recordings attach to. */
  selectedBusId: number;
  selectedTrackId: number | null;
  master: { volume: number; reverb: number; muted: boolean };
  /**
   * Seed values for the next recording, set in settings. Like the delay, these
   * apply at spawn and never move a track that already exists.
   */
  defaultDelayMs: number;
  defaultTrackVolume: number;
  defaultTrackReverb: number;
  notice: string | null;
  counters: { track: number; segment: number; bus: number };
}

export type SessionEvent =
  | { type: "record" }
  | { type: "playStop" }
  | { type: "clock" }
  | { type: "setMultiplier"; value: number }
  | { type: "toggleMetronome" }
  | { type: "setTempo"; value: number }
  | { type: "setBeats"; value: number }
  | { type: "setBars"; value: number }
  | { type: "selectTrack"; id: number | null }
  | { type: "deleteTrack"; id: number }
  | { type: "deleteAllTracks" }
  | { type: "moveTrack"; id: number; toIndex: number }
  | { type: "deleteOverwrite"; id: number }
  | { type: "setTrackDelay"; id: number; ms: number }
  | { type: "setOverwriteDelay"; id: number; ms: number }
  | { type: "setTrackVolume"; id: number; value: number }
  | { type: "setTrackReverb"; id: number; value: number }
  | { type: "toggleTrackMute"; id: number }
  | { type: "toggleTrackSolo"; id: number }
  | { type: "setTrackBus"; id: number; busId: number }
  | { type: "renameTrack"; id: number; name: string }
  | { type: "addBus" }
  | { type: "deleteBus"; id: number }
  | { type: "selectBus"; id: number }
  | { type: "setBusVolume"; id: number; value: number }
  | { type: "setBusReverb"; id: number; value: number }
  | { type: "toggleBusMute"; id: number }
  | { type: "renameBus"; id: number; name: string }
  | { type: "setMasterVolume"; value: number }
  | { type: "setMasterReverb"; value: number }
  | { type: "toggleMasterMute" }
  | { type: "setDefaultDelay"; ms: number }
  | { type: "setDefaultTrackVolume"; value: number }
  | { type: "setDefaultTrackReverb"; value: number }
  | { type: "adoptTrackDefaults"; id: number }
  | { type: "toggleAutoDetect" }
  | { type: "overwriteDetected"; at: number }
  | { type: "restore"; state: SessionState }
  | { type: "clearNotice" };

/** Side effects for the audio layer, in order. */
export type Effect =
  | {
      type: "extract";
      segmentId: number;
      /** Content bounds; the audio layer adds ±padSeconds itself. */
      fromTime: number;
      toTime: number;
      trackId: number;
    }
  | { type: "disposeSegment"; segmentId: number }
  | { type: "rebake"; trackId: number }
  | { type: "removeTrackAudio"; trackId: number }
  | { type: "startTransport" }
  | { type: "stopTransport" };

export interface Result {
  state: SessionState;
  effects: Effect[];
}

export const NOTICES = {
  loopTooLong: `That length is over the ${config.transport.maxLoopSeconds}s loop ceiling.`,
  freeTooShort: "That loop was too short to keep — try again.",
  tooManyTracks: `The station holds ${config.mix.maxTracks} tracks.`,
  tempoTooFast: `That loop works out faster than ${config.transport.maxTempo} BPM — play it slower, or raise the multiplier.`,
  tempoTooSlow: `That loop works out slower than ${config.transport.minTempo} BPM — play it faster, or lower the multiplier.`,
} as const;

/**
 * Tolerance for comparing two audio-clock times, seconds (1µs — far below a
 * sample). Boundary times reached along different arithmetic paths differ by an
 * ulp, so exact comparison both mis-orders simultaneous transitions and defers
 * a transition due *now* by a whole scheduler tick.
 */
const TIME_EPSILON = 1e-6;

export function createSession(defaultDelayMs = 0): SessionState {
  return {
    playing: false,
    anchorTime: null,
    loopSeconds: null,
    tempo: config.transport.defaultTempo,
    beats: config.transport.defaultBeats,
    bars: config.transport.defaultBars,
    metronomeOn: false,
    metroAnchor: null,
    multiplier: 1,
    autoDetect: false,
    recording: { kind: "off" },
    tracks: [],
    buses: [
      {
        id: 1,
        name: "BUS 1",
        colorIndex: 0,
        volume: config.mix.defaultVolume,
        reverb: config.mix.defaultReverb,
        muted: false,
      },
    ],
    selectedBusId: 1,
    selectedTrackId: null,
    master: {
      volume: config.mix.defaultMasterVolume,
      reverb: config.mix.defaultMasterReverb,
      muted: false,
    },
    defaultDelayMs,
    defaultTrackVolume: config.mix.defaultVolume,
    defaultTrackReverb: config.mix.defaultReverb,
    notice: null,
    counters: { track: 1, segment: 1, bus: 2 },
  };
}

/**
 * The first index that is pinned in place: an in-progress track, and everything
 * below it. Tracks are always appended on spawn, so an in-progress one and its
 * successors form a locked tail; nothing may be dragged from there, and nothing
 * may be dropped at or below it.
 *
 * Shared by the reducer and the drag layer so the floor has one definition.
 */
export function lockedFromIndex(tracks: readonly TrackState[]): number {
  const index = tracks.findIndex((track) => track.spawnLoopEndTime !== null);
  return index === -1 ? tracks.length : index;
}

/**
 * The smallest free slot in `used`. Both track names and bus colours reuse
 * whatever a deletion or a rename freed, rather than climbing forever.
 */
function smallestFree(used: ReadonlySet<number>, from = 0): number {
  let n = from;
  while (used.has(n)) n++;
  return n;
}

/** `TAKE 07` for the smallest number no current track is already called. */
export function nextTakeName(tracks: readonly TrackState[]): string {
  const taken = new Set<number>();
  for (const track of tracks) {
    const match = /^TAKE (\d+)$/.exec(track.name);
    if (match) taken.add(Number(match[1]));
  }
  return `TAKE ${String(smallestFree(taken, 1)).padStart(2, "0")}`;
}

/** Tempo, beats and bars are editable only while nothing depends on them. */
export function transportUnlocked(s: SessionState): boolean {
  return s.tracks.length === 0 && s.anchorTime === null && s.recording.kind === "off";
}

// ---------------------------------------------------------------------------
// Reducer

export function reduce(s: SessionState, event: SessionEvent, now: number): Result {
  switch (event.type) {
    case "clock":
      return reduceClock(s, now);
    case "record":
      return reduceRecord(s, now);
    case "playStop":
      return reducePlayStop(s, now);
    case "setMultiplier":
      return reduceSetMultiplier(s, event.value, now);
    case "toggleMetronome": {
      // In free mode there is no tempo yet, so there is nothing to click.
      if (s.recording.kind === "free") return unchanged(s);
      const turningOn = !s.metronomeOn;
      return done({
        ...s,
        metronomeOn: turningOn,
        // A fresh grid every time it comes on pre-loop, so the first click is now.
        metroAnchor: turningOn && s.anchorTime === null ? now : s.metroAnchor,
      });
    }
    case "setTempo": {
      if (!transportUnlocked(s)) return unchanged(s);
      const value = clamp(event.value, config.transport.minTempo, config.transport.maxTempo);
      return done({ ...s, tempo: value, metroAnchor: s.metronomeOn ? now : s.metroAnchor });
    }
    case "setBeats": {
      if (!transportUnlocked(s)) return unchanged(s);
      const value = clamp(event.value, config.transport.minBeats, config.transport.maxBeats);
      return done({ ...s, beats: value });
    }
    case "setBars": {
      if (!transportUnlocked(s)) return unchanged(s);
      const value = clamp(event.value, config.transport.minBars, config.transport.maxBars);
      const multiplier = divisorsOf(value).includes(s.multiplier) ? s.multiplier : 1;
      return done({ ...s, bars: value, multiplier });
    }
    case "selectTrack": {
      if (event.id === null) return done({ ...s, selectedTrackId: null });
      const track = s.tracks.find((t) => t.id === event.id);
      // In-progress tracks cannot be selected (and therefore not modified).
      if (!track || track.spawnLoopEndTime !== null) return unchanged(s);
      return done({
        ...s,
        selectedTrackId: s.selectedTrackId === event.id ? null : event.id,
      });
    }
    case "deleteTrack":
      return reduceDeleteTrack(s, event.id);
    case "deleteAllTracks":
      return reduceDeleteAllTracks(s);
    case "moveTrack":
      return reduceMoveTrack(s, event.id, event.toIndex);
    case "deleteOverwrite": {
      const track = editableTrack(s, event.id);
      if (!track || !track.overwrite) return unchanged(s);
      const seg = track.overwrite.segmentId;
      return {
        state: patchTrack(s, event.id, { overwrite: null }),
        effects: [
          { type: "disposeSegment", segmentId: seg },
          { type: "rebake", trackId: event.id },
        ],
      };
    }
    case "setTrackDelay": {
      if (!editableTrack(s, event.id)) return unchanged(s);
      const ms = clamp(event.ms, config.delay.minMs, config.delay.maxMs);
      return {
        state: patchTrack(s, event.id, { delayMs: ms }),
        effects: [{ type: "rebake", trackId: event.id }],
      };
    }
    case "setOverwriteDelay": {
      const track = editableTrack(s, event.id);
      if (!track || !track.overwrite) return unchanged(s);
      const ms = clamp(event.ms, config.delay.minMs, config.delay.maxMs);
      return {
        state: patchTrack(s, event.id, { overwrite: { ...track.overwrite, delayMs: ms } }),
        effects: [{ type: "rebake", trackId: event.id }],
      };
    }
    case "setTrackVolume":
      return editableTrack(s, event.id)
        ? done(patchTrack(s, event.id, { volume: clamp(event.value, 0, 100) }))
        : unchanged(s);
    case "setTrackReverb":
      return editableTrack(s, event.id)
        ? done(patchTrack(s, event.id, { reverb: clamp(event.value, 0, 100) }))
        : unchanged(s);
    case "toggleTrackMute": {
      const track = editableTrack(s, event.id);
      return track ? done(patchTrack(s, event.id, { muted: !track.muted })) : unchanged(s);
    }
    case "toggleTrackSolo": {
      const track = editableTrack(s, event.id);
      return track ? done(patchTrack(s, event.id, { soloed: !track.soloed })) : unchanged(s);
    }
    case "setTrackBus": {
      const track = editableTrack(s, event.id);
      if (!track || !s.buses.some((b) => b.id === event.busId)) return unchanged(s);
      return done(patchTrack(s, event.id, { busId: event.busId }));
    }
    case "renameTrack": {
      const name = event.name.trim().slice(0, config.ui.trackNameMaxLength);
      if (!name || !editableTrack(s, event.id)) return unchanged(s);
      return done(patchTrack(s, event.id, { name }));
    }
    case "addBus": {
      if (s.buses.length >= config.mix.maxBuses) return unchanged(s);
      const id = s.counters.bus;
      const colorIndex = smallestFree(new Set(s.buses.map((b) => b.colorIndex)));
      const bus: BusState = {
        id,
        name: `BUS ${colorIndex + 1}`,
        colorIndex,
        volume: config.mix.defaultVolume,
        reverb: config.mix.defaultReverb,
        muted: false,
      };
      return done({
        ...s,
        buses: [...s.buses, bus],
        selectedBusId: id,
        counters: { ...s.counters, bus: id + 1 },
      });
    }
    case "deleteBus": {
      const index = s.buses.findIndex((b) => b.id === event.id);
      // The first bus is the floor the rack stands on; it can't be deleted.
      if (index <= 0) return unchanged(s);
      const fallback = s.buses[index - 1].id;
      return done({
        ...s,
        buses: s.buses.filter((b) => b.id !== event.id),
        selectedBusId: s.selectedBusId === event.id ? fallback : s.selectedBusId,
        tracks: s.tracks.map((t) => (t.busId === event.id ? { ...t, busId: fallback } : t)),
      });
    }
    case "selectBus":
      return s.buses.some((b) => b.id === event.id)
        ? done({ ...s, selectedBusId: event.id })
        : unchanged(s);
    case "setBusVolume":
      return done(patchBus(s, event.id, { volume: clamp(event.value, 0, 100) }));
    case "setBusReverb":
      return done(patchBus(s, event.id, { reverb: clamp(event.value, 0, 100) }));
    case "toggleBusMute": {
      const bus = s.buses.find((b) => b.id === event.id);
      return bus ? done(patchBus(s, event.id, { muted: !bus.muted })) : unchanged(s);
    }
    case "renameBus": {
      const name = event.name.trim().slice(0, config.ui.busNameMaxLength);
      if (!name) return unchanged(s);
      return done(patchBus(s, event.id, { name }));
    }
    case "setMasterVolume":
      // The master alone boosts past 100; tracks and buses stop there.
      return done({
        ...s,
        master: {
          ...s.master,
          volume: clamp(event.value, 0, config.mix.maxMasterVolume),
        },
      });
    case "setMasterReverb":
      return done({ ...s, master: { ...s.master, reverb: clamp(event.value, 0, 100) } });
    case "toggleMasterMute":
      return done({ ...s, master: { ...s.master, muted: !s.master.muted } });
    case "setDefaultDelay":
      return done({
        ...s,
        defaultDelayMs: clamp(event.ms, config.delay.minMs, config.delay.maxMs),
      });
    case "setDefaultTrackVolume":
      return done({ ...s, defaultTrackVolume: clamp(event.value, 0, 100) });
    case "setDefaultTrackReverb":
      return done({ ...s, defaultTrackReverb: clamp(event.value, 0, 100) });
    case "adoptTrackDefaults": {
      // Volume and reverb only: a track's delay is per-recording alignment,
      // not a taste worth carrying to the next take.
      const track = editableTrack(s, event.id);
      if (!track) return unchanged(s);
      return done({
        ...s,
        defaultTrackVolume: track.volume,
        defaultTrackReverb: track.reverb,
      });
    }
    case "toggleAutoDetect":
      // Locked once the gesture is under way, so the mode can't change beneath it.
      if (s.recording.kind === "detecting" || s.recording.kind === "overdub") {
        return unchanged(s);
      }
      return done({ ...s, autoDetect: !s.autoDetect });
    case "overwriteDetected":
      return reduceOverwriteDetected(s, event.at);
    case "restore":
      return done(event.state);
    case "clearNotice":
      return s.notice === null ? unchanged(s) : done({ ...s, notice: null });
  }
}

// ---------------------------------------------------------------------------
// The record button

function reduceRecord(s: SessionState, now: number): Result {
  switch (s.recording.kind) {
    case "off":
      return startRecordSession(s, now);
    case "countIn":
      // Cancelling the count-in leaves nothing behind; back to the empty state.
      return done({ ...s, recording: { kind: "off" } });
    case "free":
      return finishFreeLoop(s, s.recording.startTime, now);
    case "armed":
    case "capturing":
      return endRecordSession(s, s.recording.session);
    case "detecting":
      // Pressed again before anything was heard: give up listening.
      return done({ ...s, recording: { kind: "off" } });
    case "overdub":
      return completeOverdub(s, s.recording, now);
  }
}

function startRecordSession(s: SessionState, now: number): Result {
  const empty = s.anchorTime === null && s.tracks.length === 0;

  if (empty) {
    if (s.metronomeOn) {
      // Quantized start: the loop length is already decided by tempo × beats × bars.
      const loop = loopLengthSeconds(s.tempo, s.beats, s.bars);
      if (loop > config.transport.maxLoopSeconds) {
        return done({ ...s, notice: NOTICES.loopTooLong });
      }
      // One bar of count-in, snapped onto the next *accent* of the click grid the
      // player is already hearing. Snapping to a bar line rather than any beat
      // means the count starts where they hear the bar start, and — since the
      // count-in is exactly one bar — the loop anchor lands on a bar line too, so
      // the accent grid never shifts. Only the emphasis drops out for that bar.
      const beatSeconds = 60 / s.tempo;
      const barSeconds = beatSeconds * s.beats;
      const grid = s.metroAnchor ?? now;
      const startTime = grid + Math.ceil((now - grid) / barSeconds - 1e-9) * barSeconds;
      return done({
        ...s,
        recording: { kind: "countIn", startTime, endTime: startTime + s.beats * beatSeconds },
      });
    }
    // Free start: press-to-press will decide the loop.
    return done({ ...s, recording: { kind: "free", startTime: now } });
  }

  // A loop exists. A selected single-rep, graduated track turns the button into
  // the overwrite button; repetition tracks can't be overwritten, so for them
  // (and with nothing selected) the button records normally.
  const selected = s.tracks.find((t) => t.id === s.selectedTrackId);
  if (selected && selected.spawnLoopEndTime === null && selected.reps === 1) {
    return startOverdub(s, selected.id, now);
  }

  if (s.tracks.length >= config.mix.maxTracks) {
    return done({ ...s, notice: NOTICES.tooManyTracks });
  }

  const effects: Effect[] = [];
  let next = s;
  if (!s.playing) {
    // Recording from a stopped transport restarts the loop from its beginning.
    next = { ...s, playing: true, anchorTime: now };
    effects.push({ type: "startTransport" });
  }
  return {
    state: {
      ...next,
      recording: {
        kind: "armed",
        session: { targetTrackId: null, isInitial: false },
        sinceTime: now,
      },
    },
    effects,
  };
}

/** Free-mode press 2: derive tempo and loop length, spawn the first track. */
function finishFreeLoop(s: SessionState, startTime: number, now: number): Result {
  const freeSeconds = now - startTime;
  if (freeSeconds < config.transport.minFreeLoopSeconds) {
    return done({ ...s, recording: { kind: "off" }, notice: NOTICES.freeTooShort });
  }
  const loop = s.multiplier * freeSeconds;
  if (loop > config.transport.maxLoopSeconds) {
    return done({ ...s, recording: { kind: "off" }, notice: NOTICES.loopTooLong });
  }

  const tempo = freeModeTempo(freeSeconds, s.beats, s.bars, s.multiplier);
  // A derived tempo the tempo field would reject is refused here instead, so the
  // two can never disagree once every track is deleted and the field re-enables.
  // The tolerance keeps a loop played dead on the ceiling from being refused by
  // a rounding error in the derivation.
  if (tempo > config.transport.maxTempo * (1 + TIME_EPSILON)) {
    return done({ ...s, recording: { kind: "off" }, notice: NOTICES.tempoTooFast });
  }
  if (tempo < config.transport.minTempo * (1 - TIME_EPSILON)) {
    return done({ ...s, recording: { kind: "off" }, notice: NOTICES.tempoTooSlow });
  }

  const segmentId = s.counters.segment;
  const trackId = s.counters.track;
  const track = spawnTrack(s, trackId, segmentId, {
    reps: s.multiplier,
    segmentSeconds: freeSeconds,
    // Spawn loop is iteration 0; with x1 that ends exactly now, so the track
    // graduates on the next clock tick, as the spec's "normal track" implies.
    spawnLoopEndTime: startTime + loop,
  });

  return {
    state: {
      ...s,
      tempo,
      playing: true,
      anchorTime: startTime,
      loopSeconds: loop,
      recording: { kind: "off" },
      tracks: [track],
      counters: { ...s.counters, segment: segmentId + 1, track: trackId + 1 },
    },
    effects: [
      { type: "startTransport" },
      { type: "extract", segmentId, fromTime: startTime, toTime: now, trackId },
    ],
  };
}

/** Turning the record button off mid-session. The in-flight segment dies; set tracks stay. */
function endRecordSession(s: SessionState, session: RecordSession): Result {
  // The quantized-start edge case: nothing was set yet, so the whole attempt —
  // transport included — is cancelled and the user starts again.
  if (session.isInitial && session.targetTrackId === null) {
    return resetTransport({ ...s, recording: { kind: "off" } });
  }
  return done({ ...s, recording: { kind: "off" } });
}

function startOverdub(s: SessionState, trackId: number, now: number): Result {
  const effects: Effect[] = [];
  let next = s;
  let anchor = s.anchorTime as number;
  const loop = s.loopSeconds as number;
  if (!s.playing) {
    anchor = now;
    next = { ...s, playing: true, anchorTime: now };
    effects.push({ type: "startTransport" });
  }

  // Auto-detect punches in at the first note played instead of at the press,
  // so the silence before it doesn't overwrite the original with nothing.
  if (s.autoDetect) {
    return { state: { ...next, recording: { kind: "detecting", trackId } }, effects };
  }

  // The overwrite ends at the second press or when the loop reaches its end.
  const iteration = Math.floor((now - anchor) / loop + 1e-9);
  const endBound = anchor + (iteration + 1) * loop;
  return {
    state: { ...next, recording: { kind: "overdub", trackId, startTime: now, endBound } },
    effects,
  };
}

/** The player started playing: promote the listening state into a real punch. */
function reduceOverwriteDetected(s: SessionState, at: number): Result {
  if (s.recording.kind !== "detecting") return unchanged(s);
  const anchor = s.anchorTime;
  const loop = s.loopSeconds;
  if (anchor === null || loop === null) return unchanged(s);

  const iteration = Math.floor((at - anchor) / loop + 1e-9);
  const iterationStart = anchor + iteration * loop;
  // A level threshold fires a block or two after the attack, so start earlier
  // than the detection — but never before this iteration began, or the phase
  // would wrap and punch at the wrong end of the loop.
  const startTime = Math.max(iterationStart, at - config.autoDetect.onsetBackoffMs / 1000);
  return done({
    ...s,
    recording: {
      kind: "overdub",
      trackId: s.recording.trackId,
      startTime,
      endBound: iterationStart + loop,
    },
  });
}

function completeOverdub(
  s: SessionState,
  od: Extract<Recording, { kind: "overdub" }>,
  endTime: number,
): Result {
  const anchor = s.anchorTime as number;
  const loop = s.loopSeconds as number;
  const clippedEnd = Math.min(endTime, od.endBound);
  const startPhase = phaseAt(anchor, loop, od.startTime);
  // Ending on the loop boundary means "to the end of the track", not phase 0.
  const endPhase = clippedEnd >= od.endBound - 1e-9 ? loop : phaseAt(anchor, loop, clippedEnd);

  const track = s.tracks.find((t) => t.id === od.trackId);
  if (!track) {
    // The track vanished mid-overdub (deleted); nothing to attach the take to.
    return done({ ...s, recording: { kind: "off" } });
  }

  const segmentId = s.counters.segment;
  const effects: Effect[] = [];
  if (track.overwrite) {
    // A new segment replaces the old one only on successful completion.
    effects.push({ type: "disposeSegment", segmentId: track.overwrite.segmentId });
  }
  effects.push({
    type: "extract",
    segmentId,
    fromTime: od.startTime,
    toTime: clippedEnd,
    trackId: od.trackId,
  });

  return {
    state: {
      ...patchTrack(s, od.trackId, {
        overwrite: { segmentId, startPhase, endPhase, delayMs: s.defaultDelayMs },
      }),
      recording: { kind: "off" },
      counters: { ...s.counters, segment: segmentId + 1 },
    },
    effects,
  };
}

// ---------------------------------------------------------------------------
// Play / stop

function reducePlayStop(s: SessionState, now: number): Result {
  switch (s.recording.kind) {
    case "countIn":
    case "free":
      // Cancels the attempt; there is no loop yet, so this is a full reset.
      return resetTransport({ ...s, recording: { kind: "off" } });
    default:
      break;
  }

  if (s.playing) {
    // Stop discards whatever was mid-flight and graduates set tracks immediately.
    const state: SessionState = {
      ...s,
      playing: false,
      recording: { kind: "off" },
      tracks: s.tracks.map((t) =>
        t.spawnLoopEndTime !== null ? { ...t, spawnLoopEndTime: null } : t,
      ),
    };
    if (state.tracks.length === 0) return resetTransport(state);
    return { state, effects: [{ type: "stopTransport" }] };
  }

  if (s.tracks.length === 0) return unchanged(s);
  // Resume from the beginning of the loop.
  return {
    state: { ...s, playing: true, anchorTime: now },
    effects: [{ type: "startTransport" }],
  };
}

// ---------------------------------------------------------------------------
// Multiplier

function reduceSetMultiplier(s: SessionState, value: number, now: number): Result {
  if (!divisorsOf(s.bars).includes(value)) return unchanged(s);
  if (value === s.multiplier) return unchanged(s);

  if (s.recording.kind === "capturing") {
    const { session } = s.recording;
    // Changing the multiplier mid-capture discards that segment. If it was the
    // quantized session's first segment, the whole attempt is cancelled.
    if (session.isInitial && session.targetTrackId === null) {
      return resetTransport({ ...s, multiplier: value, recording: { kind: "off" } });
    }
    return done({
      ...s,
      multiplier: value,
      recording: { kind: "armed", session, sinceTime: now },
    });
  }

  return done({ ...s, multiplier: value });
}

// ---------------------------------------------------------------------------
// The clock: promote every transition whose exact time has passed

function reduceClock(s: SessionState, now: number): Result {
  let state = s;
  const effects: Effect[] = [];

  // Several transitions can be due in one tick (a backgrounded tab throttles
  // timers while audio keeps running), so loop until nothing is due. Each apply
  // uses its exact computed time, not `now`.
  for (let guard = 0; guard < 64; guard++) {
    const step = nextDueTransition(state, now);
    if (!step) break;
    const result = step();
    state = result.state;
    effects.push(...result.effects);
  }

  return state === s && effects.length === 0 ? unchanged(s) : { state, effects };
}

/**
 * The earliest transition due at or before `now`, or null. Ties break by list
 * order below — most importantly, a capture completing on the same boundary that
 * graduates its track must land *before* the graduation, so the re-recorded
 * partition still replaces the track.
 */
function nextDueTransition(s: SessionState, now: number): (() => Result) | null {
  type Candidate = { time: number; order: number; apply: () => Result };
  const candidates: Candidate[] = [];
  /** Due at or before `now`, within a microsecond of float slop. */
  const due = (time: number) => time <= now + TIME_EPSILON;

  if (s.recording.kind === "countIn" && due(s.recording.endTime)) {
    const endTime = s.recording.endTime;
    candidates.push({ time: endTime, order: 0, apply: () => beginQuantizedLoop(s, endTime) });
  }

  if (s.playing && s.anchorTime !== null && s.loopSeconds !== null) {
    const anchor = s.anchorTime;
    const loop = s.loopSeconds;

    if (s.recording.kind === "armed") {
      const boundary = nextPartitionBoundary(anchor, loop, s.multiplier, s.recording.sinceTime);
      if (due(boundary)) {
        const rec = s.recording;
        candidates.push({
          time: boundary,
          order: 1,
          apply: () =>
            done({
              ...s,
              recording: {
                kind: "capturing",
                session: rec.session,
                segStart: boundary,
                segEnd: boundary + partitionLength(loop, s.multiplier),
                reps: s.multiplier,
              },
            }),
        });
      }
    }

    if (s.recording.kind === "capturing" && due(s.recording.segEnd)) {
      const rec = s.recording;
      candidates.push({ time: rec.segEnd, order: 1, apply: () => completeSegment(s, rec) });
    }

    if (s.recording.kind === "overdub" && due(s.recording.endBound)) {
      const rec = s.recording;
      candidates.push({
        time: rec.endBound,
        order: 1,
        apply: () => completeOverdub(s, rec, rec.endBound),
      });
    }

    for (const track of s.tracks) {
      const spawnEnd = track.spawnLoopEndTime;
      if (spawnEnd !== null && due(spawnEnd)) {
        const id = track.id;
        candidates.push({ time: spawnEnd, order: 2, apply: () => graduateTrack(s, id) });
      }
    }
  }

  if (candidates.length === 0) return null;
  // "Same time" must tolerate float drift: a capture's end and its track's spawn
  // loop end are computed along different arithmetic paths and can differ by an
  // ulp, which would otherwise defeat the priority ordering.
  candidates.sort((a, b) => {
    const dt = a.time - b.time;
    return Math.abs(dt) > TIME_EPSILON ? dt : a.order - b.order;
  });
  return candidates[0].apply;
}

/** Count-in finished: the loop grid exists from this instant, and capture begins. */
function beginQuantizedLoop(s: SessionState, anchorTime: number): Result {
  const loop = loopLengthSeconds(s.tempo, s.beats, s.bars);
  return {
    state: {
      ...s,
      playing: true,
      anchorTime,
      loopSeconds: loop,
      recording: {
        kind: "capturing",
        session: { targetTrackId: null, isInitial: true },
        segStart: anchorTime,
        segEnd: anchorTime + partitionLength(loop, s.multiplier),
        reps: s.multiplier,
      },
    },
    effects: [{ type: "startTransport" }],
  };
}

/** A partition segment finished cleanly: set (or re-set) a track with it. */
function completeSegment(
  s: SessionState,
  rec: Extract<Recording, { kind: "capturing" }>,
): Result {
  const { session, segStart, segEnd, reps } = rec;
  const loop = s.loopSeconds as number;
  const anchor = s.anchorTime as number;
  const segmentSeconds = segEnd - segStart;
  const effects: Effect[] = [];

  const target = s.tracks.find(
    (t) => t.id === session.targetTrackId && t.spawnLoopEndTime !== null,
  );

  let state: SessionState;
  let trackId: number;
  const segmentId = s.counters.segment;

  if (target) {
    // Still inside the spawn loop: the fresh partition replaces the track's audio.
    trackId = target.id;
    effects.push({ type: "disposeSegment", segmentId: target.segmentId });
    state = patchTrack(s, target.id, { segmentId, reps, segmentSeconds });
    state = { ...state, counters: { ...state.counters, segment: segmentId + 1 } };
  } else {
    if (s.tracks.length >= config.mix.maxTracks) {
      // No room for another take; the session ends rather than looping uselessly.
      return done({ ...s, recording: { kind: "off" }, notice: NOTICES.tooManyTracks });
    }
    trackId = s.counters.track;
    const track = spawnTrack(s, trackId, segmentId, {
      reps,
      segmentSeconds,
      spawnLoopEndTime: spawnLoopEnd(anchor, loop, segStart),
    });
    state = {
      ...s,
      tracks: [...s.tracks, track],
      counters: { ...s.counters, segment: segmentId + 1, track: trackId + 1 },
    };
  }

  effects.push({ type: "extract", segmentId, fromTime: segStart, toTime: segEnd, trackId });

  // Record stays on: re-arm from the boundary just crossed, so the next partition
  // starts capturing immediately on the following clock pass.
  state = {
    ...state,
    recording: {
      kind: "armed",
      session: { targetTrackId: trackId, isInitial: false },
      sinceTime: segEnd,
    },
  };

  return { state, effects };
}

function graduateTrack(s: SessionState, trackId: number): Result {
  let state = patchTrack(s, trackId, { spawnLoopEndTime: null });
  // A graduated track is out of the session's reach; the next completed
  // partition spawns a new track instead of replacing this one.
  if (
    (state.recording.kind === "armed" || state.recording.kind === "capturing") &&
    state.recording.session.targetTrackId === trackId
  ) {
    state = {
      ...state,
      recording: {
        ...state.recording,
        session: { ...state.recording.session, targetTrackId: null },
      },
    };
  }
  return done(state);
}

// ---------------------------------------------------------------------------
// Track deletion and shared helpers

/** Tear-down effects for one track: its node, its recording, its overwrite. */
function disposeTrack(track: TrackState): Effect[] {
  const effects: Effect[] = [
    { type: "removeTrackAudio", trackId: track.id },
    { type: "disposeSegment", segmentId: track.segmentId },
  ];
  if (track.overwrite) {
    effects.push({ type: "disposeSegment", segmentId: track.overwrite.segmentId });
  }
  return effects;
}

function reduceDeleteTrack(s: SessionState, id: number): Result {
  const track = s.tracks.find((t) => t.id === id);
  if (!track || track.spawnLoopEndTime !== null) return unchanged(s);

  const effects = disposeTrack(track);

  let state: SessionState = {
    ...s,
    tracks: s.tracks.filter((t) => t.id !== id),
    selectedTrackId: s.selectedTrackId === id ? null : s.selectedTrackId,
  };

  // Deleting the track out from under its own overdub cancels the overdub.
  if (state.recording.kind === "overdub" && state.recording.trackId === id) {
    state = { ...state, recording: { kind: "off" } };
  }

  // Deleting the last track unlocks tempo/beats/bars — unless a record session is
  // still running, which needs the loop grid to keep meaning anything.
  if (state.tracks.length === 0 && state.recording.kind === "off") {
    const reset = resetTransport(state);
    return { state: reset.state, effects: [...effects, ...reset.effects] };
  }

  return { state, effects };
}

/**
 * Reorder one track. Purely presentational — every track plays in parallel into
 * its bus, so the array order drives nothing but the render, which is why this
 * emits no effects and touches no audio.
 */
function reduceMoveTrack(s: SessionState, id: number, toIndex: number): Result {
  const floor = lockedFromIndex(s.tracks);
  const from = s.tracks.findIndex((track) => track.id === id);
  // Nothing at or below an in-progress track moves, and nothing lands there.
  if (from < 0 || from >= floor) return unchanged(s);
  const to = clamp(toIndex, 0, floor - 1);
  if (to === from) return unchanged(s);
  return done({ ...s, tracks: moveItem(s.tracks, from, to) });
}

/**
 * Clear the station. Unlike deleting one track this reaches in-progress tracks
 * and cancels any recording — a "clear everything" that silently ignored you
 * mid-session would be worse than one that interrupts it.
 */
function reduceDeleteAllTracks(s: SessionState): Result {
  if (s.tracks.length === 0 && s.recording.kind === "off") return unchanged(s);

  const effects = s.tracks.flatMap(disposeTrack);
  const cleared: SessionState = {
    ...s,
    tracks: [],
    recording: { kind: "off" },
    notice: null,
  };
  const reset = resetTransport(cleared);
  return { state: reset.state, effects: [...effects, ...reset.effects] };
}

/** Back to the empty, unlocked state. Emits stopTransport when one was running. */
function resetTransport(s: SessionState): Result {
  const wasLive = s.playing || s.anchorTime !== null;
  const state: SessionState = {
    ...s,
    playing: false,
    anchorTime: null,
    loopSeconds: null,
    selectedTrackId: null,
  };
  return { state, effects: wasLive ? [{ type: "stopTransport" }] : [] };
}

function spawnTrack(
  s: SessionState,
  id: number,
  segmentId: number,
  fields: { reps: number; segmentSeconds: number; spawnLoopEndTime: number },
): TrackState {
  return {
    id,
    name: nextTakeName(s.tracks),
    busId: s.selectedBusId,
    segmentId,
    delayMs: s.defaultDelayMs,
    volume: s.defaultTrackVolume,
    reverb: s.defaultTrackReverb,
    muted: false,
    soloed: false,
    overwrite: null,
    ...fields,
  };
}

/** A track that exists and has graduated — the only kind events may modify. */
function editableTrack(s: SessionState, id: number): TrackState | undefined {
  const track = s.tracks.find((t) => t.id === id);
  return track && track.spawnLoopEndTime === null ? track : undefined;
}

function patchTrack(s: SessionState, id: number, fields: Partial<TrackState>): SessionState {
  return { ...s, tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...fields } : t)) };
}

function patchBus(s: SessionState, id: number, fields: Partial<BusState>): SessionState {
  if (!s.buses.some((b) => b.id === id)) return s;
  return { ...s, buses: s.buses.map((b) => (b.id === id ? { ...b, ...fields } : b)) };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function done(state: SessionState): Result {
  return { state, effects: [] };
}

/** Same object back, so React can bail out of re-rendering on idle clock ticks. */
function unchanged(state: SessionState): Result {
  return { state, effects: [] };
}
