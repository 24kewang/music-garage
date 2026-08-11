# Random Excerpt Generator — architecture

This records the decisions that are **not** obvious from the code. Read it before
changing the game.

## The game, precisely

A face filter. The player's excerpt images (uploaded once, kept in OPFS) float in a
box above their head in the webcam feed, tracked in 3D. SPIN cycles the *checked*
images slot-machine style — fast, then slower — and lands on a random one, captioned
with a name derived from its file path. A settings gear opens two tabs: **Files** (a
searchable checkbox tree with select-all, add-more and delete-everything) and
**Filter** (sliders for where the box sits above the head, and how big it is).

Two screens only: **upload** (library empty) and **filter** (library has images).
Which one shows follows from a single async fact — what `listImagePaths()` finds.

## Layers

```
Game.tsx              orchestration: OPFS scan → screen; selection state; spin lock
config.ts             every tunable — spin feel, box placement, caption budget
game.module.css       only the loading/unsupported placeholders
components/
  UploadScreen        file picker + folder picker + drag-drop, busy/skipped notices
  FilterScreen        camera lifecycle, SPIN button, intro→spinning→result FSM
  SettingsPanel       gear + panel: the Files/Filter tabs, and collapse state
  FileTree            recursive checkbox tree; derived folder state; filtered rows
  FilterTuning        the Filter tab: x/y/z + size sliders, caption toggle, reset
  ExcerptOverlay      the enlarged still of the landed excerpt
lib/
  paths.ts            normalise / split / extension allowlist          (pure, tested)
  tree.ts             build, cascade, derived check state, search      (pure, tested)
  names.ts            path → caption, budgeted truncation              (pure, tested)
  spin.ts             the whole spin as a data plan                    (pure, tested)
  selection.ts        excluded-set persistence in localStorage        (pure, tested)
  settings.ts         placement persistence, per-field coercion       (pure, tested)
  opfs.ts             byte moving only: list / write / read / wipe    (browser)
  upload.ts           three upload gestures → { path, file } pairs    (browser)
  textures.ts         blob → ImageBitmap → CanvasTexture; the pool    (browser)
  mindarScene.ts      everything three.js/MindAR; the verbs for React (browser)
  mind-ar.d.ts        shim for the untyped mind-ar module
```

The rule the split serves: **decisions are pure and Node-testable; the browser
modules only move bytes and pixels.** Vitest here runs in the `node` environment —
nothing touching camera, WebGL or OPFS can be tested, so nothing decision-shaped is
allowed to live there.

## Decisions

### MindAR owns the render loop, the camera, and all smoothing

`mindarScene.ts` never re-implements what the engine provides: anchored objects get
head position, rotation and scale for free (face width = 1 unit), the anchor hides
itself when no face is tracked, and one-euro filtering is built in (knobs exposed as
`config.scene.filter`). Hand-rolled matrix smoothing is how these filters end up
jittering — don't add any. Anchor 10 is the forehead ("hat") anchor.

### The spin is planned up front, off the render loop

`buildSpinPlan` returns the entire animation as data — target chosen first, then
swap steps whose gaps stretch along an ease-out — and `FilterScreen` walks it with
timeouts. The render loop just keeps drawing whatever texture is current. Coupling
the cadence to the frame rate would tie spin feel to camera FPS; planning it as pure
data is also what makes "always lands on the target, never repeats a frame,
decelerates monotonically" provable in Node with a seeded `random`.

### `imageOrientation: "flipY"` is why images aren't upside-down

three sets `UNPACK_FLIP_Y_WEBGL` from `texture.flipY`, but **WebGL ignores that flag
for `ImageBitmap` sources** — an ImageBitmap's orientation is fixed at
`createImageBitmap()` time. `texImage2D` puts source row 0 at `v = 0`, which
`PlaneGeometry` maps to the *bottom* of the quad, so an unflipped bitmap renders
upside-down. There is no warning of any kind. The canvas-drawn text planes do honour
`flipY`, which is exactly why the original bug flipped the excerpts but not the
captions — a misleading clue if you go looking at the geometry instead.

