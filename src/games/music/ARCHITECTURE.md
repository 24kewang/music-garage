# MUSIC — architecture

HORSE, played on melodies. This file records the decisions that are **not** obvious
from the code. For how to play see the README; for what every knob does see
`config.ts`. The original algorithm spec is `MUSIC-design.md` at the repo root, and
where this build departs from it, the departures are listed below with reasons.

## The game, precisely

One player is the **setter**. They record two takes: the first is the melody they are
calling, the second has to match it. If it does, take one becomes the round's target
and everybody else copies it in turn; a failed copy earns a letter. Miss your own
called shot and you lose nothing but the turn — the melody passes to the next player,
exactly as in HORSE.

What is actually compared is a **sequence of distinct pitches** and nothing else.

- **Rhythm is discarded.** Note lengths never reach the scoring, and silences do not
  break the contour.
- **Adjacent repeats collapse.** `C C G G A A G` is `C G A G`. This is the spec's
  choice, not an accident of the detector: with rhythm gone there is nothing left
  that could tell a repeated note from a held one.
- **The comparison is key-agnostic.** An octave away scores identically to in tune,
  because the transposition search treats ±12 as just another candidate. Relative
  octave still counts — a leap has to be reproduced as a leap.

That reading is what makes a singer and a trumpet player able to play each other,
and it is the whole justification for the pipeline being as long as it is.

**One note at a time.** The detector is monophonic (McLeod Pitch Method, via
`@/shared/audio`), so a chord gives it nothing to hold on to. The game says so
rather than pretending otherwise.

## Layers

```
config.ts        Every tunable, one frozen object.

dsp/             Pure signal processing — no React, no DOM, no Web Audio.
  onset.ts       One-shot energy gate over (time, rms) blocks     (pure, tested)
  track.ts       Buffer → voiced frames of continuous MIDI        (pure, tested)
  contour.ts     Concatenate voiced frames, median filter         (pure, tested)
  segment.ts     Plateau detection, duration gate, glide removal  (pure, tested)
  sequence.ts    Tuning offset, quantize, collapse                (pure, tested)
  transcribe.ts  The pipeline, composed, plus debug artefacts     (pure, tested)
  trim.ts        Chunk assembly and pre-roll trimming             (pure, tested)
  fade.ts        Edge ramps for playback                          (pure, tested)
  synth.ts       The tests' instrument                            (pure)

score/
  align.ts       Weighted Needleman–Wunsch, cost and traceback    (pure, tested)
  compare.ts     Transposition search, normalization, score       (pure, tested)

lib/
  rules.ts       Phases, turn order, letters, elimination         (pure, tested)
  settings.ts    Validate / coerce / persist                      (pure, tested)
  graph.ts       Geometry for the failure graph                   (pure, tested)
  useGame.ts     Sequencing — the only stateful game logic        (browser)
  useRecorder.ts Take machine: arming, onset, countdown, handoff  (browser)
  useRowDrag.ts  Pointer gesture for the settings list            (browser)
  useToasts.ts   Notice queue                                     (browser)

audio/           Browser only: worklet lifecycle and playback.
components/      Presentational.
public/worklets/music-capture.js   Plain JS, loaded by URL. Moves samples, decides nothing.
```

The split is the one the rest of the repo uses and it earns its keep here more than
anywhere: **every decision this game makes is in a pure module with a test.** The
transcription, the scoring, the turn order and the graph geometry are all plain
functions over arrays. What is left in React is sequencing — a recording arrives, it
gets transcribed, it gets compared, the result goes to the rules.

## Decisions

### Capture is an AudioWorklet, not an analyser poll

Pitch Math captures by reading an `AnalyserNode` on a rAF loop, which works because it
needs exactly one window. MUSIC needs up to thirty seconds, and a rAF loop that drops
a frame under load tears a hole in the middle of the buffer. The worklet runs on the
audio thread and cannot.

It is deliberately **not** the Loop Station's worklet, and not a shared one. That one
keeps a ring buffer so presses can be treated as time marks and audio extracted from
the *past*; MUSIC only ever records forward from a press, so the ring would be
machinery with nothing to do. What is shared is the principle: the worklet moves
samples and nothing else, so where a take actually begins is decided in `dsp/trim.ts`
where it can be tested.

### The clock starts at the first note, and is enforced from the audio clock

Somebody reaching back to their instrument should not spend their ten seconds doing
it, so the window is measured from the energy onset. The armed state shows **no
digits at all** — a countdown that is not counting is a lie about how much time
somebody has, and the absence is what communicates "not started yet".

The cap is checked in the level handler, against `AudioContext.currentTime`. The
`setInterval` that draws the countdown is display only. A backgrounded tab throttles
timers to once a second or worse; the audio clock does not care, so losing focus
mid-take still stops at ten seconds.

The onset gate reports the **start** of the run that triggered it, not the block that
confirmed it, and the clip keeps 120 ms of pre-roll in front of that. Between them the
attack of the first note survives, which matters because the first note is a note.

