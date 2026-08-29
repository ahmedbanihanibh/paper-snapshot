# Linear — comment surface, DARK (anchor rule · card at rest · reaction picker)

Captured 2026-08-29, `linear.app/test-48bd-dd25`, document
`example-document-copy-be593f056408`, **dark**
(`prefers-color-scheme: dark`, root ground `lch(2.595 0.4 272)`), Edge 151
on :9222.

Serves board #189 / #190 / #191 / #196, and settles #164 in passing. The
2026-08-24 `linear-resolved-comments.md` covers the same surface in LIGHT on a
different workspace; this is the dark half plus the anchor rule, which that
capture never asked about.

## HOW TO DRIVE IT — the trap that cost three probes

**A caret inside `.ProseMirror` is NOT focus.** Clicking a paragraph places a
caret and reports `inEditor: true`, while `document.activeElement` is something
else entirely — so every subsequent key event goes to the wrong element,
`Shift+End` leaves the selection collapsed, and the selection toolbar never
appears. That reads exactly like "Linear has no selection toolbar".

The working sequence:

```js
click(paragraph)                                   // caret only
if (!pm.contains(document.activeElement)) pm.focus()   // ← the fix
for (i < 8) key("ArrowRight", shift)               // extend the selection
```

A synthetic double-click also produces a real DOM selection
(`sel.toString()` non-empty, `isCollapsed: false`) that Linear does **not**
react to — same family as the native-drag trap: CDP emits mouse events, the app
wants something else. Keyboard extension after an explicit focus works.

## 1 · Selection toolbar — 14 items (settles #164)

`Regular text · Bold · Italic · Strikethrough · Underline · Link · Quote ·
Collapse · Inline code · Code block · List · Create issue from selection ·
Ask agent · Comment`

The `Comment` button's aria-label is **exactly** `Comment` — a `/comment/i`
match grabs the header's `Show resolved comments` and opens the panel instead.

## 2 · THE ANCHOR RULE — cards sit at their anchor's level

Ahmed: *"the comment must be register in same level of where it was posted not
like what you propose always start on top"* / *"in same level like of the
registering element surface"*.

| | anchor rect | card rect |
|---|---|---|
| `pb189 probe thread` | `[278, 715, 68, 22]` | `[1091, 716, 283, 78]` |
| `pb196 second anchor` *(did not persist — see below)* | higher in the document | `[1085, 370, 283, 78]` |

**The card's top tracks its anchor's top** — 716 against 715. Cards do NOT stack
at the top of the gutter.

> **HOW STRONG THIS IS, honestly.** Only the FIRST thread persisted. A later
> sweep at six scroll positions found exactly **1 highlighted anchor and 1 card
> every time** (`scratchpad/rc-virtualized.mjs`), so the second and third
> threads I created were optimistic UI that rolled back — the comment composer
> almost certainly never received the typed text, the same focus problem that
> cost three probes earlier, and `Cmd+Enter` posted an empty comment.
>
> So the rule rests on **one confirmed pair (716 vs 715)** plus **one transient
> observation** — the rolled-back card was still rendered at 370, beside its own
> anchor rather than at the top of the gutter, which is real evidence about
> placement but not durable evidence.
>
> One confirmed sample is exactly the trap that produced two wrong conclusions
> on #192 today. The direction is not in doubt (a card 1px from its anchor while
> the gutter's top is hundreds of px away cannot be "stacks at the top"), but
> **the offset constant and the multi-card behaviour are NOT established.**

Live card is **283 x 78**, inside a `300 x 120` wrapper.

**The commented range is highlighted** in the document:
`background: lch(21.633 23.767 83.803)` — an amber wash in dark. This is
Ahmed's *"its likely highlight the lement that has comment"*.

## 2b · Cards scroll IN THE DOCUMENT FLOW — no clamping

25 samples, `scrollTop` 0 → 960 in 40px steps (`scratchpad/rc-scroll-track.mjs`):

```
cols=[scrollTop, anchorTop, cardTop, delta, opacity]
[  0, 369.5, 715.6, 346.1, 1]
[400, -30.5, 315.6, 346.1, 1]
[960,-590.5,-244.4, 346.1, 1]
delta min == max == 346.1
```

