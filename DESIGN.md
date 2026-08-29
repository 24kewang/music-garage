# Music Garage — design system

The vocabulary every screen in this app is built from. Hand this to a design tool before
wireframing a new game, and the result will drop into the codebase without restyling.

Everything here is extracted from the live code:
[`src/shared/styles/tokens.css`](src/shared/styles/tokens.css),
[`src/app/globals.css`](src/app/globals.css) and the three shipped games. Where a value
appears below, it is the value in use — not an approximation.

---

## 1. Non-negotiables

These are the rules that make the site read as one thing. Break any of them and a new
game will look bolted on.

1. **One dark theme. There is no light mode.** No `prefers-color-scheme` branch anywhere;
   `color-scheme: dark` is set globally. Don't reintroduce one.
2. **Everything comes from tokens.** Reference `var(--color-accent)`, never `#818cf8`.
   If a value is missing, add a token rather than a literal in a component.
3. **Contrast is computed, not eyeballed.** Every text/background pair clears WCAG AA
   (4.5:1). The tightest in the system is `--color-text-faint` on
   `--color-surface-raised` at **4.89:1**. Add or change a text color and you compute the
   ratio and record it in `tokens.css`.
4. **Type has exactly three roles** (§3). The display face is for the wordmark and page
   H1s *only* — never body copy, never button labels.
5. **Icons are Phosphor, and never emoji.** Emoji render differently on every OS and read
   as filler.
6. **Motion uses the tokens**, and `prefers-reduced-motion` removes it globally. Every
   behavior must still work with all motion gone.
7. **Hover is never the only path** to anything. Fine-pointer hover, keyboard focus, and a
   coarse-pointer fallback are all required.
8. **Interactive rows are at least 2.75rem (44px) tall**, even when the control inside is
   16px.
9. **CSS Modules, colocated with the component.** No Tailwind, no CSS-in-JS, no global
   class soup.

---

## 2. Color

### Surfaces — furthest back to closest

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#0d0d16` | Page background. Deliberately not pure black: black smears on OLED and crushes the shadows the layering depends on. |
| `--color-surface` | `#14141f` | Cards, inset controls, input fields. |
| `--color-surface-raised` | `#1c1c2b` | Floating panels, hovered cards, badges. |
| `--color-stage` | `#17172a1f` | Translucent "lit panel" a piece of apparatus is mounted on. |

### Borders

| Token | Value | Use |
| --- | --- | --- |
| `--color-border` | `#262638` | Default separator and container edge. |
| `--color-border-strong` | `#35354c` | Edges that must read as interactive (inputs, ghost buttons). |

### Text

| Token | Value | Contrast on `bg` | Use |
| --- | --- | --- | --- |
| `--color-text` | `#f2f3f7` | 17.4:1 | Body and headings. |
| `--color-text-muted` | `#a2a3b4` | 7.8:1 | Secondary copy, inactive control labels. |
| `--color-text-faint` | `#85879c` | 5.5:1 | Hints, metadata. The floor — don't go dimmer. |

### Accent — indigo

Links, active nav, focus rings, primary actions. One accent, used sparingly enough that it
always means "this is the thing to press".

| Token | Value | Use |
| --- | --- | --- |
| `--color-accent` | `#818cf8` (6.5:1 on bg) | Primary fills, active states, focus ring. |
| `--color-accent-hover` | `#a5b4fc` | Hover on an accent fill. |
| `--color-accent-contrast` | `#0d0d16` | Text/icon *on* an accent fill. |
| `--color-accent-soft` | `rgb(129 140 248 / 0.12)` | Tinted badge and icon-tile backgrounds. |
| `--color-accent-line` | `rgb(129 140 248 / 0.35)` | Accent-tinted borders. |
| `--color-accent-glow` | `rgb(99 102 241 / 0.18)` | Ambient halos and hover washes. |

### Status

| Token | Value | Use |
| --- | --- | --- |
| `--color-warn` / `--color-warn-soft` | `#fbbf24` / `12%` | In-progress badges, cautions. |
| `--color-danger` / `--color-danger-soft` | `#f87171` / `12%` | Destructive actions, validation errors. |

