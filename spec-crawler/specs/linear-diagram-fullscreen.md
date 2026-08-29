# Linear — the diagram FULLSCREEN overlay (#119)

Captured 2026-08-28, raw CDP on :9222 (Edge 151), 1432×723, **both themes**,
`linear.app/test-48bd-dd25/document/example-document-b550ded309ec`.

Reachable at last because #136 found the entry path: right-click the diagram →
`Fullscreen`. This task had been blocked on "Linear's diagram insertion trigger
is unknown" — the diagrams exist now and the menu opens fine once the tab is
brought to the front.

## Shape — NOT a centred max-width dialog

A panel **inset 33px from every viewport edge** over a plain scrim. At
1432×723 that is exactly **1366 × 657** at (33, 33).

| | dark | light |
|---|---|---|
| scrim | `lch(0 0 0 / 0.4)` | `lch(0 0 0 / 0.25)` |
| scrim blur | **none** | none |
| scrim z-index | 700 | 700 |
| panel bg | `lch(5.52 0.4 272)` ≈ `#121213` | `lch(97.94 0.5 282)` ≈ `#F9F9FA` |
| panel border | `1px solid lch(14.16 1.48 272)` ≈ `#242527` | `1px solid lch(88.49 0 282)` ≈ `#DEDEDE` |
| panel radius | 8px | 8px |
| panel overflow | hidden | hidden |

Shadows — dark is **five** layers, light is three. Both captured in full (the
first read truncated the dark stack at three; re-read rather than guessed):

```
dark   0 4px 40px rgba(0,0,0,.1), 0 3px 20px rgba(0,0,0,.125),
       0 3px 12px rgba(0,0,0,.125), 0 2px 8px rgba(0,0,0,.125),
       0 1px 1px rgba(0,0,0,.125)
light  0 9px 48px rgba(0,0,0,.08), 0 6px 24px rgba(0,0,0,.1),
       0 1px 1px rgba(0,0,0,.04)
```

## The diagram is NOT scaled to fit

Linear renders it at **natural size** inside the panel and lets the panel
scroll — the flowchart's last node sits near the bottom edge in the capture.
This corrects the note left on #119 earlier, which read our own behaviour
(identical size inline and fullscreen) as a defect. It is what the reference
does.

## Controls — a three-control cluster, top right

Three round controls, **26 × 26**, `border-radius: 9999px`, transparent at
rest, at y = 47 (14px below the panel's top edge):

| x | control |
|---|---|
| 1299 | copy |
| 1325 | show source |
| 1360 | **close** — 9px further right than the pair's pitch, 13px from the panel's right edge |

The active/hover plate is the panel ground at 80% alpha
(`color(srgb 0.0703 0.0712 0.0737 / 0.8)` dark,
`color(srgb 0.976 0.9765 0.9804 / 0.8)` light).

**Right-clicking inside fullscreen** opens a 3-row menu of its own:
`Copy diagram to clipboard` · `Show source` · ── · `Close`.

## Ours after the rebuild — drive gate, dark

| | ours | reference |
|---|---|---|
| panel rect | [33, 33, 1366, 657] | [33, 33, 1366, 657] |
| radius | 8px | 8px |
| border | `1px solid rgb(36,37,39)` | `1px solid lch(14.16 1.48 272)` ≈ rgb(36,37,39) |
| bg | `rgb(18,18,19)` | `lch(5.52 0.4 272)` ≈ rgb(18,18,19) |
| shadow | the five layers above, verbatim | same |
| scrim | `rgba(0,0,0,0.4)`, no blur | `lch(0 0 0 / 0.4)`, no blur |
| diagram | 196×820 at (614, 66) — natural size, top visible, panel scrolls | natural size, panel scrolls |

Three build traps, all measured rather than reasoned:

1. **`sm:max-w-lg` survives `max-w-none`.** tailwind-merge treats the `sm:`
   variant as a different group, so the panel measured **512px** wide — max-w-lg
   exactly — while its height was already correct. `sm:max-w-none` is required.
2. **An arbitrary-value shadow utility lost to the shared `shadow-lg`**; the
   panel measured Tailwind's 0.18 stack. Setting `box-shadow` as an arbitrary
   PROPERTY wins.
3. **`items-center` clips a too-tall child unreachably.** The svg (820px) in a
   657px scroller landed at **y = −49** — centred into negative space, top
   unscrollable. `items-start` plus `m-auto` on the child gives centring when
   it fits and no clipping when it does not.

## Not measured

- The **three icons** are not extracted, so ours still ships the shared single
  close button rather than the cluster. Drawing them by hand is the one thing
  this repo never does — that is #119's remainder.
- **Escape**: the sentinel used to detect fullscreen turned out to detect the
  context MENU, not the overlay, so the Escape result cannot be trusted either
  way. Untested, deliberately named.
- The open/close **animation**.
- Whether the panel's 33px inset is a fixed value or a percentage — only one
  viewport (1432×723) was captured.
- What the copy / show-source controls do.
