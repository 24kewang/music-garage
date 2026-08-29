/**
 * Turn order, letters and elimination.
 *
 * Pure and Node-tested, because this is where the game is actually decided and none
 * of it is provable by clicking around. Every transition ends by asking whether the
 * game is over, so "everyone but one was knocked out halfway through a round" is not
 * a special case anybody has to remember to write.
 *
 * The organizing idea: **elimination is derived, never stored.** A player is a
 * contender when they are active and hold fewer letters than the word is long. That
 * one rule is what makes the awkward settings edits fall out for free — shorten the
 * word and people drop out, lengthen it and they come back, because the letters are
 * the truth and being out is only ever a reading of them.
 */

export interface Player {
  id: string;
  name: string;
  /** Letters earned. May exceed the word's length; the card just lights it all. */
  letters: number;
  active: boolean;
}

export type Phase =
  /** Nobody has set a melody yet this round. */
  | "setting"
  /** A melody is set and the copiers are taking their turns. */
  | "copying"
  /** One player left standing. */
  | "finished";

export interface Round {
  phase: Phase;
  /** Whose melody the round belongs to. */
  setterId: string | null;
  /** Whose attempt is live right now. Equals `setterId` while setting. */
  turnId: string | null;
  /** Which of the setter's two takes is next. Meaningless outside `setting`. */
  takeIndex: 0 | 1;
}

export interface Outcome {
  round: Round;
  players: Player[];
}

export function isContender(player: Player, word: string): boolean {
  return player.active && player.letters < word.length;
}

export function contenders(players: readonly Player[], word: string): Player[] {
  return players.filter((player) => isContender(player, word));
}

/** The last player standing, or `null` while more than one remains — or none does. */
export function winner(players: readonly Player[], word: string): Player | null {
  const left = contenders(players, word);
  return left.length === 1 ? left[0] : null;
}

/**
 * Whether there is a game to play at all.
 *
 * Below two contenders there is nothing to win. Reporting a winner for a roster that
 * never had an opponent in it would be wrong, so the board says so instead.
 */
export function canPlay(players: readonly Player[], word: string): boolean {
  return contenders(players, word).length >= 2;
}

/** How many letters of the word to light on a player's card. */
export function lettersShown(player: Player, word: string): number {
  return Math.min(player.letters, word.length);
}

function indexOf(players: readonly Player[], id: string | null): number {
  return id === null ? -1 : players.findIndex((player) => player.id === id);
}

/** The next contender after `id`, wrapping. Returns `id` itself if they are alone. */
export function nextContenderAfter(
  players: readonly Player[],
  id: string | null,
  word: string,
): string | null {
  const from = indexOf(players, id);
  if (players.length === 0) return null;

  for (let step = 1; step <= players.length; step++) {
    const player = players[(Math.max(0, from) + step) % players.length];
    if (isContender(player, word)) return player.id;
  }
  return null;
}

/**
 * Who copies next, or `null` when everyone has had their turn.
 *
 * The setter is the **round boundary**, not a participant: walking forward from the
 * current copier and stopping when we reach the setter is what ends the round. That
 * comparison happens whether or not the setter is still a contender themselves —
 * which is the point. Deactivating the setter mid-round must not abandon a melody the
 * remaining copiers still owe an answer to, and filtering them out first would do
 * exactly that.
 *
 * In a two-player game it also means the single copier is not handed the melody
 * twice: one step forward from them lands on the setter, and the round ends.
 */
export function nextCopier(
  round: Round,
  players: readonly Player[],
  word: string,
): string | null {
  const from = indexOf(players, round.turnId ?? round.setterId);
  if (from === -1) return null;

  for (let step = 1; step <= players.length; step++) {
    const player = players[(from + step) % players.length];
    if (player.id === round.setterId) return null;
    if (isContender(player, word)) return player.id;
  }
  return null;
}

/**
 * One player left ends the game, whatever was happening at the time.
 *
 * Called at the tail of every transition rather than checked at the call sites, so
 * there is one place the game can end and no path that forgets to look.
 */
function settle(round: Round, players: readonly Player[], word: string): Round {
  if (contenders(players, word).length > 1) return round;
  return { ...round, phase: "finished", turnId: null, takeIndex: 0 };
}

/** A fresh round with `setterId` up first. */
function setting(setterId: string | null): Round {
  return { phase: "setting", setterId, turnId: setterId, takeIndex: 0 };
}

/** The opening position: first contender in display order sets. */
export function startRound(players: readonly Player[], word: string): Round {
  const first = contenders(players, word)[0]?.id ?? null;
  return settle(setting(first), players, word);
}

/**
 * The setter's confirmation take has been judged.
 *
 * A failed set costs **no letter** — in HORSE, missing your own called shot just
 * hands the turn on. The next contender becomes the setter and tries to call
 * something they can actually play twice.
 */
