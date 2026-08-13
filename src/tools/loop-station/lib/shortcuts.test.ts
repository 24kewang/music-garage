import { describe, expect, it } from "vitest";
import { config } from "../config";
import { deleteTarget, resolveAltShortcut, resolveShortcut } from "./shortcuts";
import { createSession, type SessionState, type TrackState } from "./session";
import { loopLengthSeconds } from "./transport";

const LOOP = loopLengthSeconds(
  config.transport.defaultTempo,
  config.transport.defaultBeats,
  config.transport.defaultBars,
);

function track(id: number, overrides: Partial<TrackState> = {}): TrackState {
  return {
    id,
    name: `TAKE 0${id}`,
    busId: 1,
    reps: 1,
    segmentId: id * 10,
    segmentSeconds: LOOP,
    delayMs: 0,
    volume: 80,
    reverb: 15,
    muted: false,
    soloed: false,
    spawnLoopEndTime: null,
    overwrite: null,
    ...overrides,
  };
}

function withTracks(tracks: TrackState[], overrides: Partial<SessionState> = {}): SessionState {
  return { ...createSession(), loopSeconds: LOOP, tracks, ...overrides };
}

describe("resolveShortcut", () => {
  const s = createSession();

  it("maps the transport keys", () => {
    expect(resolveShortcut(" ", s)).toEqual({ type: "record" });
    expect(resolveShortcut("Enter", s)).toEqual({ type: "playStop" });
    expect(resolveShortcut("m", s)).toEqual({ type: "toggleMetronome" });
    expect(resolveShortcut("M", s)).toEqual({ type: "toggleMetronome" });
  });

  it("ignores keys it doesn't own", () => {
    for (const key of ["a", "Tab", "ArrowUp", "F5", "5", "9", "/"]) {
      expect(resolveShortcut(key, s)).toBeNull();
    }
  });

  it("mutes master with 0 and buses with 1-3", () => {
    const three = { ...s, buses: [...s.buses, { ...s.buses[0], id: 7 }, { ...s.buses[0], id: 9 }] };
    expect(resolveShortcut("0", three)).toEqual({ type: "toggleMasterMute" });
    expect(resolveShortcut("1", three)).toEqual({ type: "toggleBusMute", id: three.buses[0].id });
    expect(resolveShortcut("2", three)).toEqual({ type: "toggleBusMute", id: 7 });
    expect(resolveShortcut("3", three)).toEqual({ type: "toggleBusMute", id: 9 });
  });

  it("declines a bus key with no bus behind it", () => {
    // The default station has exactly one bus.
    expect(resolveShortcut("2", s)).toBeNull();
    expect(resolveShortcut("3", s)).toBeNull();
  });

  describe("multiplier stepping", () => {
    // bars = 4 → multipliers 1, 2, 4.
    const at = (multiplier: number) => ({ ...s, bars: 4, multiplier });

    it("moves right and left", () => {
      expect(resolveShortcut(".", at(1))).toEqual({ type: "setMultiplier", value: 2 });
      expect(resolveShortcut(".", at(2))).toEqual({ type: "setMultiplier", value: 4 });
      expect(resolveShortcut(",", at(4))).toEqual({ type: "setMultiplier", value: 2 });
      expect(resolveShortcut(",", at(2))).toEqual({ type: "setMultiplier", value: 1 });
    });

    it("wraps at both ends", () => {
      expect(resolveShortcut(".", at(4))).toEqual({ type: "setMultiplier", value: 1 });
      expect(resolveShortcut(",", at(1))).toEqual({ type: "setMultiplier", value: 4 });
    });

    it("handles a bar count with only one option", () => {
      const one = { ...s, bars: 1, multiplier: 1 };
      expect(resolveShortcut(".", one)).toEqual({ type: "setMultiplier", value: 1 });
      expect(resolveShortcut(",", one)).toEqual({ type: "setMultiplier", value: 1 });
    });

    it("accepts the shifted pair the hint advertises", () => {
      // The hint reads "< >", so those must work as well as "," and ".".
      expect(resolveShortcut(">", at(1))).toEqual({ type: "setMultiplier", value: 2 });
      expect(resolveShortcut("<", at(2))).toEqual({ type: "setMultiplier", value: 1 });
    });

    it("R jumps straight back to x1", () => {
      expect(resolveShortcut("r", at(4))).toEqual({ type: "setMultiplier", value: 1 });
      expect(resolveShortcut("R", at(2))).toEqual({ type: "setMultiplier", value: 1 });
    });
  });
});

