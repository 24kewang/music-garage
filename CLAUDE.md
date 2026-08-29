@AGENTS.md

# Music Garage

A collection of browser-only music games. No server, no accounts, no audio leaves the
tab. Next.js (App Router) + TypeScript + CSS Modules + Vitest.

Per-game architecture notes live in `src/games/<slug>/ARCHITECTURE.md`. **Read the one
for a game before changing it.** Setup, scripts and how to add a game are in the README.

## Architecture rules

The organizing rule: **games are self-contained; the shell knows nothing about them
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
- `@/shared/lib/` is for pure cross-feature helpers. `reorder.ts` is the drag-to-reorder
  geometry (`moveItem`, `targetIndex`, `shiftFor`, `gapBetween`), used by both the loop
  station and MUSIC. The pointer gesture stays per-feature — the two have genuinely
  different needs.

## Styling

**One dark theme. There is no light mode** — no `prefers-color-scheme` branch, and
`color-scheme: dark` is set globally. Don't reintroduce one without being asked.

- **Everything comes from `src/shared/styles/tokens.css`.** Reference tokens
  (`var(--color-accent)`); never hard-code a color, radius, duration or type size in a
  component. Add a token rather than a literal.
- Contrast is **computed, not eyeballed.** Every text/background pair clears WCAG AA;
  the tightest is documented at the top of `tokens.css`. If you add or change a text
  color, compute the ratio and record it.
- **Type has three roles.** `--font-display` (Righteous) is the wordmark and page H1s
  *only* — never body copy. `--font-sans` (Poppins) is everything else.
  `--font-mono` (Geist Mono) is for readouts that need tabular figures.
- **Icons are Phosphor, via `@/shared/icons`. No emoji as icons** — they render
  differently on every OS and read as filler. Add new icons to the `ICONS` registry so
  `IconId` stays typed and a typo is a build error. Import the **`*Icon` names**
  (`GearIcon`, not `Gear`) — the unsuffixed exports are deprecated aliases of the same
  components. The `Icon` *type* keeps its name. (The padlock inside the dial's center
  button is hand-drawn apparatus and stays that way.)
- **Motion uses the tokens**: `--ease-out` plus `--dur-fast|base|slow`, so timing is
  consistent instead of re-invented per component. `prefers-reduced-motion` zeroes the
  duration tokens globally — behavior must still work with motion removed.
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

## Writing

**American English, everywhere** — UI copy, code comments, identifiers, commit messages
and every Markdown file in the repo. Color not colour, license not licence, center not
centre, analyze not analyse, canceled not cancelled, gray not grey, artifact not
artefact, catalog not catalogue, practice not practise, judgment not judgement.

Three categories are **not** ours to respell, and changing them breaks things:

- **Web platform names.** `AnalyserNode`, `createAnalyser()`, `aria-labelledby`,
  `echoCancellation`. Our own identifiers that wrap them keep the platform's spelling
  too — `mic.analyser` holds an `AnalyserNode`, and renaming the wrapper away from the
  API it wraps reads as a bug rather than as consistency. Prose *about* them still
  changes: "the game analyzes the buffer".
- **Third-party names and license identifiers.** SPDX strings (`Apache-2.0`), package
  names, the `LICENSE` filename.
- **Words that only look British.** `cancellation` takes a double L in both variants,
  and `analysis` is spelled the same either way.

## Shipping

The site is deployed as a **static export** (`output: "export"` in `next.config.ts`)
served by a Cloudflare Worker with an assets binding. Consequences that are easy to
trip over:

- **`headers()`, `redirects()` and `rewrites()` in `next.config.ts` do nothing.**
  Security headers live in `public/_headers`, which the export copies to `out/` and
  Workers parses at the edge. CI fails the build if `out/_headers` goes missing.
- **Metadata routes need `export const dynamic = "force-static"`.** `robots.ts`,
  `sitemap.ts`, `manifest.ts` and `opengraph-image.tsx` are Route Handlers underneath,
  and a static export refuses them without it.
- **The CSP's `cdn.jsdelivr.net` and `storage.googleapis.com` entries are REG's face
  tracking, not decoration** — mind-ar fetches the MediaPipe runtime and model from
  them and hardcodes both URLs. Removing either breaks the camera filter, and it fails
  through the camera-error path so the message blames the webcam. `'unsafe-inline'` in
  `script-src` is likewise not laziness: a static export cannot emit per-request
  nonces. The CSP ships as **Report-Only** until it has been exercised in a browser.
- **`camera` and `microphone` must stay `(self)` in `Permissions-Policy`.** Setting
  either to `()` silently kills REG, the loop station, and every pitch-based game.
- **`src/shared/site.ts` is the only place the domain is written.** `metadataBase`,
  `robots`, `sitemap`, `manifest`, the footer and both legal pages all read it.
- `SiteFooter` is **deliberately absent on `/games/*` and `/tools/*`** — those own the
  whole viewport, and the loop station is `position: fixed; inset: 0`, so a footer
  under it is unreachable. `SiteHeader` carries the legal links instead, on every
  route. Don't "fix" this by rendering the footer everywhere.
- CI (`.github/workflows/ci.yml`) gates PRs. Deployment is Cloudflare's own git
  integration and lives in no file here. `npm run licenses` is the license gate; add
  an exception to `scripts/check-licenses.mjs` **with the reason** rather than
  widening the denylist.

## Before calling work done

`npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — all clean.

There is no browser automation here. Verify served markup and computed values, and say
plainly which parts need the user's eyes — especially anything touch-only.
