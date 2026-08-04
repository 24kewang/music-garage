"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { angleAt, clamp, localPoint, norm, type Point } from "./geometry";
import { scoreAt, type Landing } from "./scoring";
import { needsMicrophone, type NeedleMode } from "./settings";

/**
 * setup  — place the target: spin the wheel, open and close the cover freely.
 * guess  — aim the needle. The wheel is locked; opening the cover ends the round.
 * reveal — the score is in. Touching the wheel starts over.
 */
export type Phase = "setup" | "guess" | "reveal";

type Drag =
  | { kind: "wheel"; lastDeg: number }
  | { kind: "needle" }
  | { kind: "cover"; offsetDeg: number };

export interface DialState {
  phase: Phase;
  wheelDeg: number;
  coverDeg: number;
  needleDeg: number;
  /** Audio modes only: needle held at its current angle. */
  locked: boolean;
  /** Set on reveal — which band was hit, or null for a miss. */
  landing: Landing | null;
  /** Bumped on every reveal so one-shot effects re-run on a repeat score. */
  revealKey: number;
}

export interface DialControls extends DialState {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onCoverPointerDown: (event: React.PointerEvent) => void;
  /** The centre button: START, or the lock toggle, depending on phase and mode. */
  onButton: () => void;
}

const { motion, geometry } = config;

/**
 * The dial's behaviour. The caller owns the `<svg>` ref and passes it in, so the
 * returned controls stay a plain data object that can be handed to components.
 */