### A press that hears nothing leaves no trace

No recording, no attempt, no letter, same player still up. This is what makes the
record button safe to press experimentally, and it is why the discard path is a
distinct outcome rather than an empty take handed to the pipeline to find no notes in.

### Segmentation uses a band around a fixed anchor, not a derivative

The spec asks for "regions where the derivative is near zero". That is the right
intent and the wrong implementation: half a semitone of vibrato at 5.5 Hz peaks around
**seventeen semitones per second**, so a frame-to-frame difference calls every
sustained note a glide. A least-squares slope over a window does not rescue it either
— the regression slope of a sine over one period is zero only at one particular phase.

What is actually stable about a held note is that it *stays put*. So a run extends
while the contour remains within `toleranceSemitones` of the pitch the run started at.
Both halves are load-bearing:

- **A band, not a derivative**, so vibrato inside the band is simply ignored. The band
  is 0.7 semitones — above the vibrato it must tolerate, below a semitone so it can
  never merge two neighbouring notes.
- **A fixed anchor, not a running one.** A running median drifts along with a slow
  portamento and swallows the whole slide into one "note". Anchored, a glide leaves
  the band after it has travelled 0.7 semitones however slowly it got there.

`findSegments` **requires an already-smoothed contour**. The anchor is taken from a
run's opening frames, and on a raw contour those can land anywhere in the vibrato
swing and push the band off to one side; the median filter is what centres it. This
is a real coupling between two stages and the tests assert it by smoothing first.

### The median filter is long, and that is safe because it is a median

The spec's 150–200 ms kernel looked wrong at first glance — longer than the shortest
note the pipeline is meant to keep. It is not, because a **median preserves step
edges** where a mean would round them off. It only erases a feature shorter than half
the kernel. 130 ms sits comfortably above one vibrato period and comfortably below
twice `minNoteMs`.

### Tuning offset comes out before rounding

Not in the spec, and a genuine correctness fix. A singer consistently forty cents flat
has every note sitting at x.60 of the semitone below. Rounded directly, some go up and
some go down depending on which side of x.50 the detector's noise happened to fall —
and the *intervals*, the only thing this game scores, come out wrong. The median
distance to the nearest semitone is subtracted first so the rounding is unanimous.

### Scoring happens in note space, with an explicit shift search

Interval space would be transposition-invariant for free, and is the wrong choice:
one wrong note corrupts the two intervals either side of it, one inserted note
corrupts two more, so every error is counted twice and the indels stop meaning
anything a player would recognise.

Two constraints hold the cost model up:

- **The substitution ceiling stays strictly below `2 × indel`.** At or above it the
  aligner discovers that any badly wrong note is cheaper as a deletion plus an
  insertion — interval weighting stops mattering, and one wrong note stops *reading*
  as one wrong note in the graph, becoming a hole in one line beside a spike in the
  other. There is a test that asserts this directly.
- **The traceback prefers the diagonal on ties**, for the same reason.

Shifts are tried in order of increasing size and only a strictly better cost wins, so
an ambiguous phrase reports the smallest shift that explains it rather than announcing
"up an octave" for something played in the same key.

Normalizing by `max(len(target), len(attempt))` keeps a short attempt from scoring
well against a long target. It does make long phrases marginally more forgiving per
note, which is a real consequence and a deliberate trade.

### Elimination is derived, never stored

A player is a contender when they are active and hold fewer letters than the word is
long. That single rule is what makes the settings edits fall out for free: shorten the
word and people drop out, lengthen it and they come back, because the letters are the
truth and being out is only a reading of them.

Two consequences worth knowing:

- **`settle()` runs at the tail of every transition**, so "everybody but one was
  knocked out halfway through a round" needs no branch of its own.
- **The setter is a round boundary, not a participant.** `nextCopier` stops when it
  reaches the setter *whether or not they are still a contender*. Deactivating the
  setter mid-round must not abandon a melody the remaining copiers still owe an
  answer to, and filtering them out first would do exactly that. It is also what stops
  a two-player round handing the melody back to the one copier twice.

Everything resolves **by id, not by index**, because reordering rows in the settings
panel must not change whose turn it is.

### The round is reconciled during render, not in an effect

`useGame` stores the round as the rules left it and derives the reconciled version on
read. Doing it in an effect would leave a render in which the board is drawn from a
round the roster has already invalidated. The two takes are tagged with the setter
they belong to for the same reason: a half-finished melody has to disappear the
instant the round rotates away from its owner, and a tag checked on read does that
without an effect racing the render.

### The graph's x axis follows the alignment, not the target

Every alignment step gets identical width — evenly spaced, as asked — which means an
inserted note occupies real width instead of being wedged into a boundary. The payoff
is that **a missed note leaves a gap in the attempt's line and an extra one leaves a
gap in the target's**, so both kinds of error are legible with the colours ignored
entirely. Colour is the echo, not the message.

