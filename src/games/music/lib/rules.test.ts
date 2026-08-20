import { describe, expect, it } from "vitest";
import {
  armConfirmation,
  canChooseSetter,
  canPlay,
  chooseSetter,
  contenders,
  lettersShown,
  nextContenderAfter,
  nextCopier,
  reconcile,
  resetLetters,
  resolveCopy,
  resolveSet,
  startRound,
  winner,
  type Player,
  type Round,
} from "./rules";

const WORD = "MUSIC";

const player = (id: string, letters = 0, active = true): Player => ({
  id,
  name: id.toUpperCase(),
  letters,
  active,
});

/** Four players, nobody out. */
const four = () => [player("a"), player("b"), player("c"), player("d")];

describe("isContender / contenders", () => {
  it("counts the active players still under the word length", () => {
    const players = [player("a"), player("b", 5), player("c", 0, false), player("d", 4)];
    expect(contenders(players, WORD).map((p) => p.id)).toEqual(["a", "d"]);
  });

  it("brings a player back when the word gets longer", () => {
    const players = [player("a", 3)];
    expect(contenders(players, "MUS")).toHaveLength(0);
    expect(contenders(players, "MUSIC")).toHaveLength(1);
  });
});

describe("lettersShown", () => {
  it("lights the whole word when the strike count runs past it", () => {
    expect(lettersShown(player("a", 5), "MUS")).toBe(3);
    expect(lettersShown(player("a", 2), "MUSIC")).toBe(2);
  });
});

describe("canPlay", () => {
  it("needs two contenders", () => {
    expect(canPlay([player("a")], WORD)).toBe(false);
    expect(canPlay([player("a"), player("b", 0, false)], WORD)).toBe(false);
    expect(canPlay([player("a"), player("b")], WORD)).toBe(true);
  });
});

describe("nextContenderAfter", () => {
  it("wraps around the roster", () => {
    expect(nextContenderAfter(four(), "d", WORD)).toBe("a");
  });

  it("skips whoever is out", () => {
    const players = [player("a"), player("b", 5), player("c", 0, false), player("d")];
    expect(nextContenderAfter(players, "a", WORD)).toBe("d");
  });

  it("returns the same player when they are the only one left", () => {
    const players = [player("a"), player("b", 5)];
    expect(nextContenderAfter(players, "a", WORD)).toBe("a");
  });

  it("returns null when nobody is left", () => {
    expect(nextContenderAfter([player("a", 5)], "a", WORD)).toBeNull();
  });
});

describe("startRound", () => {
  it("puts the first contender up to set", () => {
    const round = startRound(four(), WORD);
    expect(round).toEqual({
      phase: "setting",
      setterId: "a",
      turnId: "a",
      takeIndex: 0,
    });
  });

  it("skips an inactive player at the front of the order", () => {
    const players = [player("a", 0, false), player("b"), player("c")];
    expect(startRound(players, WORD).setterId).toBe("b");
  });

  it("finishes at once when there is nobody to play against", () => {
    expect(startRound([player("a")], WORD).phase).toBe("finished");
  });
});

describe("resolveSet", () => {
  it("passes the melody to the next player when the confirmation lands", () => {
    const { round } = resolveSet(startRound(four(), WORD), four(), WORD, true);
    expect(round).toMatchObject({ phase: "copying", setterId: "a", turnId: "b" });
  });

  it("rotates the setter with no letter when the confirmation fails", () => {
    const players = four();
    const { round, players: after } = resolveSet(
      startRound(players, WORD),
      players,
      WORD,
      false,
    );

    expect(round).toMatchObject({ phase: "setting", setterId: "b", turnId: "b" });
    // Missing your own called shot costs nothing in HORSE, and nothing here.
    expect(after.every((p) => p.letters === 0)).toBe(true);
  });

  it("skips an eliminated player when rotating the setter", () => {
    const players = [player("a"), player("b", 5), player("c")];
    const { round } = resolveSet(startRound(players, WORD), players, WORD, false);
    expect(round.setterId).toBe("c");
  });

  it("hands the setter the win when nobody is left to copy", () => {
    const players = [player("a"), player("b", 4)];
    // B is knocked out by a settings edit between the set and the copy.
    const out = [player("a"), player("b", 5)];
    const { round } = resolveSet(startRound(players, WORD), out, WORD, true);

    expect(round.phase).toBe("finished");
    expect(winner(out, WORD)?.id).toBe("a");
  });
});