So `loadTexture` passes `imageOrientation: "flipY"` (the real fix) and also sets
`texture.flipY = false` (a no-op today, correct if a browser ever honours the flag).
Don't "simplify" either away.

### Supersampling the render buffer

MindAR sizes the drawing buffer to the **camera frame**
(`setSize(video.videoWidth, video.videoHeight)`) and then CSS-stretches the canvas to
cover the container. The effective sampling ratio is therefore `videoWidth / cssWidth`
and `devicePixelRatio` cancels out entirely: a 1280-wide stream on a 1920 viewport
draws the overlay at 0.67×. That, not the texture filtering, was why the notation was
unreadable.

`applyPixelRatio()` measures the canvas's CSS width against the frame width and raises
`setPixelRatio` to match, capped by `scene.maxPixelRatio` (MindAR enables MSAA, so an
uncapped buffer is a real fill-rate cost on phones). It is safe because
`setPixelRatio` re-runs `setSize` with `updateStyle: false` — MindAR's own CSS sizing
is untouched — and the projection depends only on aspect, which doesn't change. It
must run *after* `mindar.start()`, since the CSS width doesn't exist before then, and
be re-applied on resize.

`Texture.DEFAULT_ANISOTROPY` is set once from the renderer's capability rather than
per texture: anisotropy is part of three's texture **cache key**, so changing it after
first upload reallocates the texture. `getMaxAnisotropy()` returns **0**, not 1, when
the extension is missing — hence the `Math.max(1, …)`.

### `stop()` has three jobs beyond stopping

1. **Neuter MindAR's resize listener.** MindAR binds
   `window.addEventListener('resize', this._resize.bind(this))` inline, so the listener
   can never be removed, and its early-return only fires when `video` is falsy —
   `stop()` merely detaches the element. Left alone, a resize after teardown runs
   `setSize(0, 0)` and `camera.aspect = NaN` on a dead instance and keeps the entire
   scene graph alive across navigations. Setting `mindar.video = null` makes the guard
   fire, which is why the type shim declares `video` as nullable.
2. **Free three's caches — but *not* the GL context.** `renderer.dispose()` releases
   three's program/render-list caches and its canvas listeners. Our geometries and
   materials go here too, but never `imageMaterial.map`, which the `TexturePool` owns.

   **Do not add `renderer.forceContextLoss()`.** It was tried and it white-screens the
   filter. `mindar.stop()` stops the camera tracks and calls `video.remove()`, but it
   **never removes `renderer.domElement`** from the container — so a torn-down
   instance's canvas is still sitting in the DOM, still absolutely positioned over the
   feed. While its context is merely idle the canvas stays transparent and the live feed
   shows through; force the context to be lost and it paints as a blank white sheet
   instead. In development that happens on every visit, because Strict Mode mounts the
   effect twice and the second MindAR instance renders underneath the first instance's
   corpse.

   The cost of leaving it out is smaller than it first looks. In production each visit
   creates exactly one context, and React removes the whole container subtree on
   unmount, so the orphaned canvas and its context become garbage and are collected.
   The earlier worry about browsers' ~16-context cap only bites if a session mounts the
   filter many times without collection, which normal navigation doesn't do.
3. **Be idempotent.** Teardown is genuinely reachable twice: the camera effect's cleanup
   can fire while `start()` is still awaiting permission, and the resolved `start()` then
   tears down again. A `stopped` flag makes the second call a no-op, which matters now
   that the method disposes things.

### Placement is one verb, and scale lives on the group

`setPlacement({ x, y, z, scale })` writes `box.position` and `box.scale` — nothing
else, and no plane sizing is recomputed. A node's own scale doesn't move its own
position, so the box stays planted at its offset and grows *around its origin*, which
is the image's bottom edge (`imageBottomY` is 0). The caption gap scales along with it,
which is what "size of the whole filter" should mean.

`createRegScene` takes the initial placement as an argument so the first rendered frame
already reflects stored settings instead of flashing the defaults. In `FilterScreen`
the placement deliberately does **not** appear in the camera effect's dependency
array — that effect owns the webcam, and re-running it per slider tick would restart
the camera. A ref carries the value across instead.