describe("arrow keys", () => {
  const threeBuses = (selectedBusId: number) => ({
    ...createSession(),
    buses: [
      { ...createSession().buses[0], id: 1 },
      { ...createSession().buses[0], id: 7, colorIndex: 1 },
      { ...createSession().buses[0], id: 9, colorIndex: 2 },
    ],
    selectedBusId,
  });

  describe("left and right change the selected bus", () => {
    it("steps in both directions", () => {
      expect(resolveShortcut("ArrowRight", threeBuses(1))).toEqual({
        type: "selectBus",
        id: 7,
      });
      expect(resolveShortcut("ArrowLeft", threeBuses(7))).toEqual({
        type: "selectBus",
        id: 1,
      });
    });

    it("wraps at both ends", () => {
      expect(resolveShortcut("ArrowRight", threeBuses(9))).toEqual({
        type: "selectBus",
        id: 1,
      });
      expect(resolveShortcut("ArrowLeft", threeBuses(1))).toEqual({
        type: "selectBus",
        id: 9,
      });
    });

    it("declines when there is only one bus", () => {
      const one = createSession();
      expect(resolveShortcut("ArrowLeft", one)).toBeNull();
      expect(resolveShortcut("ArrowRight", one)).toBeNull();
    });
  });

  describe("up and down move the track selection", () => {
    const three = (selectedTrackId: number | null) =>
      withTracks([track(1), track(2), track(3)], { selectedTrackId });

    it("does nothing when no track is selected", () => {
      expect(resolveShortcut("ArrowUp", three(null))).toBeNull();
      expect(resolveShortcut("ArrowDown", three(null))).toBeNull();
    });

    it("steps in both directions", () => {
      expect(resolveShortcut("ArrowDown", three(1))).toEqual({ type: "selectTrack", id: 2 });
      expect(resolveShortcut("ArrowUp", three(3))).toEqual({ type: "selectTrack", id: 2 });
    });

    it("clamps at both ends instead of wrapping", () => {
      // Returning the current id would *deselect*, since selectTrack toggles.
      expect(resolveShortcut("ArrowUp", three(1))).toBeNull();
      expect(resolveShortcut("ArrowDown", three(3))).toBeNull();
    });

    it("declines when the only selectable track is the selected one", () => {
      const one = withTracks([track(1)], { selectedTrackId: 1 });
      expect(resolveShortcut("ArrowUp", one)).toBeNull();
      expect(resolveShortcut("ArrowDown", one)).toBeNull();
    });

    it("skips an in-progress track, which can't be selected", () => {
      const s = withTracks([track(1), track(2, { spawnLoopEndTime: 99 }), track(3)], {
        selectedTrackId: 1,
      });
      expect(resolveShortcut("ArrowDown", s)).toEqual({ type: "selectTrack", id: 3 });
    });

    it("ignores a selection pointing at a track that has since locked", () => {
      const s = withTracks([track(1), track(2, { spawnLoopEndTime: 5 })], {
        selectedTrackId: 2,
      });
      expect(resolveShortcut("ArrowUp", s)).toBeNull();
    });
  });
});

