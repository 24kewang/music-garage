import { describe, expect, it } from "vitest";
import { config } from "../config";
import {
  createSession,
  lockedFromIndex,
  reduce,
  transportUnlocked,
  NOTICES,
  type Effect,
  type SessionEvent,
  type SessionState,
} from "./session";
import { loopLengthSeconds } from "./transport";

/**
 * Drives the reducer the way the hook does: one event at a time, collecting
 * effects, with `clock` events standing in for the scheduler's ticks.
 */
function run(
  state: SessionState,
  steps: [SessionEvent, number][],
): { state: SessionState; effects: Effect[] } {
  const effects: Effect[] = [];
  let s = state;
  for (const [event, now] of steps) {
    const result = reduce(s, event, now);
    s = result.state;
    effects.push(...result.effects);
  }
  return { state: s, effects };
}

/** Default session: 92 BPM, 4 beats, 4 bars → loop of 16 beats. */
const LOOP = loopLengthSeconds(
  config.transport.defaultTempo,
  config.transport.defaultBeats,
  config.transport.defaultBars,
);
const BEAT = 60 / config.transport.defaultTempo;

const BAR = config.transport.defaultBeats * BEAT;

/** A session mid-way through a quantized start: metronome on at t=0, record at t=0. */
function quantizedStart() {
  return run(createSession(), [
    [{ type: "toggleMetronome" }, 0],
    [{ type: "record" }, 0],
  ]);
}

/** A running loop with one graduated x1 track, recorded quantized. */
function withOneTrack() {
  const countInEnd = config.transport.defaultBeats * BEAT;
  const first = run(quantizedStart().state, [
    [{ type: "clock" }, countInEnd], // count-in ends, capture begins
    [{ type: "clock" }, countInEnd + LOOP + 0.01], // segment completes + graduates
    [{ type: "record" }, countInEnd + LOOP + 0.02], // record off
  ]);
  return { ...first, anchor: countInEnd };
}