MindAR's anchor group has `matrixAutoUpdate = false` and its matrix is overwritten
every tracked frame, so never touch its transform; the child `box` is the only safe
place. That matrix is a uniform positive scale (1 unit ≈ one face width) with no
mirroring, so a child scale of 2.5 introduces no flipped normals or reversed text.

### Clicking the excerpt is a ray cast, not a rectangle

The excerpt is a WebGL plane that moves, tilts and scales with the head, so there is no
DOM box to hang a click handler on. `hitTestImage(clientX, clientY)` converts the
pointer to NDC against `renderer.domElement.getBoundingClientRect()` and casts a ray at
`imagePlane`.

Two properties make that correct, and both are easy to break by "tidying":
- **MindAR leaves the WebGL canvas free of CSS transforms.** It sets only
  `position/top/left/width/height`; the `scaleX(-1)` mirroring goes on the `<video>`
  alone. So canvas-rect coordinates map 1:1 onto what is drawn, with no mirror
  correction. If a future version transforms the canvas, this breaks silently.
- **World matrices are at most one frame stale**, because the render loop never stops.

The `Raycaster` and `Vector2` are allocated once, since this runs on pointer move too
(to light up a `zoom-in` cursor — the only affordance advertising that the excerpt is
clickable, and one that touch devices don't get).

### The overlay re-reads the file instead of reusing the texture

`ExcerptOverlay` calls `readFileBlob` again rather than reusing the `TexturePool`'s
`ImageBitmap`. Those bitmaps are decoded with `imageOrientation: "flipY"` for WebGL, so
drawing one into a 2D canvas or an `<img>` would come out **upside-down** — the same trap
as above, wearing a different hat. The overlay is also where a stray flip would be most
obvious and least excusable, since reading the notation is its whole purpose.

Its backdrop sits at `z-index: 60` — above camera (0), header (30), SPIN (40), gear (45)
and games menu (50), below the skip link (100), which stays reachable. The backdrop
covering the viewport is what makes SPIN and the gear unclickable; both are *also*
`disabled` while it's open, so neither is reachable by keyboard either.

### The caption is derived, not assigned

The spin's final step records the landed path; an effect turns `(landed, phase,
showCaption)` into the caption. Setting it directly at the end of the spin would have
been shorter, but then switching the caption off in the settings wouldn't affect the
excerpt already on screen. One source of truth, and live toggling comes free.

### Collapse state lives in the panel

`FileTree` renders from a `collapsed` set it doesn't own. Lifting it to `SettingsPanel`
is what lets Expand/Collapse all drive every folder at once (`folderPaths()` supplies
the list), and it survives the panel closing, which the old component-local state did
not. The button is disabled during a search because search mode force-expands every
visible node, so collapsing would change nothing observable.

### Text wraps rather than being squeezed

`ctx.fillText`'s `maxWidth` argument *condenses glyphs*, which is what made long
captions look wrong once `names.maxLength` grew. `drawTextCanvas` now word-wraps to
`maxLines` instead. On the last allowed line the remainder is appended rather than
dropped — that line just runs long, and the plane shrinks on both axes together to
`scene.maxTextWidth`, so text is bounded but never distorted. World size is derived
from a one-line canvas height, so glyphs come out the same physical size whether the
caption wrapped or not.

### Bottom-aligned images, by construction

Excerpt images vary wildly in shape. The image plane is unit geometry scaled per
texture: `planeW = min(imageWidth, maxImageHeight × aspect)`, `planeH = planeW /
aspect`, `y = imageBottomY + planeH / 2` — so every image's bottom edge sits on the
same head-space line and the caption below never gets overlapped. Change
`imageBottomY` to move the whole assembly, not the individual planes.

### Selection is stored as the *excluded* set

`localStorage["music-garage:reg:selection"]` holds the paths the player has
*unchecked*. A new upload is checked by default because it simply isn't in the set;
a missing or corrupt store means "everything checked", which is always playable.
Folder checkboxes are **derived** from descendant files every render (`mixed` →
`indeterminate`) — only file paths are ever stored, so folder state can't drift.
`saveExcluded` intersects with the existing paths so deletions don't leave stale
entries accumulating.

### Duplicate uploads overwrite

`createWritable()` truncates, so re-uploading a path replaces the bytes. Deliberate:
re-uploading a corrected excerpt just works, and merging a folder twice is
idempotent instead of an error.

### Two filters, one visibility set — and folders derived from files

`visiblePaths(root, { query, selectedOnly, checked })` returns the node paths to render,
or `null` for "show everything". It returns a *set* rather than a filtered tree so the
tree keeps its shape and rows simply drop out.

It is computed **file-first**: a file survives when it passes every active filter, then
the visible folders are exactly the ancestors of surviving files. Composing two
ready-made visibility sets by intersection looks equivalent and is quietly wrong — a
folder that is an ancestor of a matched-but-unchecked file *and* of a checked-but-
unmatched file survives the intersection with no visible children, leaving an empty
folder in the tree. Deriving folders from the survivors makes that impossible by
construction, and `tree.test.ts` pins the exact case.

### Row filtering and search behaviour are deliberately separate

`FileTree` takes `visible` **and** `searching`, rather than deriving one from the other
as it once did. `visible` decides only which rows appear; `searching` decides whether the
tree auto-expands and drops folder checkboxes.

They must not be conflated, because only a *search* justifies hiding folder checkboxes:
there, checking a folder would reach files the query is hiding, so the consequence is
invisible. The selected-only filter hides files **by the very property the checkbox
sets** — check a folder and its files appear, uncheck it and they leave — so nothing ever
stays hidden after being toggled, the checkboxes are safe to keep, and a `mixed` folder
truthfully reports that some of its contents aren't selected. So selected-only alone
feels like normal mode with fewer rows: collapsible, checkboxes intact. Add a query and
search's stricter rule takes over.

### Select/Deselect all acts on what's shown

The button reads `shownFiles(root, visible)` and toggles exactly those, so a search
scopes it to the files that search surfaced instead of the whole library. Its label
follows `shown.every(isChecked)`, which is why in selected-only mode it always reads
*Deselect all* — every shown file is checked by definition, and clicking it empties the
view. Note the tree can be empty for four different reasons now, so the panel passes
`emptyMessage` in rather than letting `FileTree` guess: "no excerpts yet" would be
alarming and wrong when the library is full and a filter is hiding all of it.

### The 3D stack loads only on the filter screen

`three` and `mind-ar` are imported only via dynamic `import()` inside
`createRegScene` / `loadTexture` — never statically. MindAR's face bundle embeds tfjs
and runs to ~2 MB; a static import anywhere would drag that into graphs that never show
a camera. This is also what keeps SSR from ever evaluating it.

### Face tracking is *not* fully local — two CDN fetches

The rest of this game is genuinely offline-capable. Face tracking is not.
`mind-ar/src/face-target/face-mesh-helper.js` hardcodes two remote URLs, neither of
them configurable and both baked into the prod bundle we import:

| What | From |
| --- | --- |
| MediaPipe WASM runtime | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm` |
| Face landmark model (`.task`) | `https://storage.googleapis.com/mediapipe-models/…` |

