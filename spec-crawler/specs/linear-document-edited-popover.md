# Linear — the "Edited &lt;date&gt;" popover in the document header (#143)

Captured 2026-08-28 over raw CDP on :9222 (Edge 151), viewport 1432×723,
`linear.app/test-48bd-dd25/document/example-document-b550ded309ec`.
Both themes. Rest and hover measured **separately**, with the pointer parked
away from the panel for every "rest" value — see *Traps* below, because the
first dark reading was hover-contaminated and would have shipped as rest.

## Entry path

The trigger is a pill in the document header, right-aligned:
`<button aria-haspopup="dialog">Edited Aug 28</button>` at **[1292, 61, 120, 28]**.
It opens on **click** (hover for 1.6s does nothing — measured). It **toggles**:
a blind second click closes it, which reads as "the popover never opens".

## Trigger chrome

| | dark | light |
|---|---|---|
| rest bg | `transparent` | — |
| rest color | `lch(61.803 1.2 272)` | `lch(19.588 1.25 282)` (measured while open) |
| hover bg | `lch(14.006 0.593 272)` | `lch(94.854 0.5 282)` |
| hover color | `lch(90.451 1.2 272)` | — |

radius `9999px` · padding `0 10px 0 8px` · font `12px / 500` · border
`0.5px solid transparent` · size **120 × 28**.
The label **brightens on hover** as well as gaining a plate.

## Panel

**308 × 207**, anchored **right-aligned to the trigger** (`panel.right ==
trigger.right`, dx 0) and **4px below it** (`panel.top - trigger.bottom = 4`).
radius **12px** · padding 0 · border `0.5px solid` · `z-index: 500`.

The outermost floating element is a **transparent positioning wrapper**
(bg `rgba(0,0,0,0)`, radius 0, no shadow); the chrome is on a `position: static`
descendant. Measuring the wrapper reports "no chrome at all".

| | dark | light |
|---|---|---|
| bg | `lch(12.72 0.85 272)` | `lch(100 0 282)` |
| border | `0.5px solid lch(25.68 1.93 272)` | `0.5px solid lch(91.9 0 282)` |
| shadow | `0 3px 8px, 0 2px 5px, 0 1px 1px` all `lch(0 0 0 / .125)` | `0 6px 18px /.02, 0 3px 9px /.04, 0 1px 1px /.04` |

Both shadow stacks are **exactly our `--popover-shadow`** per theme — an
independent confirmation of the dark value corrected in #181.

## Row inventory — 5 rows, 1 separator

Offsets are from the panel's top-left. Rows were found by geometry: Linear's
panel carries a role but its **items carry none**, so a `[role="menuitem"]`
query returns 0 on a menu that is plainly on screen.

| top | h | w | inset | content | notes |
|---|---|---|---|---|---|
| 5 | 32 | 275 | 17 | `Show comments` | toggle row, inset from the panel edge |
| 37 | 32 | 275 | 17 | `Show author names` | toggle row |
| 77 | 44 | 307 | 1 | `Owned by` → avatar + `test dma` | padding `8px 16px`; the value is a 92×28 pill button |
| 121 | — | 307 | — | **separator** | the ONLY one |
| 122 | 40 | 307 | 1 | `Last edit by` → avatar + `Aug 28, 7:13 PM` | padding `8px 16px` |
| 162 | 45 | 307 | 1 | `Show document history` | padding `8px`; contains the button below |

**There is exactly ONE separator, between `Owned by` and `Last edit by`.**
There is none after the two toggle rows — the 8px gap there is padding.

## `Show document history` — the control #143 is about

A **pill button**, not a rectangle, and the *same* pill chrome as the header
trigger:

**291 × 28** · radius `9999px` · padding `0 10px 0 8px` · border
`0.5px solid transparent` · font `12px / 500` · one **leading icon**.
It sits in a 45px row with `8px` padding, so 291 + 8 + 9 ≈ 308.

| | rest bg | hover bg | color |
|---|---|---|---|
| dark | `lch(17.349 1.139 272)` | `lch(21.977 1.525 272)` | `lch(91.178 1.425 272)` |
| light | `lch(100 0 282)` (= panel bg) | `lch(95.886 0 282)` | `lch(20 1 282)` |

