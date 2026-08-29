# The "Recently deleted" archive (#206)

Captured 2026-08-29, dark. Scripts: `scratchpad/lin-206.mjs` (empty view + tab
strip), `lin-206d/e/f/g.mjs` (populated row, hover, row menu).

## 1 · It is ONE route family with a SEVEN-tab strip

`/{workspace}/team/{TEAM_KEY}/archive/{view}` — tabs at `y=60`, height `28`:

| tab | href suffix |
|---|---|
| Issues | `/archive/issues` |
| Projects | `/archive/projects` |
| Cycles | `/archive/cycles` |
| Recently deleted issues | `/archive/recently-deleted` |
| Recently deleted projects | `/archive/recently-deleted-projects` |
| Recently deleted initiatives | `/archive/recently-deleted-initiatives` |
| Recently deleted documents | `/archive/recently-deleted-documents` |

**ARCHIVED and RECENTLY DELETED are two different concepts sharing one route
family.** Issues/Projects/Cycles are archived; the four `recently-deleted-*`
views are the 30-day soft-delete bin. Do not collapse them — a build that
treats "archive" as one list gets the vocabulary wrong on day one.

Naming quirk worth copying or deliberately not copying: recently-deleted
ISSUES is the bare `/recently-deleted`; the other three carry their noun. That
is the shape of a feature that shipped for issues first.

Tab labels `12px/500`. Active `lch(100 0 272)`, inactive
`lch(61.803 1.2 272)` — colour is the only active marker measured.

Document title: `Test 48bd_dd25 › Recently deleted documents`.

## 2 · Row anatomy

| | value |
|---|---|
| title text | `[267, 112, 183, 16]` · `16px/400` · `lch(100 0 272)` |
| row container | `[267, 112, 1101, 16]` — a flex row spanning the content width |
| hover control | `Open menu`, `32 × 32`, at `x = 1374` (far right) |

Empty state: **"No matching documents"**.

## 3 · The row menu IS the deleted-document menu

Opening a row's `Open menu` gives exactly the two rows the deleted document's
own ⋯ gives — `Copy ▶` and `Restore document` (chord `#`), rows `184 × 32`.

That is the architectural finding: **the deleted-entity action set is one
thing**, presented in two places. Build it once and mount it from both, which
is also what makes the same list work for issues and projects later.

## 4 · What this implies for our build

- one route family, one list surface, an entity ADAPTER per kind — not three
  copies (Ahmed: "would ship this recently deleted job layer for ALL the
  issues, projects, documents");
- the 30-day retention is already user-visible at the delete confirm
  (`specs/linear-deleted-document.md` §1), so the number is a product fact,
  not an implementation detail;
- restore is reachable from BOTH the archived item's own surface and its row
  in the list.

## Not measured

- Light theme for every value above.
- Row HOVER wash (I captured the revealed control, not the row's own plate).
- Whether the list paginates, and its sort order (only one row existed).
- Bulk selection / multi-restore — no affordance was visible with one row.
- What the deleted-at / "deleted N days ago" column shows; the populated row
  exposed only a title in my probe.
- The other three `recently-deleted-*` views; only DOCUMENTS was opened.
