# Loop Station — architecture

This file records the decisions that are **not** obvious from the code and expensive to
rediscover. For what every knob does see `config.ts`; for how the whole recording state
machine behaves, `lib/session.test.ts` is the executable spec.

## The tool, precisely

A loop pedal with a mixer bolted on. The mic is always listening; the record button
drops loops on top of each other against one master timeline; tracks hang off buses
with volume and a shared reverb; a settings panel calibrates away the latency between
what you hear and what the mic hears. No server, no accounts, no audio leaves the tab —
and nothing persists across a reload except the default delay setting. Recordings are
memory, deliberately: this is an instrument, not a DAW project file.

## Layers

```
config.ts        every tunable, one object — tests derive expectations from it
lib/transport.ts pure loop arithmetic (boundaries, phases, divisors, free-mode tempo)
lib/session.ts   pure reducer: (state, event, audioTime) → {state, effects}
dsp/             pure Float32Array work: tile/crossfade bake, onset, calibration, peaks
audio/           browser-only: AudioContext, worklet wrapper, node graph, metronome
lib/useLoopStation.ts  the one stateful hook: reducer ↔ engine plumbing
components/      render state; no musical decisions
LoopStation.tsx  wiring and the rAF paint loop
```

Everything above `audio/` runs under Node. The reducer returns *effects* — extract this
window, re-bake that track, start the transport — and the hook interprets them against
the engine, which is what lets every cancel/discard/graduation rule in the spec be a
unit test instead of a browser session.

## Decisions

### One AudioContext, and the audio clock is the only clock

Capture and playback share a single `AudioContext`, so input and output share the
hardware sample clock and cannot drift apart over minutes — the classic looper failure.
Every musical time is an `AudioContext.currentTime` value; boundary N is always
`anchorTime + N × loopLength`, computed fresh from the anchor, never accumulated.
`performance.now()` and `setTimeout` appear only as UI cadence (the 25ms scheduler tick
and the rAF paint loop), never as musical timing. The scheduler tick looks ~100ms ahead
and schedules against exact future timestamps — Chris Wilson's "A Tale of Two Clocks"
pattern.

### Presses are time marks, not recording boundaries

The worklet (`public/worklets/loop-capture.js`) writes the mic into a ring buffer
stamped with the audio clock's own frame counter. "Press record" and "press stop" just
mark times; extraction happens afterwards with **±1s of padding** around the marks.
That padding *is* the ±1000ms delay range — moving a delay slider re-bakes from the
same padded recording; nothing is ever re-recorded. It is also what feeds the seam
crossfades their genuine audio (the fade-out at a loop seam plays the recording's real
continuation, not a synthetic tail).

The worklet is deliberately dumb — it moves samples and posts block RMS. Onset
detection, offset math and windows all live in testable TypeScript on the main thread.
Communication is `postMessage`, not `SharedArrayBuffer`: SAB needs COOP/COEP headers,
and site-wide headers would break REG's cross-origin model fetches. One copy per
recording is nothing.

### Extraction happens twice per recording

The full padded window extends one second *past* the stop mark, which doesn't exist
yet when the segment completes. Waiting for it would keep a new track silent for a
second. So the hook extracts twice: a quick window (already written — the track is
audible within ~100ms) and the full ±pad window, which re-bakes seamlessly when it
lands and unlocks the delay slider's whole range. Both go through the same
`bakeTrack`; reads past a short buffer's end come back as silence by design.

### Every track plays one baked, loop-length buffer

`dsp/tile.ts` lays `reps` copies at their exact partition boundaries, equal-power
crossfades every seam **including the wrap-around**, and punches the overwrite in on
top (replace, not mix — the original is silenced inside the bounds but stored
untouched, which is why overwrite segments can be swapped and deleted freely). Because
`reps = 1` is just the one-seam case, ordinary tracks and repetition tracks share one
code path.

Re-bake triggers are the *bake inputs only*: track delay, overwrite delay, overwrite
add/remove, a replacing partition. Volume, mute, solo and reverb are `GainNode` ramps
(`setTargetAtTime`, ~15ms) and never touch the buffer.

