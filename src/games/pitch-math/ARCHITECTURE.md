# Pitch Math — architecture

Two players sound a note at the same time and race to name the interval. This file
records the decisions that are **not** obvious from the code. For how to play see the
README; for what every knob does see `config.ts`.

## The game, precisely

Both players play together into one microphone. Whoever names the interval out loud
first presses a button; a wrong press hands the turn to the other. **The app keeps no
score and tracks no turn order** — the players do that themselves, out loud.

That reading is what keeps the build small. There are no players, no rounds, no
persistence beyond settings, and no networking. Everything hard is in the audio.

## Layers

```
config.ts        Every tunable, one object.
dsp/             Pure signal processing — no React, no DOM, no Web Audio.
  fft.ts         Iterative radix-2 FFT, hand-rolled
  spectrum.ts    Hann window, magnitude spectrum, peak helpers
  noteGrid.ts    Candidate notes and their harmonic bin tables
  multiPitch.ts  The detector
  synth.ts       Synthesized tones — the tests' instrument
lib/             Pure game logic, plus the round machine
  intervals.ts   Catalog, folding, absolute/relative judging
  spelling.ts    Transposition and accidental choice
  settings.ts    Validate / coerce / persist
  useRound.ts    Phase machine — the only stateful piece
audio/useCapture Onset detection and the capture window
components/      Presentational
```

`dsp/` and most of `lib/` are pure on purpose: the parts with real invariants are the
parts that must be testable in Node without a microphone.

## Decisions

### Capture uses an AnalyserNode, not an AudioWorklet

`AnalyserNode.getFloatTimeDomainData` always returns the most recent `fftSize` samples.
So: wait for an onset, wait one more analyser-length, then read **once** — the buffer is
now entirely post-onset. No ring buffer, no worklet module to load, and **`useMicrophone`
needed no changes at all**, which is why the shared audio module is untouched by this
game.

The window is `fftSize / sampleRate` — 0.68 s at 48 kHz. That is more than enough
resolution for the detector (a 1.5 Hz bin against the ~8 Hz gap between the lowest
semitones) and a short note to hold.

### The replay clip is stitched from successive windows

The same property that makes the capture work also makes a longer clip free: a read one
window later returns exactly the samples from the end of the previous one, so successive
reads are **contiguous, with no gap and no overlap**. `playbackWindows: 2` collects two
and joins them into ~1.4 s.

Only the **first** window is analyzed, and it is handed over the moment it is ready — so
the board appears with no added delay while the tail is collected behind it.

`onCaptured` returns a boolean for this reason: `false` abandons the tail immediately.
Without it, a capture that heard nothing would make the retry wait out a window nobody
will ever listen to.

**Two shutdown races, both from the microphone being released mid-tail.** `guess()` stops
the capture loop *before* `mic.stop()`, since a fast correct answer can land while the
tail is still collecting; and the rAF tick bails on a closed `analyser.context`, because
the Stop button can close it from outside the loop.

### Playback owns its own AudioContext

It cannot borrow the microphone's: `useMicrophone`'s teardown closes that context, and
the round deliberately releases the microphone the instant someone answers correctly —
exactly when the players most want to hear the clip again. The samples are a plain array
in memory and outlive it without trouble. The playback context is created on the first
press, which is a click, so autoplay rules are satisfied.

Two details that look fussy and aren't:

- **`onended` checks the source is still the current one.** A press during playback stops
  the old source and starts a new one; the old source's `ended` event would otherwise
  switch the new one off the moment it began.
- **The clip is faded ~8 ms at each edge** (`dsp/fade.ts`, unit-tested). The capture
  starts and ends mid-note, so both edges are step discontinuities that click audibly.
  The fade runs on a copy — it is destructive, and the recording has to survive being
  replayed repeatedly.

### Only real notes are ever scored

`noteGrid.ts` precomputes every candidate MIDI note's harmonic positions, and the
detector scores *those* — never arbitrary spectral peaks. The answer is snapped to a
note by construction, and a noisy overtone can't be reported as a pitch.

Harmonic tolerance is specified in **cents, not bins**. Tuning error is proportional: a
note twenty cents flat puts its 8th harmonic eight times further from the predicted bin
than its 1st. A fixed bin tolerance would be far too tight up high and useless down low.
Without this the detector would only work on perfectly tuned input, which nobody plays.

### The cancellation ceiling is what makes a perfect 5th work

Pick the strongest candidate, subtract its harmonic series, pick the strongest of what
remains. The subtraction is the dangerous step: for a perfect 5th, the lower note's 3rd
harmonic sits exactly on the upper note's 2nd. Subtract that bin freely and the upper
note's evidence goes with it — **every 5th collapses into a unison**.

`cancellationCeiling` caps how much of any bin the subtraction may remove. P4, P5 and the
octave have dedicated tests because they are where this breaks.

