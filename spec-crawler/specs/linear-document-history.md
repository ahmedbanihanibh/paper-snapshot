# Linear — document history / restore-version overlay

Board #192. Captured 2026-08-28 over raw CDP on :9222 (Edge 151), workspace
`linear.app/test-48bd-dd25`, dark theme unless a line says otherwise.

Entry path, and it matters: the header's **`Edited …` pill TOGGLES** its
popover. Clicking it blind closes an already-open one, which reads as "the
overlay would not open". Every probe here first looks for the
`Show document history` row and only clicks the pill when that row is absent.

Three documents were used. The one-version document is the one that MISLED me —
see SUPERSEDED below — because on it, "newest", "identical to live" and "the
only row" are the same row.

## SUPERSEDED — read this first

An earlier revision of this file (2026-08-28) concluded that `Current` marks the
version whose content IS the live document, and that selecting it removes the
diff cluster. **Both were wrong**, and both came from measuring a document with
ONE version, where four different models predict the same screen. Corrected
2026-08-29 against a THREE-version document. The sections below are the
corrected reading; the mistake is recorded in
`feedback_identity_badge_is_content_not_index.md`.

## The `Current` badge — POSITIONAL

Measured on the three-version reference (2.6s settle, reproduced,
`scratchpad/pill-state-machine.mjs`):

| row | stamp | badge | counter | switch | steppers | restore |
|---|---|---|---|---|---|---|
| 0 | 11:44 PM | **Current** | `1 of 1` | yes | 3 | **disabled**, opacity 0.6 |
| 1 | 11:35 PM | — | `1 of 3` | yes | 3 | enabled, opacity 1 |
| 2 | 10:45 PM | — | none | **no** | 1 | enabled, opacity 1 |

`Current` marks the **newest** version. Row 0 carries it while the live
document holds a block that version does not (a line typed after the snapshot),
so the badge cannot mean content identity.

Badge rect 57x18, right-aligned in the row.

## The diff runs against the PREDECESSOR, not the live document

Row 2 is the oldest and shows **no diff UI at all** — no switch, no counter, no
steppers, only `Restore version` in a 124.3px pill. Against the live document it
would have plenty of changes; against a predecessor it has none, because it has
none.

This is the only model consistent with all three rows and with the
single-version document that produced the original wrong reading (one version,
no predecessor, no cluster).

**Not proven by content comparison** — inferred from the oldest row's absence
plus the counts (`1 of 1` on row 0 matches exactly the one block added between
row 1 and row 0). To prove it outright, diff two known version contents and
check the count against both candidate comparisons.

## The pill's state machine and its motion

Per-edge rAF sampling, 6 edges:

| edge | motion | what moves |
|---|---|---|
| 0 -> 1 (both have a cluster) | 144.5ms | button opacity 0.6 -> 1 only; width constant 410.16 |
| 1 -> 0 | 233.1ms | opacity 1 -> 0.6; width 410.16 -> 407.41 (2.75px settle) |
| 0 -> 2 (cluster leaves) | 347.4ms | width 410 -> 124.3, opacity 0.6 -> 1 |
| 1 -> 2 (cluster leaves) | 360.4ms | width 303 -> 124.3, opacity stays 1 |
| 2 -> 0 (cluster appears) | 504.6ms | opacity ramp FIRST, then cluster mounts, then width 124.3 -> 407.41 |
| 2 -> 1 (cluster appears) | 562ms | same ordering, width 124.3 -> 410.16 |

Mechanics:

- **Width animates, height does not.** Height is 40 in every frame of every
  edge. The width curve decelerates — 410 / 293 / 276 / 268 / 245 / 230 / 211 /
  188 / 169 / 158 / 148 / 140 / 134 / 131 / 128.7 / 124.3 — i.e. ease-out over
  roughly 250ms. The pill is centred, so BOTH edges move; its left edge travels
  454 -> 536 while it shrinks.
- **The switch and counter swap INSTANTLY** — one frame, no fade, no width
  animation of their own. `hasSwitch` flips 0 -> 1 in a single sample.
- **Button opacity ramps ~150ms**, matching its declared
  `opacity 0.15s`. Declared transition on the button:
  `border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s`. Note it
  transitions COLOUR — which our house rule bans app-wide; we deliberately do
  not copy that half.
- **Ordering differs by direction.** Expanding (2 -> 0): opacity ramps first,
  then the cluster mounts, then the width animates. Collapsing (0 -> 2): width
  and opacity run concurrently.
- **~470-750ms of content-load latency precedes all motion** on every edge —
  the version content is fetched before the footer updates.

## OURS, after building it (drive-gated, Chromium)

`scratchpad/ours-pill-gate.mjs`, 9-version document, reduced-motion emulated to
`no-preference` (see the trap below):

| row | badge | counter | switch | steppers | restore | pill |
|---|---|---|---|---|---|---|
| newest | **Current** | `1 of 1` | yes | 4 | disabled, opacity 0.6 | 403 x 40 |
| middle | — | — | yes | 2 | enabled, opacity 1 | 288 x 40 |
| oldest | — | none | **no** | 1 | enabled, opacity 1 | **120 x 40** |