### Swaps are phase-preserving, not boundary-queued

The architecture notes suggest a "do X at the next loop boundary" helper. This
implementation doesn't have one, on purpose: since every baked buffer is exactly one
loop long, the correct playback offset is computable at any instant, so a new source
starts ~50ms from now at the current phase with a ~15ms crossfade against the old one.
Phase is preserved by construction, and a delay drag responds now instead of up to a
whole loop later. If an audible artifact ever shows up at swap time, the boundary-queue
approach is the fallback — build it once in `engine.ts` and use it everywhere.

### The reducer is the spec, and the clock event replays late

All recording rules — quantized count-in snapped to the audible click grid, free-mode
tempo derivation, partition capture, in-progress replacement, graduation, the
cancel-everything edge case before the first quantized segment, overwrite bounds —
live in `reduce()`. The `clock` event (every scheduler tick) promotes every transition
whose *exact computed time* has passed, looping until stable, so a throttled background
tab that misses ticks still extracts sample-exact windows; only the reaction is late,
and the phase-preserving swap absorbs that. Idle ticks return the same state object so
React bails out of re-rendering 40×/s.

`TIME_EPSILON` (1µs, far under a sample) is load-bearing in two places, both because
boundary times reached along different arithmetic paths differ by an ulp. Transitions
due at the "same time" are **ordered** within that tolerance — a capture completing on
its graduation boundary must land *before* the graduation, or a re-recorded partition
would spawn a spurious track instead of replacing one. And a transition is **due**
within that tolerance too: exact comparison silently deferred a transition landing on
`now` by a whole scheduler tick.

### The count-in waits for the next accent, and needs no accent rule of its own

Pressing record snaps the count-in to the next *bar line* of the click grid, not the
next beat, so the count begins where the player hears the bar begin. Because the
count-in is exactly one bar, the loop anchor then also lands on a bar line and the
accent grid never shifts.

That is why the metronome has **no special case for the count-in**. Ordinary
`k % beatsPerBar === 0` accenting already puts an accent on the count-in's first click,
none on the rest, and resumes in step the instant recording starts. An earlier
`accented` flag that silenced the count-in was removed: it was suppressing exactly the
accent that was wanted.

**A grid change must take back what it has already booked.** `setGrid` resets
`scheduledUntil`, but the lookahead runs 100ms ahead, so at the count-in → recording
handover the first beat had already been booked under the old grid and was booked again
under the new one — a flam on the most important click in the interaction, with the
first copy unaccented. `Metronome` therefore remembers every source it schedules and
stops the unplayed ones whenever the grid changes or `clear()` is called.

### Auto-detect punches in at the note, not at the press

With auto-detect on, the overwrite button starts a `detecting` state rather than a
punch: the reducer waits for `overwriteDetected`, which the hook fires from the same
onset detector calibration uses. The punch then starts where the note was, so the
silence between pressing and playing never overwrites the original with nothing.

Three details are load-bearing. The start is **backed off** by
`config.autoDetect.onsetBackoffMs`, because a level threshold fires a block or two after
the attack — and clamped to the iteration's start, or the phase would wrap and punch at
the far end of the loop. `detecting` has **no due transition**, so it survives loop
boundaries and keeps listening until the player cancels. And the toggle is refused while
detecting or overdubbing, so the mode cannot change underneath a running gesture.

`CaptureBus.onLevel` became `addLevelListener` with a **reference-counted** detailed
mode, because calibration and auto-detect are now two consumers of the same stream and
whichever stopped last would otherwise switch the worklet's fine-grained level posting
off under the other.

The honest caveat: on speakers the loop's own output trips the detector. This wants
earbuds, like the rest of the tool — the UI hint says so.

### Saving is a snapshot plus its recordings

`snapshot.ts` (pure, tested) owns the shape and its `version`; `storage.ts` is thin
IndexedDB plumbing. IndexedDB rather than OPFS: it stores `ArrayBuffer`s through
structured clone with no file naming or sync-access-handle worker dance, and puts the
manifest and the audio under one transaction so a save is never half-written.

