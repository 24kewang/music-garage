# Music Garage

A collection of small music games, picked from the Games menu in the header.
Everything runs in the browser — no server, no accounts, no audio leaves the tab.

Built with Next.js (App Router) + TypeScript, CSS Modules, and Vitest.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |

**Microphone and camera access need a secure origin.** `localhost` counts, so
`npm run dev` works; if you open the dev server from another device on your network it
needs HTTPS.

## Architecture

The organising rule: **games and tools are self-contained, the shell knows nothing
about them beyond their manifest.**

```
src/
├── app/          Routing and shell only — no game logic lives here
├── games/        One folder per game, plus the registry
├── tools/        One folder per tool, plus its own registry
└── shared/       Cross-game dependencies (audio, UI chrome, design tokens)
```

- `src/games/registry.ts` is the single source of truth. The header's Games menu and
  the home gallery are both rendered from it, so registering a game is what makes it
  appear. Each game's own decisions are recorded in `src/games/<slug>/ARCHITECTURE.md`.
- `src/app/games/<slug>/page.tsx` is a thin adapter that re-exports the game's root
  component. Keeping real route folders (rather than one `[slug]` catch-all) gives
  each game automatic code-splitting and its own page metadata.
- A game may import from `@/shared/*`. It must **not** import from another game.

### Adding a game

Three steps:

