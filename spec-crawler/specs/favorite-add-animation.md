# Favouriting — the entry animation

Recorded from Linear with real pointer events, 2026-08-11. The animation is
captured off `document.getAnimations()` at the frame it is created, not sampled
by eye.

## What actually animates

**One animation, on the newly-added sidebar row.** Nothing else in the sidebar
animates, and the star control in the header does not animate its own toggle.

| | |
|---|---|
| property | `opacity`, keyframes `0 → 1` |
| duration | **300ms** |
| easing | a **baked spring**, expressed as `linear(…)` with **30 stops** |
| target | the new favourite row, 220px wide |
| height | **0 → 28.8px** across the same window |

Sampled through the transition: `0 → 8.8 → 25.1 → 28.8px` while opacity ran
`0 → 0.312 → 0.894 → 1`. So the row does not slide or scale — it **grows from
zero height while fading in**, and the surrounding rows are pushed down by the
layout rather than by an animation of their own.

### The easing is the composer's trick again

```
linear(0 0%, 0.0411 3.45%, 0.1342 6.90%, 0.2478 10.34%, … 0.9987 96.55%, 1 100%)
```

A spring solved at build time and shipped as a 30-stop `linear()` function —
exactly what Linear does for the issue composer's open. It never exceeds 1, so it
is a damped ease-out, **not a bouncy overshoot**. Do not substitute a
`cubic-bezier`: the whole character is in the dense early stops.

## Timing that matters for the implementation

**The row appears ~430ms after the click**, not immediately — that is the server
round-trip. The 300ms animation begins when the row arrives, so from the user's
side the sequence is: click → brief nothing → 300ms grow-and-fade.

If protocolbase writes optimistically to a local store, the row will appear
instantly and the perceived motion will be *faster* than Linear's, not slower.
That is a product decision, not a fidelity one — but it should be a decision.

## Not measured

- **Whether a collapsed Favorites section auto-expands when you favourite
  something.** Two attempts to drive the section collapsed did not actually
  collapse it, so the observation would have been of an already-expanded section.
- **The star control's own feedback.** Once favourited the control's label changes
  (`Add to favorites` → `Remove from favorites`), but I did not capture whether
  its icon fills or animates.
- **Exact height at fixed progress fractions.** The freeze-and-seek pass caught an
  unrelated 150ms fade-out twice instead of the row's own animation. The numbers
  above come from rAF sampling, which is why they are given as a shape rather
  than as per-fraction values.

## Housekeeping

The workspace is back to its starting state: `All issues` favourited, the test
favourite (`Active issues`) removed, and all seven folders intact.

---

# Validation against the `emil-design-eng` principles

The measurement above says what Linear does. This says which parts are worth
copying — they are not the same question, and this is the first surface in the
whole spec effort where the honest answer is **diverge from the reference**.

## Where Linear is right

**Animating at all is justified.** Favouriting is an occasional action, not a
hundred-times-a-day one. Under the frequency test it earns a standard animation.

**`opacity` + `height` is the correct pair here**, despite the usual rule of
animating only `transform` and `opacity`. For a list insertion the siblings have
to be displaced, and `transform` cannot do that — height is doing real layout
work, not decoration. This is the exact case Emil names (Family's drawer): *"when
items enter and exit a list, the opacity change must work well with the height
animation."*

**The 30-stop baked spring is worth cloning.** It runs off the main thread, and
it is a damped ease-out with no overshoot — so it satisfies "entering → ease-out"
while feeling more alive than a bezier. It also matches the guidance to keep
bounce out of most UI.

## Where copying it would hurt

| Before (Linear, as measured) | After (what to ship) | Why |
| --- | --- | --- |
| ~430ms of nothing, then a 300ms animation | Optimistic insert — the row appears on click | 730ms to settle. The user watches most closely at t=0 and sees nothing happen |
| `300ms` entry | `200–250ms` | 300ms is the ceiling for UI motion, not the target. A list row sits nearer a dropdown (150–250ms) than a modal |
| Star control has no press feedback | `transform: scale(0.97)` on `:active` | A pressable element must feel heard. Linear's star is a genuine gap — do not inherit it |
| Keyframed entry | CSS transition wherever possible | Keyframes restart from zero; favourite several things quickly and each restarts instead of retargeting |
| No reduced-motion path | Keep the opacity fade, drop the height growth | Reduced motion means gentler, not absent — the fade still explains what happened |

## The conclusion

**Clone the curve and the property choice. Do not clone the timing.**

The 430ms dead time is a server round-trip Linear has chosen to live with. A rail
that writes optimistically to a local store will produce a measurably better
interaction than the reference does. Matching Linear here would mean deliberately
inserting a delay, which is the wrong call.

## Caveats on this validation

- The height figures come from rAF sampling, not freeze-and-seek — the seek pass
  caught an unrelated 150ms fade twice. They describe the **shape**, not exact
  per-frame values.
- Per Emil's own advice, animations should be reviewed the next day and in slow
  motion. This was measured once, at speed. Treat the verdict as sound and the
  numbers as provisional.