Status colors are **text-on-soft-tint**, not solid fills — a solid red button would
outrank the accent.

---

## 3. Type

Three faces, three jobs. Loaded via `next/font/google` in the root layout and bound to CSS
variables.

| Token | Face | Job |
| --- | --- | --- |
| `--font-display` | Righteous 400 | The wordmark and page H1s. **Never body copy.** |
| `--font-sans` | Poppins 300–700 | Everything else. |
| `--font-mono` | Geist Mono | Numeric readouts needing tabular figures. Pair with `font-variant-numeric: tabular-nums` so digits don't shuffle as values change. |

### Scale

| Token | Value | Typical use |
| --- | --- | --- |
| `--text-xs` | 0.75rem | Hints, badges, metadata, small action pills |
| `--text-sm` | 0.875rem | Secondary copy, inputs, panel labels |
| `--text-base` | 1rem | Body |
| `--text-lg` | 1.125rem | Primary button label, emphasis |
| `--text-xl` | 1.375rem | Card titles |
| `--text-2xl` | 1.75rem | Section headings |
| `--text-3xl` | 2.25rem | Page headings |
| `--text-4xl` | 3rem | Hero |

### Defaults already set globally

- `body`: `--font-sans`, `--text-base`, `line-height: 1.55`, antialiased.
- `h1`–`h4`: `margin: 0`, `line-height: 1.2`, `font-weight: 650`, `letter-spacing: -0.01em`.
- `p`: `margin: 0` — spacing is the parent's job, via `gap`.
- `a`: `color: inherit`, no underline. `button`: `font: inherit`, `color: inherit`.

**Uppercase micro-labels** are a recurring device for section eyebrows and primary button
text: `--text-xs` or `--text-sm`, `font-weight: 500–700`, `letter-spacing: 0.06em`–`0.14em`,
`text-transform: uppercase`.

---

## 4. Spacing, radii, elevation

**Spacing** — note it is not linear; the jumps widen deliberately.

`--space-1` 0.25rem · `--space-2` 0.5 · `--space-3` 0.75 · `--space-4` 1 · `--space-5` 1.5 ·
`--space-6` 2 · `--space-7` 3 · `--space-8` 4

Layouts are built with `display: flex` + `gap`, not margins. Panel-internal rhythm is
`--space-4`/`--space-5`; page rhythm is `--space-6`+.

**Radii** — and what each is for.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-sm` | 6px | Inputs, small inner surfaces, images |
| `--radius-md` | 10px | Segmented-control tracks, icon tiles, inline alerts |
| `--radius-lg` | 16px | Panels, cards, modals |
| `--radius-xl` | 24px | Large containers |
| `--radius-pill` | 999px | Buttons, badges, sliders' thumbs |

Circular controls use `border-radius: 50%`, not the pill token.

**Elevation** — deeper and softer than a light theme needs, so panels separate from a dark
page.

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.4)` | Resting cards |
| `--shadow-md` | `0 4px 16px rgb(0 0 0 / 0.45)` | Hovered cards, floating buttons |
| `--shadow-lg` | `0 16px 48px rgb(0 0 0 / 0.55)` | Panels, modals, primary actions |
| `--shadow-glow` | `0 0 0 1px var(--color-accent-line), 0 12px 40px var(--color-accent-glow)` | Accent-charged hover |

---

## 5. Motion

One easing pair, three durations — so timing is consistent instead of re-invented per
component.

| Token | Value |
| --- | --- |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |
| `--dur-fast` | 160ms — hover, focus, color changes |
| `--dur-base` | 240ms — panels appearing, card hover lifts |
| `--dur-slow` | 420ms — entrances, deliberate rotations |

`prefers-reduced-motion: reduce` zeroes all three tokens **and** `globals.css` clamps every
animation and transition to `0.01ms !important`. Components that animate should still add an
explicit `animation: none` under the query, as the existing ones do.

