# Initiative scope check — the containerRoute prediction, tested

Tests the prediction `initiative = containerRoute("initiative", ["project"])`
made in the builder PRD (`docs/issues-tracker-prd.md` §3) from the rule in
`issues-scope-rule.md` §1. Result: **partially falsified, in an instructive way.**

Viewport 1432 × 723 CSS px, DPR 2. Workspace `test-workspace-bb`.

---

## Setup performed (writes to the workspace)

No initiative existed, so one was created — authorised by Ahmed ("any action in
Linear, it's only for testing"):

- Initiative **"PB"** at `/initiative/pb-726867a8ca01`, status Active, no
  priority/owner/date/labels.
- Existing project **"Editor — DataMiner UI Component Visualization Parity"**
  added to it via Overview → *Add a project* → *Add existing projects…*.

Leave these in place — later captures (initiative overview populated state,
timeline view) reuse them.

## Finding 1 — an initiative has NO issue list

The initiative page's tabs are **Overview · Activity · Projects**. There is no
Issues tab and no initiative-scoped issue list anywhere on the surface. An
initiative's leaf list is a list of *projects* (rendered as a timeline/gantt by
default, with Order by Name/Health/Priority/Target date/Status columns in the
Overview's embedded list).

So the PRD's predicted `containerRoute("initiative", ["project"])` — an
initiative-scoped *issue* list with `project` promoted as a child axis — does
not exist in Linear. Linear's initiative rolls up **containers, not items**.

## Finding 2 — the scope-subtraction rule does NOT apply to this list

The filter menu on the initiative's Projects tab, complete, in order:

> AI filter · Advanced filter ─ Status ▶ · Priority ▶ · Labels ▶ · Lead ▶ ·
> Members ▶ · Creator ▶ · Health ▶ · Dates ▶ ─ **Initiatives ▶** ·
> Milestones ▶ · Relations ▶ ─ Template ▶ · Title & summary ▶ ·
> Specific project ▶

**`Initiatives` is present and filterable on the initiative's own list.** And
the workspace-level `/projects/all` filter menu is **byte-identical** — same 16
entries, same order, same section breaks. The initiative route performs **zero
scope subtraction**: it reuses the generic projects-list filter wholesale.

Compare `issues-scope-rule.md` §1, where the *issue* lists subtract rigorously
(cycle route drops Cycle, project route drops Project + Initiative, My Issues
drops Assignee). The subtraction rule is a property of Linear's **issue-list
surface**, not a universal law of scoped lists.

## Finding 3 — the container chrome DOES generalise

What survives, and it is the more important half: the initiative page has the
exact chrome shape of the project page —

| | project | initiative |
|---|---|---|
| URL | `/project/{slug}-{id}/…` stable | `/initiative/{slug}-{id}/overview` stable |
| tabs | Overview · Activity · **Issues** | Overview · Activity · **Projects** |
| header | breadcrumb · favorite · actions ⋯ · notifications · add | identical anatomy |
| + Add new view | ✓ (after tabs) | ✓ (after tabs) |

Same chrome, same tab logic, same header anatomy — **the leaf-list TYPE varies
by container kind**: items for project/cycle, child containers for initiative.

## Revised model for the builder

```
containerRoute(kind, leafList, exposedChildAxes)

  version    = containerRoute("version",    items,      [])
  project    = containerRoute("project",    items,      [milestone, parentItem])
  initiative = containerRoute("initiative", containers, [])   // leaf = child containers
```

- The `filterable/groupable = allAxes − fixed − above` derivation is correct for
  **item lists** (n=4 routes measured: my-issues, team, cycle, project). Do not
  apply it to container-of-container lists; Linear doesn't.
- A containers list gets its own generic filter set (status/priority/labels/
  lead/members/creator/health/dates/…) with no subtraction.
- The chrome (stable slug-id URL, Overview·Activity·leaf tab set, header
  anatomy, saved views appended to the tab bar) generalises across ALL container
  kinds — that part of the PRD stands, strengthened.

## How it was reached

spec-crawler MCP over CDP (port 9222, `~/.spec-crawler-edge` profile):
`browser_attach` with `navigateTo` per route (direct navigation — clicking the
sidebar's collapsed-but-mounted rows is the documented trap and was hit once),
`click`/`press` for the create flow, `frontier` scoped to the open filter
dialog to enumerate items past the fold. Filter menus opened with `f` on
`/projects/all` and via the Add-filter button on the initiative Projects tab.

## Not measured

- **Grouping** on either projects list (only filtering was enumerated). The
  Display panel on projects lists is unread.
- The initiative Projects tab's **timeline view** itself (zoom, today button,
  bar anatomy) — seen, not measured.
- Whether an initiative with **multiple** projects changes the Overview's
  embedded list (only 1 project attached).
- Sub-initiatives (`parentContainerId` analogue) — not attempted; unknown
  whether this workspace's plan tier even offers them.
- The `Specific project ▶` filter's semantics — likely "id in (…)", unverified.
- Whether the initiative Projects filter list is identical on a *team's*
  projects list (`/team/TES/projects/all`) too — expected yes, unread.
