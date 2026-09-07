# 🎛️ Loop Station

A loop pedal in the browser: play a phrase, and it repeats while you layer the next one
over it. Up to 20 tracks across 3 buses, mixed live.

The microphone is asked for on load and **never stops listening**. Everything you play
is written into a rolling buffer, so pressing record marks a moment in a recording that
was already happening instead of starting one. Alignment is therefore adjustable after
the fact. See *Timing* below.

## Starting the first loop, two ways

Set the beats and bars first (they multiply: 4 beats × 4 bars = a 16-beat loop). Then the
metronome decides which mode you're in:

- **Metronome on: quantized.** The tempo you set fixes the loop length. Record waits for
  the next bar line, counts you in for one bar, and starts. The count-in's first click is
  accented and the rest are not, so you always know where the bar begins.
- **Metronome off: free.** The first press starts, the second closes, and the length of
  what you played becomes the loop. Tempo is derived from it, and the metronome becomes
  available in step with what you recorded.

Either way, **once a track exists the tempo, beats and bars lock**. Deleting every track
unlocks them.

**The multiplier records a fraction and tiles it.** At ×2 on a 4-bar loop you record 2
bars and they fill the whole track; at ×4, one bar fills four. The divisors offered
always divide the bar count evenly, so a partition can only ever land on a bar line.
Where in the loop you record does not matter; it fills the track wherever it started.

**Overwrite is punch-in, not overdub.** Select a track and the record button becomes an
overwrite button: inside the punch, the original is replaced instead of mixed with. The
original is kept untouched underneath, so a punch can be re-recorded or deleted and the
track returns to what it was. One punch per track. Tracks built from a multiplier cannot
be punched, since a derived tiling has no single place to merge into.

Turning on **Auto-detect** makes the overwrite wait for your first note instead of
starting on the press, so the silence between the two doesn't erase anything. It keeps
listening across loops until you play or cancel.

## Timing

Every recording keeps **one second either side** of your button presses. The track's
START slider slides that window ±1000 ms, so a phrase that landed late can be pulled
back into place *after* it was played, with no re-recording.

The gear in the bottom-right sets what new recordings inherit (delay, volume and reverb)
and holds **Calibrate**. Calibration plays a metronome, listens for you playing along,
and measures each hit against the click it belongs to. Averaging with the outliers
trimmed cancels out your own timing error and leaves the round-trip latency of your
hardware, which it then sets as the default delay. Wired earbuds are strongly advised.
Bluetooth adds 100–300 ms that also drifts, and the manual slider is there to correct
it.

## Mixing

| Level | Controls |
| --- | --- |
| **Track** | Volume, reverb send, mute, solo, timing, rename, drag to reorder, delete |
| **Bus** | Volume, reverb send, mute, rename. Each bus has a color that tags its tracks, and the selected bus is where new recordings land |
| **Master** | Volume to **150%**, reverb, mute, with a soft limiter on the output so the extra headroom reads as louder rather than distorted |

Reverb is one shared convolver fed by sends instead of a unit per track, because
per-track reverb smears each tail across the loop seam. Volume, mute and solo are gain
changes, so they never interrupt playback. Timing and punch edits re-bake the track and
swap it in at the correct phase, so the loop keeps running through them.

## Saving

**Save** writes the loop to IndexedDB, including every track, its audio, and the whole
mix. It comes back automatically the next time you open the page, stopped and ready to
play. Leaving with unsaved changes warns you first. **Holding** the Save button turns it
into a Delete Saved button that fills over two seconds; let go early and nothing happens.
Your calibration and defaults are kept separately and survive the delete.

## Keyboard

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

## Under the hood

Capture and playback share **one `AudioContext`**, so input and output run off the same
hardware clock and cannot drift apart over a long session. Capture is an
[`AudioWorklet`](../../../public/worklets/loop-capture.js) ring buffer. Scheduling uses a
lookahead scheduler clocked on `AudioContext.currentTime` and never `setTimeout`; a
`setTimeout`-driven loop wanders audibly within a minute. Loop seams and tiled
repetitions are joined with equal-power crossfades using the captured padding, which
removes the click a looper otherwise makes once per repeat.

The recording rules are a pure state machine and the DSP is pure functions, so both are
unit-tested in Node without a browser.

---

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the reasoning, and [`config.ts`](config.ts)
for every tunable: loop ceiling, crossfade lengths, detection thresholds and the rest.