### The named entrances in use

```css
/* Content arriving on a screen */
@keyframes stageIn {
  from { opacity: 0; transform: translateY(16px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* Cards in a gallery, staggered via an inline --stagger delay */
@keyframes cardIn {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* A popover panel */
@keyframes panelIn {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* A modal card */
@keyframes cardIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
/* Rejecting an action — note it preserves the translateX(-50%) that centers the button */
@keyframes shake {
  0%, 100% { transform: translateX(-50%); }
  20% { transform: translateX(calc(-50% - 8px)); }
  40% { transform: translateX(calc(-50% + 8px)); }
  60% { transform: translateX(calc(-50% - 5px)); }
  80% { transform: translateX(calc(-50% + 5px)); }
}
```

Entrances use `animation: <name> var(--dur-slow) var(--ease-out) backwards`.

---

## 6. Layering

There is no z-index token; these are the values in use. Stay inside the scale.

| z | What |
| --- | --- |
| `-1` | Ambient glows behind their own element |
| `0` | A full-viewport game surface (camera feed, canvas) |
| `29` / `30` | Header hover zone / the site header |
| `40` | A game's primary fixed action (bottom-center) |
| `45` | The settings gear (bottom-right) |
| `50` | Confetti, the games dropdown |
| `60` | Modal backdrops |
| `100` | The skip link — must stay reachable above everything |

---

## 7. Layout

### The app shell

`<main>` is a centered column: `max-width: var(--page-max-width)` (68rem), `margin: 0 auto`,
`padding: calc(var(--space-7) + var(--nav-peek)) var(--space-5) var(--space-8)`. The header
floats over the page, so content only clears the 4px peek strip. Under
`@media (hover: none), (pointer: coarse)` the header becomes a real sticky bar and
`padding-top` drops to `--space-6`.

Layout tokens: `--page-max-width: 68rem`, `--nav-height: 4rem`, `--nav-peek: 4px`,
`--nav-hover-zone: 50px`.

### A full-bleed game inside that column

```css
.game {
  /* Break out of the app's centered column. */
  margin: calc(var(--space-7) * -1) calc(50% - 50vw) calc(var(--space-8) * -1);
  min-height: 100dvh;
  padding: var(--space-8) var(--space-5);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: var(--space-6);
}
.stage { width: 100%; max-width: 62rem; /* + stageIn */ }

@media (max-width: 640px) {
  .game { padding: var(--space-6) var(--space-3); gap: var(--space-5); }
}
```

### A game that owns the whole viewport

```css
.screen { position: fixed; inset: 0; z-index: 0; background: var(--color-bg); }
```

Used when a game renders a camera feed or canvas edge to edge. Fixed controls then float
above it at z 40/45.

### Where controls live

- **Primary action**: fixed, bottom-center — `bottom: var(--space-5); left: 50%;
  transform: translateX(-50%)`.
- **Settings**: fixed, bottom-right — `right: var(--space-5); bottom: var(--space-5)`.
- Panels open **upward** from their trigger and are rendered *before* the trigger in DOM
  order.

### Breakpoints

Only two, used consistently: `640px` (game padding and type step-down) and `560px` (shell
side padding). Plus the capability query `@media (hover: none), (pointer: coarse)`.

---

## 8. Component recipes

### Primary action — the accent pill

```css
min-width: 9rem; min-height: 3.25rem; padding: var(--space-3) var(--space-6);
background: var(--color-accent); border: 1px solid transparent;
border-radius: var(--radius-pill); color: var(--color-accent-contrast);
font-family: var(--font-sans); font-size: var(--text-lg); font-weight: 700;
letter-spacing: 0.06em; text-transform: uppercase; box-shadow: var(--shadow-lg);
transition: background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);

:hover:not(:disabled) { background: var(--color-accent-hover); box-shadow: var(--shadow-glow); }
:disabled { opacity: 0.65; cursor: default; }
```

One per screen. If you need a second prominent action, it's a ghost pill.

### Ghost pill — secondary action