describe("quantized start", () => {
  it("snaps the count-in to the next accent, not the next click", () => {
    // Metronome on at t=1, record pressed at t=1.3: the count waits for the next
    // bar line (1 + BAR), so it begins where the player hears the bar begin.
    const { state } = run(createSession(), [
      [{ type: "toggleMetronome" }, 1],
      [{ type: "record" }, 1.3],
    ]);
    expect(state.recording.kind).toBe("countIn");
    if (state.recording.kind !== "countIn") return;
    expect(state.recording.startTime).toBeCloseTo(1 + BAR);
    expect(state.recording.endTime).toBeCloseTo(1 + 2 * BAR);
  });

  it("puts the loop anchor on a bar line, so the accent grid never shifts", () => {
    const { state } = run(createSession(), [
      [{ type: "toggleMetronome" }, 1],
      [{ type: "record" }, 1.3],
      [{ type: "clock" }, 1 + 2 * BAR + 0.01],
    ]);
    // The anchor is a whole number of bars after the metronome grid started.
    const barsSinceGrid = ((state.anchorTime as number) - 1) / BAR;
    expect(barsSinceGrid).toBeCloseTo(Math.round(barsSinceGrid));
  });

  it("starts capturing the first partition the moment the count-in ends", () => {
    const { state, effects } = run(quantizedStart().state, [
      [{ type: "clock" }, config.transport.defaultBeats * BEAT + 0.01],
    ]);
    expect(state.playing).toBe(true);
    expect(state.anchorTime).toBeCloseTo(config.transport.defaultBeats * BEAT);
    expect(state.loopSeconds).toBeCloseTo(LOOP);
    expect(state.recording.kind).toBe("capturing");
    if (state.recording.kind !== "capturing") return;
    expect(state.recording.segStart).toBeCloseTo(config.transport.defaultBeats * BEAT);
    expect(state.recording.segEnd).toBeCloseTo(config.transport.defaultBeats * BEAT + LOOP);
    expect(effects.some((e) => e.type === "startTransport")).toBe(true);
  });

  it("cancels entirely when record is pressed during the count-in", () => {
    const { state } = run(quantizedStart().state, [[{ type: "record" }, 1]]);
    expect(state.recording.kind).toBe("off");
    expect(state.anchorTime).toBeNull();
    expect(transportUnlocked(state)).toBe(true);
  });

  it("cancels entirely when play/stop is pressed during the count-in", () => {
    const { state } = run(quantizedStart().state, [[{ type: "playStop" }, 1]]);
    expect(state.recording.kind).toBe("off");
    expect(state.anchorTime).toBeNull();
  });

  it("cancels entirely when record is turned off before the first segment is set", () => {
    const countInEnd = config.transport.defaultBeats * BEAT;
    const { state, effects } = run(quantizedStart().state, [
      [{ type: "clock" }, countInEnd + 0.01], // capturing
      [{ type: "record" }, countInEnd + 1], // halted mid-first-segment
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.anchorTime).toBeNull();
    expect(state.tracks).toHaveLength(0);
    expect(effects.filter((e) => e.type === "stopTransport")).toHaveLength(1);
    expect(transportUnlocked(state)).toBe(true);
  });

  it("cancels entirely when the multiplier changes before the first segment is set", () => {
    const countInEnd = config.transport.defaultBeats * BEAT;
    const { state } = run(quantizedStart().state, [
      [{ type: "clock" }, countInEnd + 0.01],
      [{ type: "setMultiplier", value: 2 }, countInEnd + 1],
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.anchorTime).toBeNull();
    expect(state.tracks).toHaveLength(0);
  });

  it("rejects a quantized start whose loop would exceed the ceiling", () => {
    const { state } = run(createSession(), [
      [{ type: "setTempo", value: config.transport.minTempo }, 0],
      [{ type: "setBeats", value: config.transport.maxBeats }, 0],
      [{ type: "setBars", value: config.transport.maxBars }, 0],
      [{ type: "toggleMetronome" }, 0],
      [{ type: "record" }, 0],
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.notice).toBe(NOTICES.loopTooLong);
  });
});

describe("the normal record mechanism", () => {
  const countInEnd = config.transport.defaultBeats * BEAT;

  it("sets the first track from the first completed segment and stays armed", () => {
    const { state, effects } = run(quantizedStart().state, [
      [{ type: "clock" }, countInEnd],
      [{ type: "clock" }, countInEnd + LOOP],
    ]);
    expect(state.tracks).toHaveLength(1);
    const track = state.tracks[0];
    expect(track.reps).toBe(1);
    expect(track.name).toBe("TAKE 01");
    // x1: the spawn loop is the loop just recorded, so it graduates as it is set —
    // and the clock loop processes that graduation in the same pass.
    expect(track.spawnLoopEndTime).toBeNull();
    const extract = effects.find((e) => e.type === "extract");
    expect(extract).toBeDefined();
    if (extract?.type !== "extract") return;
    expect(extract.fromTime).toBeCloseTo(countInEnd);
    expect(extract.toTime).toBeCloseTo(countInEnd + LOOP);
    // Record stays on: the same clock pass re-arms and rolls straight into
    // capturing the next partition from the boundary just crossed.
    expect(state.recording.kind).toBe("capturing");
    if (state.recording.kind !== "capturing") return;
    expect(state.recording.segStart).toBeCloseTo(countInEnd + LOOP);
  });

  it("keeps spawning new tracks while record stays on", () => {
    const { state } = run(quantizedStart().state, [
      [{ type: "clock" }, countInEnd],
      [{ type: "clock" }, countInEnd + LOOP],
      [{ type: "clock" }, countInEnd + 2 * LOOP],
    ]);
    expect(state.tracks).toHaveLength(2);
    expect(state.tracks[1].name).toBe("TAKE 02");
  });

  it("with x2, a re-recorded partition replaces the in-progress track", () => {
    // Start a fresh x2 session on an existing loop, pressing record in the
    // second half of iteration 2 so the next half-boundary is anchor + 2L.
    const base = withOneTrack();
    const t0 = base.anchor + 1.6 * LOOP;
    const { state, effects } = run(base.state, [
      [{ type: "setMultiplier", value: 2 }, t0],
      [{ type: "record" }, t0],
      // Capture of the first half of iteration 3 begins at anchor + 2L…
      [{ type: "clock" }, base.anchor + 2 * LOOP + 0.01],
      // …and completes at anchor + 2.5L, setting the track.
      [{ type: "clock" }, base.anchor + 2.5 * LOOP + 0.01],
    ]);
    expect(state.tracks).toHaveLength(2);
    const spawned = state.tracks[1];
    expect(spawned.reps).toBe(2);
    expect(spawned.spawnLoopEndTime).toBeCloseTo(base.anchor + 3 * LOOP);
    const firstSegment = spawned.segmentId;

    // Re-record the second half; it replaces the same track.
    const replay = run(state, [[{ type: "clock" }, base.anchor + 3 * LOOP + 0.01]]);
    expect(replay.state.tracks).toHaveLength(2);
    const replaced = replay.state.tracks[1];
    expect(replaced.id).toBe(spawned.id);
    expect(replaced.segmentId).not.toBe(firstSegment);
    // The old audio is disposed, the new extracted.
    expect(replay.effects.some((e) => e.type === "disposeSegment" && e.segmentId === firstSegment)).toBe(true);
    // And having reached its spawn loop end, the track graduates in the same pass.
    expect(replaced.spawnLoopEndTime).toBeNull();
    expect(effects.some((e) => e.type === "extract")).toBe(true);
  });

  it("discards the in-flight segment when the multiplier changes, then re-arms", () => {
    const base = withOneTrack();
    const t0 = base.anchor + LOOP + 0.1;
    const { state, effects } = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "clock" }, base.anchor + 2 * LOOP + 0.01], // capturing iteration 3
      [{ type: "setMultiplier", value: 4 }, base.anchor + 2 * LOOP + 1],
    ]);
    expect(state.recording.kind).toBe("armed");
    expect(state.multiplier).toBe(4);
    // Nothing extracted for the discarded segment; only the base track exists.
    expect(state.tracks).toHaveLength(1);
    expect(effects.filter((e) => e.type === "extract")).toHaveLength(0);
  });

  it("record-off keeps the set track but discards the in-flight segment", () => {
    const base = withOneTrack();
    const t0 = base.anchor + LOOP + 0.1;
    const { state } = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "clock" }, base.anchor + 2 * LOOP + 0.01],
      [{ type: "record" }, base.anchor + 2 * LOOP + 1], // off mid-capture
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.tracks).toHaveLength(1); // no second track was set
    expect(state.playing).toBe(true); // the loop keeps running
  });

  it("caps the number of tracks with a notice", () => {
    let s = quantizedStart().state;
    s = reduce(s, { type: "clock" }, countInEnd).state;
    // Let it spawn tracks until the cap.
    for (let i = 1; i <= config.mix.maxTracks + 2; i++) {
      s = reduce(s, { type: "clock" }, countInEnd + i * LOOP).state;
    }
    expect(s.tracks.length).toBe(config.mix.maxTracks);
    expect(s.recording.kind).toBe("off");
    expect(s.notice).toBe(NOTICES.tooManyTracks);
  });
});