describe("Alt+arrow reordering", () => {
  const three = (selectedTrackId: number | null) =>
    withTracks([track(1), track(2), track(3)], { selectedTrackId });

  it("follows the selected track, not whatever holds focus", () => {
    // The bug this replaced: a row-local handler kept moving the row that was
    // clicked first, because arrowing the selection never moves DOM focus.
    expect(resolveAltShortcut("ArrowDown", three(1))).toEqual({
      type: "moveTrack",
      id: 1,
      toIndex: 1,
    });
    expect(resolveAltShortcut("ArrowDown", three(2))).toEqual({
      type: "moveTrack",
      id: 2,
      toIndex: 2,
    });
    expect(resolveAltShortcut("ArrowUp", three(3))).toEqual({
      type: "moveTrack",
      id: 3,
      toIndex: 1,
    });
  });

  it("does nothing when no track is selected", () => {
    expect(resolveAltShortcut("ArrowUp", three(null))).toBeNull();
    expect(resolveAltShortcut("ArrowDown", three(null))).toBeNull();
  });

  it("clamps at both ends", () => {
    expect(resolveAltShortcut("ArrowUp", three(1))).toBeNull();
    expect(resolveAltShortcut("ArrowDown", three(3))).toBeNull();
  });

  it("respects the in-progress floor", () => {
    // Track 3 is recording, so track 2 can't be pushed below it.
    const s = withTracks([track(1), track(2), track(3, { spawnLoopEndTime: 99 })], {
      selectedTrackId: 2,
    });
    expect(resolveAltShortcut("ArrowDown", s)).toBeNull();
    expect(resolveAltShortcut("ArrowUp", s)).toEqual({
      type: "moveTrack",
      id: 2,
      toIndex: 0,
    });
  });

  it("declines when the selection points at a locked track", () => {
    const s = withTracks([track(1), track(2, { spawnLoopEndTime: 5 })], {
      selectedTrackId: 2,
    });
    expect(resolveAltShortcut("ArrowDown", s)).toBeNull();
  });

  it("owns only the arrow pair", () => {
    for (const key of [" ", "Enter", "m", ".", "Delete", "ArrowLeft", "ArrowRight"]) {
      expect(resolveAltShortcut(key, three(1))).toBeNull();
    }
  });
});

describe("Escape deselects", () => {
  it("clears the selection when there is one", () => {
    const s = withTracks([track(1)], { selectedTrackId: 1 });
    expect(resolveShortcut("Escape", s)).toEqual({ type: "selectTrack", id: null });
  });

  it("does nothing when nothing is selected", () => {
    expect(resolveShortcut("Escape", withTracks([track(1)]))).toBeNull();
    expect(resolveShortcut("Escape", createSession())).toBeNull();
  });
});

describe("deleteTarget", () => {
  it("does nothing on an empty station", () => {
    expect(deleteTarget(createSession())).toBeNull();
  });

  it("takes the bottom-most track when nothing is selected", () => {
    const s = withTracks([track(1), track(2), track(3)]);
    expect(deleteTarget(s)).toEqual({ type: "deleteTrack", id: 3 });
  });

  it("prefers the selected track over the bottom-most", () => {
    const s = withTracks([track(1), track(2), track(3)], { selectedTrackId: 1 });
    expect(deleteTarget(s)).toEqual({ type: "deleteTrack", id: 1 });
  });

  it("removes an overwrite before the track carrying it", () => {
    const withOverwrite = track(2, {
      overwrite: { segmentId: 99, startPhase: 0, endPhase: 1, delayMs: 0 },
    });
    const s = withTracks([track(1), withOverwrite]);
    expect(deleteTarget(s)).toEqual({ type: "deleteOverwrite", id: 2 });

    // Once the overwrite is gone, the same key takes the track.
    const plain = withTracks([track(1), track(2)]);
    expect(deleteTarget(plain)).toEqual({ type: "deleteTrack", id: 2 });
  });

  it("skips a locked track at the bottom", () => {
    const recording = track(3, { spawnLoopEndTime: 123 });
    const s = withTracks([track(1), track(2), recording]);
    expect(deleteTarget(s)).toEqual({ type: "deleteTrack", id: 2 });
  });

  it("declines when every track is locked", () => {
    const s = withTracks([track(1, { spawnLoopEndTime: 1 })]);
    expect(deleteTarget(s)).toBeNull();
  });

  it("ignores a stale selection pointing at a locked track", () => {
    const s = withTracks([track(1), track(2, { spawnLoopEndTime: 5 })], { selectedTrackId: 2 });
    expect(deleteTarget(s)).toEqual({ type: "deleteTrack", id: 1 });
  });

  it("is reached through the Delete and Backspace keys alike", () => {
    const s = withTracks([track(1)]);
    expect(resolveShortcut("Delete", s)).toEqual({ type: "deleteTrack", id: 1 });
    expect(resolveShortcut("Backspace", s)).toEqual({ type: "deleteTrack", id: 1 });
  });
});
