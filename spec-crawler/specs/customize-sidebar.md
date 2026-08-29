# Customize sidebar

Captured live from Linear, 1440×900, 2026-08-10. Every value is measured.

## Entry point

**Right-click any sidebar section header.** There is no button, no settings link,
and it is not in the command palette — searching "customize sidebar" there
returns "No results found". Right-click is the only route I could find.

The context menu is a `role="dialog"` wrapping a `role="listbox"`; its items are
`role="option"`, **not** `role="menuitem"`. A `[role=menuitem]` query returns
zero and reads as "there is no menu".

| | |
|---|---|
| surface | 175×122, radius **12px** |
| background | `lch(12.72 0.85 272)` |
| border | 1px `lch(21.36 1.93 272)` |
| shadow | `0 3px 8px lch(0 0 0 / 0.125), 0 2px 5px lch(0 0 0 / 0.125)` |
| padding | 0 |
| contents | a `Showing all items` label, then **Members**, **Teams**, **Customize sidebar** |

> This resolves the `Showing all items` discrepancy left open earlier. It is not
> part of the folder menu — it belongs to the **section header** context menu.
> The folder menu remains **Rename / Remove folder**, two items.

## The panel

Title **"Customize sidebar"**, 15px / weight 600, at x=505 y=115. Content column
runs x=505…935 (430px wide). Rows are laid out as a label on the left and a
right-aligned control whose right edge lands at x=922.

### Groups and rows, in order

**Personal** — group label 13px / weight 500 at x=505

| row | control at capture |
|---|---|
| My issues | Always show |
| Inbox | Always show |
| Reviews | Always show |
| Agent | Always show |
| Drafts | Show when badged |

**Workspace**

| row | control at capture |
|---|---|
| Views | Always show |
| Initiatives | Always show |
| Projects | Always show |
| Members | Don't show |
| Teams | Don't show |

Above both groups sits a standalone **Default badge style** row (label at x=518,
y=179) whose control offers **1 Count** / **Dot**.

### Metrics

| | |
|---|---|
| row pitch | **36px** (270 → 306 → 342 → 378 → 414) |
| row label | 13px / weight 500, x=552 |
| group label → first row | 34px |
| last row → next group label | 57px |
| control height | 30px |

## The combobox

Closed, it is text plus a chevron with no visible chrome — it only reads as a
control on hover.

| | |
|---|---|
| height | 30px, radius **8px** |
| background | transparent |
| padding | `1px 28px 1px 10px` — the 28px right side is the chevron's room |
| font | 13px, `lch(91.178 1.425 272)` |
| width | **shrinks to its label**: 120px "Always show", 109px "Don't show", 162px "Show when badged" |

The width tracking the label is why the column is right-aligned rather than a
fixed control column — the left edges of these controls do not line up, and are
not meant to.

## The dropdown

| | |
|---|---|
| surface | radius **12px**, width = trigger width + ~9px |
| background | `lch(12.72 0.85 272)` |
| border | 1px `lch(23.52 1.93 272)` |
| shadow | `0 3px 8px lch(0 0 0 / 0.125), 0 2px 5px lch(0 0 0 / 0.125)` |
| padding | 0 |
| option | 32px tall, padding `0 35px 0 12px`, 13px |
| selection | `aria-selected="true"`; the 35px right padding is the checkmark's room |

It opens **over** the trigger, aligned so the selected option sits on the
trigger's own line — for `My issues` the trigger is at y=285 and the surface
opens at y=264, putting "Always show" (selected) exactly on the trigger.

### The option set is row-dependent — this is the detail worth getting right

| rows | options |
|---|---|
| can carry a badge (e.g. **Drafts**) | Always show · **Show when badged** · Don't show — 3 rows, surface 171×106 |
| cannot (e.g. **My issues**) | Always show · Don't show — 2 rows, surface 129×74 |

Offering "Show when badged" on a row that can never be badged gives the user a
setting that does nothing. The option list has to be derived from whether the
row has a badge source, not hard-coded per menu.

---

# Proposal for protocolbase

## Current state (measured)

There is **no** customize-sidebar surface. Right-clicking the sidebar — on
`Favorites`, on `Pages`, on empty space — produces nothing. The only related
affordances anywhere are `Settings` and `Resize sidebar`.

So this is net-new, not a fidelity fix.

## What maps directly

The app's sidebar already has the two things this feature needs:

1. **Fixed nav rows** — `Canvas`, `Agent`, `Settings`, `Branches & changes`.
   These are the analogue of Linear's *Personal* group and are exactly what
   per-row visibility is for.
2. **Rows that already carry counts** — `Pages 2`, `All params 12`. That makes
   the **Default badge style** row (Count / Dot) meaningful on day one rather
   than a copied control with nothing behind it.

## Recommended shape

**Entry point.** Match Linear: right-click a section header. But the app has no
section context menu at all yet, so that menu is a prerequisite — and once it
exists, it is also where `Showing all items` and any section-level toggles
belong. Do not hang this off the existing `Settings` route; it is sidebar
chrome, not app settings, and Linear deliberately keeps it out of settings.

**Groups.** Two, mirroring the structure rather than the labels:

- *Workspace* — Canvas, Agent, Branches & changes, Settings
- *Content* — Pages, Favorites

**Per-row options.** Derive the set, do not hard-code it:

- row has a badge source → Always show · Show when badged · Don't show
- row has none → Always show · Don't show

On current data that means `Pages` gets three and `Canvas` gets two.

**Badge style.** One `Default badge style` row above the groups, Count / Dot,
applying to every badged row. The app already renders counts, so `Dot` is the
only new rendering path.

**What NOT to copy.** Linear's combobox has no resting chrome — transparent
background, no border, chevron only. That works because its settings surfaces
are dense and uniformly styled. Check it against the app's existing control
styling before adopting it; a borderless combobox dropped next to bordered
inputs reads as broken rather than clean. The 8px radius, 30px height, 13px
type and 32px option rows are safe to take regardless.

**Open question for Ahmed.** Linear scopes this to workspace nav only —
favourites and folders are not listed as rows. Whether protocolbase wants
`Favorites` itself to be hideable is a product call, not something the capture
answers.