describe("resolveCopy", () => {
  const copying = (): Round => ({
    phase: "copying",
    setterId: "a",
    turnId: "b",
    takeIndex: 0,
  });

  it("moves to the next copier on a success, with no letter", () => {
    const { round, players } = resolveCopy(copying(), four(), WORD, true);
    expect(round).toMatchObject({ phase: "copying", turnId: "c" });
    expect(players.every((p) => p.letters === 0)).toBe(true);
  });

  it("gives a letter on a failure", () => {
    const { round, players } = resolveCopy(copying(), four(), WORD, false);
    expect(players.find((p) => p.id === "b")?.letters).toBe(1);
    expect(round.turnId).toBe("c");
  });

  it("gives the melody back to the same setter once everyone has answered", () => {
    // Making your shot in HORSE keeps you shooting. The ball is only lost by missing
    // one of your own, which is `resolveSet`'s job.
    const round: Round = { phase: "copying", setterId: "a", turnId: "d", takeIndex: 0 };
    const { round: after } = resolveCopy(round, four(), WORD, true);

    expect(after).toMatchObject({ phase: "setting", setterId: "a", turnId: "a" });
    expect(after.takeIndex).toBe(0);
  });

  it("hands the melody on when the setter was switched off mid-round", () => {
    // They cannot earn a letter while setting, so this only happens by a settings
    // edit — but the ball still has to go somewhere.
    const players = [player("a", 0, false), player("b"), player("c")];
    const round: Round = { phase: "copying", setterId: "a", turnId: "c", takeIndex: 0 };
    const { round: after } = resolveCopy(round, players, WORD, true);

    expect(after).toMatchObject({ phase: "setting", setterId: "b" });
  });

  it("skips a player eliminated by the very letter just given", () => {
    const players = [player("a"), player("b", 4), player("c")];
    const { round } = resolveCopy(copying(), players, WORD, false);
    // B hits five and is out on the same step, so C is up rather than B again.
    expect(round.turnId).toBe("c");
  });

  it("ends the game when the last copier is eliminated", () => {
    const players = [player("a"), player("b", 4)];
    const { round, players: after } = resolveCopy(copying(), players, WORD, false);

    expect(round.phase).toBe("finished");
    expect(winner(after, WORD)?.id).toBe("a");
  });

  it("runs a two-player round without giving the copier two turns at it", () => {
    // One step forward from the sole copier lands on the setter, which is the round
    // boundary — the naive "next player still in" would have B copy twice. The round
    // then ends and A, who made their shot, sets again.
    const players = [player("a"), player("b")];
    const { round } = resolveCopy(copying(), players, WORD, true);

    expect(round).toMatchObject({ phase: "setting", setterId: "a", turnId: "a" });
  });
});

describe("nextCopier", () => {
  it("stops at the setter rather than looping forever", () => {
    const round: Round = { phase: "copying", setterId: "a", turnId: "d", takeIndex: 0 };
    expect(nextCopier(round, four(), WORD)).toBeNull();
  });

  it("treats a deactivated setter as the boundary all the same", () => {
    // The melody is already recorded; the remaining copiers still owe it an answer.
    const players = [player("a", 0, false), player("b"), player("c")];
    const round: Round = { phase: "copying", setterId: "a", turnId: "b", takeIndex: 0 };

    expect(nextCopier(round, players, WORD)).toBe("c");
    expect(
      nextCopier({ ...round, turnId: "c" }, players, WORD),
    ).toBeNull();
  });
});