describe("free mode", () => {
  it("derives tempo, anchor and loop from the two presses and the multiplier", () => {
    const { state, effects } = run(createSession(), [
      [{ type: "setMultiplier", value: 2 }, 0],
      [{ type: "record" }, 5],
      [{ type: "record" }, 9], // 4s free loop, x2 → 8s master loop
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.playing).toBe(true);
    expect(state.anchorTime).toBeCloseTo(5);
    expect(state.loopSeconds).toBeCloseTo(8);
    // 4 bars × 4 beats / x2 = 8 beats over 4s → 120 BPM.
    expect(state.tempo).toBeCloseTo(120);
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].reps).toBe(2);
    // Still in its spawn loop (ends at anchor + loop = 13).
    expect(state.tracks[0].spawnLoopEndTime).toBeCloseTo(13);
    const extract = effects.find((e) => e.type === "extract");
    if (extract?.type !== "extract") return;
    expect(extract.fromTime).toBeCloseTo(5);
    expect(extract.toTime).toBeCloseTo(9);
  });

  it("an x1 free track graduates immediately", () => {
    const { state } = run(createSession(), [
      [{ type: "record" }, 2],
      [{ type: "record" }, 6],
      [{ type: "clock" }, 6.01],
    ]);
    expect(state.tracks[0].spawnLoopEndTime).toBeNull();
  });

  it("refuses the metronome while the free loop is still open", () => {
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "toggleMetronome" }, 1],
    ]);
    expect(state.metronomeOn).toBe(false);
  });

  it("allows the metronome once the free loop has decided the tempo", () => {
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "record" }, 4],
      [{ type: "toggleMetronome" }, 5],
    ]);
    expect(state.metronomeOn).toBe(true);
  });

  it("rejects a free loop that is too short", () => {
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "record" }, config.transport.minFreeLoopSeconds / 2],
    ]);
    expect(state.notice).toBe(NOTICES.freeTooShort);
    expect(state.tracks).toHaveLength(0);
    expect(state.anchorTime).toBeNull();
  });

  it("cancels on play/stop mid-free-recording", () => {
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "playStop" }, 2],
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.tracks).toHaveLength(0);
    expect(transportUnlocked(state)).toBe(true);
  });

  it("rejects a free loop whose derived tempo is over the ceiling", () => {
    // 4 bars × 4 beats = 16 beats crammed into 1s → 960 BPM.
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "record" }, 1],
    ]);
    expect(state.notice).toBe(NOTICES.tempoTooFast);
    expect(state.tracks).toHaveLength(0);
    expect(transportUnlocked(state)).toBe(true);
  });

  it("rejects a free loop whose derived tempo is under the floor", () => {
    // 16 beats spread over 55s → ~17 BPM. The loop length itself is legal, so
    // only the tempo check catches this one.
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "record" }, 55],
    ]);
    expect(state.notice).toBe(NOTICES.tempoTooSlow);
    expect(state.tracks).toHaveLength(0);
  });

  it("accepts a tempo right at the ceiling", () => {
    // 16 beats over exactly 16 * 60/500 seconds → 500 BPM.
    const seconds = (16 * 60) / config.transport.maxTempo;
    const { state } = run(createSession(), [
      [{ type: "record" }, 0],
      [{ type: "record" }, seconds],
    ]);
    expect(state.notice).toBeNull();
    expect(state.tempo).toBeCloseTo(config.transport.maxTempo);
    expect(state.tracks).toHaveLength(1);
  });
});

describe("track names", () => {
  const countInEnd = config.transport.defaultBeats * BEAT;

  function withThreeTracks() {
    let s = quantizedStart().state;
    s = reduce(s, { type: "clock" }, countInEnd).state;
    for (let i = 1; i <= 3; i++) {
      s = reduce(s, { type: "clock" }, countInEnd + i * LOOP).state;
    }
    return reduce(s, { type: "record" }, countInEnd + 3 * LOOP + 0.01).state;
  }

  it("counts up while nothing is free", () => {
    expect(withThreeTracks().tracks.map((t) => t.name)).toEqual([
      "TAKE 01",
      "TAKE 02",
      "TAKE 03",
    ]);
  });

  /** The name of the next track a fresh record session sets, from time 100. */
  function nameOfNextTake(state: SessionState): string {
    const before = state.tracks.length;
    // Far enough ahead for the arm, the capture and its completion.
    const after = run(state, [
      [{ type: "record" }, 100],
      [{ type: "clock" }, 120],
    ]).state;
    return after.tracks[before].name;
  }

  it("reuses the smallest number a deletion freed", () => {
    const three = withThreeTracks();
    const without1 = reduce(three, { type: "deleteTrack", id: three.tracks[0].id }, 100).state;
    expect(nameOfNextTake(without1)).toBe("TAKE 01");
  });

  it("reuses a number freed by a rename", () => {
    const three = withThreeTracks();
    const renamed = reduce(
      three,
      { type: "renameTrack", id: three.tracks[1].id, name: "BASS" },
      100,
    ).state;
    expect(renamed.tracks.map((t) => t.name)).toEqual(["TAKE 01", "BASS", "TAKE 03"]);
    expect(nameOfNextTake(renamed)).toBe("TAKE 02");
  });
});

