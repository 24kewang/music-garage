# 🔀 Random Excerpt Generator (REG)

One player, a webcam, and their own practice library. Upload images of musical excerpts,
either loose files or whole nested folders. They are kept in the browser's private file
storage (OPFS), so the library survives reloads and nothing leaves the tab.

The camera feed becomes a face filter: a box floats above your head, tracked in 3D as
you move. Press **SPIN** and it riffles through your checked excerpts slot-machine
style, slowing until it lands on a random one, captioned with a name built from the
file's path (`orchestral/mahler/Symphony 5.png` → *orchestral - mahler - Symphony 5*).
Practice what fate hands you, then spin again.

The excerpt floats at head size, which is enough to recognize a piece but not to play
it. **Clicking the excerpt opens it full-screen**, and the x, a click outside, or Escape
closes it again. SPIN and the gear stay locked while it is open.

## The gear panel

**Files** is the library: a search bar, a collapsible checkbox tree mirroring your folder
structure (folder checkboxes cascade), expand/collapse-all, an "only show selected"
filter that composes with the search, ways to add more files, and a delete-everything
escape hatch behind a confirmation. Select/deselect-all applies to whatever the tree is
currently showing, so during a search it only touches the files that search surfaced. At
least one excerpt must stay checked; SPIN buzzes and shakes otherwise.

**Filter** is where the box lives: a **Camera mode** switch, sliders for the box's
left/right, up/down and near/far offset, overall size as a percentage, and whether the
excerpt's name is shown at all. The filter follows the sliders live while you watch
yourself, and your tuning is remembered.

Offsets are measured in *face widths*, so the box holds its position as you move toward
or away from the camera.

## Camera mode starts off

Without it the same slot machine runs as an ordinary picker, with the excerpt centered
on screen and its name underneath, still clickable to enlarge. It asks for no camera
permission and loads none of the 3D stack, so a visit that never turns the camera on
never fetches it. The position sliders gray out there, since there is no head to track.
The switch is session-only: reload and you are back to camera-free. It also locks while
the camera is starting, so a half-built scene cannot be torn down under itself.

Face tracking is [MindAR](https://github.com/hiukim/mind-ar-js) plus three.js, loaded
only on this page. Turning it on fetches the MediaPipe runtime and model from two
third-party origins. See the site's privacy policy.

---

The spin's cadence, the slider bounds, and the caption length budget are all tunable in
[`config.ts`](config.ts). See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the decisions,
including what `imageOrientation: "flipY"` fixes, how the render buffer is supersampled
to make notation legible, and the two stubs (`canvas`, `fs`) that mind-ar needs to
build.
