"use client";

import { createElement, type ComponentProps } from "react";
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  GearIcon,
  HouseIcon,
  MicrophoneIcon,
  MusicNotesIcon,
  ShuffleIcon,
  TargetIcon,
  WaveSineIcon,
  type Icon,
} from "@phosphor-icons/react";

/**
 * The site's icon set.
 *
 * One library, one grid, one stroke weight — emoji were rendering differently on every
 * operating system and reading as filler. Games refer to icons by id rather than
 * importing components, so a game's `manifest.ts` stays plain data.
 *
 * Adding an icon: import it from `@phosphor-icons/react` and add it here. Nothing else
 * needs to change.
 *
 * Use the `*Icon` export names (`GearIcon`, not `Gear`) — the unsuffixed ones are
 * deprecated aliases of the very same components and are slated for removal.
 */
export const ICONS = {
  target: TargetIcon,
  musicNotes: MusicNotesIcon,
  house: HouseIcon,
  caretDown: CaretDownIcon,
  gear: GearIcon,
  microphone: MicrophoneIcon,
  waveSine: WaveSineIcon,
  arrowClockwise: ArrowClockwiseIcon,
  shuffle: ShuffleIcon,
} as const satisfies Record<string, Icon>;

/** Valid icon names. Typing `iconId` as this makes a typo a build error. */
export type IconId = keyof typeof ICONS;

export type { Icon };

/**
 * Render an icon by id.
 *
 * Built with `createElement` rather than by assigning the looked-up component to a
 * capitalised local — that pattern creates a "new" component type on every render as
 * far as React (and the lint rule) can tell.
 */
export function GameIcon({
  id,
  ...props
}: { id: IconId } & ComponentProps<Icon>) {
  return createElement(ICONS[id], props);
}