describe("delete all tracks", () => {
  it("clears every track, disposes its audio, and unlocks the transport", () => {
    const base = withOneTrack();
    const { state, effects } = run(base.state, [[{ type: "deleteAllTracks" }, 100]]);
    expect(state.tracks).toHaveLength(0);
    expect(state.playing).toBe(false);
    expect(transportUnlocked(state)).toBe(true);
    expect(effects.some((e) => e.type === "removeTrackAudio")).toBe(true);
    expect(effects.some((e) => e.type === "disposeSegment")).toBe(true);
    expect(effects.some((e) => e.type === "stopTransport")).toBe(true);
  });

  it("reaches in-progress tracks and cancels the recording", () => {
    // A free x2 track is still inside its spawn loop, so single delete refuses it.
    const free = run(createSession(), [
      [{ type: "setMultiplier", value: 2 }, 0],
      [{ type: "record" }, 0],
      [{ type: "record" }, 2],
    ]);
    const id = free.state.tracks[0].id;
    expect(reduce(free.state, { type: "deleteTrack", id }, 2.5).state.tracks).toHaveLength(1);

    const { state } = run(free.state, [[{ type: "deleteAllTracks" }, 2.5]]);
    expect(state.tracks).toHaveLength(0);
    expect(state.recording.kind).toBe("off");
  });

  it("also disposes an overwrite's segment", () => {
    const base = withOneTrack();
    const t0 = base.anchor + LOOP + 1;
    const withOw = run(base.state, [
      [{ type: "selectTrack", id: base.state.tracks[0].id }, t0 - 0.5],
      [{ type: "record" }, t0],
      [{ type: "record" }, t0 + 1],
    ]);
    const owSegment = withOw.state.tracks[0].overwrite?.segmentId;
    const { effects } = run(withOw.state, [[{ type: "deleteAllTracks" }, t0 + 2]]);
    expect(
      effects.some((e) => e.type === "disposeSegment" && e.segmentId === owSegment),
    ).toBe(true);
  });

  it("does nothing on an already-empty station", () => {
    const s = createSession();
    expect(reduce(s, { type: "deleteAllTracks" }, 0).state).toBe(s);
  });
});

describe("locking", () => {
  it("locks tempo, beats and bars once a track exists, and unlocks on delete-all", () => {
    const base = withOneTrack();
    expect(transportUnlocked(base.state)).toBe(false);
    const locked = run(base.state, [
      [{ type: "setTempo", value: 140 }, 100],
      [{ type: "setBeats", value: 3 }, 100],
      [{ type: "setBars", value: 8 }, 100],
    ]);
    expect(locked.state.tempo).toBe(base.state.tempo);
    expect(locked.state.beats).toBe(base.state.beats);
    expect(locked.state.bars).toBe(base.state.bars);

    const emptied = run(locked.state, [
      [{ type: "deleteTrack", id: base.state.tracks[0].id }, 101],
    ]);
    expect(emptied.state.tracks).toHaveLength(0);
    expect(emptied.state.anchorTime).toBeNull();
    expect(transportUnlocked(emptied.state)).toBe(true);
    expect(emptied.effects.some((e) => e.type === "stopTransport")).toBe(true);

    const retuned = run(emptied.state, [[{ type: "setTempo", value: 140 }, 102]]);
    expect(retuned.state.tempo).toBe(140);
  });

  it("resets the multiplier when bars stop dividing by it", () => {
    const { state } = run(createSession(), [
      [{ type: "setBars", value: 4 }, 0],
      [{ type: "setMultiplier", value: 4 }, 0],
      [{ type: "setBars", value: 5 }, 0],
    ]);
    expect(state.multiplier).toBe(1);
  });
});

describe("play/stop", () => {
  it("stop graduates a set-but-in-progress track immediately", () => {
    const base = withOneTrack();
    // Spawn an x2 track (pressing in the second half of iteration 2, so capture
    // begins at anchor + 2L) and stop before its spawn loop ends.
    const { state } = run(base.state, [
      [{ type: "setMultiplier", value: 2 }, base.anchor + 1.6 * LOOP],
      [{ type: "record" }, base.anchor + 1.6 * LOOP],
      [{ type: "clock" }, base.anchor + 2 * LOOP + 0.01],
      [{ type: "clock" }, base.anchor + 2.5 * LOOP + 0.01], // first half set
      [{ type: "playStop" }, base.anchor + 2.6 * LOOP],
    ]);
    expect(state.playing).toBe(false);
    expect(state.recording.kind).toBe("off");
    expect(state.tracks).toHaveLength(2);
    expect(state.tracks[1].spawnLoopEndTime).toBeNull();
  });

  it("play resumes from the beginning of the loop with a fresh anchor", () => {
    const base = withOneTrack();
    const { state, effects } = run(base.state, [
      [{ type: "playStop" }, base.anchor + 1.5 * LOOP],
      [{ type: "playStop" }, base.anchor + 5 * LOOP],
    ]);
    expect(state.playing).toBe(true);
    expect(state.anchorTime).toBeCloseTo(base.anchor + 5 * LOOP);
    expect(effects.filter((e) => e.type === "startTransport")).toHaveLength(1);
  });

  it("does nothing when stopped and empty", () => {
    const s = createSession();
    expect(reduce(s, { type: "playStop" }, 3).state).toBe(s);
  });
});

