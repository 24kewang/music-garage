"use client";

import { config } from "../config";
import type { Tick } from "../lib/modes";
import type { NeedleMode } from "../lib/settings";
import type { DialControls } from "../lib/useDial";
import CenterButton from "./CenterButton";
import Cover from "./Cover";
import DialDefs from "./DialDefs";
import Housing from "./Housing";
import Needle from "./Needle";
import Wheel from "./Wheel";

const { viewBox } = config;

interface DialProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  dial: DialControls;
  mode: NeedleMode;
  ticks: readonly Tick[];
}

/**
 * The whole instrument. Draw order matters and follows the design: wheel, then
 * cover over it, then the housing masking everything outside the window, then the
 * needle and hub on top.
 */
export default function Dial({ svgRef, dial, mode, ticks }: DialProps) {
  return (
    <svg
      ref={svgRef}
      viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
      onPointerDown={dial.onPointerDown}
      onPointerMove={dial.onPointerMove}
      onPointerUp={dial.onPointerUp}
      onPointerCancel={dial.onPointerUp}
      role="application"
      aria-label="Wavelength dial"
      style={{
        width: "100%",
        height: "auto",
        display: "block",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <DialDefs />

      <Wheel
        wheelDeg={dial.wheelDeg}
        landing={dial.landing}
        revealKey={dial.revealKey}
      />

      <Cover
        coverDeg={dial.coverDeg}
        ticks={ticks}
        onHandlePointerDown={dial.onCoverPointerDown}
      />

      <Housing />

      <Needle needleDeg={dial.needleDeg} />

      <CenterButton
        phase={dial.phase}
        mode={mode}
        locked={dial.locked}
        score={dial.phase === "reveal" ? (dial.landing?.score ?? 0) : null}
        onClick={dial.onButton}
      />
    </svg>
  );
}
