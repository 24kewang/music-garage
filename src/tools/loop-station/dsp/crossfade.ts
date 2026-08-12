/**
 * Equal-power crossfade gains. `t` runs 0→1 across the fade window; the two
 * gains obey in² + out² = 1, so the summed signal keeps constant perceived
 * loudness through the seam instead of dipping the way a linear fade does.
 */
export function fadeInGain(t: number): number {
  return Math.sin((Math.PI / 2) * t);
}

export function fadeOutGain(t: number): number {
  return Math.cos((Math.PI / 2) * t);
}
