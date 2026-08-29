# 003-favorites-collapsed — animation contract

Captured from a live app. Reproduce this motion exactly; do not re-derive it.

- trigger: "Favorites"
- surface: sidebar-section · NaN×NaN
- sampling: 122 frames @ ~16.7ms

## Element 1 (s2640)

**Reuse this transition verbatim — do not write your own:**

```css
transition: opacity, width 0.15s ease;
```

**ANIMATE these** — the element declares a transition for them:

| property | from | to |
|---|---|---|
| `opacity` | 1 | 0 |
| `w` | 24 | 0 |

**DO NOT animate these** — they change because layout responded:

- `h` 24 → 0 _(rect (derived))_

Write them instantly, or leave them to layout. Driving one applies it on
the first frame and pre-empts the animation. Setting an upper bound
(`max-*`) or a plain `width`/`height` instantly is safe — rendered width is
`min(width, max-width)`, so a tweening `max-width` still drives it. Setting a
`min-*` floor instantly is **not**: it forces the final size immediately.

## Acceptance test

No reference filmstrip was captured for this state. Before trusting any
implementation, run `verify_animation` against the original and against your
clone, and compare the tables.

Verify with `verify_animation` (spec-crawler MCP), or:

```bash
node build-prototype.mjs --bundle <this bundle> --collapsed <id> --maximized <id>
```