describe("overwrite", () => {
  function withSelectedTrack() {
    const base = withOneTrack();
    const state = reduce(
      base.state,
      { type: "selectTrack", id: base.state.tracks[0].id },
      base.anchor + LOOP + 0.1,
    ).state;
    return { ...base, state };
  }

  it("starts at the press and ends at the second press with exact phases", () => {
    const base = withSelectedTrack();
    const t0 = base.anchor + LOOP + 1; // phase 1s into iteration 2
    const t1 = t0 + 2;
    const { state, effects } = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "record" }, t1],
    ]);
    expect(state.recording.kind).toBe("off");
    const ow = state.tracks[0].overwrite;
    expect(ow).not.toBeNull();
    if (!ow) return;
    expect(ow.startPhase).toBeCloseTo(1);
    expect(ow.endPhase).toBeCloseTo(3);
    expect(ow.delayMs).toBe(state.defaultDelayMs);
    const extract = effects.find((e) => e.type === "extract");
    if (extract?.type !== "extract") return;
    expect(extract.fromTime).toBeCloseTo(t0);
    expect(extract.toTime).toBeCloseTo(t1);
  });

  it("clamps at the loop end, marking endPhase as the full loop", () => {
    const base = withSelectedTrack();
    const t0 = base.anchor + LOOP + (LOOP - 1); // 1s before iteration 2 ends
    const { state } = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "clock" }, base.anchor + 2 * LOOP + 0.3], // loop end passed
    ]);
    const ow = state.tracks[0].overwrite;
    if (!ow) throw new Error("expected overwrite");
    expect(ow.startPhase).toBeCloseTo(LOOP - 1);
    expect(ow.endPhase).toBeCloseTo(LOOP);
  });

  it("a new overwrite disposes the old one only on successful completion", () => {
    const base = withSelectedTrack();
    const t0 = base.anchor + LOOP + 1;
    const first = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "record" }, t0 + 1],
    ]);
    const firstSeg = first.state.tracks[0].overwrite?.segmentId;
    // Start a second overwrite, then discard it with play/stop: the first stays.
    const discarded = run(first.state, [
      [{ type: "record" }, t0 + 2],
      [{ type: "playStop" }, t0 + 2.5],
    ]);
    expect(discarded.state.tracks[0].overwrite?.segmentId).toBe(firstSeg);
    // Complete a second overwrite: the first segment is disposed.
    const resumed = run(first.state, [
      [{ type: "record" }, t0 + 2],
      [{ type: "record" }, t0 + 3],
    ]);
    expect(resumed.state.tracks[0].overwrite?.segmentId).not.toBe(firstSeg);
    expect(
      resumed.effects.some((e) => e.type === "disposeSegment" && e.segmentId === firstSeg),
    ).toBe(true);
  });

  it("never offers overwrite for a repetition track", () => {
    // Build a loop whose only track has reps 2 (free mode x2), then select it.
    const free = run(createSession(), [
      [{ type: "setMultiplier", value: 2 }, 0],
      [{ type: "record" }, 0],
      [{ type: "record" }, 2], // 2s free, x2 → 4s loop
      [{ type: "clock" }, 4.01], // graduate
    ]);
    const trackId = free.state.tracks[0].id;
    const { state } = run(free.state, [
      [{ type: "selectTrack", id: trackId }, 5],
      [{ type: "record" }, 5],
    ]);
    // Selection succeeded, but the record press armed a normal session.
    expect(state.selectedTrackId).toBe(trackId);
    expect(state.recording.kind).toBe("armed");
  });

  it("cannot select an in-progress track at all", () => {
    const free = run(createSession(), [
      [{ type: "setMultiplier", value: 2 }, 0],
      [{ type: "record" }, 0],
      [{ type: "record" }, 2],
    ]);
    const trackId = free.state.tracks[0].id;
    const { state } = run(free.state, [[{ type: "selectTrack", id: trackId }, 2.5]]);
    expect(state.selectedTrackId).toBeNull();
  });

  it("track delay and overwrite delay are independent", () => {
    const base = withSelectedTrack();
    const t0 = base.anchor + LOOP + 1;
    const withOw = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "record" }, t0 + 1],
    ]);
    const id = withOw.state.tracks[0].id;
    const { state, effects } = run(withOw.state, [
      [{ type: "setTrackDelay", id, ms: -120 }, t0 + 2],
      [{ type: "setOverwriteDelay", id, ms: 40 }, t0 + 2],
    ]);
    expect(state.tracks[0].delayMs).toBe(-120);
    expect(state.tracks[0].overwrite?.delayMs).toBe(40);
    expect(effects.filter((e) => e.type === "rebake")).toHaveLength(2);
  });

  it("deleting an overwrite rebakes the untouched original", () => {
    const base = withSelectedTrack();
    const t0 = base.anchor + LOOP + 1;
    const withOw = run(base.state, [
      [{ type: "record" }, t0],
      [{ type: "record" }, t0 + 1],
    ]);
    const id = withOw.state.tracks[0].id;
    const originalSegment = withOw.state.tracks[0].segmentId;
    const { state, effects } = run(withOw.state, [[{ type: "deleteOverwrite", id }, t0 + 2]]);
    expect(state.tracks[0].overwrite).toBeNull();
    expect(state.tracks[0].segmentId).toBe(originalSegment);
    expect(effects.some((e) => e.type === "rebake" && e.trackId === id)).toBe(true);
  });
});