No model file ships inside `mind-ar` at all, and although the WASM *is* present in
`node_modules/@mediapipe/tasks-vision/wasm/`, mind-ar ignores it and goes to jsDelivr.
Consequences to keep in mind:

- **A strict Content-Security-Policy breaks the filter in production only.** It needs
  `cdn.jsdelivr.net` in `script-src` (the loader is a script) *and* `connect-src` (the
  `.wasm`), `storage.googleapis.com` in `connect-src` (the model), and
  `'wasm-unsafe-eval'` in `script-src`. Independently, `ExcerptOverlay` needs
  `img-src blob:`.
- **The first visit needs network**, and a blocked CDN (restricted networks; Google
  domains in some regions) means no filter. That failure currently surfaces through the
  camera-error path, so the message blames the camera — worth splitting if users on
  restricted networks matter.
- Opening the filter reveals IP and user agent to jsDelivr and Google. No video leaves
  the tab, but those requests do.

Self-hosting is possible but not cheap: the URLs are string literals inside mind-ar's
prod bundle, so it means vendoring or patching that file.

### The dev console is noisy, and one of the warnings is load-bearing

`THREE.WebGLRenderer: Property .outputEncoding has been removed` comes from mind-ar's
constructor assigning a property three deleted in r152. It is a no-op — the setter warns
and then writes the `outputColorSpace` value that is already the default — and it prints
twice in development only, because Strict Mode mounts effects twice.