```css
min-height: 2.5rem; padding: var(--space-2) var(--space-5);
background: transparent; border: 1px solid var(--color-border-strong);
border-radius: var(--radius-pill); color: var(--color-text-faint); font-size: var(--text-sm);
transition: color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);

:hover { color: var(--color-text); border-color: var(--color-text-faint); }
```

### Small action pill — dense rows inside a panel

`min-height: 2rem; padding: var(--space-1) var(--space-3); --radius-pill;
--text-xs; font-weight: 600; border: 1px solid var(--color-border-strong)`. The danger
variant swaps text to `--color-danger`. Always guard hover with `:hover:not(:disabled)`,
and `:disabled { opacity: 0.5; cursor: default; }`.

### Circular icon button — the settings gear

```css
width: 52px; height: 52px; display: grid; place-items: center;
border: 1px solid var(--color-border); border-radius: 50%;
background: color-mix(in srgb, var(--color-surface-raised) 92%, transparent);
backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
color: var(--color-text-muted); box-shadow: var(--shadow-md);

:hover { color: var(--color-accent); border-color: var(--color-accent-line);
         box-shadow: var(--shadow-glow); transform: rotate(45deg); }
```

Icon at `size={22} weight="bold"`. The rotation is zeroed under reduced motion.

### Floating panel

```css
width: min(21rem, calc(100vw - var(--space-6)));   /* 26rem when it holds a tree */
max-height: min(34rem, calc(100dvh - 9rem)); overflow-y: auto;
margin-bottom: var(--space-3); padding: var(--space-5);
background: color-mix(in srgb, var(--color-surface-raised) 94%, transparent);
backdrop-filter: blur(18px) saturate(1.3);
border: 1px solid var(--color-border); border-radius: var(--radius-lg);
box-shadow: var(--shadow-lg);
display: flex; flex-direction: column; gap: var(--space-5);
animation: panelIn var(--dur-base) var(--ease-out) backwards;
```

Inside: `.field` is `flex column; gap: var(--space-2)`; `.title` is
`--text-sm / 600 / --color-text`; `.hint` is `--text-xs / 1.5 / --color-text-faint`;
`.divider` is `height: 1px; background: var(--color-border)`.

### Card

`--color-surface`, `1px solid var(--color-border)`, `--radius-lg`, `padding: var(--space-5)`,
`--shadow-sm`. On hover: `translateY(-3px)`, background to `--color-surface-raised`, border to
`--color-accent-line`, shadow to `--shadow-md`, plus an `::after` gradient wash
(`linear-gradient(to top, var(--color-accent-glow), transparent)`, 60% height) fading in.
Title uses `--font-display` at `--text-xl / 400`. Icon tile: 44px, `--radius-md`,
`--color-accent-soft` background, `--color-accent` glyph.

### Status badge

`padding: 0 var(--space-2); --radius-pill; --text-xs; font-weight: 600; line-height: 1.8`.
Variants: accent-soft/accent, warn-soft/warn, surface-raised/muted with a border.

### Segmented control