Exactly one badged row, and it is the newest. The oldest row collapses to the
lone button at 120x40 against the reference's 124.3x40 — the 4px is our button
being 103 wide where Linear's is 106 (font metrics).

Expand motion, oldest -> newest: width **120 -> 403 over 238.4ms**,
decelerating (149.75 / 179 / 206.3 / 232.55 / 257.14 / 280.47 / 301.8 / 322.81 /
340.49 / 356.38 / 369.15 / 379.23 / 389.36 / 397.06 / 401.84 / 403), **height
constant at 40** across all 139 sampled frames. Reference: ~250ms, same shape,
same constant height.

### THE INSTRUMENT TRAP THAT COST TWO ROUNDS

**The :9222 debug browser has `prefers-reduced-motion: reduce` ON.** Our pill
honours it (`motion-reduce:!transition-none`), so the gate reported "NO WIDTH
MOTION" and a computed `transition-property: none` while the element's own style
attribute said `transition: width 250ms ease-out`. Correct code, instrument
asserting its own setting.

Emulate it away for the measurement and restore afterwards:

```js
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
```

**Linear does NOT honour the preference here** — its pill animated in the same
browser with reduce-motion on. Ours does. That is the one place this surface is
deliberately not 1:1.

## The footer PILL — Ahmed's padding report (image #371)

The footer is not a bar. It is a **floating pill centred over the preview**:

| | Linear | ours (after the fix) |
|---|---|---|
| outer strip | 756 x 70, `padding: 10px 0 20px`, `justify-content: center` | 756 x 40, `padding: 0 16px`, `justify-content: center` |
| the pill | 124 x 40, `padding: 6px 6px 6px 10px` | 120 x 40, `padding: 6px 6px 6px 10px` |
| button inside | 106 x 24, gap 10 left / 6 right | 103 x 24, gap **10 left / 6 right** |

The pill's asymmetric `10 / 6` is deliberate: the left edge meets text (the
switch label), the right edge meets a fully-rounded button whose own radius
supplies the missing space. Ours already had it.

What ours got wrong was one level in: the button's wrapper carried
`ml-2 pl-2` — 16px of *separation* from the counter cluster. When the cluster
is removed (the `Current` state) that stops being separation and becomes
padding, so the pill read `10 + 16 = 26px` left against `6px` right.

**The drive gate had already recorded this and I read past it**: the button
measured `x=693` with the cluster and `x=559` without. A control that moves
when a sibling disappears is not anchored to anything. Ours is now 551/541,
i.e. 10 left and 6 right, matching the reference. The 4px pill-width delta is
our button being 103 wide where Linear's is 106 — font metrics, not layout.

## What ours got wrong (fixed in this pass)

1. **The diff was against the LIVE document, not the predecessor.** This is
   almost certainly Ahmed's report — *"it detects the chanegs not right"* — since
   our counts and bands described a comparison the reference never makes. Now
   `changedBlockIndices(selected.content, predecessor.content)`.
2. The cluster was shown on every row, including the oldest, where the reference
   shows none. Now gated on having a predecessor.
3. The disabled button used `bg-primary/40 text-primary-foreground/70` — two
   independently-chosen alphas — and carried a "you cannot restore it" tooltip
   that could never appear (a disabled element dispatches no pointer events).
   Now one `opacity-60` over the enabled tokens, and no tooltip. The dead-tooltip
   class is now `pb-design/no-tooltip-on-disabled-control`.
4. The button's wrapper carried an unconditional `ml-2 pl-2` — see the pill
   section.

**And one thing ours had RIGHT that I broke and then restored**: `Current` on
`sorted[0]`. My content-identity rewrite was the regression, not the fix.

## Not measured

- **The predecessor model, proven rather than inferred.** It is the only model
  fitting all three rows, but no two version contents were diffed by hand to
  confirm the count directly.
- **What the badge does after a RESTORE.** If `Current` is positional, restoring
  an old version should move the badge to whichever row ends up newest. Not
  produced — a restore writes to the reference document.
- **The light theme** of the disabled button. Only the `opacity: 0.6` mechanism
  was measured, in dark. Since the fill and text are the enabled tokens
  unchanged, light should follow from the tokens, but that is an inference.
- **The badge's own chrome** — background, border, radius, font. Only its rect
  was taken.
- **What the preview pane shows for the `Current` row** — presumably that
  version's content, but the pane was not diffed against anything.
- **The motion in LIGHT theme.** All six edges were sampled in dark only.
- **A row that HAS a predecessor but ZERO changed blocks.** The reference never
  produced one (its oldest row has no predecessor at all; its other two rows
  both had changes), so what Linear shows there is unknown. Ours renders the
  switch and hides the counter — no inert "0 of 0" (§14) — which is a judgement
  call, not a measurement.
- **Whether the width motion is a CSS transition or a JS/WAAPI animation.** The
  pill's computed `transition` serialises as bare `all` (no duration), yet the
  width demonstrably animates over ~250ms, so the curve is driven by something
  computed styles do not report.
- **Restore-from-the-current-row behaviour**, because the control is disabled;
  whether Linear also blocks the keyboard path is unknown.