**Don't silence it.** It is the canary for mind-ar depending on a removed three API, and
`sRGBEncoding` is gone entirely in later versions: if three is ever bumped, this warning
becoming a crash is how you find out. The MediaPipe lines (`face_landmarker_graph.cc`,
`gl_context.cc`, the XNNPACK delegate notice) come from inside the WASM module via
Emscripten's stdout forwarding; mind-ar instantiates that module, so there is no handler
of ours to quiet them.

### mind-ar needs two stubs to build at all

- **`canvas` → empty package** (`overrides` in `package.json`): mind-ar declares
  native `node-canvas` as a dependency, but only its Node-side image-target
  compiler uses it — the browser face bundle never does. The override means
  `npm install` doesn't need a C++ toolchain.
- **`fs` → `src/shared/shims/empty.js`** (`turbopack.resolveAlias`, browser
  condition, in `next.config.ts`): mind-ar's bundled TensorFlow.js keeps Node-only
  fallback paths that `require("fs")`; they never execute in a browser, but
  Turbopack still resolves them and fails the build without the alias.

If mind-ar is ever upgraded, keep both.

### Storage is best-effort durable

`navigator.storage.persist()` is requested after the first successful write, and its
answer is ignored — Chrome grants it by heuristics. The library works either way;
un-persisted OPFS is merely evictable under storage pressure.

## Shared code this game uses

- `useDismiss` from `@/shared/hooks/useDismiss` — panel Escape/outside-click.
- The gear + panel treatment copied from the other games' settings (same position,
  blur, hover rotation): three games, one way to open settings.
- **Not** `usePitchDetector` / `@/shared/audio` — this game makes and hears no sound.
- **Not** `Confetti` — the landing moment is the reveal itself; confetti on every
  spin would wear out in minutes.

## Tests

| File | Guards |
| --- | --- |
| `paths.test.ts` | normalisation, extension allowlist edge cases |
| `tree.test.ts` | build/sort/dedupe, derived folder state, cascade, folder listing, both visibility filters and their composition (including the empty-folder case), shown-file scoping |
| `names.test.ts` | caption pipeline; drop-longest-folder-first, tie-break, ellipsis |
| `spin.test.ts` | forced landing, monotone deceleration, no repeats, minSteps, bounds |
| `selection.test.ts` | coercion of corrupt stores, excluded→checked derivation |
| `settings.test.ts` | per-field range and boolean coercion, the "always renderable" invariant, percent→multiplier |

## What the tests cannot prove

Everything a camera sees. Face tracking quality, box placement and offsets, spin
*feel*, caption legibility at arm's length, upload via real folder drags, OPFS
persistence across restarts, camera permission flows, vibration on a phone, and
that `stop()` really turns the webcam light off — all need eyes on a real browser,
ideally one desktop and one phone.

**Image orientation and sharpness in particular.** Both bugs this file documents
(`flipY`, the render buffer) were invisible to the whole suite and to the build, and
would be again: nothing in Node can render a texture. The only check is looking at the
screen. If you touch `loadTexture` or `applyPixelRatio`, spin once and confirm the
notation is upright *and* the caption is still upright — a wrong flip fix inverts the
text instead of the image. The overlay needs the same look, for the same reason.

**The hit test too.** Whether a click lands on the excerpt depends on the canvas's CSS
geometry and MindAR's per-frame matrices, neither of which exists in Node. Changing
`hitTestImage` means clicking on and beside a tracked excerpt by hand.

**And teardown.** The `forceContextLoss()` white-screen passed `npm test`, `lint`, `tsc`
and `build` without a murmur, because the symptom lives in what the compositor paints
over a canvas MindAR forgot to remove. Anything touching `stop()` needs a real reload —
and in development, where Strict Mode mounts twice, that is the case that actually
exercises it.
