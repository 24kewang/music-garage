import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
  EMPTY_SIGNATURE,
  loopSignature,
  parseSnapshot,
  referencedSegments,
  SNAPSHOT_VERSION,
  toSnapshot,
} from "./snapshot";
import { createSession, reduce, type SessionState } from "./session";
import { loopLengthSeconds } from "./transport";

const LOOP = loopLengthSeconds(
  config.transport.defaultTempo,
  config.transport.defaultBeats,
  config.transport.defaultBars,
);

/** A session with two tracks, one carrying an overwrite. */
function loaded(): SessionState {
  const base = createSession();
  return {
    ...base,
    loopSeconds: LOOP,
    tracks: [
      {
        id: 1,
        name: "TAKE 01",
        busId: 1,
        reps: 1,
        segmentId: 10,
        segmentSeconds: LOOP,
        delayMs: -20,
        volume: 70,
        reverb: 30,
        muted: false,
        soloed: false,
        spawnLoopEndTime: null,
        overwrite: { segmentId: 11, startPhase: 1, endPhase: 3, delayMs: 5 },
      },
      {
        id: 2,
        name: "BASS",
        busId: 1,
        reps: 2,
        segmentId: 12,
        segmentSeconds: LOOP / 2,
        delayMs: 0,
        volume: 90,
        reverb: 10,
        muted: true,
        soloed: false,
        spawnLoopEndTime: null,
        overwrite: null,
      },
    ],
  };
}

describe("toSnapshot", () => {
  it("captures the loop and stamps the sample rate", () => {
    const snapshot = toSnapshot(loaded(), 48000);
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(snapshot.sampleRate).toBe(48000);
    expect(snapshot.state.tracks).toHaveLength(2);
    expect(snapshot.state.loopSeconds).toBeCloseTo(LOOP);
  });

  it("saves a resting station: stopped, unselected, nothing recording", () => {
    const live: SessionState = {
      ...loaded(),
      playing: true,
      anchorTime: 12,
      metronomeOn: true,
      selectedTrackId: 1,
      notice: "something",
      recording: { kind: "detecting", trackId: 1 },
    };
    const { state } = toSnapshot(live, 48000);
    expect(state.playing).toBe(false);
    expect(state.anchorTime).toBeNull();
    expect(state.selectedTrackId).toBeNull();
    expect(state.notice).toBeNull();
    expect(state.recording.kind).toBe("off");
    expect(state.metronomeOn).toBe(false);
  });

  it("graduates a track that was mid-recording", () => {
    const mid = loaded();
    mid.tracks[0] = { ...mid.tracks[0], spawnLoopEndTime: 99 };
    const { state } = toSnapshot(mid, 48000);
    expect(state.tracks[0].spawnLoopEndTime).toBeNull();
  });
});

describe("referencedSegments", () => {
  it("lists originals and overwrites", () => {
    expect(referencedSegments(loaded()).sort()).toEqual([10, 11, 12]);
  });

  it("is empty for a blank station", () => {
    expect(referencedSegments(createSession())).toEqual([]);
  });
});

