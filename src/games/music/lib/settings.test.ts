import { describe, expect, it } from "vitest";
import {
  activeCount,
  canDeactivate,
  coercePlayers,
  coerceSettings,
  coerceWord,
  DEFAULT_SETTINGS,
  defaultPlayers,
  enforceMinimumActive,
  MAX_LETTERS,
  MIN_ACTIVE,
  PLAYER_COUNT,
} from "./settings";

const roster = (...flags: boolean[]) =>
  flags.map((active, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    letters: 0,
    active,
  }));

describe("coerceWord", () => {
  it("uppercases and keeps letters", () => {
    expect(coerceWord("dog")).toBe("DOG");
  });

  it("strips anything that is not a letter", () => {
    expect(coerceWord("m-u 5s!")).toBe("MUS");
  });

  it("caps at five letters", () => {
    expect(coerceWord("ELEPHANT")).toBe("ELEPH");
    expect(coerceWord("ELEPHANT")).toHaveLength(MAX_LETTERS);
  });

  it("keeps a single letter", () => {
    expect(coerceWord("x")).toBe("X");
  });

  it("falls back rather than allowing an empty word", () => {
    // A zero-length word makes `letters < word.length` false for everyone, which
    // would eliminate the whole roster before a note was played.
    expect(coerceWord("")).toBe(DEFAULT_SETTINGS.word);
    expect(coerceWord("1234")).toBe(DEFAULT_SETTINGS.word);
    expect(coerceWord(null)).toBe(DEFAULT_SETTINGS.word);
    expect(coerceWord(7)).toBe(DEFAULT_SETTINGS.word);
  });
});

describe("coercePlayers", () => {
  it("always returns a full board", () => {
    expect(coercePlayers([])).toHaveLength(PLAYER_COUNT);
    expect(coercePlayers(undefined)).toHaveLength(PLAYER_COUNT);
    expect(coercePlayers("nonsense")).toHaveLength(PLAYER_COUNT);
  });

  it("pads a short roster with defaults", () => {
    const players = coercePlayers([{ id: "x", name: "Ada", letters: 2, active: true }]);
    expect(players[0]).toEqual({ id: "x", name: "Ada", letters: 2, active: true });
    expect(players[1]).toEqual(defaultPlayers()[1]);
  });

  it("cuts a roster that has grown too long", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, name: `N${i}` }));
    expect(coercePlayers(many)).toHaveLength(PLAYER_COUNT);
  });

  it("reassigns a duplicate id", () => {
    // Two rows sharing an id would make resolution by id ambiguous, and the melody
    // would start going to the wrong person after a reorder.
    const players = coercePlayers([
      { id: "same", name: "One" },
      { id: "same", name: "Two" },
    ]);
    expect(players[0].id).not.toBe(players[1].id);
    expect(new Set(players.map((p) => p.id)).size).toBe(PLAYER_COUNT);
  });

  it("clamps a strike count into range", () => {
    const players = coercePlayers([
      { id: "a", letters: 99 },
      { id: "b", letters: -3 },
      { id: "c", letters: 2.7 },
      { id: "d", letters: "lots" },
    ]);
    expect(players.map((p) => p.letters)).toEqual([MAX_LETTERS, 0, 2, 0]);
  });

  it("names an unnamed player rather than showing a blank box", () => {
    const players = coercePlayers([{ id: "a", name: "   " }, { id: "b", name: 5 }]);
    expect(players[0].name).toBe("Player 1");
    expect(players[1].name).toBe("Player 2");
  });

  it("defaults a missing active flag to playing", () => {
    expect(coercePlayers([{ id: "a" }])[0].active).toBe(true);
    expect(coercePlayers([{ id: "a", active: false }])[0].active).toBe(false);
  });

  it("brings a stored roster back up to the floor", () => {
    // A blob from an older build, or one edited by hand, must not come back with a
    // game nobody can play.
    const players = coercePlayers([
      { id: "a", active: false },
      { id: "b", active: false },
      { id: "c", active: false },
      { id: "d", active: false },
    ]);
    expect(activeCount(players)).toBe(MIN_ACTIVE);
  });

  it("costs only its own field when one entry is rubbish", () => {
    const players = coercePlayers([{ id: "a", name: "Ada", letters: 3 }, null, 42]);
    expect(players[0]).toEqual({ id: "a", name: "Ada", letters: 3, active: true });
    expect(players[1]).toEqual(defaultPlayers()[1]);
    expect(players[2]).toEqual(defaultPlayers()[2]);
  });
});

describe("activeCount", () => {
  it("counts only the players switched on", () => {
    expect(activeCount(roster(true, false, true, false))).toBe(2);
    expect(activeCount([])).toBe(0);
  });
});

describe("canDeactivate", () => {
  it("allows it while more than the floor are in", () => {
    expect(canDeactivate(roster(true, true, true, false), "p1")).toBe(true);
  });

  it("refuses the last two", () => {
    // Otherwise a roster can be emptied down to a game nobody can play.
    const two = roster(true, true, false, false);
    expect(canDeactivate(two, "p1")).toBe(false);
    expect(canDeactivate(two, "p2")).toBe(false);
  });

  it("refuses a player who is already out", () => {
    expect(canDeactivate(roster(true, true, true, false), "p4")).toBe(false);
  });

  it("refuses an id nobody has", () => {
    expect(canDeactivate(roster(true, true, true, true), "nobody")).toBe(false);
  });
});

describe("enforceMinimumActive", () => {
  it("leaves a roster that already meets the floor alone", () => {
    const fine = roster(false, true, true, false);
    expect(enforceMinimumActive(fine)).toEqual(fine);
  });

  it("switches players back on, from the top, until the floor is met", () => {
    // Top-down because the panel's order is the board's order, so the players who
    // come back are the ones nearest the left of the board.
    expect(enforceMinimumActive(roster(false, false, false, true)).map((p) => p.active))
      .toEqual([true, false, false, true]);
  });

  it("rescues a roster with nobody in it at all", () => {
    const rescued = enforceMinimumActive(roster(false, false, false, false));
    expect(activeCount(rescued)).toBe(MIN_ACTIVE);
    expect(rescued.map((p) => p.active)).toEqual([true, true, false, false]);
  });

  it("does not mutate the roster it was given", () => {
    const original = roster(false, false, false, false);
    enforceMinimumActive(original);
    expect(original.every((p) => !p.active)).toBe(true);
  });
});

describe("coerceSettings", () => {
  it("accepts a well-formed blob", () => {
    const stored = {
      players: defaultPlayers(),
      word: "DOG",
      tolerance: "loose" as const,
    };
    expect(coerceSettings(stored)).toEqual(stored);
  });

  it("falls back on a corrupt blob", () => {
    expect(coerceSettings(null).word).toBe(DEFAULT_SETTINGS.word);
    expect(coerceSettings("wat").players).toHaveLength(PLAYER_COUNT);
  });

  it("keeps the good fields when one is bad", () => {
    const result = coerceSettings({ word: "cat", tolerance: "sideways" });
    expect(result.word).toBe("CAT");
    expect(result.tolerance).toBe("strict");
    expect(result.players).toHaveLength(PLAYER_COUNT);
  });

  it("does not hand out a shared reference to the defaults", () => {
    // Two loads must not alias each other, or editing one game's roster would
    // silently edit the constant every later load starts from.
    const first = coerceSettings(null);
    const second = coerceSettings(null);
    first.players[0].name = "Mutated";

    expect(second.players[0].name).toBe("Player 1");
    expect(DEFAULT_SETTINGS.players[0].name).toBe("Player 1");
  });
});
