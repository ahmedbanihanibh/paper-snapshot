# 001-composer-collapse — animation contract

Captured from a live app. Reproduce this motion exactly; do not re-derive it.

- trigger: "Collapse"
- surface: dialog · 750×262
- sampling: 152 frames @ ~16.5ms

## Element 1 (s2774)

**Reuse this transition verbatim — do not write your own:**

```css
transition: padding 0.3s cubic-bezier(0.43, 0.07, 0.59, 0.94);
```

**ANIMATE these** — the element declares a transition for them:

| property | from | to |
|---|---|---|
| `padding-bottom` | 54 | 117 |
| `padding-top` | 54 | 117 |

## Element 2 (s2776)

**Reuse this transition verbatim — do not write your own:**

```css
transition: max-width 0.3s cubic-bezier(0.43, 0.07, 0.59, 0.94);
```

**ANIMATE these** — the element declares a transition for them:

| property | from | to |
|---|---|---|
| `max-width` | 820 | 750 |

**DO NOT animate these** — they change because layout responded:

- `w` 820 → 750 _(rect (derived))_
- `h` 792 → 262.2 _(rect (derived))_

Write them instantly, or leave them to layout. Driving one applies it on
the first frame and pre-empts the animation. Setting an upper bound
(`max-*`) or a plain `width`/`height` instantly is safe — rendered width is
`min(width, max-width)`, so a tweening `max-width` still drives it. Setting a
`min-*` floor instantly is **not**: it forces the final size immediately.

## Element 3 (s2778)

**Reuse this transition verbatim — do not write your own:**

```css
transition: min-height 0.3s cubic-bezier(0.43, 0.07, 0.59, 0.94);
```

**ANIMATE these** — the element declares a transition for them:

| property | from | to |
|---|---|---|
| `min-height` | 792 | 0 |

**DO NOT animate these** — they change because layout responded:

- `w` 818 → 748 _(rect (derived))_
- `h` 792 → 260.2 _(rect (derived))_

Write them instantly, or leave them to layout. Driving one applies it on
the first frame and pre-empts the animation. Setting an upper bound
(`max-*`) or a plain `width`/`height` instantly is safe — rendered width is
`min(width, max-width)`, so a tweening `max-width` still drives it. Setting a
`min-*` floor instantly is **not**: it forces the final size immediately.

## Element 4 (s2794)

**Reuse this transition verbatim — do not write your own:**

```css
transition: border, background-color, color, opacity 0.15s ease;
```

**ANIMATE these** — the element declares a transition for them:

| property | from | to |
|---|---|---|
| `color` | 1 | 91.2 |

## Acceptance test

The original was filmstripped at fixed progress points. Your implementation
must reproduce this table. Property-level checks are not sufficient — they
pass while a landmark sits still for half the animation and then jumps.

| progress | size | footer from bottom |
|---|---|---|
| 0% | 820×792 | 11 |
| 15% | 816×746 | 13 |
| 30% | 806×635 | 13 |
| 50% | 786×405 | 13 |
| 70% | 765×262 | 13 |
| 85% | 754×262 | 13 |
| 100% | 750×262 | 13 |

A landmark holding a constant offset throughout is what correct looks like.
One that holds still and then lurches means a property is being applied
instantly instead of animated.

Verify with `verify_animation` (spec-crawler MCP), or:

```bash
node build-prototype.mjs --bundle <this bundle> --collapsed <id> --maximized <id>
```