describe("overwrite auto-detect", () => {
  function armed() {
    const base = withOneTrack();
    const state = run(base.state, [
      [{ type: "toggleAutoDetect" }, base.anchor],
      [{ type: "selectTrack", id: base.state.tracks[0].id }, base.anchor + 0.1],
    ]).state;
    return { ...base, state };
  }

  it("listens instead of punching in straight away", () => {
    const base = armed();
    const { state } = run(base.state, [[{ type: "record" }, base.anchor + LOOP + 1]]);
    expect(state.recording.kind).toBe("detecting");
    if (state.recording.kind !== "detecting") return;
    expect(state.recording.trackId).toBe(base.state.tracks[0].id);
  });

  it("punches in where the note was played, backed off a little", () => {
    const base = armed();
    const heard = base.anchor + LOOP + 2;
    const { state } = run(base.state, [
      [{ type: "record" }, base.anchor + LOOP + 1],
      [{ type: "overwriteDetected", at: heard }, heard],
    ]);
    expect(state.recording.kind).toBe("overdub");
    if (state.recording.kind !== "overdub") return;
    expect(state.recording.startTime).toBeCloseTo(
      heard - config.autoDetect.onsetBackoffMs / 1000,
    );
    // Still ends at the end of the loop the note landed in.
    expect(state.recording.endBound).toBeCloseTo(base.anchor + 2 * LOOP);
  });

  it("never backs off past the start of the loop it heard the note in", () => {
    const base = armed();
    // A note right on the loop boundary: backing off would wrap the phase to
    // the far end and punch at the wrong place entirely.
    const heard = base.anchor + LOOP + 0.001;
    const { state } = run(base.state, [
      [{ type: "record" }, base.anchor + LOOP - 1],
      [{ type: "overwriteDetected", at: heard }, heard],
    ]);
    if (state.recording.kind !== "overdub") throw new Error("expected overdub");
    expect(state.recording.startTime).toBeCloseTo(base.anchor + LOOP);
  });

  it("keeps listening across a loop boundary", () => {
    const base = armed();
    const { state } = run(base.state, [
      [{ type: "record" }, base.anchor + LOOP + 1],
      [{ type: "clock" }, base.anchor + 3 * LOOP],
    ]);
    expect(state.recording.kind).toBe("detecting");
  });

  it("cancels on a second press before anything is heard", () => {
    const base = armed();
    const { state } = run(base.state, [
      [{ type: "record" }, base.anchor + LOOP + 1],
      [{ type: "record" }, base.anchor + LOOP + 2],
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.tracks[0].overwrite).toBeNull();
  });

  it("cancels on play/stop, leaving the loop intact", () => {
    const base = armed();
    const { state } = run(base.state, [
      [{ type: "record" }, base.anchor + LOOP + 1],
      [{ type: "playStop" }, base.anchor + LOOP + 2],
    ]);
    expect(state.recording.kind).toBe("off");
    expect(state.tracks).toHaveLength(1);
    expect(state.playing).toBe(false);
  });

  it("locks the toggle once the gesture is under way", () => {
    const base = armed();
    const detecting = run(base.state, [[{ type: "record" }, base.anchor + LOOP + 1]]).state;
    expect(reduce(detecting, { type: "toggleAutoDetect" }, 0).state).toBe(detecting);

    const heard = base.anchor + LOOP + 2;
    const overdubbing = reduce(detecting, { type: "overwriteDetected", at: heard }, heard).state;
    expect(reduce(overdubbing, { type: "toggleAutoDetect" }, 0).state).toBe(overdubbing);
  });

  it("ignores a detection when nothing is listening", () => {
    const base = withOneTrack();
    expect(reduce(base.state, { type: "overwriteDetected", at: 100 }, 100).state).toBe(
      base.state,
    );
  });

  it("punches in immediately when the toggle is off", () => {
    const base = withOneTrack();
    const { state } = run(base.state, [
      [{ type: "selectTrack", id: base.state.tracks[0].id }, base.anchor + 0.1],
      [{ type: "record" }, base.anchor + LOOP + 1],
    ]);
    expect(state.recording.kind).toBe("overdub");
  });
});

describe("adoptTrackDefaults", () => {
  it("copies a track's volume and reverb into the defaults", () => {
    const base = withOneTrack();
    const id = base.state.tracks[0].id;
    const tuned = run(base.state, [
      [{ type: "setTrackVolume", id, value: 44 }, 100],
      [{ type: "setTrackReverb", id, value: 77 }, 100],
      [{ type: "adoptTrackDefaults", id }, 100],
    ]);
    expect(tuned.state.defaultTrackVolume).toBe(44);
    expect(tuned.state.defaultTrackReverb).toBe(77);
  });

  it("leaves the delay alone — that is alignment, not taste", () => {
    const base = withOneTrack();
    const id = base.state.tracks[0].id;
    const tuned = run(base.state, [
      [{ type: "setTrackDelay", id, ms: -300 }, 100],
      [{ type: "adoptTrackDefaults", id }, 100],
    ]);
    expect(tuned.state.defaultDelayMs).toBe(base.state.defaultDelayMs);
  });

  it("refuses an in-progress or unknown track", () => {
    const free = run(createSession(), [
      [{ type: "setMultiplier", value: 2 }, 0],
      [{ type: "record" }, 0],
      [{ type: "record" }, 2],
    ]);
    const id = free.state.tracks[0].id;
    expect(reduce(free.state, { type: "adoptTrackDefaults", id }, 2.5).state).toBe(free.state);
    expect(reduce(free.state, { type: "adoptTrackDefaults", id: 999 }, 2.5).state).toBe(
      free.state,
    );
  });
});

describe("buses", () => {
  it("attaches new tracks to the selected bus", () => {
    const withBus = run(createSession(), [[{ type: "addBus" }, 0]]);
    const busId = withBus.state.selectedBusId;
    expect(busId).not.toBe(1);
    const { state } = run(withBus.state, [
      [{ type: "record" }, 1],
      [{ type: "record" }, 3],
    ]);
    expect(state.tracks[0].busId).toBe(busId);
  });

  it("caps buses, protects the first, and reassigns tracks on delete", () => {
    let s = createSession();
    for (let i = 0; i < config.mix.maxBuses + 1; i++) {
      s = reduce(s, { type: "addBus" }, 0).state;
    }
    expect(s.buses.length).toBe(config.mix.maxBuses);
    expect(reduce(s, { type: "deleteBus", id: s.buses[0].id }, 0).state.buses.length).toBe(
      config.mix.maxBuses,
    );

    const withTrack = run(s, [
      [{ type: "record" }, 1],
      [{ type: "record" }, 3],
      [{ type: "clock" }, 5.01],
    ]);
    const lastBus = withTrack.state.buses[withTrack.state.buses.length - 1];
    expect(withTrack.state.tracks[0].busId).toBe(lastBus.id);
    const { state } = run(withTrack.state, [[{ type: "deleteBus", id: lastBus.id }, 6]]);
    const previous = withTrack.state.buses[withTrack.state.buses.length - 2];
    expect(state.tracks[0].busId).toBe(previous.id);
    expect(state.selectedBusId).toBe(previous.id);
  });

  it("gives each bus its own colour slot", () => {
    let s = createSession();
    for (let i = 0; i < config.mix.maxBuses - 1; i++) {
      s = reduce(s, { type: "addBus" }, 0).state;
    }
    expect(s.buses.map((b) => b.colorIndex)).toEqual([0, 1, 2]);
    expect(s.buses.map((b) => b.name)).toEqual(["BUS 1", "BUS 2", "BUS 3"]);
  });

  it("reuses the colour slot a deleted bus freed", () => {
    let s = createSession();
    s = reduce(s, { type: "addBus" }, 0).state;
    s = reduce(s, { type: "addBus" }, 0).state;
    // Drop the middle bus, then add another: it takes slot 1 back rather than
    // drifting past the end of the palette.
    s = reduce(s, { type: "deleteBus", id: s.buses[1].id }, 0).state;
    s = reduce(s, { type: "addBus" }, 0).state;
    expect(s.buses.map((b) => b.colorIndex).sort()).toEqual([0, 1, 2]);
    expect(s.buses[s.buses.length - 1].colorIndex).toBe(1);
  });
});

describe("mix levels", () => {
  it("lets the master boost past 100, up to the configured ceiling", () => {
    const boosted = reduce(createSession(), { type: "setMasterVolume", value: 120 }, 0);
    expect(boosted.state.master.volume).toBe(120);

    const over = reduce(
      createSession(),
      { type: "setMasterVolume", value: config.mix.maxMasterVolume + 50 },
      0,
    );
    expect(over.state.master.volume).toBe(config.mix.maxMasterVolume);
  });

  it("keeps tracks and buses capped at 100", () => {
    // The master's ceiling must not leak into the per-source faders.
    const base = withOneTrack();
    const id = base.state.tracks[0].id;
    const track = reduce(base.state, { type: "setTrackVolume", id, value: 140 }, 100);
    expect(track.state.tracks[0].volume).toBe(100);

    const busId = base.state.buses[0].id;
    const bus = reduce(base.state, { type: "setBusVolume", id: busId, value: 140 }, 100);
    expect(bus.state.buses[0].volume).toBe(100);
  });

  it("floors every fader at zero", () => {
    const s = createSession();
    expect(reduce(s, { type: "setMasterVolume", value: -20 }, 0).state.master.volume).toBe(0);
    expect(
      reduce(s, { type: "setBusVolume", id: s.buses[0].id, value: -20 }, 0).state.buses[0]
        .volume,
    ).toBe(0);
  });
});

describe("reordering", () => {
  const countInEnd = config.transport.defaultBeats * BEAT;

  /** Three graduated tracks, record off. */
  function withThree() {
    let s = quantizedStart().state;
    s = reduce(s, { type: "clock" }, countInEnd).state;
    for (let i = 1; i <= 3; i++) {
      s = reduce(s, { type: "clock" }, countInEnd + i * LOOP).state;
    }
    return reduce(s, { type: "record" }, countInEnd + 3 * LOOP + 0.01).state;
  }

  const names = (s: SessionState) => s.tracks.map((t) => t.name);

  it("moves a track down", () => {
    const s = withThree();
    const moved = reduce(s, { type: "moveTrack", id: s.tracks[0].id, toIndex: 2 }, 100);
    expect(names(moved.state)).toEqual(["TAKE 02", "TAKE 03", "TAKE 01"]);
    // Purely presentational: the audio graph is never touched.
    expect(moved.effects).toHaveLength(0);
  });

  it("moves a track up", () => {
    const s = withThree();
    const moved = reduce(s, { type: "moveTrack", id: s.tracks[2].id, toIndex: 0 }, 100);
    expect(names(moved.state)).toEqual(["TAKE 03", "TAKE 01", "TAKE 02"]);
  });

  it("clamps a target past the end", () => {
    const s = withThree();
    const moved = reduce(s, { type: "moveTrack", id: s.tracks[0].id, toIndex: 99 }, 100);
    expect(names(moved.state)).toEqual(["TAKE 02", "TAKE 03", "TAKE 01"]);
  });

  it("no-ops on the same index or an unknown id", () => {
    const s = withThree();
    expect(reduce(s, { type: "moveTrack", id: s.tracks[1].id, toIndex: 1 }, 100).state).toBe(s);
    expect(reduce(s, { type: "moveTrack", id: 9999, toIndex: 0 }, 100).state).toBe(s);
  });

  it("leaves selection, buses and recording state alone", () => {
    const base = withThree();
    const s = reduce(base, { type: "selectTrack", id: base.tracks[2].id }, 100).state;
    const moved = reduce(s, { type: "moveTrack", id: s.tracks[0].id, toIndex: 2 }, 100).state;
    expect(moved.selectedTrackId).toBe(s.selectedTrackId);
    expect(moved.buses).toBe(s.buses);
    expect(moved.recording).toBe(s.recording);
    expect(moved.tracks).toHaveLength(3);
  });

  describe("the in-progress floor", () => {
    /** Two graduated tracks, then an x2 track still inside its spawn loop. */
    function withFloor() {
      const s = withThree();
      // Delete one so the take names stay easy to read, then spawn an x2 track.
      const trimmed = reduce(s, { type: "deleteTrack", id: s.tracks[2].id }, 100).state;
      const anchor = trimmed.anchorTime as number;
      const t0 = anchor + 10.6 * LOOP;
      return run(trimmed, [
        [{ type: "setMultiplier", value: 2 }, t0],
        [{ type: "record" }, t0],
        [{ type: "clock" }, anchor + 11 * LOOP + 0.01],
        [{ type: "clock" }, anchor + 11.5 * LOOP + 0.01],
      ]).state;
    }

    it("reports the floor at the first in-progress track", () => {
      const s = withFloor();
      expect(s.tracks).toHaveLength(3);
      expect(s.tracks[2].spawnLoopEndTime).not.toBeNull();
      expect(lockedFromIndex(s.tracks)).toBe(2);
      // With nothing recording, the whole list is free.
      expect(lockedFromIndex(withThree().tracks)).toBe(3);
      expect(lockedFromIndex([])).toBe(0);
    });

    it("refuses to move the in-progress track itself", () => {
      const s = withFloor();
      expect(reduce(s, { type: "moveTrack", id: s.tracks[2].id, toIndex: 0 }, 200).state).toBe(s);
    });

    it("clamps a drop that targets the floor or below", () => {
      const s = withFloor();
      const before = names(s);
      const moved = reduce(s, { type: "moveTrack", id: s.tracks[0].id, toIndex: 2 }, 200);
      // Lands at index 1 — just above the in-progress track, not below it.
      expect(names(moved.state)).toEqual([before[1], before[0], before[2]]);
      expect(moved.state.tracks[2].spawnLoopEndTime).not.toBeNull();
    });

    it("still reorders freely above the floor", () => {
      const s = withFloor();
      const before = names(s);
      const moved = reduce(s, { type: "moveTrack", id: s.tracks[1].id, toIndex: 0 }, 200);
      expect(names(moved.state)).toEqual([before[1], before[0], before[2]]);
    });
  });
});

describe("new-recording defaults", () => {
  it("seed a spawned track and clamp to 0-100", () => {
    const configured = run(createSession(), [
      [{ type: "setDefaultTrackVolume", value: 42 }, 0],
      [{ type: "setDefaultTrackReverb", value: 66 }, 0],
      [{ type: "record" }, 1],
      [{ type: "record" }, 5],
    ]);
    expect(configured.state.tracks[0].volume).toBe(42);
    expect(configured.state.tracks[0].reverb).toBe(66);

    const clamped = run(createSession(), [
      [{ type: "setDefaultTrackVolume", value: 400 }, 0],
      [{ type: "setDefaultTrackReverb", value: -30 }, 0],
    ]);
    expect(clamped.state.defaultTrackVolume).toBe(100);
    expect(clamped.state.defaultTrackReverb).toBe(0);
  });

  it("never move a track that already exists", () => {
    const base = withOneTrack();
    const before = base.state.tracks[0].volume;
    const changed = run(base.state, [
      [{ type: "setDefaultTrackVolume", value: 12 }, 100],
      [{ type: "setDefaultTrackReverb", value: 90 }, 100],
    ]);
    expect(changed.state.tracks[0].volume).toBe(before);
    expect(changed.state.tracks[0].reverb).toBe(base.state.tracks[0].reverb);
  });

  it("start from the config defaults", () => {
    const s = createSession();
    expect(s.defaultTrackVolume).toBe(config.mix.defaultVolume);
    expect(s.defaultTrackReverb).toBe(config.mix.defaultReverb);
  });
});

describe("idle clock ticks", () => {
  it("return the same state object so React can bail out", () => {
    const base = withOneTrack();
    const tick = reduce(base.state, { type: "clock" }, base.anchor + LOOP + 0.2);
    expect(tick.state).toBe(base.state);
    expect(tick.effects).toHaveLength(0);
  });
});