The delta never varies, so the card is NOT `position: fixed`, does not re-layout
on scroll settle, and is not animated into place — it simply scrolls with the
document. When the anchor leaves the viewport the card leaves with it
(`anchorAboveViewport: true`, `cardStillVisible: false`): **no clamping to a
viewport edge, no "pinned" behaviour.**

> **Probe flaw, stated because it changes what this proves.** The `anchorOf()`
> helper ignored its text argument and returned the FIRST highlighted element,
> so this run paired the `pb189` card with the OTHER thread's anchor — which is
> why the delta is 346.1 rather than ~1. A constant delta between any two
> elements in one scroller is trivially true, so this measurement establishes
> *scrolls in document flow*, and nothing about which anchor the card follows.
> The anchor pairing comes from §2's two-card measurement (716 vs 715, and 370),
> which used per-thread lookups.

## 2c · Cards STACK FLUSH — they never overlap

Two threads created with the assertion-based helper
(`scratchpad/rc-thread-lib.mjs`), both confirmed persisted by their document
highlight rather than by an optimistic card:

```
card A  [1091, 271, 283, 78]     anchor "dededede"  top 270   → delta 1
card B  [1091, 349, 283, 78]
cardGap = 349 - (271 + 78) = 0   cardsOverlap = false
```

- **A second clean confirmation of the anchor rule**: card A's top is 1px from
  its anchor's top. With the earlier 716-vs-715 pair, the rule now has two
  independent confirmations rather than one.
- **Cards never overlap.** Card B begins at exactly the pixel where card A ends
  — gap 0, not a negative overlap and not a gap. So when placement would
  collide, the lower card is pushed to sit FLUSH beneath the one above.

> **Detector caveat, because it limits what the above proves.** My anchor finder
> is "a leaf element with a non-transparent background", which also matches code
> spans and some headings — the run detected only two marks, 764px apart, on a
> document that should have had two comment anchors much closer together. So
> `delta 1` for card A is trustworthy (its mark text matched the block it was
> created on), while card B's relationship to ITS anchor is unresolved: B may
> have been pushed up to stack, or its mark may simply not have been detected.
>
> Three separate probes in this surface have now produced a wrong number by
> joining cards to anchors BY INDEX after sorting. The join key must be the
> anchor text, and the detector must identify comment marks specifically —
> by mark class or attribute, not by "has a background".

## 2d · The card LIFTS ON FOCUS — never on hover (#198)

Ahmed: *"why it change its card bg color when group hover over it that is nto
like 1:1 like linear"*. He is right, and the mechanism is more specific than
"no hover state":

| | resting | ACTIVE / focused |
|---|---|---|
| background | `lch(9.232 0.85 272)` | `lch(12.945 1.3 272)` |
| border (0.5px) | `lch(16.793 1.93 272)` | `lch(20.505 2.38 272)` |
| box-shadow | `lch(0 0 0 / .3) 0 0.5px 1px 1px` | `lch(0 0 0 / .125) 0 3px 8px 0, 0 2px 5px 0, 0 1px 1px 0` |
| margin-left | `0px` | **`-6px`** — the card slides 6px LEFT |
| x | 1091 | 1085 |

radius `10px` in both. And the card declares exactly the transition those four
need:

```
transition: margin-left, background-color, box-shadow, opacity 0.2s
```

**HOVER CHANGES NOTHING.** Measured with the pointer parked at (30,700) and
then on the card body, in the genuine resting state: background, border,
shadow and transform identical.

So the "lifted" treatment is real — it just belongs to the ACTIVE thread, not
to whatever the pointer happens to be over. Ours fires it on `group-hover`,
which is the drift Ahmed reported.

> **THIS ALMOST WENT IN AS A SECOND INVENTION.** My first two readings both
> showed the lifted values and I nearly recorded them as "the resting card",
> concluding only that hover does nothing. They were lifted because the thread
> had JUST BEEN CREATED and was therefore active — the state I was measuring
> was one I had caused. Clicking away is what exposed the real resting ground.
> The tell was in the data the whole time: `margin-left: -6px` on a card
> supposedly at rest, and a declared transition naming four properties that
> nothing appeared to change.
>
> Rule: when a measurement shows a transition declared for properties you have
> observed to be constant, you have not found the state that moves them.

## 2e · What CLEARS the focused thread (#200)

Measured 2026-08-29. The card lifts on a click; the question is what puts it
back. Four targets, each trial preceded by a **page reload**, because focus
lives in page state and a leftover focus makes every later reading ambiguous:

