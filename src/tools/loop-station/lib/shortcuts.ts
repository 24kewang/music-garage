import { lockedFromIndex, type SessionEvent, type SessionState, type TrackState } from "./session";
import { divisorsOf } from "./transport";

/**
 * Keyboard shortcuts, as a pure mapping from key to session event.
 *
 * Shortcuts are convenience only: they never make something possible that the
 * buttons don't already allow. Most of that falls out of the reducer, which
 * already refuses impossible events — but where a key has no meaningful target
 * at all (a bus that doesn't exist, nothing to delete), this returns `null`,
 * and the caller leaves the browser's own behaviour alone.
 */

export const SHORTCUT_HINTS: readonly { keys: string; label: string }[] = [
  { keys: "Space", label: "record" },
  { keys: "Enter", label: "play/stop" },
  { keys: "M", label: "metronome" },
  { keys: "< >", label: "multiplier" },
  { keys: "R", label: "×1" },
  { keys: "0–3", label: "mute master/bus" },
  { keys: "← →", label: "bus" },
  { keys: "↑ ↓", label: "track" },
  { keys: "Alt ↑ ↓", label: "reorder" },
  { keys: "Esc", label: "deselect" },
  { keys: "Del", label: "remove" },
];

/**
 * What Delete/Backspace acts on: the selected track if there is one, otherwise
 * the bottom-most track that isn't locked. An in-progress track is never a
 * target — it can't be selected, and it's skipped when scanning from the
 * bottom. A track carrying an overwrite loses the overwrite first; the track
 * itself only goes once it is plain again.
 */
export function deleteTarget(state: SessionState): SessionEvent | null {
  const unlocked = (track: TrackState) => track.spawnLoopEndTime === null;

  const selected = state.tracks.find(
    (track) => track.id === state.selectedTrackId && unlocked(track),
  );
  let target = selected;
  if (!target) {
    for (let i = state.tracks.length - 1; i >= 0; i--) {
      if (unlocked(state.tracks[i])) {
        target = state.tracks[i];
        break;
      }
    }
  }
  if (!target) return null;
  return target.overwrite
    ? { type: "deleteOverwrite", id: target.id }
    : { type: "deleteTrack", id: target.id };
}

/** Step through the multipliers on offer, wrapping at both ends. */
function stepMultiplier(state: SessionState, delta: number): SessionEvent | null {
  const options = divisorsOf(state.bars);
  if (options.length === 0) return null;
  const current = options.indexOf(state.multiplier);
  const index = current === -1 ? 0 : current + delta;
  const wrapped = ((index % options.length) + options.length) % options.length;
  return { type: "setMultiplier", value: options[wrapped] };
}

/**
 * Cycle which bus is selected — the one new recordings land on. Wraps, like the
 * multiplier does; the rack holds at most three. A single-bus rack has nothing
 * to move to, and `selectBus` would hand back a fresh state object for nothing.
 */
function stepBus(state: SessionState, delta: number): SessionEvent | null {
  const { buses } = state;
  if (buses.length < 2) return null;
  const current = buses.findIndex((bus) => bus.id === state.selectedBusId);
  const index = current === -1 ? 0 : current + delta;
  const wrapped = ((index % buses.length) + buses.length) % buses.length;
  return { type: "selectBus", id: buses[wrapped].id };
}

/**
 * Move the track selection, but only when something is already selected.
 *
 * Steps through selectable tracks — an in-progress one can't be selected, so it
 * is skipped — and **clamps** at both ends rather than wrapping: a vertical list
 * that jumps from bottom to top is disorienting.
 *
 * Returning null when the target is the track already selected is load-bearing,
 * not tidiness: `selectTrack` *toggles*, so dispatching it with the current id
 * would deselect instead of doing nothing.
 */
function stepTrack(state: SessionState, delta: number): SessionEvent | null {
  if (state.selectedTrackId === null) return null;
  const selectable = state.tracks.filter((track) => track.spawnLoopEndTime === null);
  const current = selectable.findIndex((track) => track.id === state.selectedTrackId);
  if (current === -1) return null;
  const next = Math.min(selectable.length - 1, Math.max(0, current + delta));
  if (next === current) return null;
  return { type: "selectTrack", id: selectable[next].id };
}

/**
 * Alt+↑/↓ reorders — and it follows the **selected** track, not whichever row
 * happens to hold DOM focus.
 *
 * This used to live on the row itself, which meant it latched onto the row you
 * first clicked: arrow-navigating the selection doesn't move focus, so the keys
 * kept moving the old track. Keying it off `selectedTrackId` fixes both halves
 * of that — it follows the selection, and with nothing selected it declines.
 *
 * Respects the in-progress floor for the same reason dragging does: an
 * in-progress track and everything below it are pinned.
 */
export function resolveAltShortcut(key: string, state: SessionState): SessionEvent | null {
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const id = state.selectedTrackId;
  if (id === null) return null;

  const from = state.tracks.findIndex((track) => track.id === id);
  const floor = lockedFromIndex(state.tracks);
  if (from < 0 || from >= floor) return null;

  const to = Math.min(floor - 1, Math.max(0, from + (key === "ArrowUp" ? -1 : 1)));
  if (to === from) return null;
  return { type: "moveTrack", id, toIndex: to };
}

/** Map a `KeyboardEvent.key` to the event it fires, or null for "not ours". */
export function resolveShortcut(key: string, state: SessionState): SessionEvent | null {
  switch (key) {
    case " ":
    case "Spacebar":
      return { type: "record" };
    case "Enter":
      return { type: "playStop" };
    case "m":
    case "M":
      return { type: "toggleMetronome" };
    case "r":
    case "R":
      return divisorsOf(state.bars).includes(1) ? { type: "setMultiplier", value: 1 } : null;
    // The hint reads "< >", so the shifted pair has to work as well as the
    // unshifted keys they live on.
    case ".":
    case ">":
      return stepMultiplier(state, 1);
    case ",":
    case "<":
      return stepMultiplier(state, -1);
    case "Escape":
      return state.selectedTrackId === null ? null : { type: "selectTrack", id: null };
    case "0":
      return { type: "toggleMasterMute" };
    case "1":
    case "2":
    case "3": {
      const bus = state.buses[Number(key) - 1];
      return bus ? { type: "toggleBusMute", id: bus.id } : null;
    }
    // Alt+Arrow never reaches here — the hook drops anything with a modifier,
    // leaving TrackRow's own handler to own reordering.
    case "ArrowLeft":
      return stepBus(state, -1);
    case "ArrowRight":
      return stepBus(state, 1);
    case "ArrowUp":
      return stepTrack(state, -1);
    case "ArrowDown":
      return stepTrack(state, 1);
    case "Delete":
    case "Backspace":
      return deleteTarget(state);
    default:
      return null;
  }
}