A snapshot is stored **resting** — stopped, unselected, nothing recording, in-progress
tracks graduated — because none of that is meaningful after a reload. `parseSnapshot`
returns `null` rather than throwing on anything it doesn't recognize, and merges over
`createSession()` so a field an older save omitted can't leave the reducer holding an
undefined it never checks.

**Sample rate is stored with the audio.** Every frame calculation downstream — padding,
tiling, punch bounds — uses the *current* context's rate, so a save made at 48kHz opened
at 44.1kHz would bake at the wrong length. Restore resamples once through
`dsp/resample.ts` and everything after it stays honest.

`loopSignature` is what makes the exit warning trustworthy: a pure string over exactly
what a save captures. A "something changed" boolean would collect false positives from
selection, notices, the metronome and drag state, and the station would read as unsaved
forever. A test pins that a save/restore round trip leaves the signature unchanged —
otherwise a freshly restored loop would immediately claim to be dirty.

`beforeunload` covers tab close and reload. It does **not** fire for a Next.js
client-side navigation, so nav clicks are intercepted in the capture phase and held
against the in-app confirm dialog. Known gap, not hidden: the **back button** after a
client-side navigation is not covered.

### Hold-to-delete paints its own progress

Holding the Save button past `deleteArmMs` turns it red and runs a two-second fill; a
shorter press is an ordinary save, which is why the arm delay exists at all — without it
every save would flash red on the way past.

**The fill is a rAF loop, not a CSS transition.** `globals.css` clamps every transition
and animation to `0.01ms !important` under `prefers-reduced-motion`, which would erase
the gesture's only feedback — and this bar is not decoration, it *is* the timer. Painting
`transform: scaleX(p)` per frame keeps it alive under reduced motion and keeps one clock
rather than two that can drift apart, since the same loop is what fires the delete.

Delete clears the IndexedDB save only. Calibration and the new-recording defaults live in
localStorage and survive deliberately: they're settings, not part of the loop, and
recalibrating latency is tedious. Afterwards `savedSignature` resets to `EMPTY_SIGNATURE`
so a station that still has tracks correctly reads as unsaved again.

The button stays enabled while a save exists even with no tracks, or clearing the station
would strand a save with no way to reach it. In that state a *click* is guarded to do
nothing — saving an empty station would write nothing over a real save.

**A real gap, not an oversight:** press-and-hold has no keyboard equivalent, so deleting
the save is pointer-only. It isn't solved with a second confirm dialog because the action
is recoverable — save again — but it is a hole.

### Shortcuts decline rather than force

`shortcuts.ts` maps a key to a session event, purely, so every "not possible right now"
rule is a unit test. Most of it falls out of the reducer already refusing impossible
events; where a key has no meaningful target at all — a bus that doesn't exist, nothing
left to delete — it returns `null` and the browser's own behavior is left alone.

The delete rule is the one with real logic: the selected track if there is one,
otherwise the bottom-most **unlocked** track, and its overwrite before the track itself.
An in-progress track is never a target, including via a stale selection.

The arrows carry one trap worth knowing. `selectTrack` **toggles**, so dispatching it
with the currently-selected id deselects instead of doing nothing — which is why ↑/↓
clamp at the ends of the list and return `null` whenever the computed target is already
selected. ←/→ cycle the *selected bus* and wrap (a rack of at most three); ↑/↓ walk the
selectable tracks and deliberately don't, because a vertical list that jumps from bottom
to top is disorienting.

**Alt+↑/↓ reordering is keyed off the selection, not focus.** It began life as a
`TrackRow` key handler, which latched onto whichever row was clicked first: arrowing the
selection never moves DOM focus, so the keys kept moving the old track. `resolveAltShortcut`
reads `selectedTrackId` instead, declines when nothing is selected, and respects the
in-progress floor exactly as dragging does. Alt is therefore the one modifier
`useShortcuts` lets through, and only for that pair. Escape defers to any open
`[role="dialog"]` so closing the settings panel doesn't also drop the selection, and the
form-field check leaves every slider's native arrow behavior intact.

