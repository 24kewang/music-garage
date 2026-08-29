# Music Garage

A collection of small music games and tools, picked from the Games and Tools menus in
the header. Everything runs in the browser — no server, no accounts, no audio leaves
the tab.

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
| `npm start` | Serve the last build through the Cloudflare Worker runtime |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run licenses` | Dependency license audit |
| `npm run icons` | Regenerate every app icon from `public/icon.svg` |
| `npm run preview` | Build, then serve it exactly as production does |
| `npm run deploy` | Build and deploy to Cloudflare |

**Microphone and camera access need a secure origin.** `localhost` counts, so
`npm run dev` works; if you open the dev server from another device on your network it
needs HTTPS.

## Architecture

The organizing rule: **games and tools are self-contained, the shell knows nothing
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

Colors, spacing, radii, type and motion come from CSS custom properties in
`src/shared/styles/tokens.css` — one dark theme, no light mode. Reference tokens
(`var(--color-accent)`) instead of hard-coding values, and games inherit a consistent
look without importing each other's stylesheets. Everything else is CSS Modules,
colocated with the component it styles. See `CLAUDE.md` for the full styling rules.

## Deployment

The site is a **static export** served from a Cloudflare Worker. `next build` writes
`out/`; the Worker serves it straight from the edge with no script in the request path.

```bash
npm run preview     # build, then serve it exactly as production does
npm run deploy      # build and push it live
```

Continuous integration and deployment are split on purpose. **GitHub Actions gates
pull requests** — lint, types, tests, build, license audit
(`.github/workflows/ci.yml`). **Cloudflare's git integration deploys**, watching `main`
directly, so no deployment credentials live in this repository. The full setup runbook
is in `HOSTING.md`, which is untracked.

Three things about this shape are worth knowing before you change anything:

- **`headers()` / `redirects()` / `rewrites()` in `next.config.ts` are inert** under
  `output: "export"`. Security headers — CSP, HSTS, `Permissions-Policy` and the rest —
  live in [`public/_headers`](public/_headers), which the export copies into `out/` and
  Cloudflare parses at the edge. Every rule in there is commented with what needs it.
- **The CSP is enforced, and its weakest directive is deliberate.** `'unsafe-eval'` is
  there for the mathjs parser bundled inside mind-ar; removing it breaks REG's camera
  filter, which reports the failure as a camera error rather than a CSP one. Every
  allowance in `public/_headers` carries a comment saying what needs it.
- **Adding a server later is additive.** `wrangler.jsonc` is written so that
  multiplayer means adding a `main` script, an `ASSETS` binding and Durable Objects to
  the same Worker — the static assets keep serving exactly as they do now.
- **Icons are generated.** `npm run icons` rasterizes `favicon.ico`, the Apple touch
  icon and the manifest PNGs from `public/icon.svg`. The outputs are committed, so the
  build never runs it. Note there is deliberately no `src/app/favicon.ico`: Next's file
  convention would outrank everything declared in `metadata.icons`.
- **Analytics has no code.** Cloudflare injects the Web Analytics beacon at the edge,
  which is why nothing in this repo mentions it and why the CSP still has to allow
  `static.cloudflareinsights.com`.

`src/shared/site.ts` holds the canonical URL and the publisher details, and is the only
place either is written.

## Licensing

Music Garage is [MIT licensed](LICENSE). The dependency tree was audited before
publication: no GPL, AGPL, SSPL, EPL, CDDL or CC-BY-SA anywhere, and no package with an
undeclared license. The only copyleft present is the LGPL-3.0 libvips binaries that
`next` pulls in as optional dependencies of `sharp` — build-time only, dynamically
linked, and absent from a static export entirely.

```bash
npm run licenses            # the gate CI runs
npm run licenses:notices    # regenerate THIRD-PARTY-NOTICES.md
```

`scripts/check-licenses.mjs` reads `package-lock.json` rather than walking
`node_modules`, because the lockfile declares a license for every resolved package
while an install only contains the binaries for the current platform. Exceptions are
listed in that script with the reason recorded next to them.

[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) is generated, and satisfies the
attribution requirements of the Apache-2.0 and CC-BY-4.0 packages in the tree.

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

#### Customizing the dial

Every geometry, color, motion, tick, glow and confetti parameter lives in one place —
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
Practice what fate hands you, then spin again.

The excerpt floats at head size, which is enough to recognize a piece but not to play
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
the excerpt centered on screen with its name underneath, still clickable to enlarge — asking
for no camera permission and loading none of the 3D stack, so a visit that never turns the
camera on never fetches it. The position sliders gray out there, since there's no head to
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

### 🏀 MUSIC

HORSE, played on melodies. Two to four musicians take turns; a failed copy earns a
letter, and spelling out **MUSIC** puts you out. Last player standing wins.

One player is the **setter**. They record the melody they're calling, then record it
*again* — the confirmation take has to match, which is the melodic equivalent of
actually making the shot you called. If it does, the first take becomes the round's
target and everyone else copies it in turn. If it doesn't, nobody takes a letter and
the turn simply passes on.

**Making your shot keeps you shooting.** Once everyone has answered, the melody goes
back to the *same* setter for another one — you only lose the ball by missing a
confirmation of your own. And before a first take is recorded, **any box on the board
can be clicked** to hand that player the turn: turn order picks a sensible default, but
four people around one screen rarely go in array order. The choice locks the moment a
melody is recorded and opens again when the round comes back round.

What gets compared is a **sequence of pitches** and nothing else:

- **Rhythm is discarded.** Play it faster or slower, in any time you like.
- **Silences don't count.** A rest can't split a note or fake a repeat.
- **Adjacent repeats collapse.** `C C G G A A G` is heard as `C G A G`.
- **Any key, any octave.** The comparison searches every transposition and keeps the
  best, so a bass and a piccolo can copy each other note for note. Leaps still have to
  be leaps — relative octave counts, absolute register doesn't.

That's what makes a singer and a trumpet player able to play each other. **One note at
a time, though** — the pitch detector is monophonic, so chords give it nothing to hold.

Press record and it *listens* rather than recording: the clock only starts on your
first note, so reaching back for your instrument costs you nothing. There's a live
level ring while it listens, a countdown over the last five seconds, and a second press
stops early. Press stop before playing anything and nothing is saved at all — the turn
is untouched, as though you never pressed it. Setters get 10 seconds; copiers get 30,
because rhythm doesn't count and nobody should fail for not matching someone else's
note density.

Lose a copy and a dialog shows **why**: your attempt drawn over the melody you were
copying, green where the notes matched and red where they didn't, with a missing or
extra note showing as a visible gap in one of the two lines. The score out of 100
underneath is honest rather than flattering — a near miss reads in the high eighties,
which is the number that makes switching to loose tolerance an informed decision.

The gear in the bottom-right has two tabs. **Players** is the roster: drag a row **by
its handle** to reorder it (top-to-bottom here is left-to-right on the board — or focus
a handle and use the arrow keys), rename anyone, edit a strike count directly, and
switch players in and out, down to a floor of two. **Game** sets the word — any 1–5 letters, not just MUSIC — and the tolerance,
**strict** or **loose**. Everything applies immediately, including a shortened word
that eliminates somebody on the spot. Settings lock while a melody is being copied,
since that round's terms are already set.

Everything persists but the audio: names, order, who's in, the scores, the word and the
tolerance all survive a reload.

Transcription is [pitchy](https://github.com/ianprime0509/pitchy)'s McLeod Pitch Method
over a captured buffer, and judging is a weighted Needleman–Wunsch alignment over a
transposition search. Every threshold is tunable in
[`config.ts`](src/games/music/config.ts). See
[`ARCHITECTURE.md`](src/games/music/ARCHITECTURE.md) for the decisions — including why
plateau detection uses a band around a fixed anchor rather than a derivative, why the
substitution ceiling has to stay under two indels, and why the tuning offset comes out
before rounding.

## Tools

### 🎛️ Loop Station

A loop pedal in the browser: play a phrase, and it repeats while you layer the next one
over it. Up to 20 tracks across 3 buses, mixed live.

The microphone is asked for on load and **never stops listening**. Everything you play
is written into a rolling buffer, so pressing record marks a moment in a recording that
was already happening rather than starting one. That is what makes alignment adjustable
after the fact — see *Timing* below.

**Starting the first loop, two ways.** Set the beats and bars first (they multiply:
4 beats × 4 bars = a 16-beat loop). Then the metronome decides which mode you're in:

- **Metronome on → quantized.** The tempo you set fixes the loop length. Record waits
  for the next bar line, counts you in for one bar, and starts. The count-in's first
  click is accented and the rest are not, so you always know where the bar begins.
- **Metronome off → free.** The first press starts, the second closes, and the length of
  what you played *becomes* the loop. Tempo is then derived from it, and the metronome
  becomes available in step with what you recorded.

Either way, **once a track exists the tempo, beats and bars lock**. Deleting every track
unlocks them.

**The multiplier records a fraction and tiles it.** At ×2 on a 4-bar loop you record 2
bars and they fill the whole track; at ×4, one bar fills four. The divisors offered
always divide the bar count evenly, so a partition can only ever land on a bar line.
Where in the loop you record it doesn't matter — it fills the track wherever it started.

**Overwrite is punch-in, not overdub.** Select a track and the record button becomes an
overwrite button: inside the punch, the original is replaced rather than mixed with. The
original is kept untouched underneath, so a punch can be re-recorded or deleted and the
track returns to what it was. One punch per track, and tracks built from a multiplier
can't be punched — they're a derived tiling with no single place to merge into.

Turning on **Auto-detect** makes the overwrite wait for your first note instead of
starting on the press, so the silence between the two doesn't erase anything. It keeps
listening across loops until you play or cancel.

#### Timing

Every recording keeps **one second either side** of your button presses. The track's
START slider slides that window ±1000 ms, so a phrase that landed late can be pulled
back into place *after* it was played, with no re-recording.

The gear in the bottom-right sets what new recordings inherit — delay, volume and reverb
— and holds **Calibrate**. Calibration plays a metronome, listens for you playing along,
and measures each hit against the click it belongs to. Averaging with the outliers
trimmed cancels out your own timing error and leaves the round-trip latency of your
hardware, which it then sets as the default delay. Wired earbuds are strongly advised:
Bluetooth adds 100–300 ms that also *drifts*, which is why the manual slider exists at
all rather than being a nice-to-have.

#### Mixing

| Level | Controls |
| --- | --- |
| **Track** | Volume, reverb send, mute, solo, timing, rename, drag to reorder, delete |
| **Bus** | Volume, reverb send, mute, rename. Each bus has a color that tags its tracks, and the selected bus is where new recordings land |
| **Master** | Volume to **150%**, reverb, mute, with a soft limiter on the output so the extra headroom reads as louder rather than distorted |

Reverb is one shared convolver fed by sends rather than a unit per track — per-track
reverb would smear each tail across the loop seam. Volume, mute and solo are gain
changes, so they never interrupt playback; timing and punch edits re-bake the track and
swap it in at the correct phase, which is why the loop keeps running through them.

#### Saving

**Save** writes the loop — every track, its audio, and the whole mix — to IndexedDB, and
it comes back automatically the next time you open the page, stopped and ready to play.
Leaving with unsaved changes warns you first. **Holding** the Save button turns it into a
Delete Saved button that fills over two seconds; let go early and nothing happens. Your
calibration and defaults are kept separately and survive the delete.

#### Keyboard

| Key | Action |
| --- | --- |
| `Space` / `Enter` | Record (or overwrite) / play-stop |
| `M` · `<` `>` · `R` | Metronome · multiplier left/right · multiplier ×1 |
| `0` · `1`–`3` | Mute master · mute bus |
| `←` `→` · `↑` `↓` | Select bus · select track |
| `Alt` `↑` `↓` · `Esc` | Reorder the selected track · deselect |
| `Delete` | Remove the selected track's punch, or the track itself |

Shortcuts stay out of the way while you're typing a name or a tempo, and never do
anything the buttons wouldn't allow.

#### Under the hood

Capture and playback share **one `AudioContext`**, so input and output run off the same
hardware clock and can't drift apart over a long session. Capture is an
[`AudioWorklet`](public/worklets/loop-capture.js) ring buffer; scheduling is a
lookahead scheduler clocked on `AudioContext.currentTime`, never `setTimeout`, which is
the difference between a loop that holds and one that wanders. Loop seams and tiled
repetitions are joined with equal-power crossfades using the captured padding, which is
what keeps a looper from ticking once per repeat.

The recording rules are a pure state machine and the DSP is pure functions, so both are
unit-tested in Node without a browser. See
[`ARCHITECTURE.md`](src/tools/loop-station/ARCHITECTURE.md) for the reasoning, and
[`config.ts`](src/tools/loop-station/config.ts) for every tunable — loop ceiling, crossfade
lengths, detection thresholds and the rest.