The y range comes from the **target alone**, with the attempt clamped into it. Fitting
the range to both would let one note sung two octaves out squash the real phrase into
a flat sliver; clamping pins it to the edge instead, which reads correctly.

No axes, no gridlines, no pitch labels — and that is honesty as much as restraint. The
attempt is drawn at whatever transposition scored best, so an absolute pitch scale
alongside it would be actively misleading.

### The transcription is not shown during play

`MUSIC-design.md` leaves this open. Showing the setter what the game heard would help
them re-record a bad transcription — but everyone is looking at the same screen, so it
is a crib sheet for the copiers. The failure dialog reveals the comparison only after
a round resolves, which explains an outcome without giving one away.

## Shared code this game uses

- `@/shared/audio` — `createPitchDetector`, `detectPitch`, `frequencyToMidi`,
  `midiToFrequency`. Being DOM-free is what makes the whole pipeline Node-testable.
- `@/shared/lib/reorder` — moved here from the Loop Station as part of this change,
  since two features now reorder lists the same way.
- `@/shared/hooks/useDismiss` — both dialogs and the settings panel.
- `@/shared/components/Confetti` — the win.
- `@/shared/icons` — `basketball`, added for the manifest.

**Not `usePitchDetector`.** It is a live rAF loop over an analyser; this game analyses
a stored buffer after the fact and needs the frame-by-frame contour, not a smoothed
current reading.

**Not `useMicrophone`.** It builds an `AnalyserNode`, which is not what the worklet
needs, and the recorder wants the stream and the context under its own control so it
can hold them across a whole game.

**Not the Loop Station's `useTrackDrag`.** Most of its size is edge auto-scrolling and
long-press-versus-scroll arbitration over a long scrolling list. Four rows in a fixed
panel need neither.

## Tests

| File | Guards |
|---|---|
| `dsp/onset.test.ts` | fires on a sustained rise, not a single loud block; reports the run's start; fires at most once; respects the grace period |
| `dsp/track.test.ts` | a steady tone reads as its note; silence is unvoiced; frame times are hop-accurate and centred; 44.1 kHz agrees with 48 kHz; vibrato is tracked, not lost |
| `dsp/contour.test.ts` | unvoiced frames dropped and the contour closed over a rest; a one-frame octave spike removed; a spike on the very first frame still outvoted; step edges survive |
| `dsp/segment.test.ts` | a vibrato'd note is one segment; a slow glide is not a note; one bad frame does not split a run; runs under the minimum dropped; neighbours a semitone apart stay separate; oscillating figures preserved; glide removal keeps short *real* notes and chromatic runs |
| `dsp/sequence.test.ts` | tuning offset found and not dragged off by an outlier; a consistently flat performance keeps its intervals; adjacent duplicates collapse and `C D C D` does not |
| `dsp/transcribe.test.ts` | end to end on synthesized phrases — clean, transposed, vibrato'd, portamento-joined, noisy, flat, silent, and at both sample rates |
| `dsp/trim.test.ts` | chunk assembly; pre-roll trimming; pre-roll longer than the head; onset before the capture began or past the end; the fade's ramps do not overlap on a short clip |
| `score/align.test.ts` | the ceiling stays under an indel pair; **a large substitution is not decomposed**; ties prefer the diagonal; one sub / one del / one ins each cost what they should; empty inputs; and a property check over 200 random pairs that every index appears exactly once and the path sums to the cost |
| `score/compare.test.ts` | key-agnosticism with the shift's **sign pinned**; octave equivalence; smallest shift on an ambiguous phrase; `max` normalization; padding is not rewarded; the strict and loose thresholds land where documented |
| `lib/rules.test.ts` | every edge case above — two-player rounds, a setter deactivated mid-copying, a player eliminated by their own letter, a shortened word ending the game, a lengthened word reopening it, reordering not changing whose turn it is, and nobody left standing |
| `lib/settings.test.ts` | per-field coercion — duplicate ids reassigned, strikes clamped, blank names filled, an empty word refused, and one bad entry costing only itself |
| `lib/graph.test.ts` | even spacing; higher pitches drawn higher; gaps where notes were missed or added; a unison phrase not dividing by zero; a narrow phrase not blown up to fill the panel; an out-of-range attempt clamped rather than NaN, without rescaling the target |

## What the tests cannot prove

Vitest runs in Node with no DOM and no audio hardware, so none of the following is
covered and all of it needs a person:

- Whether the onset gate fires on a real instrument in a real room **without** firing
  on the room itself. `config.record.onsetRms` is the first knob to reach for.
- Whether a melody someone actually sings transcribes to the notes they meant. The
  values in `config.transcribe` are starting points; expect a tuning pass.
- Whether the copy threshold feels fair in play. The failure dialog's score out of 100
  is the instrument for judging that — it is deliberately honest rather than
  flattering, so a near miss reads in the high eighties.
- That the worklet's chunks join without an audible seam.
- Drag-to-reorder under touch, and the header's coarse-pointer fallback on this page.
- That the countdown and the armed state read clearly under `prefers-reduced-motion`.
