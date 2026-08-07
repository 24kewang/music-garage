"use client";

import { createElement, type ComponentProps } from "react";
import {
  CaretDown,
  Gear,
  House,
  Microphone,
  MusicNotes,
  Target,
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
 */
export const ICONS = {
  target: Target,
  musicNotes: MusicNotes,
  house: House,
  caretDown: CaretDown,
  gear: Gear,
  microphone: Microphone,
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