export function resolveSet(
  round: Round,
  players: readonly Player[],
  word: string,
  passed: boolean,
): Outcome {
  const next = players.map((player) => ({ ...player }));

  if (!passed) {
    const setterId = nextContenderAfter(next, round.setterId, word);
    return { round: settle(setting(setterId), next, word), players: next };
  }

  const copying: Round = { ...round, phase: "copying", takeIndex: 0 };
  const first = nextCopier({ ...copying, turnId: round.setterId }, next, word);

  // Nobody left to answer it — the setter has outlasted the field.
  if (first === null) {
    return { round: settle({ ...copying, turnId: null }, next, word), players: next };
  }

  return { round: { ...copying, turnId: first }, players: next };
}

/**
 * A copier's attempt has been judged.
 *
 * A failure earns a letter, which may eliminate them — and because `nextCopier` reads
 * the updated roster, a player knocked out by their own letter is skipped on the very
 * same step rather than being offered another turn.
 *
 * When the round runs out of copiers the melody goes **back to the same setter**, not
 * on to the next player. Making your shot in HORSE keeps you shooting; you only lose
 * the ball by missing one of your own, which is what `resolveSet` handles at the other
 * end. The one exception is a setter who stopped being a contender mid-round — they
 * cannot earn a letter while setting, so this only happens by a settings edit.
 */
export function resolveCopy(
  round: Round,
  players: readonly Player[],
  word: string,
  passed: boolean,
): Outcome {
  const next = players.map((player) =>
    !passed && player.id === round.turnId
      ? { ...player, letters: player.letters + 1 }
      : { ...player },
  );

  const following = nextCopier(round, next, word);
  if (following !== null) {
    return { round: settle({ ...round, turnId: following }, next, word), players: next };
  }

  // Everyone has answered. The setter keeps the ball and calls another one.
  const keeper = next.find((player) => player.id === round.setterId);
  const setterId =
    keeper !== undefined && isContender(keeper, word)
      ? keeper.id
      : nextContenderAfter(next, round.setterId, word);

  return { round: settle(setting(setterId), next, word), players: next };
}

/**
 * Whether the setter is still up for grabs.
 *
 * Only before a first take. `takeIndex` is the whole lock: once a melody has been
 * recorded it belongs to whoever recorded it, and it stays theirs until the round
 * comes back to setting — either because their confirmation failed, or because a full
 * round of copies finished.
 */
export function canChooseSetter(round: Round): boolean {
  return round.phase === "setting" && round.takeIndex === 0;
}

/**
 * Hand the setting turn to a particular player.
 *
 * A no-op unless the round is open to it and the player is actually a contender, so
 * an eliminated or switched-off box cannot be picked. Turn order still supplies the
 * default — this only lets the room override it, which is what a game played around
 * one screen actually needs.
 */
export function chooseSetter(
  round: Round,
  players: readonly Player[],
  word: string,
  id: string,
): Round {
  if (!canChooseSetter(round)) return round;

  const player = players.find((candidate) => candidate.id === id);
  if (player === undefined || !isContender(player, word)) return round;

  return setting(id);
}

/** The setter's first take is in the bag; the confirmation take is next. */
export function armConfirmation(round: Round): Round {
  return { ...round, takeIndex: 1 };
}

/** Throw away a set in progress and let the same player start again. */
export function restartSet(round: Round): Round {
  return { ...round, takeIndex: 0 };
}

/**
 * Bring a round back into agreement with the roster after a settings edit.
 *
 * Called after **any** change to players, letters or the word. Everything is
 * resolved by id rather than by position, because reordering rows in the settings
 * panel must not change whose turn it is.
 *
 * The setter is only rotated while setting. During copying they are the round
 * boundary and the melody is already recorded, so the remaining copiers keep their
 * turn even if the setter has just been switched off.
 */
export function reconcile(round: Round, players: readonly Player[], word: string): Round {
  if (players.length === 0) {
    return { phase: "finished", setterId: null, turnId: null, takeIndex: 0 };
  }

  const stillPlaying = (id: string | null) => {
    const player = players.find((candidate) => candidate.id === id);
    return player !== undefined && isContender(player, word);
  };

  // Lengthening the word brings people back, so a finished game can reopen. It
  // restarts as a fresh set rather than resuming a copying phase whose melody is
  // long gone — and with the same setter, if they are still eligible.
  if (round.phase === "finished") {
    if (contenders(players, word).length < 2) return round;
    const setterId = stillPlaying(round.setterId)
      ? round.setterId
      : (contenders(players, word)[0]?.id ?? null);
    return setting(setterId);
  }

  const settled = settle(round, players, word);
  if (settled.phase === "finished") return settled;

  if (settled.phase === "setting") {
    if (stillPlaying(settled.setterId)) return { ...settled, turnId: settled.setterId };
    const setterId = nextContenderAfter(players, settled.setterId, word);
    return settle(setting(setterId), players, word);
  }

  // Copying. Keep the melody; just make sure somebody eligible is up.
  if (stillPlaying(settled.turnId)) return settled;

  const following = nextCopier(settled, players, word);
  if (following !== null) return { ...settled, turnId: following };

  const setterId = nextContenderAfter(players, settled.setterId, word);
  return settle(setting(setterId), players, word);
}

/** Wipe the scores but keep the roster, the order, the word and the tolerance. */
export function resetLetters(players: readonly Player[]): Player[] {
  return players.map((player) => ({ ...player, letters: 0 }));
}