### Octave detection normalizes timbre away

A note and its octave cannot be separated by subtraction — the upper note owns no bin of
its own. All it leaves is a signature: it reinforces the lower note's **even** harmonics
and not its odd ones.

The obvious measure, a plain even-to-odd energy ratio, **does not work**, and this was
measured rather than assumed. Across timbres it also tracks brightness: a bright lone
note reaches 0.74 while a quiet octave sits at 0.66 — overlapping ranges, so no threshold
on that ratio can separate one note from two.

`octaveEvidence` fits the note's own harmonic decay (`≈1/hʳ`) to the **odd** harmonics
only — which an octave above cannot touch — and compares the even harmonics against that
prediction. Timbre cancels out. Measured again afterwards: a lone note lands at 0.95–1.04
whatever its brightness, an octave at 1.59–5.79. The threshold sits at 1.25, and
`multiPitch.test.ts` pins that margin so it can't silently narrow.

**Known limitation:** an octave whose upper note is much quieter *and* on a bright
instrument can fall to ~0.99 and read as a unison. Lowering the threshold would catch
those at the cost of calling lone notes octaves — the worse error, since it invents a
note nobody played.

### Compound intervals fold inward

`0 → 0`, otherwise `((s-1) % 12) + 1`. A 12th answers as a perfect 5th, two octaves as an
octave. Note the shape: a plain `% 12` would turn two octaves into a *unison*, which is
the wrong button. Without folding, two players on distant instruments could produce a
round with no answer on the board.

### Relative mode is derived, not tabulated

Absolute accepts the distance from the lower note. Relative also accepts `12 - folded`,
the inversion. That produces exactly two answers for every interval **except the
tritone**, which inverts to itself — as a property of the rule rather than a
hand-maintained table that could drift from the catalog.

### The answer never reaches the DOM before it's won

`useRound` deliberately does not expose the detected interval. Only `eliminated` and
`solved` leave the hook, and `revealMidis` is empty until the round is over. Passing the
truth into `IntervalGrid` would make it readable in devtools while the players are still
guessing.

### Transposition is presentation only

Written pitch = sounding + offset (C 0, B♭ +2, E♭ +9, F +7). It changes names, never the
interval — so it can never change which button is correct. `spelling.test.ts` asserts
that directly. Flats for transposing instruments, sharps for C: a trumpeter expects "B♭",
not "A♯".

### Failure retries silently, with three ways to notice

A failed capture drops straight back to listening rather than stopping. That risks a
quiet player staring at an animation forever, so: the wave's height tracks the **live
input level**, a caption says what went wrong, and there's a **Stop** button. The caption
is `aria-live="polite"`, never `role="alert"` — the loop can run repeatedly and an alert
each pass would nag.

### Status is never carried by color alone

A wrong button is dimmed **and struck through** and marked `aria-disabled`; the winner is
lit **and ticked**. Color-only status is the most common accessibility failure in a UI
like this and would leave a color-blind player unable to see which answers they had
already burned. Eliminated buttons stay focusable rather than `disabled`, so a keyboard
user can still read them.

## Shared code this game uses

- `@/shared/audio` — `useMicrophone` (unchanged), and the note-theory conversions.
- `@/shared/components/Confetti` — promoted here from Musical Wavelength, now taking its
  tuning as a prop plus an optional element origin, since this game bursts at the winning
  button rather than the screen center.
- `@/shared/hooks/useDismiss` — Escape/outside-click, previously written out in both
  popovers.

**Not** `pitchy` / `usePitchDetector`: they are monophonic McLeod Pitch Method on a live
loop. This game needs one-shot two-pitch estimation over a fixed buffer.

## Tests

`npm test` — no microphone, no DOM.

| File | Guards |
| --- | --- |
| `fft.test.ts` | Agreement with a naive DFT, Parseval, bin placement |
| `fade.test.ts` | Ramp shape, untouched interior, clips too short for two ramps |
| `multiPitch.test.ts` | Every interval, both hard cases, detuning, noise, timbre, quiet second player |
| `intervals.test.ts` | Folding, and the exactly-two-answers property |
| `spelling.test.ts` | All four transpositions; that transposition never moves the interval |
| `settings.test.ts` | Per-field coercion |

`synth.ts` is the instrument: additive harmonic tones with configurable brightness,
detuning and amplitude, plus seeded noise so a failure is reproducible.

**What the tests cannot prove** is behavior on real instruments in a real room, or
anything audible: that the stitched windows join without a seam, or that the edge fades
actually kill the click. The maths is pinned; `onsetRmsThreshold`,
`secondNoteSalienceRatio` and `octaveEvidenceThreshold` are the knobs to turn if
detection misbehaves in practice, and `playbackWindows` and `fadeMs` if the replay does.