describe("reconcile", () => {
  it("eliminates people when the word is shortened", () => {
    const players = [player("a"), player("b", 3), player("c", 4)];
    const round = reconcile(startRound(players, WORD), players, "MUS");

    // B and C are both out at three letters, so A has won.
    expect(round.phase).toBe("finished");
    expect(winner(players, "MUS")?.id).toBe("a");
  });

  it("brings a player back when the word is lengthened", () => {
    const players = [player("a"), player("b", 3)];
    const finished = reconcile(startRound(players, "MUS"), players, "MUS");
    expect(finished.phase).toBe("finished");

    const reopened = reconcile(finished, players, "MUSIC");
    expect(reopened.phase).toBe("setting");
    expect(contenders(players, "MUSIC")).toHaveLength(2);
  });

  it("rotates the setter when they are deactivated while setting", () => {
    const players = [player("a", 0, false), player("b"), player("c")];
    const round = reconcile(
      { phase: "setting", setterId: "a", turnId: "a", takeIndex: 1 },
      players,
      WORD,
    );

    expect(round).toMatchObject({ phase: "setting", setterId: "b", turnId: "b" });
    // The half-finished set goes with them.
    expect(round.takeIndex).toBe(0);
  });

  it("keeps the round alive when the setter is deactivated mid-copying", () => {
    const players = [player("a", 0, false), player("b"), player("c")];
    const round = reconcile(
      { phase: "copying", setterId: "a", turnId: "b", takeIndex: 0 },
      players,
      WORD,
    );

    expect(round).toMatchObject({ phase: "copying", setterId: "a", turnId: "b" });
  });

  it("advances the turn when the current copier is deactivated", () => {
    const players = [player("a"), player("b", 0, false), player("c")];
    const round = reconcile(
      { phase: "copying", setterId: "a", turnId: "b", takeIndex: 0 },
      players,
      WORD,
    );

    expect(round.turnId).toBe("c");
  });

  it("does not change whose turn it is when the rows are reordered", () => {
    // Resolution is by id, not by position — dragging a row in the settings panel
    // must not hand the melody to somebody else.
    const round: Round = { phase: "copying", setterId: "a", turnId: "c", takeIndex: 0 };
    const reordered = [player("d"), player("c"), player("a"), player("b")];

    expect(reconcile(round, reordered, WORD)).toMatchObject({
      setterId: "a",
      turnId: "c",
    });
  });

  it("finishes on an empty roster without reporting a winner", () => {
    expect(reconcile(startRound(four(), WORD), [], WORD).phase).toBe("finished");
    expect(winner([], WORD)).toBeNull();
  });

  it("reports no winner when everybody has been knocked out at once", () => {
    const players = [player("a", 5), player("b", 5)];
    expect(reconcile(startRound(players, WORD), players, WORD).phase).toBe("finished");
    expect(winner(players, WORD)).toBeNull();
  });
});

describe("canChooseSetter", () => {
  it("is open before a first take", () => {
    expect(canChooseSetter(startRound(four(), WORD))).toBe(true);
  });

  it("locks once a melody has been recorded", () => {
    expect(canChooseSetter(armConfirmation(startRound(four(), WORD)))).toBe(false);
  });

  it("is closed while copying and when finished", () => {
    const copying: Round = { phase: "copying", setterId: "a", turnId: "b", takeIndex: 0 };
    expect(canChooseSetter(copying)).toBe(false);
    expect(canChooseSetter({ ...copying, phase: "finished" })).toBe(false);
  });
});

describe("chooseSetter", () => {
  it("hands the turn to the chosen player", () => {
    const round = chooseSetter(startRound(four(), WORD), four(), WORD, "c");
    expect(round).toEqual({
      phase: "setting",
      setterId: "c",
      turnId: "c",
      takeIndex: 0,
    });
  });

  it("refuses once a melody is half set", () => {
    const locked = armConfirmation(startRound(four(), WORD));
    expect(chooseSetter(locked, four(), WORD, "c")).toBe(locked);
  });

  it("refuses during copying", () => {
    const copying: Round = { phase: "copying", setterId: "a", turnId: "b", takeIndex: 0 };
    expect(chooseSetter(copying, four(), WORD, "c")).toBe(copying);
  });

  it("refuses an eliminated player", () => {
    const players = [player("a"), player("b", 5), player("c")];
    const round = startRound(players, WORD);
    expect(chooseSetter(round, players, WORD, "b")).toBe(round);
  });

  it("refuses a switched-off player", () => {
    const players = [player("a"), player("b", 0, false), player("c")];
    const round = startRound(players, WORD);
    expect(chooseSetter(round, players, WORD, "b")).toBe(round);
  });

  it("refuses an id nobody has", () => {
    const round = startRound(four(), WORD);
    expect(chooseSetter(round, four(), WORD, "nobody")).toBe(round);
  });

  it("survives a settings edit, because reconcile keeps an eligible setter", () => {
    const players = four();
    const chosen = chooseSetter(startRound(players, WORD), players, WORD, "d");
    expect(reconcile(chosen, players, WORD).setterId).toBe("d");
  });
});

describe("armConfirmation and resetLetters", () => {
  it("moves the setter on to their second take", () => {
    expect(armConfirmation(startRound(four(), WORD)).takeIndex).toBe(1);
  });

  it("wipes the letters but keeps the roster", () => {
    const players = [player("a", 3), player("b", 0, false)];
    expect(resetLetters(players)).toEqual([
      { id: "a", name: "A", letters: 0, active: true },
      { id: "b", name: "B", letters: 0, active: false },
    ]);
  });
});
