"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "./config";
import { meterFraction } from "./dsp/level";
import { lockedFromIndex, type SessionEvent } from "./lib/session";
import { SHORTCUT_HINTS } from "./lib/shortcuts";
import { useLoopStation } from "./lib/useLoopStation";
import { useShortcuts } from "./lib/useShortcuts";
import { useTrackDrag } from "./lib/useTrackDrag";
import BusRack from "./components/BusRack";
import ConfirmDialog from "./components/ConfirmDialog";
import SaveButton from "./components/SaveButton";
import MasterPanel from "./components/MasterPanel";
import MicGate from "./components/MicGate";
import SettingsPanel from "./components/SettingsPanel";
import TrackRow from "./components/TrackRow";
import TransportBar from "./components/TransportBar";
import styles from "./loop-station.module.css";

/**
 * The Loop Station's root: wiring only. All musical decisions live in
 * `lib/session.ts`; all audio lives in `audio/`; this renders state and runs
 * the paint loop (playhead, meters, the record button's count) against the DOM
 * directly — 60fps visuals must not become 60fps React renders.
 */
export default function LoopStation() {
  const station = useLoopStation();
  const { session, dispatch, status, readVisuals } = station;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const clearButtonRef = useRef<HTMLButtonElement | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  /** An in-app link click held back until the unsaved-work question is answered. */
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();
  /** Smoothed meter fills, so transients read instead of flickering. */
  const meterLevels = useRef(new Map<string, number>());
  /** Announces a reorder, which is otherwise silent to a screen reader. */
  const [reorderNotice, setReorderNotice] = useState("");

  // An in-progress track and everything below it are pinned in place.
  const lockedFrom = lockedFromIndex(session.tracks);

  const moveTrack = useCallback(
    (id: number, toIndex: number) => {
      dispatch({ type: "moveTrack", id, toIndex });
      const track = session.tracks.find((t) => t.id === id);
      const landed = Math.min(Math.max(0, toIndex), lockedFrom - 1);
      if (track) {
        setReorderNotice(
          `${track.name} moved to ${landed + 1} of ${session.tracks.length}`,
        );
      }
    },
    [dispatch, session.tracks, lockedFrom],
  );

  // Destructured rather than kept as one object: the React compiler analyzes
  // custom hooks inter-procedurally, and reading a property off the whole
  // returned value inside the render loop reads as touching its refs.
  const {
    listRef: trackListRef,
    onRowPointerDown,
    active: dragActive,
    draggingId,
    offsets: dragOffsets,
  } = useTrackDrag({
    count: session.tracks.length,
    lockedFrom,
    onMove: moveTrack,
  });

  /**
   * Reorders routed through `moveTrack` so a keyboard move is announced the
   * same way a dragged one is; everything else goes straight to the reducer.
   */
  const handleShortcut = useCallback(
    (event: SessionEvent) => {
      if (event.type === "moveTrack") moveTrack(event.id, event.toIndex);
      else dispatch(event);
    },
    [dispatch, moveTrack],
  );

  // Shortcuts stand down while a modal owns the screen.
  useShortcuts({
    session,
    dispatch: handleShortcut,
    enabled: status === "ready" && !confirmingClear && pendingHref === null,
  });

  /**
   * `beforeunload` covers tab close and reload, but never fires for a Next.js
   * client-side navigation — so nav clicks are caught in the capture phase,
   * before the router sees them, and held against the same question.
   */
  useEffect(() => {
    if (!station.dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname) return;
      event.preventDefault();
      setPendingHref(anchor.pathname + anchor.search + anchor.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [station.dirty]);

  useEffect(() => {
    if (status !== "ready") return;
    let raf = 0;
    const recording = session.recording;

    const paint = () => {
      raf = requestAnimationFrame(paint);
      const root = rootRef.current;
      if (!root) return;
      const v = readVisuals();

      const playheadPct = v.playhead === null ? 0 : v.playhead * 100;
      root.querySelectorAll<HTMLElement>("[data-playhead]").forEach((el) => {
        el.style.left = `${playheadPct}%`;
        el.style.opacity = v.playhead === null ? "0" : "1";
      });

      const meters = meterLevels.current;
      paintMeter(root, meters, "input", v.inputLevel);
      paintMeter(root, meters, "master", v.masterLevel);
      v.busLevels.forEach((level, id) => paintMeter(root, meters, `bus-${id}`, level));

      const count = root.querySelector<HTMLElement>("[data-rec-count]");
      if (count) count.textContent = recordButtonText(recording, v.now, session.beats);

      // Live overwrite region growing across its track's waveform.
      if (recording.kind === "overdub" && v.playhead !== null && session.loopSeconds) {
        const live = root.querySelector<HTMLElement>("[data-od-live]");
        if (live) {
          const from = phaseFraction(recording.startTime, session);
          const width = Math.max(0, v.playhead - from);
          live.style.left = `${from * 100}%`;
          live.style.width = `${width * 100}%`;
        }
      }
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [status, readVisuals, session]);

  const overdubbing = session.recording.kind === "overdub";
  const selected = session.tracks.find((t) => t.id === session.selectedTrackId);
  const overwriteArmed =
    overdubbing ||
    (session.recording.kind === "off" &&
      !!selected &&
      selected.spawnLoopEndTime === null &&
      selected.reps === 1);

  return (
    <div ref={rootRef} className={styles.screen}>
      <div className={styles.layout}>
        <div className={styles.rail}>
          <BusRack session={session} dispatch={dispatch} />
          <MasterPanel session={session} dispatch={dispatch} />
        </div>

        <div className={styles.trackArea}>
          <div className={styles.trackHeader}>
            <span className={styles.eyebrow}>
              Tracks · {String(session.tracks.length).padStart(2, "0")}
            </span>
            {session.notice && (
              <button
                type="button"
                className={styles.notice}
                onClick={() => dispatch({ type: "clearNotice" })}
              >
                {session.notice}
              </button>
            )}
            <span className={styles.trackHeaderSpacer} />
            <SaveButton
              status={station.saveStatus}
              dirty={station.dirty}
              hasSave={station.hasSave}
              trackCount={session.tracks.length}
              onSave={station.save}
              onDelete={station.deleteSave}
            />
            <button
              ref={clearButtonRef}
              type="button"
              className={styles.clearButton}
              disabled={session.tracks.length === 0}
              onClick={() => setConfirmingClear(true)}
            >
              Clear all
            </button>
          </div>

          <div className={styles.trackList} ref={trackListRef}>
            {session.tracks.length === 0 && session.recording.kind === "off" && (
              <p className={styles.empty}>
                No tracks yet. Set beats and bars, then press record — with the metronome
                on for a quantized loop, or off to set the length by playing.
              </p>
            )}
            {session.tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                session={session}
                peaks={station.trackPeaks.get(track.id)}
                overdubbing={
                  session.recording.kind === "overdub" &&
                  session.recording.trackId === track.id
                }
                index={index}
                dragging={draggingId === track.id}
                dragActive={dragActive}
                dragOffset={dragOffsets[index] ?? 0}
                draggable={index < lockedFrom}
                onDragPointerDown={onRowPointerDown}
                dispatch={dispatch}
              />
            ))}
            {(session.recording.kind === "countIn" ||
              session.recording.kind === "free" ||
              session.recording.kind === "armed" ||
              session.recording.kind === "capturing") && (
              <div className={styles.recRow} data-kind={session.recording.kind}>
                <span className={styles.recRowLabel}>
                  {session.recording.kind === "countIn" && "COUNT-IN"}
                  {session.recording.kind === "free" && "FREE LOOP · press record to close"}
                  {session.recording.kind === "armed" && "WAITING FOR THE NEXT PARTITION"}
                  {session.recording.kind === "capturing" && "RECORDING"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={styles.transport}>
          <TransportBar session={session} dispatch={dispatch} overwriteArmed={overwriteArmed} />
          <p className={styles.shortcuts}>
            {SHORTCUT_HINTS.map((hint, index) => (
              <span key={hint.keys}>
                {index > 0 && <span className={styles.shortcutDot}>·</span>}
                <kbd className={styles.key}>{hint.keys}</kbd> {hint.label}
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* A reorder is otherwise completely silent to a screen reader. */}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {reorderNotice}
      </p>

      <SettingsPanel
        session={session}
        dispatch={dispatch}
        calibration={station.calibration}
        startCalibration={station.startCalibration}
        stopCalibration={station.stopCalibration}
      />

      <MicGate
        status={status}
        errorMessage={station.errorMessage}
        bluetoothInput={station.bluetoothInput}
        resumeAudio={station.resumeAudio}
      />

      {confirmingClear && (
        <ConfirmDialog
          title="Delete every track?"
          body={
            session.recording.kind === "off"
              ? "All recordings are lost — nothing is saved between sessions. The tempo, beats and bars unlock afterwards."
              : "This also cancels the recording in progress. All recordings are lost — nothing is saved between sessions."
          }
          confirmLabel="Delete all"
          onConfirm={() => {
            dispatch({ type: "deleteAllTracks" });
            setConfirmingClear(false);
            clearButtonRef.current?.focus();
          }}
          onCancel={(reason) => {
            setConfirmingClear(false);
            if (reason === "escape") clearButtonRef.current?.focus();
          }}
        />
      )}

      {pendingHref !== null && (
        <ConfirmDialog
          title="Leave with unsaved changes?"
          body="This loop hasn't been saved. Leaving now loses it — nothing is kept between sessions until you press Save."
          confirmLabel="Leave"
          onConfirm={() => {
            const href = pendingHref;
            setPendingHref(null);
            router.push(href);
          }}
          onCancel={() => setPendingHref(null)}
        />
      )}
    </div>
  );
}

/**
 * Light a meter from a peak amplitude.
 *
 * The fill is a dB fraction, not a linear one — real material peaks well below
 * full scale, and mapping that linearly is why the meters used to barely leave
 * the floor. Smoothing jumps to a rise and eases down from it, so a transient
 * registers instead of flashing past between frames.
 */
function paintMeter(
  root: HTMLElement,
  smoothed: Map<string, number>,
  name: string,
  level: number,
): void {
  const meter = root.querySelector<HTMLElement>(`[data-meter="${name}"]`);
  if (!meter) return;

  const target = meterFraction(level);
  const previous = smoothed.get(name) ?? 0;
  const rate = target > previous ? config.ui.meterAttack : config.ui.meterRelease;
  const value = previous + (target - previous) * rate;
  smoothed.set(name, value);

  const segments = meter.children;
  const lit = Math.round(value * segments.length);
  for (let i = 0; i < segments.length; i++) {
    (segments[i] as HTMLElement).dataset.lit = i < lit ? "true" : "false";
  }
}

function recordButtonText(
  recording: ReturnType<typeof useLoopStation>["session"]["recording"],
  now: number,
  beats: number,
): string {
  if (recording.kind === "countIn") {
    // Count *up* through the one-bar count-in; a dash before the first click.
    if (now < recording.startTime) return "–";
    const total = recording.endTime - recording.startTime;
    const fraction = Math.min(0.999, (now - recording.startTime) / total);
    return String(Math.floor(fraction * beats) + 1);
  }
  if (recording.kind === "free") {
    return `${Math.max(0, now - recording.startTime).toFixed(1)}s`;
  }
  return "";
}

function phaseFraction(time: number, session: { anchorTime: number | null; loopSeconds: number | null }): number {
  if (session.anchorTime === null || !session.loopSeconds) return 0;
  const raw = ((time - session.anchorTime) / session.loopSeconds) % 1;
  return raw < 0 ? raw + 1 : raw;
}