| click target | result | ml |
|---|---|---|
| the CARD | focuses | 0px -> -6px |
| the MARK (the highlighted text) | focuses | 0px -> -6px |
| elsewhere INSIDE the editor | **CLEARS** | -6px -> 0px |
| outside the editor (page chrome, the gutter's empty space) | unchanged | -6px |

**Focus is EXCLUSIVE.** With two live threads, clicking either card focuses it
and returns the other to rest — three transitions, both directions
(`lin-two-threads2.mjs`). There is never more than one active thread, which is
why one `focusedAnchorId` (not a set) is the right shape.

So the rule is *in-editor*, not *outside-the-card*: putting a caret in the
document means you are editing and no thread is the subject any more, while
clicking inert chrome decides nothing. Marks are the exception inside the
editor — they name a thread, so they focus it (and must NOT re-scroll, since
the text is already under the pointer).

> **This took four probe runs to see, and three of them were wrong in the same
> way: they never reloaded.** Each trial inherited whatever state its
> predecessor left, so the same gutter click "cleared" in one run and "stayed"
> in the next, and I twice wrote down a rule that was the exact inverse of the
> truth. A state machine cannot be probed from a state you did not set.
>
> A second, quieter error rode along with it: the selector picked elements by
> `transition-property: margin-left`, which matched a **document-body wrapper**
> carrying `data-table-overhang-boundary`. Its margin animates for layout
> reasons that have nothing to do with comments. Identity (`.InlineCommentThread`
> and its nearest painted ancestor) is the join; a CSS property is not.

## 5 · The RESOLVED card and its panel (#189) — both themes

Reached by resolving a thread on a throwaway document and opening
`Show resolved comments`. This was the state previously recorded as unreachable.

**The resolved card is NOT a dimmed live card — it is a different card.**
`opacity: 1` in both themes; every difference is a real value:

| | live card | RESOLVED card |
|---|---|---|
| rect | `[1091, y, 284, 120]` | `[1068, 144, **336**, 125]` |
| radius | `10px` | **`8px`** |
| bg (dark) | `lch(9.232 0.85 272)` | **`lch(16.432 1.3 272)`** — LIGHTER than live |
| border (dark) | `lch(16.793 1.93 272)` | `lch(23.992 2.38 272)` |
| bg (light) | `lch(100 0 282)` | `lch(100 0 282)` |
| border (light) | `lch(91.9 0 282)` | `lch(91.9 0 282)` |
| content | author + body | **the anchored QUOTE, then author + body** |

So in DARK the resolved card sits on a lighter plate than a live one, while in
LIGHT the two share a fill and are told apart by width, radius and the quote.
A build that renders "the live card at reduced opacity" is wrong in both.

**The panel around it**

| | dark | light |
|---|---|---|
| heading "Resolved comments" | `[1068, 105, 116, 15]`, 12px/500, `lch(64.714 1.425 272)` | same rect, `lch(40 1 282)` |
| toggle button | `[1384, 61, 28, 28]`, radius `9999px`, bg `lch(10.149 0.689 272)`, fg `lch(90.451 1.2 272)`, 12px/500, padding `0 2px` | bg `lch(99.997 0.5 282)`, fg `lch(19.588 1.25 282)` |

The toggle's label is stateful: `Show resolved comments` / `Hide resolved
comments`.

> **How to switch Linear's theme, because two documented methods do NOT work.**
> `Emulation.setEmulatedMedia({prefers-color-scheme: dark})` is ignored, and so
> is writing `localStorage.darkMode`. Linear stores an EXPLICIT interface theme
> and it wins over both. The only switch that works is its own command palette:
> Cmd+K → type `theme` → rows are `Dark`, `Light`, `Pure Light`, `Magic Blue`,
> `Classic Dark`, `System preference`. Verify by reading a card's `bg`, not the
> body's — `document.body` is transparent, so it reports `rgba(0, 0, 0, 0)` in
> every theme and cannot tell you anything.
>
> The workspace was found in LIGHT at the start of this capture and has been
> set back to **Dark**, confirmed by the live card reading
> `lch(9.232 0.85 272)` again.

## 3 · Card controls are present AT REST (#190)

Read with the pointer parked at `(30, 700)`, far from the card:

| control | rect | opacity | visibility |
|---|---|---|---|
| `Resolve thread` | `[1273, 342, 28, 28]` | 1 | visible |
| `Add reaction` | `[1301, 342, 28, 28]` | 1 | visible |
| `Comment options` | `[1329, 342, 28, 28]` | 1 | visible |

All three, `28 x 28`, at rest. **Not hover-revealed.** Matches the light capture
from 2026-08-24, so this holds across both themes. Ours gating them behind
`group-hover` is the drift.

## 4 · Reaction picker (#191)

```
panel   273 x 321  @ (1062, 56)
        radius 8px · bg lch(20.145 1.75 272)
        border 0.5px solid lch(33.105 2.83 272)
        shadow  lch(0 0 0 / .125) 0 3px 8px 0,
                lch(0 0 0 / .125) 0 2px 5px 0,
                lch(0 0 0 / .125) 0 1px 1px 0
├ search 262 x 28 @ (1068, 61) · radius 8px · bg = panel ground
│        placeholder "Search emoji…"  · FOCUSED ON OPEN
└ grid   272 x 283 scroller · scrollHeight 6168  ← the full set, virtualised
         emoji cell 28 x 28 · 96 rendered at a time
         first section label "Frequently used"
```

Frequently-used row: 👍 👌 🙏 😂 ❤️ 👀 ✅ 🙂 😃 😄 😀 🤔

`scrollHeight 6168` against `clientHeight 283` is ~22 viewports of content —
this is the whole emoji set, not a curated row. Ours ships a fixed 6-emoji row
with no search, which is the gap Ahmed reported.

## Not measured

- **Whether a DISPLACED card still relates to its anchor.** With two threads
  live, card A sat at its anchor (271 vs 270) while card B sat at 349 — flush
  under A — and the only other highlight I could detect was at 1034. Either B
  was pushed far from its anchor, or my anchor detector missed B's mark. See the
  detector caveat in §2c; this needs a reliable anchor detector before it can be
  answered.
- Resolved thread in DARK — panel and card (the subject of #189).
- Per-node coverage, overlapping/per-character ranges, light-theme highlight
  token — as listed by Ahmed.
- **Resolved thread in dark** — panel and card. The light capture says a
  resolved thread leaves the gutter entirely; unconfirmed in dark.
- **Per-node coverage**: a comment on each tiptap node type (headings, list
  items, todo, quote, inline code, code block, diagram, image, table cell,
  collapsible heading collapsed and expanded). Some may refuse a comment; that
  is itself a finding.
- **Overlapping / per-character ranges**: how the highlight paints where two
  threads intersect, which card a click on the overlap opens, and what happens
  to the highlight when one of the two is resolved.
- Search behaviour once typed into (result count, no-match state, keyboard
  navigation).
- The picker's light theme.

## Also established

**The comment gutter is NOT virtualised.** At scroll positions 0 / 400 / 800 /
1200 / 1800 / 2600 the card was rendered every time, including when its anchor
was far outside the viewport. So a card missing from a query is a card that does
not exist — not one that was scrolled out of the render window. That is what
exposed the two non-persisted threads above.

## Cleanup — done, with one remainder

The probe thread was deleted via the live card's `Comment options` -> `Delete`
-> confirm. Verified afterwards: **`marks: []`, `gutterCards: 0`, blocks still
82** — the highlight is gone from the document text, which is the ground truth
(a card can re-render; an anchor cannot).

REMAINDER: the string `pb196 adjacent overlap` still appears in two leaf nodes
at roughly `x 209-293, y 322-417` — the SIDEBAR region, not the document and not
the gutter. That is an unposted composer draft chip, left by the third
thread-creation attempt that never persisted. Harmless in a disposable test
workspace, but it is mine and it is still there.

## The LIVE card's ⋯ menu (partial)

Captured while deleting. Rows seen, bottom of the list:
`Copy link to comment` · `Copy content as Markdown` · `New issue from comment…`
· `Delete`

Row x is 1233 with 32px pitch (523 / 555 / 599 / 643 — note the 44px gaps around
`New issue from comment…`, so there are separators). The rows ABOVE these were
not captured. The 2026-08-24 spec has the RESOLVED card's full 7-row menu; the
LIVE card's is still incomplete.

**Probe note**: the trigger TOGGLES. A run that left the menu open, followed by
a run that clicked the trigger again, closed it — and the "no menu container"
result read as a missing menu. Probe for the menu before clicking, exactly as
with the `Edited` pill.