Reorders from the keyboard route through `LoopStation`'s `moveTrack` rather than straight
to the reducer, so a keyboard move is announced to screen readers the same way a dragged
one is.

Guarding lives in `useShortcuts`: `event.repeat` for hold-to-repeat, a target check for
`input`/`textarea`/`select`/contenteditable — which is also what stops the Enter that
commits a rename from starting the loop, since the keydown's target is still the field —
and `preventDefault` on handled keys, which stops Space both scrolling the page and
firing twice when the record button holds focus.

### One convolver, fed by sends

Per-track reverb inserts would each smear their tail across the loop seam. One shared
`ConvolverNode` on a send/return bus sidesteps the seam problem and costs one
convolution regardless of track count. Track sends bypass the bus chain, so
`applyGains` zeroes a track's send when its bus is muted — otherwise a muted bus would
keep whispering through the reverb. The impulse response is generated (decaying noise),
because `public/` ships no audio assets and nothing is fetched from a CDN.

One non-obvious thing about tuning it. The IR envelope is
`exp(-irDecay · t · irSeconds)` with `t = i/length`, so the seconds cancel and
**RT60 = 6.9 / irDecay, independent of `irSeconds`**. `irDecay` is the length knob;
`irSeconds` only decides how much tail is stored before being truncated, so it has to
rise alongside a slower decay or the tail ends in a step. `maxReturnGain` is the
separate wetness knob. Reaching for `irSeconds` alone to get a longer reverb — the
obvious move — does nothing audible.

### A limiter on the way out, and the metronome shares it

The master fader boosts past unity (`mix.maxMasterVolume`) and the reverb return is
loud, so the sum can exceed full scale, where the browser hard-clips it into distortion
rather than loudness. A `DynamicsCompressorNode` set as a limiter sits between the
master fader and the destination; below full scale it does nothing.

The metronome still bypasses the master fader, mute and reverb — muting the master must
not silence a count-in — but it now routes **into the limiter** rather than straight to
the destination. The compressor adds a few ms of lookahead latency, and if the clicks
skipped a delay the loops go through, calibration would measure one path and compensate
the other. Sharing the output stage keeps the two honest, at the cost of the click
ducking slightly when the mix is hot.

The master meter taps **post**-limiter, so it reads what actually leaves the station;
a meter pinned at the top is the signal that the fader is being driven past what the
output can carry.

### Meters are peak-on-a-dB-scale; waveforms are normalized

Both started out linear and both were wrong for the same reason: signal amplitude is
small compared to full scale. The meters read *peak* (not RMS — RMS sits far below what
the ear calls loud) and map it through `meterFraction`, amplitude → dBFS → a fraction of
`config.ui.meterFloorDb`, so ordinary playing lands two-thirds up rather than a fifth.
The rAF loop smooths with a fast attack and slow release so transients register.

Waveform envelopes are normalized to their own loudest bar. That is not cosmetic:
a baked buffer routinely exceeds 1.0 where a crossfade sums correlated audio, and the
raw value drives a percentage height, so one spike used to push bars out through the top
of the row. The divisor is clamped to `config.ui.waveFloor` so a near-silent take stays
flat instead of having its noise floor amplified to full height.

### Rows expand on hover and *keyboard* focus, never on a click's focus

A row expands while hovered, selected, or focused — but `onFocus` pins it only when
`event.target.matches(":focus-visible")`. Without that test, clicking any control inside
a row left focus there, and the row stayed open long after the pointer had gone.
`:focus-visible` is precisely the "was this focus keyboard-driven?" question, so
tabbing still pins and clicking no longer does. `onPointerLeave` also blurs a contained
non-`:focus-visible` element as a backstop, and defers its collapse while a pointer
button is held so dragging a fader past the row's edge doesn't collapse it mid-drag.

### Bus hues label, they don't accent