describe("parseSnapshot", () => {
  const good = () => JSON.parse(JSON.stringify(toSnapshot(loaded(), 48000)));

  it("round-trips a snapshot through JSON", () => {
    const parsed = parseSnapshot(good());
    expect(parsed).not.toBeNull();
    expect(parsed!.state.tracks).toHaveLength(2);
    expect(parsed!.state.tracks[0].overwrite?.segmentId).toBe(11);
    expect(parsed!.sampleRate).toBe(48000);
  });

  it("rejects junk rather than throwing", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot(42)).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot("{}")).toBeNull();
  });

  it("rejects a version it doesn't understand", () => {
    expect(parseSnapshot({ ...good(), version: SNAPSHOT_VERSION + 1 })).toBeNull();
    expect(parseSnapshot({ ...good(), version: undefined })).toBeNull();
  });

  it("rejects a shape missing what the reducer needs", () => {
    expect(parseSnapshot({ ...good(), sampleRate: 0 })).toBeNull();
    expect(parseSnapshot({ ...good(), state: { ...good().state, tracks: "no" } })).toBeNull();
    expect(parseSnapshot({ ...good(), state: { ...good().state, buses: [] } })).toBeNull();
    expect(parseSnapshot({ ...good(), state: { ...good().state, tempo: "fast" } })).toBeNull();
    // Tracks with no loop length could never be baked.
    expect(
      parseSnapshot({ ...good(), state: { ...good().state, loopSeconds: null } }),
    ).toBeNull();
  });

  it("fills fields an older save omitted", () => {
    const partial = good();
    delete partial.state.autoDetect;
    delete partial.state.defaultTrackVolume;
    const parsed = parseSnapshot(partial);
    expect(parsed).not.toBeNull();
    expect(parsed!.state.autoDetect).toBe(false);
    expect(parsed!.state.defaultTrackVolume).toBe(config.mix.defaultVolume);
  });

  it("lands resting even if the stored state was mid-flight", () => {
    const running = good();
    running.state.playing = true;
    running.state.selectedTrackId = 1;
    const parsed = parseSnapshot(running);
    expect(parsed!.state.playing).toBe(false);
    expect(parsed!.state.selectedTrackId).toBeNull();
  });
});

describe("loopSignature", () => {
  it("is stable for an unchanged loop", () => {
    expect(loopSignature(loaded())).toBe(loopSignature(loaded()));
  });

  it("changes when the loop itself changes", () => {
    const before = loopSignature(loaded());
    const volume = { ...loaded() };
    volume.tracks = [{ ...volume.tracks[0], volume: 15 }, volume.tracks[1]];
    expect(loopSignature(volume)).not.toBe(before);

    const renamed = { ...loaded() };
    renamed.tracks = [{ ...renamed.tracks[0], name: "GUITAR" }, renamed.tracks[1]];
    expect(loopSignature(renamed)).not.toBe(before);

    const reordered = { ...loaded(), tracks: [...loaded().tracks].reverse() };
    expect(loopSignature(reordered)).not.toBe(before);

    const overwriteGone = { ...loaded() };
    overwriteGone.tracks = [{ ...overwriteGone.tracks[0], overwrite: null }, overwriteGone.tracks[1]];
    expect(loopSignature(overwriteGone)).not.toBe(before);

    expect(loopSignature({ ...loaded(), tempo: 140 })).not.toBe(before);
    expect(
      loopSignature({ ...loaded(), master: { volume: 10, reverb: 0, muted: true } }),
    ).not.toBe(before);
  });

  it("ignores what a save doesn't capture", () => {
    const before = loopSignature(loaded());
    // These change constantly and must not make the station read as unsaved.
    expect(loopSignature({ ...loaded(), selectedTrackId: 2 })).toBe(before);
    expect(loopSignature({ ...loaded(), notice: "heads up" })).toBe(before);
    expect(loopSignature({ ...loaded(), playing: true, anchorTime: 5 })).toBe(before);
    expect(loopSignature({ ...loaded(), metronomeOn: true })).toBe(before);
    expect(loopSignature({ ...loaded(), multiplier: 2 })).toBe(before);
    expect(loopSignature({ ...loaded(), autoDetect: true })).toBe(before);
    expect(loopSignature({ ...loaded(), defaultTrackVolume: 33 })).toBe(before);
  });

  it("knows an untouched station from a loaded one", () => {
    expect(loopSignature(createSession())).toBe(EMPTY_SIGNATURE);
    expect(loopSignature(loaded())).not.toBe(EMPTY_SIGNATURE);
  });

  it("survives a save/restore round trip unchanged", () => {
    // What is saved must read back as identical, or the station would be
    // "unsaved" the instant it was restored.
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(toSnapshot(loaded(), 48000))));
    expect(loopSignature(parsed!.state)).toBe(loopSignature(loaded()));
  });

  it("moves when a reducer edit changes the loop", () => {
    const s = loaded();
    const before = loopSignature(s);
    const muted = reduce(s, { type: "toggleTrackMute", id: 1 }, 0).state;
    expect(loopSignature(muted)).not.toBe(before);
  });
});
