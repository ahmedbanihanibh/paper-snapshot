# Team resources — the right-click menus, one per row KIND

Reference: `linear.app/test-48bd-dd25/team/TES/overview`, DARK theme,
Chromium (:9222). Captured 2026-08-28 by raw CDP —
`scratchpad/ref-ctx2.mjs`, `ref-link.mjs`, `ref-mklink.mjs`,
`ref-rmlink4.mjs`.

Three kinds of row live under the heading, and each has its OWN menu.
All three use the shared menu anatomy (32px rows, 6px list padding,
inset plate radius 8, separator = 0.5px full-bleed in a 12.5px block —
see `linear-team-resources-add-popover.md`).

## 1. SECTION header — 174 x 152

```
Add resources        ▶
Copy link
Rename…
──────────────────────   (separator)
Delete
```

Same four rows as the section's own ⋯ dropdown, in the same order —
they are one list rendered from two triggers, not two lists.

**Measured variance worth keeping:** the last row read `Delete…` on two
sections and `Delete` on three others in the same capture. The ellipsis
tracks whether the section HAS CHILDREN (a populated section confirms
before deleting; an empty one does not). This was read off the labels,
not confirmed by opening both — see Not measured.

## 2. EXTERNAL LINK row — 174 x 140, NO separator

```
Copy link
Unpin
Edit
Delete
```

Four rows, 32px each: 6 + 4x32 + 6 = 140. Exactly.

**`Unpin` is the row-removing action, not `Delete`.** Measured
2026-08-28 by driving both on the same row, each after a fresh reload,
with the menu-closed check proving the click registered:

| row clicked | menu closed | row still present |
|---|---|---|
| `Delete` | yes | **YES** |
| `Unpin`  | yes | no — removed |

So a link resource's "get this off the overview" verb is Unpin.
Whatever `Delete` targets, it is not the pin.

## 3. PINNED DOCUMENT row — 202 x 292, two separators

```
Unpin from overview
Duplicate
Rename…                ⇧R
Favorite               ⌥F
──────────────────────
Copy                   ▶
Remind me         ⇧H   ▶
Show document history
──────────────────────
Delete
```

Eight rows. This is Linear's shared DOCUMENT menu — the same identity
the Documents table row carries. Ours already renders it via
`DocumentContextMenuItems` (`team-resources-section.tsx`, PinnedDocumentRow).

## Ours, before this task

Only the pinned-document row has a `ContextMenu`. The section header and
the link row have none — right-click falls through to the browser's own
menu. That is #32.

## Producing the states

The reference workspace had NO external-link row, so one was created to
measure kind 2: "+" -> `New link…` -> the dialog's first field
(`placeholder="https://…"`, autofocused, 475 wide) -> `Add link`.
**Linear auto-titles the row from the URL** — `https://example.com/pb-probe`
became a row named "Example" with the second (title) field left empty.
The probe row was removed again via its own `Unpin`.

## Not measured

- **Light theme.** Every value here is dark-only.
- **`Delete` vs `Delete…` on section headers**: inferred from labels in
  one capture. Not confirmed by opening a populated and an empty section
  side by side, and the confirm dialog behind `Delete…` was never opened.
- **What `Delete` does on a LINK row.** Proven NOT to remove the row.
  Whether it deletes a shared link entity, needs a confirm that did not
  appear, or silently failed is unknown.
- **Undo.** No toast appeared within 3s of the successful `Unpin`, and
  nothing matched a toast selector. Whether Linear offers undo for this
  removal is unverified — do NOT copy "no undo" from this.
- **Hover wash inside these menus.** With the pointer parked on a row,
  `data-highlighted` read `"false"` and the background stayed
  transparent, yet the click activated. Either Linear highlights via a
  mechanism these attributes do not expose, or a CDP pointer does not
  satisfy its hover condition. Unresolved; the row plate for OUR menus
  comes from the shared anatomy, not from this.
- **Chords on the section and link menus.** None rendered a `<kbd>`; the
  document menu rendered ⇧R / ⌥F / ⇧H. Whether the other two have
  unprinted bindings was not swept.
