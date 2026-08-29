# "Add link to team" dialog — the full panel, and where our 16px went

Reference: `linear.app/test-48bd-dd25/team/TES/overview` → "+" →
`New link…`. DARK, Chromium (:9222), viewport **1432 x 723**.
Captured 2026-08-28 — `scratchpad/ref-addlink-hdr.mjs`.

## Panel

| property | value |
|---|---|
| box | **446, 145, 540 x 288** |
| radius | 12px |
| background | `lch(12.72 0.85 272)` |
| border | `0.5px solid lch(25.68 1.93 272)` |
| shadow | the five-layer dialog shadow (same as the command dialog) |
| padding | **0 on the panel** — an inner div carries `padding: 32px` |

**Vertical rule CONFIRMED for this dialog class**: `top = 145` and
`(vh − panelH)/3 = 145` — exact, not approximate. (The centre rule would
be 218, and the command dialog / Create-issue composer sit at a fixed 94
instead, so the rule really is per class.)

## Structure — one padded box, not header/body/footer bands

Linear builds the whole dialog as a single `padding: 32px` div. Offsets
relative to the panel's top:

| element | relY | box / type |
|---|---|---|
| title `Add link to team` | **33** | span 15px/600, `lch(100 0 272)`, height 23 |
| `URL` label group | **72** | margin-top 16px above it; group height 60 |
| `URL` label text | 77 | 13px/500, `lch(91.178 1.425 272)` |
| URL input | **100** | 479, 245, **475 x 32** — x is panel + 33 |
| `Title (optional)` label | **148** | |
| title input | **176** | |
| buttons | **224** | height 32 |
| panel bottom | 288 | → **32px of space under the buttons** |

## Where our 16px actually was — NOT the header

The task recorded the deficit as "the 16px sits in the shared
DialogHeader". Measuring ours at the same viewport disproves that:

| | reference | ours (before) |
|---|---|---|
| panel height | 288 | **272** |
| label1 / input1 / label2 / input2 / buttons | 72 / 100 / 148 / 176 / 224 | **all identical** |
| gap under the buttons | **32** | **17** |

Every body offset matched *and* the top was correct — a short header
would have shifted all of them up. The entire deficit was BELOW the
buttons: our footer inherited the primitive's `px-4 pb-4` (16px) where
the reference is 32 on both axes.

Fixed in `components/team/team-link-dialog.tsx` — that dialog was
already overriding `DialogFooter` (`className="pt-4"`), so the override
became `px-8 pt-4 pb-8`. **The shared `DialogFooter` was NOT touched**:
its 16px is what every other dialog already renders with, and fanning a
one-dialog measurement across all of them is the trap #21 hit with the
vertical-position rule.

After: panel **540 x 288 at y 145**, offsets 72 / 100 / 148 / 176 / 224
unchanged, input x 479, gap under the buttons 33 (32 + the 0.5px border).

## Not measured

- **Light theme** for every value above.
- **The title's 24px indent.** The title span sits at x 503 while its
  container is at 479 — something occupies that 24px (an icon slot?).
  Not identified; ours renders the title with a `flex items-center
  gap-2` that may or may not be the same thing.
- **The header divider question.** No `border-bottom` was found on any
  element above the first input, consistent with the single-padded-box
  structure — but that is an absence read from computed styles, which
  this session has already shown cannot prove a paint is missing. If it
  matters, take a pixel band.
- Whether other Linear dialogs sharing this shell also use 32px all
  round, or whether 32 is specific to this one.
