# Linear — document subscribers control (bell + popover)

Captured 2026-08-24 over CDP on
`linear.app/test-workspace-bb/document/resolved-comments-probe-…`,
BOTH states reached by unsubscribing through the popover's own row.

## The finding that matters

**The bell icon does not change with subscription state.** The svg
innerHTML (one outline-bell path, 3 subpaths) and computed fill
(`lch(39.176 1.25 282)`) are byte-identical subscribed and
unsubscribed; only `aria-label` flips `Unsubscribe` ↔ `Subscribe`.
State is carried by the label/tooltip and the popover's checked row.

## Popover anatomy (dialog 179×139 @ bell-anchored, radius 12)

- Visually-hidden command input; kbd chips **⌘ ⇧ S** in the header form.
- Listbox, 6px top/bottom padding.
- Row 178×32: `[14×14 radius-3 checkbox (12×12 input; 10×9 check glyph
  only when subscribed)] [16×16 avatar] [name 13px]`, inner row
  radius 8 on hover.
- `role=group` header **"Other users"** (178×30) between YOUR row and
  the rest (reference showed agent subscribers there).

## Shortcuts

| chord | action | bound in ours |
|---|---|---|
| ⌘⇧S | toggle own subscription | ✓ |

## Not measured

- Exact colors of the checkbox fill/check (built on our primary token).
- The popover with MANY subscribers (overflow behaviour).
- Whether clicking a colleague's row does anything for admins (ours
  disables non-self rows).
- Light theme.
