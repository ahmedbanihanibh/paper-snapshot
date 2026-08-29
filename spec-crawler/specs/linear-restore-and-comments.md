# Restore-a-version × comments (#199)

Ahmed: *"make sure to test what will happesn when restore versions waht happesn
with resolved comment threads and comemntsm and when return back how that
resolved ?"*

Measured 2026-08-29. The reference work was done on a **throwaway document**
(`test-2-org-ahead/document/restore-probe-throwaway-1481bc46607f`), created for
this, NOT on the reference document — restoring a version is the one operation
this session has previously been unable to undo without a human (#147).

## 1 · RESOLVE semantics — measured on BOTH, and they agree

This is the half that is fully settled.

| | reference | ours |
|---|---|---|
| marks in the document | 2 → **2** | 5 → **5** |
| cards in the gutter | 2 → **1** | 2 → **1** |

**Resolving keeps the highlight in the text and removes the card from the
gutter.** The thread moves to the resolved panel; the marked range stays marked.
Ours matches this exactly, by the same rule
(`document-comments.tsx`: `live.filter(t => !threadResolved(t.comments))`).

Entry path, reference: select ~12 chars → selection toolbar's `Comment`
(measured at `[696, 183, 26, 26]`) → type → Enter. Twice, on two paragraphs.
Then the `Resolve thread` control on a card.

> Probe note: the resolve click hit the FIRST matching control in DOM order,
> which belongs to the first card — not the card the pointer was over. Naming a
> button by `aria-label` alone picks a button, not *that row's* button. Ours was
> then driven correctly by scoping the query INSIDE the target card.

## 2 · RESTORE — NOT MEASURED, and exactly why

Neither side reached a restore, for two different and both mechanical reasons.

**Reference:** the throwaway document has only **one** version, and the
snapshot cadence is now bounded: two edits were made at ~02:41, and re-checking
the history surface at 02:47 and again at **03:02 — 21 minutes later, across
several navigations away from the document and back — still showed exactly one
version row (`2:41 AM`) with `Restore version` disabled.** So Linear's second
version is not produced by leaving the document, and not within ~20 minutes of
the edit; whatever triggers it is slower than one session of probing. Its history
surface shows a single row (`Aug 29, 2026 2:39 AM · Current`) whose restore
control is `disabled`, `pointer-events: none`, `opacity 0.6`, rect
`[549, 558, 106, 24]`. Linear snapshots a new version only after an idle period
following edits; two edits were made (`EDITED-AFTER-COMMENTS`, `SECOND-EDIT`) to
provoke one, and the second version had not appeared within the session. A
restore needs ≥2 versions, so there was nothing to restore *to*.

**Ours:** the drive could not reach the history dialog. `?history=1` is read in
a lazy `useState` initializer at mount, so a client-side navigate cannot deliver
it, and a hard reload on that URL is canonicalized back before mount. Driving
the ⋯ menu instead put the KeepAlive shell into a state where the document
route's container was no longer the displayed one (the visible controls were
other pages' — `grid`, `list`, `Show: Active`), so `.ProseMirror` count went to
0 and stayed there across a cache-ignoring reload. No JS exception; two
`ERR_CONNECTION_REFUSED` in the log are the parked sync relay, unrelated.

## 3 · What the code says WILL happen (a prediction, not a measurement)

Recorded so the eventual measurement has something to falsify:

Comments are `workComments` rows keyed by `anchorId`; the marks live in the
document CONTENT. Restore replaces content. So:

- restoring to a version whose content still contains the mark → the card
  returns;
- restoring to a version from BEFORE the comment → the mark is gone, the
  comment ROWS survive, and the gutter hides the thread because it filters by
  `liveAnchors = anchorIdsInContent(row.content)`;
- restoring forward again → the mark returns and the card comes back;
- **resolved-ness is stored on the comment rows, not in the content, so a
  restore should not change it in either direction.**

The docblock in `document-page.tsx` already states the intent: *"Threads
outlive their anchors on purpose (that is what makes restore bring a
conversation back)"*. That is the design; none of it is verified yet.

## Not measured

- Any restore, on either side (see §2 for the two blockers).
- Whether the resolved PANEL keeps a thread whose anchor left the content —
  the gutter is filtered by `liveAnchors`; the panel's filter was not read.
- Whether Linear's second version ever appears, and after how long.
- The disabled restore control's label: its `textContent` reads "This is the
  current version, you cannot restore it", but whether that string is ever
  VISIBLE is unknown — the control is `pointer-events: none`, so no hover can
  open a tooltip on it. (Our `document-history-dialog.tsx` docblock asserts
  Linear "does not have one either"; the STRING clearly exists, so that
  sentence is wrong even though the conclusion it supports — that a tooltip
  there is unreachable — still holds.)