Two variants, both `role="group"` + `aria-pressed` on each button (this repo's idiom for
"pick one of N" that isn't a panel switch).

*Track variant* — inside panels:

```css
.track { display: grid; grid-template-columns: repeat(N, 1fr); gap: 4px; padding: 4px;
         background: var(--color-bg); border: 1px solid var(--color-border);
         border-radius: var(--radius-md); }
.seg { padding: var(--space-2) var(--space-1); border: none; border-radius: var(--radius-sm);
       background: transparent; color: var(--color-text-muted);
       font-size: var(--text-xs); font-weight: 600; }
.seg:hover { color: var(--color-text); background: var(--color-surface); }
.segActive, .segActive:hover { background: var(--color-accent); color: var(--color-accent-contrast); }
```

*Pill variant* — on start screens: `display: inline-flex; padding: 3px;
background: var(--color-surface); border: 1px solid var(--color-border);
border-radius: var(--radius-pill)`, segments `min-height: 2.5rem;
padding: var(--space-2) var(--space-5); --text-sm`.

### Tabs

When the control switches *panels*, use real tab semantics over the track variant:
`role="tablist"` / `role="tab"` + `aria-selected` + `aria-controls`, `role="tabpanel"` +
`aria-labelledby`, `tabIndex` 0 on the active tab and −1 on the rest, and ArrowLeft/Right to
move between them.

### Text input

```css
width: 100%; min-height: 2.75rem; padding: var(--space-3);
background: var(--color-bg); border: 1px solid var(--color-border);
border-radius: var(--radius-sm); color: var(--color-text);
font-family: var(--font-mono); font-size: var(--text-sm);   /* mono for numeric fields */
transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);

:hover { border-color: var(--color-border-strong); }
:focus-visible { outline: none; border-color: var(--color-accent);
                 box-shadow: 0 0 0 3px var(--color-accent-soft); }
.invalid, .invalid:hover { border-color: var(--color-danger); }
```

Numeric fields use `inputMode="numeric"` rather than `type="number"`, and validate on a
**draft value, committing only when valid** so a half-typed entry never breaks the game.

### Select

`min-height: 2.75rem; padding: var(--space-2) var(--space-3);
background: var(--color-surface); border: 1px solid var(--color-border-strong);
--radius-sm; font: inherit; --text-sm`, with `:focus-visible { border-color: var(--color-accent) }`.

### Checkbox row

```css
.row { display: flex; align-items: center; gap: var(--space-3);
       min-height: 2.75rem;                /* the row is the target, not the 16px box */
       color: var(--color-text); font-size: var(--text-sm); font-weight: 600; }
.row input { width: 1.1rem; height: 1.1rem; accent-color: var(--color-accent); }
```

A tri-state (folder) checkbox sets `indeterminate` as a **DOM property in a ref callback** —
it isn't an attribute.

### Range slider

`accent-color: var(--color-accent)` carries both track fill and thumb — no vendor
pseudo-elements needed. Give it `width: 100%; height: 1.75rem` for a comfortable target.
Pair with a label row: label left (`--text-xs / 600`), value right in
`--font-mono` + `tabular-nums` + `min-width: 4ch; text-align: right` so the readout can't
shuffle mid-drag. Disabled fields dim to `opacity: 0.5`.

### Toggle switch

For a mode that changes what the screen *is*. A `<button role="switch" aria-checked>` — a
button so Space and Enter both work natively — with the label in a `<span>` above it and
`aria-labelledby` linking them.

```css
.switch { position: relative; width: 2.75rem; height: 1.5rem; padding: 0;
          border: 1px solid var(--color-border-strong); border-radius: var(--radius-pill);
          background: var(--color-surface); }
.switch[aria-checked="true"] { background: var(--color-accent); border-color: transparent; }
.thumb { position: absolute; top: 50%; left: 3px; width: 1.125rem; height: 1.125rem;
         border-radius: 50%; background: var(--color-text-muted); transform: translateY(-50%);
         transition: left var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out); }
.switch[aria-checked="true"] .thumb { left: calc(100% - 1.125rem - 3px);
                                      background: var(--color-accent-contrast); }
```

### Modal

Backdrop: `position: fixed; inset: 0; z-index: 60; display: grid; place-items: center;
padding: var(--space-5); background: color-mix(in srgb, var(--color-bg) 82%, transparent);
backdrop-filter: blur(10px)`, fading in over `--dur-fast`. Card: `--color-surface-raised` at
94%, `--radius-lg`, `--shadow-lg`, `padding: var(--space-5)`, scaling in from 0.97 over
`--dur-base`. Close button is a 2.25rem circle in the top-right.

Dismissal is Escape **and** an outside pointer-down (via the shared `useDismiss` hook, which
reports which of the two happened so callers can restore focus on Escape only). Anything the
backdrop covers should also be `disabled`, so it leaves the tab order too.

### Inline messages

| Kind | Recipe |
| --- | --- |
| Error block | `--color-danger-soft` bg, `1px solid var(--color-danger)`, `--radius-md`, `padding: var(--space-3) var(--space-4)`, `--text-sm`, centered, `max-width: 30rem` |
| Field error | `--text-xs`, `--color-danger`, `role="alert"` |
| Warning | `--color-warn` text on `--color-warn-soft` |
| Notice | `--text-xs`, `--color-text-muted` |
| Hint | `--text-xs`, `line-height: 1.5`, `--color-text-faint` |
| Status line | `--text-base`, `--color-text-muted`, centered, `pointer-events: none` when overlaid |

### Empty states

One sentence of `--color-text-muted`, and it must name **which** emptiness: "nothing matches
that search" and "nothing is selected" are different from "no items yet". Never show the
"nothing here yet" copy when the data exists but a filter is hiding it.

---

## 9. Interaction and accessibility

- **Focus** is global: `:focus-visible { outline: 2px solid var(--color-accent);
  outline-offset: 2px; border-radius: var(--radius-sm); }`. Only remove it if you replace it
  with something at least as visible (inputs swap to an accent border + a 3px soft ring).
- **Disabled** = `opacity: 0.5` (0.65 for the primary pill) + `cursor: default`, and every
  hover rule guarded with `:hover:not(:disabled)`.
- **Cursors**: `a`, `button`, `[role="button"]` and `label` are already `cursor: pointer`
  globally; `button:disabled` is already `default`.
- **Roles in use**: `switch` for mode toggles, `tablist`/`tab`/`tabpanel` for panel
  switching, `group` + `aria-pressed` for segmented pickers, `dialog` (+ `aria-modal` for
  true modals), `tree`/`treeitem` with `aria-expanded`/`aria-selected` for hierarchies,
  `alert` for validation and blocking warnings.
- **Touch**: every interactive row clears 44px. Hover-only affordances (like a
  pointer-tracked cursor change) need a non-hover equivalent or must be non-essential.
- **The skip link** matters more than usual because the header overlays content — keep it at
  z 100 and never cover it.
- **Selection color** is already themed (`--color-accent-soft`), as are scrollbars
  (`scrollbar-color: var(--color-border-strong) transparent`).

---

## 10. Anti-patterns

- A hex code, `px` radius, duration or type size hard-coded in a component.
- A second accent hue, or a solid `--color-danger` button competing with the primary action.
- The display face on body copy, buttons, or anything below a page title.
- Emoji standing in for icons.
- Text dimmer than `--color-text-faint`, or a new text color without a computed ratio.
- A hover-only route to a control, or a control smaller than 44px on touch.
- Margins for layout rhythm where `gap` would do.
- A `z-index` outside the scale in §6, or anything above the skip link's 100.
- An animation that the interface depends on to be usable.

---

## 11. Wireframing a new game

**Shape of a game in this codebase.** One self-contained folder, `src/games/<slug>/`:
`manifest.ts` (plain data — slug, title, blurb, `iconId`, status), `Game.tsx` (the
`"use client"` root, no props), `config.ts` (every tunable in one exported object),
`game.module.css`, `components/`, `lib/` (pure, node-testable logic), plus an
`ARCHITECTURE.md` recording the non-obvious decisions. A game may import from
`@/shared/*` but never from another game.

**Screens a game typically needs**, all of which have a recipe above: a start/idle state, the
play surface, a settings panel behind the bottom-right gear, and per-state messaging
(loading, error, empty, warning).

**Reuse before drawing:** the site header and games menu, `Confetti` (takes its tuning as a
prop plus an optional burst origin), `useDismiss` (Escape/outside-click), and the icon
registry. A fourth hand-rolled settings panel is a smell — the gear-and-panel treatment is
shared on purpose: three games, one way to open settings.

**Deliverables that translate cleanly:** wireframes at 1440px and 390px wide; the coarse-
pointer variant of anything that relies on hover; a token name (not a color) called out for
every fill, border and text color; and a named state for each of resting, hover, focus,
active, disabled, loading, error and empty.
