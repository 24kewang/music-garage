# 🎯 Musical Wavelength

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

## Customizing the dial

Every geometry, color, motion, tick, glow and confetti parameter lives in one place —
[`config.ts`](config.ts). Components read from it instead of embedding literals, so the
look can be retuned without touching JSX.

Two knobs are worth knowing about, both in [`geometry.ts`](lib/geometry.ts)'s hands:

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

---

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for why the code is shaped the way it is.