1. **Create the game folder**, `src/games/<slug>/`:

   ```
   src/games/<slug>/
   ├── manifest.ts       # slug, title, blurb, icon, status — see src/games/types.ts
   ├── Game.tsx          # 'use client' root component
   ├── components/       # game-only UI
   ├── lib/              # game-only logic
   ├── assets/           # game-only assets
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

Tools are the utilities alongside the games — the Loop Station is the first. Same
three steps with `tools` in place of `games`: create `src/tools/<slug>/` (manifest
type is `src/tools/types.ts`), add the route adapter at `src/app/tools/<slug>/page.tsx`,
register it in `src/tools/registry.ts`. `src/tools/registry.test.ts` guards the same
three-way contract, and the Tools menu and gallery section render from the registry.

### Styling

Colours, spacing, radii, type and motion come from CSS custom properties in
`src/shared/styles/tokens.css` — one dark theme, no light mode. Reference tokens
(`var(--color-accent)`) instead of hard-coding values, and games inherit a consistent
look without importing each other's stylesheets. Everything else is CSS Modules,
colocated with the component it styles. See `CLAUDE.md` for the full styling rules.

## Shared audio module

`@/shared/audio` is the pitch-detection stack every game shares. Import from the
package root, never from the individual files or from `pitchy` directly, so the
implementation stays swappable.

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

## Games

### 🎯 Musical Wavelength

Wavelength with a musical twist, for two players around one screen. A scoring target
is hidden under the cover; bands score 2-3-4-3-2, and a 4 earns confetti.

**Three rounds of play:**

1. **Setup** — the clue-giver scrolls or drags the wheel to place the target and opens
   the cover to see where it landed. They describe it out loud — an ordinary spoken
   clue — then press **START**, which shuts the cover.
2. **Guess** — the other player, who never saw the target, aims the needle by ear. The
   wheel is locked.
3. **Reveal** — slide the handle fully open. The hub shows the score and the band that
   was hit pulses. Touch the wheel to start again.

**How the guesser answers** is set from the gear in the bottom-right corner:

| Mode | Needle follows | Settings |
| --- | --- | --- |
| **Manual** | The pointer, dragged near the needle | — |
| **Pitch** | The note played or sung, low note at the left | Range, as note names (`C4`–`C5`) |
| **Intonation** | How sharp or flat that note is against the nearest semitone | Span, 10–50 cents |

So the answer can come off an instrument, out of a voice, or straight from the mouse.

In the two audio modes the cover carries a tick scale while the guess is being made,
and the hub becomes a lock that holds the needle at its current angle. Settings persist
across reloads, and invalid input is rejected rather than committed, so there is always
a usable configuration.

Peeking is safe: the cover only ends the round if you release it past halfway. Let go
before that and it springs shut with nothing changed.

#### Customising the dial

Every geometry, colour, motion, tick, glow and confetti parameter lives in one place —
[`config.ts`](src/games/musical-wavelength/config.ts). Components read from it instead
of embedding literals, so the look can be retuned without touching JSX.

Two knobs are worth knowing about, both in
[`geometry.ts`](src/games/musical-wavelength/lib/geometry.ts)'s hands:

- **`targetHalfWidthDeg`** resizes the whole scoring zone in one number. Each band's
  `edgeFraction` is its outer edge as a share of that total, so the proportions hold.
  The SVG wedge paths and the scoring maths are both generated from these, so a resize
  moves the drawn shape and the score together — they cannot disagree.
- **`geometry.scaleMaxDeg`** (86.5°) is how far the tick scale reaches either side of
  vertical, and so how far the needle travels in the audio modes. It stops short of
  `needleMaxDeg` (88°) on purpose: out at 88° a tick label sits only ~8 units above the
  window's straight edge and is rotated to run almost vertically, so its own length
  carries it past the edge — and moving it radially inward makes that *worse*, not
  better. `modes.test.ts` pins the clearance and fails if this is widened further.

The cover and the housing window are both drawn from one `windowPath()`, so the lid's
outline *is* the opening's and it cannot leave a gap — a gap would show a sliver of the
wheel through the closed cover and leak the target.

`geometry.test.ts` pins the generated coordinates to the original design's values, so a
change that breaks fidelity fails the suite.

### 〰️ Pitch Math

Two players, two instruments, one microphone. Both sound a note at the same time; the app
works out what they were and puts the thirteen intervals on screen.

Whoever names the interval out loud first gets to press a button. A wrong press shakes,
dulls and strikes it through — it can't be chosen again this round — and the turn passes.
When someone is right, the button lights up, confetti bursts from it, and the two notes
appear. **Scores and turn order are the players' job**, deliberately: the app is a
referee, not a scorekeeper.

A play button replays what the microphone caught, so a disputed interval can be settled
by listening again rather than from memory. It sits below the board while guessing and
moves alongside the note names at the reveal, and stays available until **Retry** starts
a new round.

| Setting | Where | Effect |
| --- | --- | --- |
| **Absolute / Relative** | Start screen | Absolute takes one answer. Relative also takes the inversion — a 4th answers a 5th — for every interval but the tritone |
| **Instrument** | Gear | C, B♭, E♭ or F. Changes how the notes are spelled, never which answer is right |
| **Short labels** | Gear | `m3` instead of `Minor 3rd`, so the board fits one row |

Intervals wider than an octave fold inward, so a 12th answers as a perfect 5th and no
round is ever unanswerable.

#### How the two notes are separated

`@/shared/audio`'s detector is monophonic, so this game brings its own
[`dsp/`](src/games/pitch-math/dsp/): a hand-rolled FFT, a grid of candidate notes scored
by how much of their harmonic series is present, then subtract the strongest and look
again.

Two cases are genuinely hard, and both are handled deliberately rather than hopefully:

- **A perfect 5th** shares a harmonic between the two notes. Subtracting the lower note
  too eagerly erases the upper one and turns every 5th into a unison — so the
  subtraction is capped.
- **An octave** can't be separated at all; the upper note has no harmonic of its own. It
  is identified from the way it reinforces the lower note's *even* harmonics, measured
  against the decay curve fitted to the note's own odd harmonics so that the instrument's
  brightness cancels out.

The detector is tested entirely against synthesized tones — every interval, detuned
players, uneven volumes, different timbres and added noise — so it can be verified
without a microphone. See
[`ARCHITECTURE.md`](src/games/pitch-math/ARCHITECTURE.md) for the full reasoning and the
measured thresholds.

### 🔀 Random Excerpt Generator

One player, a webcam, and their own practice library. Upload images of musical
excerpts — loose files or whole nested folders — and they're kept in the browser's
private file storage (OPFS), so the library survives reloads and nothing ever leaves
the tab.

The camera feed becomes a face filter: a box floats above your head, tracked in 3D as
you move. Press **SPIN** and it riffles through your checked excerpts slot-machine
style, slowing until it lands on a random one, captioned with a name built from the
file's path (`orchestral/mahler/Symphony 5.png` → *orchestral - mahler - Symphony 5*).
Practise what fate hands you, then spin again.

The excerpt floats at head size, which is enough to recognise a piece but not to play
it — so **clicking the excerpt itself opens it full-screen**, and the x, a click
outside, or Escape closes it again. SPIN and the gear stay locked while it's open.

The gear in the bottom-right has two tabs. **Files** is the library: a search bar, a
collapsible checkbox tree mirroring your folder structure (folder checkboxes cascade),
expand/collapse-all, an "only show selected" filter that composes with the search, ways
to add more files, and a delete-everything escape hatch behind a confirmation.
Select/deselect-all applies to whatever the tree is currently showing, so during a search
it only touches the files that search surfaced. At least one excerpt must stay checked —
SPIN buzzes and shakes otherwise. **Filter** is where the box lives: a
**Camera mode** switch, sliders for the box's left/right, up/down and near/far offset,
overall size as a percentage, and whether the excerpt's name is shown at all. The filter
follows the sliders live while you watch yourself, and your tuning is remembered.

**Camera mode starts off.** Without it the same slot machine runs as an ordinary picker —
the excerpt centred on screen with its name underneath, still clickable to enlarge — asking
for no camera permission and loading none of the 3D stack, so a visit that never turns the
camera on never fetches it. The position sliders grey out there, since there's no head to
track. The switch is session-only: reload and you're back to camera-free. It also locks
while the camera is starting, so a half-built scene can't be torn down under itself.

Offsets are measured in *face widths*, so the box holds its position as you move toward
or away from the camera.

Face tracking is [MindAR](https://github.com/hiukim/mind-ar-js) + three.js, loaded only
on this page. The spin's cadence, the slider bounds, and the caption length budget are
all tunable in [`config.ts`](src/games/reg/config.ts). See
[`ARCHITECTURE.md`](src/games/reg/ARCHITECTURE.md) for the decisions — including why
`imageOrientation: "flipY"` is load-bearing, how the render buffer is supersampled to
make notation legible, and the two stubs (`canvas`, `fs`) that mind-ar needs to build.