The themes are **not symmetric**, and this is measured, not inferred: in dark
the button carries a **raised plate at rest** (+4.6 L\* over the panel) and
lightens further on hover (+9.3 L\*); in light it is **flat at rest** — its
background is the panel's own — and only gains a wash on hover.

sRGB approximations for mapping: dark rest ≈ `#2A2B2C`, dark hover ≈ `#333334`,
light hover ≈ `#F0F0F0`. **Light hover is exactly our `--hover-wash`
(`#F0F0F1`); neither dark value is our dark `--hover-wash` (`#232424`)**, which
is darker than Linear's plate here.

## Ours, for the diff (`components/dashboard/document-page.tsx::EditedPopover`)

| | ours | reference |
|---|---|---|
| panel width | 320 | 308 |
| history button | `h-8` (32), `w-full`, `rounded-[8px]` | 28h, 291w, `rounded-full` |
| button font | `13px / 500` | `12px / 500` |
| button plate | `bg-foreground/[0.06]` both themes | per-theme, asymmetric (above) |
| separators | 2 (after toggles **and** between meta rows) | 1 (between meta rows only) |
| trigger | `h-7` `rounded-full` `px-2.5` `12px/500` | 28h `rounded-full` `0 10px 0 8px` `12px/500` |

The trigger is already right. The button and the extra separator are not.

## Traps hit while capturing this

1. **A backgrounded tab.** `Input.dispatchMouseEvent` took ~5s **per event**
   (one 9-step `walkTo` cost 46s) and the popover never opened at all — which
   reads exactly like "the control does nothing". `Page.bringToFront` first;
   after it, the same clicks worked in ~1s.
2. **Blind clicking toggles.** A second run clicked a panel that was already
   open, closing it, and reported `panel: false`. Probe for the overlay by
   effect first; click only when it is absent.
3. **Rest contaminated by the pointer.** The first dark reading of the button
   was taken with the pointer still parked on it from the previous probe, so
   `lch(21.977)` looked like the rest colour. Parking at (400,400) first
   revealed rest is `lch(17.349)` and that value is the hover. Both themes were
   re-measured this way.
4. **The wrapper is not the panel** (see above).

## Drive gate — OURS after the rebuild (2026-08-28, same probe, both themes)

| | ours dark | ours light | reference |
|---|---|---|---|
| panel | 308×207, r12, dx 0, dy 4 | same | 308×207, r12, dx 0, dy 4 |
| separators | `[121]` | `[121]` | `[121]` |
| button box | 290×28, pill, pad `0 10 0 8`, border `0.5px transparent`, `12px/500` | same | 291×28, same |
| button rest bg | `rgb(42,43,44)` | `transparent` | `lch(17.349…)` ≈ rgb(42,43,44) / panel bg |
| button hover bg | `rgb(51,51,52)` | `rgb(240,240,241)` | `lch(21.977…)` ≈ rgb(51,51,52) / `lch(95.886…)` ≈ rgb(240,240,240) |
| button color | `rgb(227,228,231)` | `rgb(48,48,50)` | ≈ rgb(231,232,234) / ≈ rgb(48,49,51) |

The label colour comes from the existing `--secondary-foreground` token in both
themes (dark `#E3E4E7`, light `#303032`), which lands within ~4/255 of the
captured value — an existing seam extended rather than a fourth token invented.
Width is 290 vs 291: our panel's own border/padding rounding, 1px.

## Not measured

- The two **toggle switches**' own chrome (track/knob size, on/off colours).
  `[role="switch"]` matched 0 in the control sweep even though an earlier probe
  counted 2, so they are probably `input[type=checkbox]` or a styled div — the
  selector, not the reference, is the open question.
- **Focus-visible** on any of these controls.
- The **open/close animation** (if any).
- The **avatar pill** in `Owned by` / `Last edit by` beyond its 92×28 box.
- What `Show document history` opens — this capture stops at the button.
- Whether the button's icon+label are **centred** or left-aligned in the 291px
  pill. Ours keeps `justify-center` because that is what it already did; the
  reference's label x-offset was not read, so this is unverified either way.
