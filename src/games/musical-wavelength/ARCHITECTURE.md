# Musical Wavelength — architecture

Wavelength with a musical twist, for two players around one screen. This file records
the decisions that are **not** obvious from the code and expensive to rediscover. For
how to play, see [`README.md`](README.md); for what every knob does, see `config.ts`.

## The game, precisely

One player spins the wheel and opens the cover to see where the scoring target landed.
They give a **verbal** clue — spoken out loud, not typed into anything. The other
player never sees the target and answers **by ear**: playing a note, singing, or
dragging the needle by hand. Then the cover comes open and the score is read off.

That reading matters because it decides what the software is responsible for. There is
no clue input, no turn state, no player identity, no networking. The app is an
*instrument the two of them share*, not a referee.

## Layers

```
config.ts        Every tunable, one object. Components never embed literals.
lib/             Pure logic — no React, no DOM (except one bounding rect). Unit-tested.
  geometry.ts    Angle convention, coordinate conversion, generated band wedges, paths
  scoring.ts     Needle + wheel angle -> Landing | null
  modes.ts       Audio -> needle angle, and the matching tick scale
  settings.ts    Validation, coercion, persistence
  useDial.ts     The only stateful piece: phases, drags, cover animation
components/      SVG parts. Presentational; all behavior arrives as props.
Game.tsx         Wires mic -> mode -> needle, and owns the settings.
```

`lib/` is pure on purpose — it is the part with real invariants, and it is testable in
Node without a DOM.

## Decisions

### Generate the geometry; never copy it

The original design ships hand-written SVG path strings. We regenerate them from
`config.bands` instead, because **the drawn wedges and the scoring maths must describe
the same shape**. If a wedge were drawn from a literal path and scored from an angle
comparison, the two could drift and the game would lie about the score.

So `buildWedges()` produces both, and `geometry.test.ts` pins the generated coordinates
to the design's original values — fidelity is enforced, not trusted.

`targetHalfWidthDeg` is the single knob that resizes the whole scoring zone. Each
band's `edgeFraction` is its outer edge as a share of that total, so proportions hold
and the drawn shape and the score move together.

### The cover and the window are the same path

`windowPath()` draws both the opening in the housing and the outline of the cover that
closes over it. Identical shapes cannot leave a gap — and a gap would show a sliver of
the wheel through a closed cover and **leak the target**. This is a correctness
property, not a cosmetic one.

`geometry.test.ts` checks this at the *source* level (both components must contain
`windowPath()`), because comparing `windowPath()` to itself would prove nothing.

### Angle convention: 0° is up, positive is clockwise

`polar()` / `angleAt()` use `atan2(x, -y)`. This matches SVG's `rotate()`, so generated
geometry and CSS/SVG transforms agree without a conversion step anywhere. Every angle
in this game is in this convention.

### `scaleMaxDeg` (86.5°) sits inside `needleMaxDeg` (88°)

The window is a plain semicircle, so anything below its straight edge is clipped. The
outermost tick label is the one at risk: it sits close to that edge and is rotated to
run nearly vertically, so **its own length** is what carries it across.

Moving labels radially inward makes this *worse*, not better — at r=200 the overflow is
+10.3 units, at r=300 it is +6.9. Pulling the angular span in is the only fix. Hence a
scale that stops short of the needle's full travel.

**86.5° is a deliberate choice, not an accident.** At that value two-character labels
(`C4`) clear the edge by 2.8 units and three-character ones (`C#4`) overhang by 2.9 —
accepted, because accidentals only land at the extremes on some ranges and the overhang
is a fraction of a glyph. `modes.test.ts` guards both halves of that: the two-character
case must clear outright, and the three-character overhang has a ceiling.

### Two mirrored band groups

`bandGroupsDeg: [0, 180]`. The wheel spins freely, so with one group an arbitrary angle
could leave no target under the needle at all. `scoreAt()` therefore tests **both**
groups and reports which one was hit, since the reveal glow needs to know where to aim.

### The phase machine lives in `useDial`

`setup` → `guess` → `reveal` → `setup`.

- The wheel is live in `setup` and `reveal`, locked in `guess`. Touching it after a
  reveal starts the next round.
- **Peeking is safe.** Dragging the cover only ends the round if the release commits
  past `coverOpenThresholdDeg`. Let go before that and it springs shut with nothing
  changed — otherwise a nervous player would score themselves by accident.
- Tick scales are drawn **only** in `guess`. The cover is bare while the target is
  being placed and after the reveal.

### The cover's angle is a ref, not just state

`coverValueRef` is authoritative and `setCover()` writes both it and the state.

This is not premature optimization. Scheduling `requestAnimationFrame` from inside a
state updater would run **twice** under StrictMode's double-invoked updaters, producing
two competing loops and a cover that eases at double speed. The drag and the animation
loop also both need to read the current angle synchronously.

### Audio → needle crosses a boundary the linter can't see

`useDial` syncs `audioNeedleDeg` into state from an effect, with an explicit
`react-hooks/set-state-in-effect` disable. This is the case the rule documents as
legitimate — syncing an external system (the microphone) — and the linter has no way to
tell. **Keep the comment with the disable**; without it the next reader will "fix" it.

The needle is grabbable by pointer only in `manual` mode; in the audio modes it belongs
to the microphone, and the hub button becomes a lock that freezes it in place.

### Settings degrade field by field

`coerceSettings()` validates each field independently and falls back per field rather
than discarding the whole object. Stored settings that have drifted shouldn't cost the
player the fields that are still fine. Defaults are always playable, so exiting the
popup any way at all leaves a working game.

`MIN_SPAN_CENTS` is 10 because the scale is labeled every `ticks.labelStepCents` (10)
cents — a narrower span would draw a scale with no labels on it. **These two are
coupled; change one and check the other.**

Settings start at `DEFAULT_SETTINGS` on first render and adopt stored values in an
effect, so the server and first client render agree.

### The microphone is released when the mode doesn't need it

Otherwise the browser's recording indicator stays lit through manual play, which reads
as the page listening when it isn't.

## The apparatus is off-limits to theme work

`Wheel`, `Cover`, `Housing`, `Needle`, `CenterButton`, `DialDefs`, `TickScale` and the
`palette` / `geometry` / `confetti` sections of `config.ts` are the imported design.
They are **not** restyled by site-wide theming — the dial keeps its own cream-and-teal
palette against the dark site.

The dark theme is why `game.module.css` puts the dial on a `.stage` cabinet panel: the
housing is `#141733`, close enough to the page background that the console silhouette
would otherwise dissolve. The panel is the thing that makes an untouched instrument
still read as an object.

If you need to verify the apparatus is unchanged after a visual pass, diff the rendered
dial SVG before and after — byte-identical is the bar.

## Tests worth knowing about

| File | Guards |
| --- | --- |
| `geometry.test.ts` | Design fidelity of generated paths; cover/window identity |
| `scoring.test.ts` | Band boundaries, both mirrored groups, misses |
| `modes.test.ts` | Needle↔tick agreement, label clearance, tick thinning |
| `settings.test.ts` | Validation and per-field coercion |

Tests derive their expectations from `config` rather than hardcoding angles. Retuning
`targetHalfWidthDeg` should not break the suite; breaking an *invariant* should.