`DESIGN.md` §10 forbids a second accent hue, and the station needs three colors to make
bus membership scannable. The compromise: `--color-bus-1/2/3` reach only the bus card's
name plus its edge chip and a track's bus badge/select. Row borders, outlines, selection
and waveforms all stay on the single indigo accent. Components never touch a color
value — `busColorStyle()` sets a `--bus-color` custom property and the CSS modules read
it, so the palette lives entirely in `tokens.css`. A bus's `colorIndex` is the smallest
unused slot, the same "smallest free" rule that names tracks, so deleting the middle bus
and adding another reuses the freed color instead of walking off the end of a
three-color palette.

### Track order is presentation, and in-progress tracks are a floor

Every track plays in parallel into its bus, so the array order drives nothing but the
render. `moveTrack` is therefore a pure array move that emits **no effects** — no
re-bake, no node changes.

`lockedFromIndex` is the one definition of what may move: the index of the first
in-progress track, or the list length when there is none. Tracks are always appended on
spawn, so an in-progress track and its successors form a locked tail. Nothing is dragged
from there, and nothing is dropped at or below it — the reducer clamps, and the drag
caps its target slot at the same bound so the floor is visible in the gesture rather
than only enforced on release.

### The drag measures once, mid-gesture, in list-content coordinates

`useTrackDrag` measures rows in a `useLayoutEffect` keyed on the drag *starting* — i.e.
after the commit in which `dragActive` collapses every row. That ordering is deliberate:
the row you grab is almost always the expanded one, and measuring before the collapse
would capture heights that vanish a frame later.

Coordinates are `offsetTop`/`offsetHeight` **inside the list**, never viewport rects,
because the list auto-scrolls during a drag and viewport measurements would go stale the
instant it did.

The split of work mirrors the paint loop: the dragged row's transform is written
straight to the DOM every frame, while only the *target slot* lives in React state, so a
drag costs a handful of renders instead of sixty a second. `reorder.ts` holds the
geometry — which slot the pointer is over, how far each sibling shifts — pure and tested,
because that is where the off-by-one bugs live.

Two subtleties worth keeping: on drop, the reorder and the transform reset land in the
same commit, so `data-dropping` suppresses transitions for one frame — without it every
row animates from its drag offset while the DOM order has already changed, and the list
visibly swims. And `preventDefault` is called only once a drag has genuinely started, so
until then a touch swipe still scrolls the list; touch additionally requires a
long-press to arm, which is what keeps scrolling and reordering from fighting over the
same gesture.

**The React compiler analyzes custom hooks inter-procedurally.** Reading a property off
the whole object `useTrackDrag` returns, inside the render loop, counts as touching the
refs inside it — so the caller destructures the return value, and `offsets` is a
precomputed array rather than a function the list calls during render. Both shapes are
load-bearing; reverting either brings back a `react-hooks/refs` build error.

### The paint loop writes to the DOM, not to React

Playhead, meters, the count-in number and the live overwrite region update at 60fps via
`[data-*]` hooks under a root ref. React renders on state changes (user events,
track set/graduate), which happen at human rate. The reducer's same-object bailout on
idle clock ticks is the other half of this bargain.

### Calibration is the delay setting's autopilot, nothing more

