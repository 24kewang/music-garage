# 〰️ Pitch Math

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

## How the two notes are separated

`@/shared/audio`'s detector is monophonic, so this game brings its own [`dsp/`](dsp/): a
hand-rolled FFT, a grid of candidate notes scored by how much of their harmonic series is
present, then subtract the strongest and look again.

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
without a microphone.

---

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full reasoning and the measured
thresholds, and [`config.ts`](config.ts) for every tunable.
