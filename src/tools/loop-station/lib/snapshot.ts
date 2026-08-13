import { config } from "../config";
import { createSession, type SessionState } from "./session";

/**
 * The serialisable form of a loop: everything needed to make the station sound
 * the same after a reload, minus the audio itself (which travels alongside,
 * keyed by segment id).
 *
 * Kept pure and separate from the IndexedDB plumbing so the shape, its
 * validation, and the dirty-tracking signature are all Node-testable.
 */

export const SNAPSHOT_VERSION = 1;

export interface LoopSnapshot {
  version: number;
  /** What the audio was recorded at; restore resamples if the device differs. */
  sampleRate: number;
  savedAt: number;
  state: SessionState;
}

/** Fields that are about the *session*, not the loop, and are reset on restore. */
function restingState(state: SessionState): SessionState {
  return {
    ...state,
    playing: false,
    anchorTime: null,
    metroAnchor: null,
    metronomeOn: false,
    recording: { kind: "off" },
    selectedTrackId: null,
    notice: null,
    // A track mid-recording has no meaning after a reload; anything already
    // set has its audio, so it simply graduates.
    tracks: state.tracks.map((track) => ({ ...track, spawnLoopEndTime: null })),
  };
}

export function toSnapshot(state: SessionState, sampleRate: number): LoopSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    sampleRate,
    savedAt: Date.now(),
    state: restingState(state),
  };
}

/** Every segment id the state refers to — originals and overwrites. */
export function referencedSegments(state: SessionState): number[] {
  const ids: number[] = [];
  for (const track of state.tracks) {
    ids.push(track.segmentId);
    if (track.overwrite) ids.push(track.overwrite.segmentId);
  }
  return ids;
}

/**
 * Validate a snapshot read back from storage. Returns null rather than
 * throwing: a save written by an older version, or a half-written one, should
 * leave the user on a blank station rather than a broken page.
 */
export function parseSnapshot(value: unknown): LoopSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== SNAPSHOT_VERSION) return null;
  if (typeof record.sampleRate !== "number" || !(record.sampleRate > 0)) return null;

  const state = record.state;
  if (typeof state !== "object" || state === null) return null;
  const s = state as Record<string, unknown>;
  if (!Array.isArray(s.tracks) || !Array.isArray(s.buses) || s.buses.length === 0) {
    return null;
  }
  if (typeof s.tempo !== "number" || typeof s.beats !== "number" || typeof s.bars !== "number") {
    return null;
  }
  // A loop with tracks but no length can't be baked or played.
  if (s.tracks.length > 0 && typeof s.loopSeconds !== "number") return null;

  // Fill any field a future/older shape omitted from the current defaults, so
  // one missing key can't leave the reducer with an undefined it never checks.
  const merged: SessionState = {
    ...createSession(),
    ...(state as SessionState),
  };
  return {
    version: SNAPSHOT_VERSION,
    sampleRate: record.sampleRate,
    savedAt: typeof record.savedAt === "number" ? record.savedAt : 0,
    state: restingState(merged),
  };
}

/**
 * A cheap identity for "the loop as it would be saved".
 *
 * Compared against the signature at last save to decide whether leaving the
 * page should warn. Deliberately covers only what a save captures — selection,
 * notices, drag state and the metronome move constantly and would otherwise
 * make the station permanently "unsaved".
 */
export function loopSignature(state: SessionState): string {
  const parts: (string | number)[] = [
    state.tempo,
    state.beats,
    state.bars,
    state.loopSeconds ?? 0,
    state.master.volume,
    state.master.reverb,
    state.master.muted ? 1 : 0,
  ];
  for (const bus of state.buses) {
    parts.push(bus.id, bus.name, bus.colorIndex, bus.volume, bus.reverb, bus.muted ? 1 : 0);
  }
  for (const track of state.tracks) {
    parts.push(
      track.id,
      track.name,
      track.busId,
      track.reps,
      track.segmentId,
      Math.round(track.segmentSeconds * 1000),
      track.delayMs,
      track.volume,
      track.reverb,
      track.muted ? 1 : 0,
      track.soloed ? 1 : 0,
      track.overwrite
        ? `${track.overwrite.segmentId}:${Math.round(track.overwrite.startPhase * 1000)}:${Math.round(
            track.overwrite.endPhase * 1000,
          )}:${track.overwrite.delayMs}`
        : "-",
    );
  }
  return parts.join("|");
}

/** The signature of an untouched station — nothing worth warning about. */
export const EMPTY_SIGNATURE = loopSignature(createSession());

export const SAVE_SLOT = config.save.slotKey;
