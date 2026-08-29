# Music Garage
A collection of small music games and tools, live at
**[music.trumpettuck.com](https://music.trumpettuck.com)**. Everything runs in the
browser — no server, no accounts, no audio leaves the tab.

Next.js (App Router) + TypeScript, CSS Modules, Vitest.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

**Microphone and camera access need a secure origin.** `localhost` counts, so
`npm run dev` works; opening the dev server from another device on your network needs
HTTPS.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | Serve the last build without rebuilding |

## The games

Each has its own README with the rules and every setting.

| | Game | Players | What it is |
| --- | --- | --- | --- |
| 🎯 | [Musical Wavelength](src/games/musical-wavelength/README.md) | 2–5 | Wavelength with a musical twist. One player hides a target and describes it; the other answers by ear |
| 〰️ | [Pitch Math](src/games/pitch-math/README.md) | 2 | Both players sound a note at once. First to name the interval out loud gets to answer |
| 🔀 | [Random Excerpt Generator](src/games/reg/README.md) | 1 | An AR filter that floats a random excerpt from your own library above your head |
| 🏀 | [MUSIC](src/games/music/README.md) | 2–4 | HORSE for musicians. Copy the melody or take a letter |
| 🎛️ | [Loop Station](src/tools/loop-station/README.md) | tool | A loop pedal with tracks, buses and latency calibration |

## Architecture

The organizing rule: **games and tools are self-contained; the shell knows nothing
about them beyond their manifest.**

```
src/
├── app/          Routing and shell only — no game logic lives here
├── games/        One folder per game, plus the registry
├── tools/        One folder per tool, plus its own registry
└── shared/       Cross-game code: audio, UI chrome, design tokens
```

- `src/games/registry.ts` is the single source of truth. The header's Games menu and
  the home gallery both render from it, so registering a game is what makes it appear.
- `src/app/games/<slug>/page.tsx` is a thin adapter that re-exports the game's root
  component. Keeping real route folders (rather than one `[slug]` catch-all) gives
  each game automatic code-splitting and its own page metadata.
- A game may import from `@/shared/*`. It must **not** import from another game.

Each game folder documents itself: `README.md` for how it plays, `ARCHITECTURE.md` for
why the code is shaped the way it is, `config.ts` for every tunable.

### Adding a game

Three steps:

1. **Create the game folder**, `src/games/<slug>/`:

   ```
   src/games/<slug>/
   ├── manifest.ts       # slug, title, blurb, icon, status — see src/games/types.ts
   ├── Game.tsx          # 'use client' root component
   ├── components/       # game-only UI
   ├── lib/              # game-only logic
   └── game.module.css
   ```

2. **Add the route adapter**, `src/app/games/<slug>/page.tsx`:

   ```tsx
   import Game from "@/games/<slug>/Game";
   import { manifest } from "@/games/<slug>/manifest";

   export const metadata = { title: manifest.title, description: manifest.blurb };

   export default function Page() {
     return <Game />;
   }
   ```

3. **Register it** in `src/games/registry.ts` by adding its manifest to `GAMES`.

`src/games/registry.test.ts` fails the build if these three drift apart — a registered
game with no route 404s, and a route with no registry entry never shows up in the tabs.

### Adding a tool

Tools are the utilities alongside the games — the Loop Station is the first. Same three
steps with `tools` in place of `games`: create `src/tools/<slug>/` (manifest type is
`src/tools/types.ts`), add the route adapter at `src/app/tools/<slug>/page.tsx`, register
it in `src/tools/registry.ts`. `src/tools/registry.test.ts` guards the same three-way
contract.

### Styling

Colors, spacing, radii, type and motion all come from CSS custom properties in
`src/shared/styles/tokens.css` — one dark theme, no light mode. Reference tokens
(`var(--color-accent)`) rather than hard-coding values. Everything else is CSS Modules,
colocated with the component it styles. `CLAUDE.md` has the full rules and `DESIGN.md`
the reasoning behind them.

## Shared audio

`@/shared/audio` is the pitch-detection stack every game shares. Import from the package
root, never from the individual files or from `pitchy` directly, so the implementation
stays swappable.

```tsx
"use client";
import { useMicrophone, usePitchDetector } from "@/shared/audio";

const mic = useMicrophone();
const pitch = usePitchDetector(mic.analyser, mic.sampleRate);
// mic.start() must be called from a click.
// pitch => { frequency, note: { name, octave, midi, cents }, clarity, isDetecting }
```

| Export | Purpose |
| --- | --- |
| `useMicrophone()` | Owns the mic stream and Web Audio graph; returns an `AnalyserNode` |
| `usePitchDetector(analyser, sampleRate)` | rAF detection loop with median smoothing |
| `detectPitch()` / `createPitchDetector()` | The detector itself — pure, unit-tested |
| `frequencyToNote()`, `midiToFrequency()`, … | Music-theory conversions in `notes.ts` |
| `parseNoteName()` / `formatMidi()` | `"Bb4"` ↔ MIDI, for note-name input and labels |

Three details in there are load-bearing and easy to undo by accident:

- **`echoCancellation`, `noiseSuppression` and `autoGainControl` are all disabled.**
  They are tuned for speech intelligibility and actively distort pitch.
- **The `AudioContext` is created inside `start()`**, which must be called from a user
  gesture. Safari and iOS refuse to start audio any other way.
- **Smoothing takes a median, not a mean**, so a single bad frame can't drag the
  reading — which is what keeps octave jumps off the screen.

Detection is unit-tested against synthesized sine and harmonic buffers in
`pitch.test.ts`, so accuracy regressions fail loudly rather than quietly sounding off.

The detector is **monophonic**. Anything needing two simultaneous pitches brings its own
— see `src/games/pitch-math/dsp/`.