export function useDial(
  svgRef: React.RefObject<SVGSVGElement | null>,
  mode: NeedleMode,
  audioNeedleDeg: number | null,
): DialControls {
  const [phase, setPhase] = useState<Phase>("setup");
  // Annotated because `config` is `as const`, which would otherwise narrow these to
  // the literal value they start at.
  const [wheelDeg, setWheelDeg] = useState<number>(config.defaults.wheelStartDeg);
  const [coverDeg, setCoverDeg] = useState<number>(0);
  const [needleDeg, setNeedleDeg] = useState<number>(config.defaults.needleStartDeg);
  const [locked, setLocked] = useState(false);
  const [landing, setLanding] = useState<Landing | null>(null);
  const [revealKey, setRevealKey] = useState(0);

  const dragRef = useRef<Drag | null>(null);
  const rafRef = useRef<number | null>(null);
  const coverGoalRef = useRef(0);
  const coverValueRef = useRef(0);

  /**
   * Latest values for handlers that are attached once (the native wheel listener) or
   * that run inside the animation loop. Kept in a ref so those don't need rebinding
   * on every state change.
   */
  const stateRef = useRef({ phase, needleDeg, wheelDeg });
  useEffect(() => {
    stateRef.current = { phase, needleDeg, wheelDeg };
  });

  // ---------------------------------------------------------------- cover motion

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  /**
   * The cover's authoritative angle. Kept alongside the state because the animation
   * loop and the drag both need to read the current value synchronously — and because
   * scheduling frames from inside a state updater would double up under StrictMode's
   * double-invoked updaters.
   */
  const setCover = useCallback((deg: number) => {
    coverValueRef.current = deg;
    setCoverDeg(deg);
  }, []);

  /** Ease the cover toward `goal`, matching the design's lerp. */
  const snapCover = useCallback(
    (goal: number) => {
      coverGoalRef.current = goal;
      if (rafRef.current !== null) return; // already animating; it'll pick up the new goal

      const step = () => {
        const delta = coverGoalRef.current - coverValueRef.current;

        if (Math.abs(delta) < motion.coverSnapEpsilonDeg) {
          setCover(coverGoalRef.current);
          rafRef.current = null;
          return;
        }

        setCover(coverValueRef.current + delta * motion.coverLerp);
        rafRef.current = requestAnimationFrame(step);
      };

      rafRef.current = requestAnimationFrame(step);
    },
    [setCover],
  );

  useEffect(() => stopAnimation, [stopAnimation]);

  // ------------------------------------------------------------ phase transitions

  const toSetup = useCallback(() => {
    setPhase("setup");
    setLanding(null);
    setLocked(false);
  }, []);

  const toGuess = useCallback(() => {
    setPhase("guess");
    setLanding(null);
    setLocked(false);
    snapCover(0);
  }, [snapCover]);

  const toReveal = useCallback(() => {
    const { needleDeg: needle, wheelDeg: wheel } = stateRef.current;
    setPhase("reveal");
    setLanding(scoreAt(needle, wheel));
    setRevealKey((key) => key + 1);
  }, []);

  // ------------------------------------------------------------------- pointer io

  const pointFor = useCallback((event: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    return localPoint(event.clientX, event.clientY, rect);
  }, [svgRef]);

  /** The wheel may be turned while placing the target, and to start a new round. */
  const wheelIsLive = phase === "setup" || phase === "reveal";

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const point = pointFor(event);
      if (!point) return;

      const distance = Math.hypot(point.x, point.y);
      if (distance < motion.dragMinRadius || distance > motion.dragMaxRadius) return;

      const pointerDeg = angleAt(point);

      // The needle is only grabbable while aiming, and only in manual mode — in the
      // audio modes it belongs to the microphone.
      const nearNeedle =
        Math.abs(norm(pointerDeg - needleDeg)) < motion.needleGrabDeg;
      if (phase === "guess" && mode === "manual" && nearNeedle) {
        dragRef.current = { kind: "needle" };
      } else if (wheelIsLive) {
        // Touching the wheel after a reveal starts the next round.
        if (phase === "reveal") toSetup();
        dragRef.current = { kind: "wheel", lastDeg: pointerDeg };
      } else {
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [mode, needleDeg, phase, pointFor, toSetup, wheelIsLive],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const point = pointFor(event);
      if (!point) return;
      const pointerDeg = angleAt(point);

      if (drag.kind === "needle") {
        setNeedleDeg(clamp(pointerDeg, -geometry.needleMaxDeg, geometry.needleMaxDeg));
      } else if (drag.kind === "wheel") {
        // Incremental, so the wheel turns with the pointer rather than jumping to it.
        const delta = norm(pointerDeg - drag.lastDeg);
        drag.lastDeg = pointerDeg;
        setWheelDeg((current) => current + delta);
      } else {
        setCover(clamp(pointerDeg - drag.offsetDeg, motion.coverOpenDeg, 0));
      }
    },
    [pointFor, setCover],
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind !== "cover") return;

    // The design's rule: past halfway, the cover falls open; otherwise it springs shut.
    const opening = coverValueRef.current < motion.coverOpenThresholdDeg;
    snapCover(opening ? motion.coverOpenDeg : 0);

    // Only a release that actually commits to open ends the round. Peeking and
    // letting go springs the cover shut and changes nothing.
    if (opening && stateRef.current.phase === "guess") toReveal();
  }, [snapCover, toReveal]);

  const onCoverPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const point = pointFor(event);
      if (!point) return;

      // Beat the wheel/needle handler on the svg to the punch.
      event.stopPropagation();
      stopAnimation();

      dragRef.current = {
        kind: "cover",
        offsetDeg: angleAt(point) - coverValueRef.current,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [pointFor, stopAnimation],
  );

  // --------------------------------------------------------------- scroll to spin

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent) => {
      if (stateRef.current.phase === "guess") return; // wheel is locked while aiming
      event.preventDefault();
      if (stateRef.current.phase === "reveal") toSetup();
      setWheelDeg((current) => current + event.deltaY * motion.scrollSensitivity);
    };

    // Not passive: spinning the dial must not also scroll the page.
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, toSetup]);

  // ------------------------------------------------------------ audio → the needle

  useEffect(() => {
    if (phase !== "guess") return;
    if (!needsMicrophone(mode) || locked) return;
    if (audioNeedleDeg === null) return;
    // Syncing an external signal (the microphone) into React state — the case the
    // set-state-in-effect rule explicitly allows, which the linter can't detect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedleDeg(audioNeedleDeg);
  }, [audioNeedleDeg, locked, mode, phase]);

  // ------------------------------------------------------------------- the button

  const onButton = useCallback(() => {
    if (phase === "setup") {
      toGuess();
    } else if (phase === "guess" && needsMicrophone(mode)) {
      setLocked((current) => !current);
    }
    // Manual aiming and the reveal have an inert button.
  }, [mode, phase, toGuess]);

  return {
    phase,
    wheelDeg,
    coverDeg,
    needleDeg,
    locked,
    landing,
    revealKey,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onCoverPointerDown,
    onButton,
  };
}