Clicks at a fixed internal tempo (ours to tune, not the player's), onsets matched to
the nearest click with a window skewed late (latency is positive; a quarter-beat of
anticipation stays negative), outliers dropped, trimmed mean over the rest. The result
lands in the same `defaultDelayMs` the slider edits, applied when calibration stops —
and closing the settings panel by *any* route stops it immediately, per spec. Positive
delay slides the content window later into the padded recording: what the player heard
on the beat plays on the beat.

## Shared code this tool uses

- `@/shared/hooks/useDismiss` — the settings panel's Escape/outside-click.
- `@/shared/icons` — manifest icon only (`waveform`); internal glyphs import
  `*Icon` names directly, as the shell components do.
- Design tokens throughout; two new ones (`--color-wave`, `--color-wave-muted`) were
  added for waveform bars, which are graphics and owe no contrast ratio.
- **Not** `@/shared/audio`'s `useMicrophone`: it closes its private `AudioContext` on
  stop and can't host a worklet or playback graph. The engine owns its own context —
  the same precedent as Pitch Math's `usePlayback`.
- **Not** `pitch-math/dsp`: games and tools may not import each other, and the looper
  needs equal-power crossfades, not `fadeEdges`' linear ramp.

## Tests

| File | Guards |
| --- | --- |
| `../registry.test.ts` | slug ↔ folder ↔ route contract for every tool |
| `lib/transport.test.ts` | boundary/phase/divisor/free-tempo arithmetic, float-drift immunity |
| `lib/reorder.test.ts` | which slot a drag is over across variable row heights, capping at the in-progress floor, sibling shift direction and range, gap derivation |
| `lib/shortcuts.test.ts` | every key mapping, multiplier and bus wrap-around at both ends, arrow track-stepping (clamped, locked tracks skipped, the selectTrack-toggle trap), and the delete rule — selection, bottom-most, stale selections ignored |
| `lib/snapshot.test.ts` | snapshot lands resting, JSON round-trip, junk/version/shape rejection, missing fields filled, and what `loopSignature` does and does not react to |
| `dsp/resample.test.ts` | duration held across a rate change, endpoints kept, ramp shape preserved |
| `lib/session.test.ts` | every recording rule in the spec: count-in bar-line snap and cancels, free mode incl. derived-tempo limits, replacement, graduation (incl. on stop), multiplier discards, overwrite lifecycle, locking, delete-all, take-name reuse, bus color slots, track/bus caps, reordering and its in-progress floor, new-recording defaults, auto-detect (backoff clamp, surviving a loop boundary, cancels, toggle lock), idle-tick bailout |
| `dsp/tile.test.ts` | tiling positions, seam and wrap crossfades, delay windows, silence past padding, punch-in replace semantics |
| `dsp/level.test.ts` | normalized envelopes never exceed 1, quiet takes lift, near-silence stays flat; the meter's dB curve is monotonic and clears the floor |
| `dsp/calibration.test.ts` | offset wrapping, RTL recovery under noise + outliers, onset edge/refractory behavior |

Tests derive expectations from `config.ts` rather than hardcoding values.

## What the tests cannot prove

Anything with a speaker or a microphone in it. Specifically: whether calibration lands
a musically-right delay on real hardware (Bluetooth latency *drifts*, which is why the
manual slider is not a nice-to-have), whether the 15ms seam crossfade is inaudible on
sustained material (`config.bake.seamFadeSeconds` is the knob), whether the meter's dB
floor reads true (`config.ui.meterFloorDb`), whether reverb at 100 is heavy or has
overshot and whether its tail washing across the loop seam is musical or muddy, whether
the limiter stays transparent at sane levels, how the vertical range inputs render
across browsers, and the whole touch layout. The Bluetooth warning fires on a device-label
heuristic (`/bluetooth|airpods|…/i`) and will miss devices with unhelpful labels — it is
a warning, not a gate, on purpose.

So is everything with a microphone or a database in it: whether auto-detect fires on
your first note rather than on loop bleed and whether the backoff keeps the attack
intact (`config.autoDetect` is the knob), whether a save/reload round trip actually
sounds identical, and whether the count-in's first click is accented with **no flam** at
the handover into recording. IndexedDB has no coverage at all — `storage.ts` is
deliberately decision-free so that everything worth pinning lives in `snapshot.ts`.

The drag gesture is entirely untestable here: whether the 5px threshold separates "click
to select" from "pick up", whether 400ms is the right touch hold, whether the sibling
shift reads as a slot opening, whether auto-scroll near the edges is controllable with
twenty tracks, and whether excluding *all* text still leaves a comfortable grab area on
a collapsed row (the waveform and padding are the target — if it feels cramped, drop
`data-no-drag` from the inert badges). Only the geometry underneath it is pinned.

`:focus-visible` behavior on a *clicked* `<input type="range">` is the one place the
row-collapse fix rests on browser judgment rather than a test. Every engine checked
treats a mouse click on a range as not-focus-visible, and the `onPointerLeave` blur
covers it if one ever disagrees.
