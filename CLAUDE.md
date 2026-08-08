@AGENTS.md

# Music Garage

A collection of browser-only music games. No server, no accounts, no audio leaves the
tab. Next.js (App Router) + TypeScript + CSS Modules + Vitest.

Per-game architecture notes live in `src/games/<slug>/ARCHITECTURE.md`. **Read the one
for a game before changing it.** Setup, scripts and how to add a game are in the README.

## Architecture rules

The organising rule: **games are self-contained; the shell knows nothing about them
beyond their manifest.**

```
src/app/       Routing and shell only — no game logic
src/games/     One folder per game, plus the registry
src/shared/    Cross-game code: audio, UI chrome, icons, design tokens
```

- A game may import from `@/shared/*`. It must **never** import from another game.
- `src/games/registry.ts` is the single source of truth. Nav and gallery both render
  from it; registering a game is what makes it appear.
- Manifests stay **plain data** — no JSX. Icons are referenced by `iconId`, resolved
  through `@/shared/icons`. This is what keeps `manifest.ts` importable anywhere.
- `src/app/games/<slug>/page.tsx` is a thin adapter re-exporting the game's root
  component. Real route folders, not a `[slug]` catch-all — that buys per-game code
  splitting and per-game metadata.
- `registry.test.ts` fails the build if slug, folder and route drift apart.
- Import audio from `@/shared/audio` only — never from its individual files, never from
  `pitchy` directly. Three things in there are load-bearing and easy to undo: browser
  audio processing (`echoCancellation`/`noiseSuppression`/`autoGainControl`) is
  **disabled** because it distorts pitch; the `AudioContext` is created inside `start()`
  because iOS refuses audio outside a user gesture; smoothing takes a **median**, not a
  mean, so one bad frame can't cause an octave jump.
- `usePitchDetector` is **monophonic** (McLeod Pitch Method, live loop). Anything needing
  two simultaneous pitches needs its own detector — see `pitch-math/dsp/`.
- Shared UI worth reusing before writing a fourth copy: `Confetti` (takes its tuning as a
  prop, plus an optional burst origin) and `useDismiss` (Escape/outside-click, passing
  the reason so callers can restore focus on Escape only).

## Styling

**One dark theme. There is no light mode** — no `prefers-color-scheme` branch, and
`color-scheme: dark` is set globally. Don't reintroduce one without being asked.

- **Everything comes from `src/shared/styles/tokens.css`.** Reference tokens
  (`var(--color-accent)`); never hard-code a colour, radius, duration or type size in a
  component. Add a token rather than a literal.
- Contrast is **computed, not eyeballed.** Every text/background pair clears WCAG AA;
  the tightest is documented at the top of `tokens.css`. If you add or change a text
  colour, compute the ratio and record it.
- **Type has three roles.** `--font-display` (Righteous) is the wordmark and page H1s
  *only* — never body copy. `--font-sans` (Poppins) is everything else.
  `--font-mono` (Geist Mono) is for readouts that need tabular figures.
- **Icons are Phosphor, via `@/shared/icons`. No emoji as icons** — they render
  differently on every OS and read as filler. Add new icons to the `ICONS` registry so
  `IconId` stays typed and a typo is a build error. Import the **`*Icon` names**
  (`GearIcon`, not `Gear`) — the unsuffixed exports are deprecated aliases of the same
  components. The `Icon` *type* keeps its name. (The padlock inside the dial's centre
  button is hand-drawn apparatus and stays that way.)
- **Motion uses the tokens**: `--ease-out` plus `--dur-fast|base|slow`, so timing is
  consistent instead of re-invented per component. `prefers-reduced-motion` zeroes the
  duration tokens globally — behaviour must still work with motion removed.
- CSS Modules colocated with the component. No Tailwind, no CSS-in-JS.

### The header

`SiteHeader` is fixed and translated out of view, revealed by a hover zone at the top of
the screen, with a 4px accent "peek" strip so it is discoverable rather than secret. The
`GamesMenu` panel is a **DOM child of the header** so hovering it can't fire the
header's `pointerleave`, and the gap between trigger and panel is bridged with padding —
a visual gap with no hit area is what makes these menus feel broken. Both use a short
delay before closing so an overshoot doesn't flicker them away.

**Hover is the desktop path, never the only path.** A hover-only nav is unreachable on
a phone. Three ways in, all required:

1. pointer into the hover zone (fine pointers only — `pointerType !== "touch"`),
2. keyboard focus, which pins it open,
3. `@media (hover: none), (pointer: coarse)` → the header becomes plain `sticky` with
   `transform: none` and the hover zone is hidden.

Plus a skip link, which matters more than usual with an overlaid header.

## Before calling work done

`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — all clean.

There is no browser automation here. Verify served markup and computed values, and say
plainly which parts need the user's eyes — especially anything touch-only.
