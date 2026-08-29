
### 2026-08-27 — collapsible sections do NOT nest, and swallow lower headings

Making the `h1` collapsible took the document from **37 blocks to 22** —
16 absorbed, straight through the `h2` nine blocks below it, to the end.

- `nestedSections: 0`. The inner `h2` stays a plain `H2.heading-node`
  child of the section body. `collapsible-section` does not recurse on
  its own; nesting exists only if the user makes the inner heading
  collapsible too.
- A lower-level heading does NOT end the range.

Status: **measured** — `scratchpad/collapse-nesting.mjs`. **Still not
measured**: whether an equal-or-higher-level heading ends the range. The
reference document has no two same-level headings in sequence, so the two
samples cannot distinguish "to the next heading of equal-or-higher level"
from "to the end of the document" — produce that shape before
implementing the rule.

Reference document restored to 37 blocks, verified. (The odd
`'rsioHeading two'` text at index 22 is pre-existing, present in the
before-capture too.)

### 2026-08-28 — the collapsible range ends at the next EQUAL-or-higher heading

The reference document has no two same-level headings in sequence, so the
shape was built: `## ZebraAAA` / body / `## ZebraBBB` / body. Making
`ZebraAAA` collapsible absorbed **only** its own heading and body —
`containsBBB: false`, `headingsInside: [H2 'ZebraAAA']`, 46 → 45 blocks.

**A section runs from its heading to the next heading of EQUAL-OR-HIGHER
level, else the end of the document.** Both samples now agree: the `h1`
swallowed a lower-level `h2` and continued to the end, which is what this
rule predicts.

Status: **measured** — `scratchpad/range2.mjs`.

Method note worth keeping: `Input.insertText` does NOT fire ProseMirror
input rules, so `"## "` stays literal text. Per-character
`Input.dispatchKeyEvent` with `text` does fire them. That one difference
is why the first attempt produced five junk paragraphs instead of two
headings.

### 2026-08-28 — the Edited popover: one hairline, and a plate that is asymmetric across themes

Capturing the `Edited <date>` popover in the document header (#143) gave up
three behaviours worth keeping beyond that one surface.

- **The trigger opens on CLICK, not hover** — hovering for 1.6s does nothing
  — and it **toggles**: a second click closes it. It carries
  `aria-haspopup="dialog"`, and it is a pill (`9999px`, `120x28`,
  padding `0 10 0 8`, `12px/500`) whose **label brightens on hover** as well
  as gaining a plate: `lch(61.803 1.2 272)` → `lch(90.451 1.2 272)` dark.
- **The panel uses exactly ONE hairline** across five rows — between
  `Owned by` and `Last edit by` (top 121 of 207). The visual break under the
  two toggle rows is **padding, not a rule**. We had drawn two, by symmetry.
- **The filled action button inside a popover is NOT symmetric across
  themes.** `Show document history` (291x28, pill, same chrome as the header
  trigger) is **flat at rest in light** — its background is the panel's own
  `lch(100 0 282)`, washing to `lch(95.886 0 282)` on hover — but carries a
  **raised plate at rest in dark**, `lch(17.349 1.139 272)`, lightening to
  `lch(21.977 1.525 272)`. A single `foreground/[0.06]` cannot express that in
  either direction, so it is a per-theme token pair here.
- The panel's shadow is **exactly our `--popover-shadow`** in both themes —
  an independent confirmation of the dark stack corrected in #181.

Status: **measured** — `scratchpad/edited-controls.mjs`,
`scratchpad/edited-rest.mjs`, `scratchpad/edited-rest-light.mjs`; full numbers
in `linear-document-edited-popover.md`.

Method notes, both of which produced confident wrong answers first:

1. **`Page.bringToFront` before driving anything.** On a BACKGROUNDED tab
   `Input.dispatchMouseEvent` took ~5s **per event** (one 9-step walk cost 46s)
   and the popover never opened at all. That reads exactly like "the control is
   dead". After bringing it forward the same clicks worked in ~1s.
2. **Park the pointer away before reading a "rest" value.** The first dark
   reading of the button was taken with the pointer still on it from the
   previous probe, so `lch(21.977)` looked like rest. It is the hover. Rest is
   `lch(17.349)`. Re-measured that way in both themes.

Still not measured: the two toggle switches' own chrome (`[role="switch"]`
matched 0 — my selector, not the reference), focus-visible on any of these
controls, the open/close animation, and whether the button's label is centred
in its pill.

### 2026-08-28 — the diagram context menu exists, and "unreachable" was a backgrounded tab

#136 was parked as *blocked on a human-driven capture* because a CDP
right-click "selected the diagram but never opened its menu". With
`Page.bringToFront` first, **one real right-click opens it in under 500ms,
every time**. The earlier session had been driving a hidden tab.

- **Inventory, 5 rows + 1 separator**: `Add comment` · `Copy diagram` ·
  `Show source` · ── · `Fullscreen` · `Delete`. Each 32h, padding `0 14px`,
  **13px/400**, one leading icon.
- **`Delete` is rendered PLAIN** — the same `lch(91.178 1.425 272)` as every
  other row. Not destructive-red.
- Surface 152x180, radius **10px**, padding `4px 0`, border
  `0.5px solid lch(34.32 1.93 272)`, shadow = `--popover-shadow` dark.
- **The hover plate is invisible to the DOM.** `backgroundColor` and
  `boxShadow` are unchanged on hover at all five ancestor layers under
  `elementFromPoint`. Pixels settle it: ground `#262627` → plate `#353537`,
  **inset ≈ 4px** each side (not full-bleed), **radius ≈ 5px** from a corner
  scan. That is NOT the 6px / `rounded-[8px]` anatomy measured on Linear's
  other menus — one menu's plate geometry does not speak for the house.
- **The highlight is a CURSOR, not CSS `:hover`.** With the pointer parked
  well outside the menu, the previously hovered row was still plated; it moves
  only when the pointer enters another row.

Status: **measured** — `scratchpad/diagram-ctx.mjs`,
`scratchpad/diagram-menu-capture.mjs`, `scratchpad/diagram-menu-hover.mjs`,
`scratchpad/menu-pixels.mjs` + the pure-Python PNG reader; full numbers in
`linear-diagram-context-menu.md`.

The real right-click is safe on THIS element because the diagram handles
`contextmenu` and calls `preventDefault`, so Chromium's own menu never opens.
That is not a general licence — a block without a handler still wedges the
browser.

Still not measured: light theme, what any row does (nothing was clicked,
`Delete` deliberately not fired), keyboard cursor/chords, the five icons, the
open/close animation.

### 2026-08-28 — diagram fullscreen is an inset PANEL, and Linear does not scale to fit

Reached at last via #136's entry path (right-click the diagram → `Fullscreen`).

- **Not a centred max-width dialog.** A panel **inset 33px from every viewport
  edge** — exactly 1366x657 at 1432x723 — over a plain scrim with **no blur**.
  radius **8px**, `overflow: hidden`, `z-index: 700` on the scrim.
- **The scrim differs by theme**: `lch(0 0 0 / 0.4)` dark, `lch(0 0 0 / 0.25)`
  light. Panel `lch(5.52 0.4 272)` / `lch(97.94 0.5 282)`, border 1px
  `lch(14.16 1.48 272)` / `lch(88.49 0 282)`.
- **The shadow layer COUNT differs by theme**: five layers dark, three light.
  The first probe truncated the dark stack at three; it was re-read, not
  guessed.
- **Linear does NOT scale the diagram to fit.** It renders at natural size and
  the panel scrolls. This corrects an earlier note of mine that read our own
  identical inline-and-fullscreen sizing as a defect — it is what the reference
  does.
- **Controls**: three round 26x26 controls top-right — copy · show source ·
  close — at y=47 (14px below the panel top), the close 13px from the panel's
  right edge and 9px past the pair's pitch. Active plate is the panel ground at
  80% alpha. **Right-clicking inside fullscreen** opens its own 3-row menu:
  `Copy diagram to clipboard` · `Show source` · ── · `Close`.
- **Clicking the scrim closes it** (learned by accident — a "neutral click",
  which is the safe way to dismiss a menu, dismissed the overlay and I then
  measured the document's own panel and nearly reported it as the overlay's).

Status: **measured** — `scratchpad/fs-one.mjs`, `scratchpad/fs-final2.mjs`,
`scratchpad/fs-shadow-dark.mjs`, `scratchpad/fs-light.mjs`; full numbers in
`linear-diagram-fullscreen.md`.

Not measured: **Escape**. The sentinel I used to detect "in fullscreen" matched
the context MENU's row text, not the overlay, so the Escape result cannot be
trusted in either direction. Also unmeasured: the open/close animation, whether
33px is fixed or proportional (one viewport), and what copy/show-source do.

### 2026-08-28 — `Current` in document history is CONTENT identity, and it takes the diff UI with it

Two documents were needed, because one cannot show both halves. The
duplicate (`example-document-copy-be593f056408`) has one version, badged
`Current` (57x18 at [1138,138]); the 20-version working document has **no
badged row at all** and shows `1 of 3`.

- `Current` marks the version whose content IS the live document — never
  "the newest row". A document edited since its last snapshot has no
  badged row, which is why the second sample was necessary.
- Selecting that row **removes** the diff cluster: no `Highlight changes`
  label, no `N of M`, no steppers. Only `Restore version` remains.
- That button, disabled: `<button disabled>` 106x24, radius 9999px,
  padding `0 8px`, 12px/500, background `lch(53 52.26 286.91)` and colour
  `lch(100 5 286.91)` — i.e. the ENABLED tokens unchanged — with
  `opacity: 0.6` and `pointer-events: none` on the element. One opacity,
  not two per-colour alphas. No tooltip, and there cannot be one.
- The footer is a floating pill, not a bar: outer strip 756x70
  `padding: 10px 0 20px` `justify-content: center`; the pill 124x40
  `padding: 6px 6px 6px 10px`. The 10/6 asymmetry is real — Ahmed spotted
  it in the reference itself (image #373). Left edge meets text, right
  edge meets a stadium button whose radius supplies the space.

Status: **measured** — `scratchpad/lh-current-btn2.mjs` and
`scratchpad/footer-geom.mjs`, dark theme, Edge 151 on :9222.

Entry-path trap worth keeping: the header's `Edited …` pill **toggles**
its popover, so clicking it blind closes an already-open one and the
probe reports "no history row". Probe for `Show document history` first
and only click the pill when that row is absent. Same shape for the
dialog itself — a previous run leaves it open, and then the pill is
behind the overlay.

**Not measured**: two rows badged `Current` at once (predicted by the
rule — restore an old version and its bytes are live — but not produced);
the light theme of the disabled button; the badge's own chrome; the
pill's expand/collapse motion when the diff cluster appears (Ahmed asked
for it 2026-08-28, tracked separately).

A pixel double-check of the pill inset was attempted and **failed** —
the fill discrimination picked the wrong band and the Linear clip did not
land on the dialog. The numbers above are box geometry, taken twice in
both apps; the pixel pass is not evidence for them.

### 2026-08-29 — the debug browser has prefers-reduced-motion ON

Every motion gate run against the :9222 Edge profile reports "no animation"
for CORRECT code that honours the preference. Measured:
`matchMedia('(prefers-reduced-motion: reduce)').matches === true`.

Our footer pill carries `motion-reduce:!transition-none`, so its computed
`transition-property` read `none` and the width sampler saw a single
constant value — which reads exactly like a broken transition. Two rounds
were spent on the code before checking the instrument.

Fix in the probe, not the app:

```js
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
// ... sample ...
await send("Emulation.setEmulatedMedia", { features: [] });   // restore
```

Status: **measured** — `scratchpad/rm-check.mjs`, `scratchpad/ours-pill-gate.mjs`.

Two more things this settled:

- **Linear does NOT honour the preference here** — its pill animated in the
  same browser with reduce-motion on. Ours does. That divergence is
  deliberate and stays; it is the one place we are not 1:1 on purpose.
- **A rail row must be scrolled into view AND the scroll awaited** before its
  rect is used for a click. Re-reading in the same frame returned the
  pre-scroll rect, the click missed, and the newest row reported the OLDEST
  row's footer state — which read as an app bug. Two rAFs plus 250ms.

### 2026-08-29 — footer pill motion, all six edges

Measured per EDGE with a rAF sampler on the reference's three-version
document (`scratchpad/pill-state-machine.mjs`):

| edge | motion | what moves |
|---|---|---|
| newest -> middle (both have a cluster) | 144.5ms | button opacity only; width constant |
| middle -> newest | 233.1ms | opacity 1 -> 0.6, 2.75px width settle |
| newest -> oldest (cluster leaves) | 347.4ms | width 410 -> 124.3 |
| middle -> oldest | 360.4ms | width 303 -> 124.3 |
| oldest -> newest (cluster appears) | 504.6ms | opacity ramps FIRST, then cluster mounts, then width |
| oldest -> middle | 562ms | same ordering |

- **Width animates; height NEVER does** — 40 in every frame of every edge.
- The curve decelerates: 410 / 293 / 276 / 268 / 245 / 230 / 211 / 188 / 169 /
  158 / 148 / 140 / 134 / 131 / 128.7 / 124.3 — ease-out over ~250ms.
- The switch and counter **swap in ONE frame** — no fade, no stagger.
- Button opacity ramps ~150ms, matching its declared `opacity 0.15s`. Its
  declared transition also names `background-color` and `color`; we do not
  copy that half (banned app-wide).
- The pill is centred, so a width change moves BOTH its edges.
- ~470-750ms of content-load latency precedes all motion on every edge.

Ours after building it: width 120 -> 403 over **238.4ms**, decelerating, height
constant 40 (`scratchpad/ours-pill-gate.mjs`).

Status: **measured**, dark theme, Edge 151. **Not measured**: light theme;
whether Linear's width curve is a CSS transition or JS — its computed
`transition` serialises as bare `all` with no duration while the width
demonstrably animates, so something is driving it that computed styles do not
report.

### 2026-08-29 — Linear's restore preview shows diagram SOURCE, not diagrams

Ahmed reported ours rendering mermaid as source in the history preview and
asked to "bring it same behaviro there". The reference does the same thing:

```
<code><span class="slice">flowchart TD
    A[Issue created] --&gt; B{Needs triage?}
    ...</span></code>
```

- mermaid SVGs in the preview pane: **0**
- total SVGs: 19 — all todo-drag-handles and icon glyphs
- flowchart present as TEXT: yes

Ruled out lazy/async rendering explicitly: scrolled the block into view inside
the pane and waited 4s before re-counting. Mermaid is a heavy async render, so
an early sample could not have decided this on its own.

Note `class="slice"` on the span — the source sits inside Linear's own diff
slice markup, i.e. the preview is a diff-rendered text view, not a live
document view. That is consistent with it rendering no node views at all.

Status: **measured** — `scratchpad/lin-preview-diagrams.mjs`,
`lin-preview-diagrams2.mjs`.

So we already MATCH here, and rendering diagrams in the preview would be a
deliberate improvement over the reference rather than a fidelity fix — which
makes it Ahmed's call, not a drift to silently correct. Tracked as #195.

**Not measured**: whether IMAGES render in the preview (only the diagram case
was tested).

### 2026-08-29 — the comment card lifts on FOCUS, and never on hover

Ahmed: "why it change its card bg color when group hover over it that is nto
like 1:1 like linear". Measured on the reference, dark:

| | resting | active |
|---|---|---|
| background | `lch(9.232 0.85 272)` | `lch(12.945 1.3 272)` |
| border 0.5px | `lch(16.793 1.93 272)` | `lch(20.505 2.38 272)` |
| shadow | `0 0.5px 1px 1px` | 3-stop, larger |
| margin-left | `0px` | **`-6px`** (slides left) |

Declared transition: `margin-left, background-color, box-shadow, opacity 0.2s`.
**Hover changes nothing** — pointer parked vs on the card body, identical.

Status: **measured** — `scratchpad/rc-card-hover2.mjs`,
`scratchpad/rc-card-focused.mjs`.

THE NEAR-MISS WORTH KEEPING: my first two readings both showed the ACTIVE
values and I nearly wrote them down as "the resting card". They were active
because the thread had just been created — a state I had caused by measuring.
Clicking away exposed the real ground. The tell was in the data all along:
`margin-left: -6px` on a card supposedly at rest, and a declared transition
naming four properties nothing appeared to change.

**Rule: when a transition is declared for properties you have observed to be
constant, you have not found the state that moves them.**

### 2026-08-29 — probe/selector traps on the comment surface

Three separate probes produced wrong NUMBERS here, all the same way:

1. **Joining cards to anchors BY INDEX** after sorting both lists. Gave a card
   `delta: -685` from "its" anchor. The join key must be identity (anchor text,
   or a data attribute), never position.
2. **"The smallest box containing the text"** as a card selector. Returns an
   inner content div — `border-radius: 0`, transparent, no border — which then
   reports "no hover change" for everything. Identify a painted surface by what
   makes it one: a radius AND a background/border/shadow.
3. **A caret inside `.ProseMirror` is NOT focus.** Clicking places a caret while
   `document.activeElement` is elsewhere, so keys go to the wrong element and
   the selection stays collapsed — which reads as "Linear has no selection
   toolbar". Call `pm.focus()` explicitly, then extend with Shift+Arrow.

Also: a menu trigger TOGGLES. A run that leaves a menu open, followed by a run
that clicks the trigger again, closes it — and "no menu container" reads as a
missing menu. Probe for the open state before clicking.

### 2026-08-29 — the ACTIVE comment thread is cleared by an IN-EDITOR click, not by clicking away

The card lifts (`margin-left: 0 → -6px`, bg `lch(9.232 0.85 272) → lch(12.945
1.3 272)`) when it becomes the active thread. What CLEARS it is the opposite of
the obvious guess:

| click target | result |
|---|---|
| the card | focuses |
| the MARK (the highlighted text) | focuses — and does NOT re-scroll |
| elsewhere INSIDE the editor | **clears** |
| outside the editor (page chrome, the gutter's own empty space) | unchanged |

So it is scoped to the editor: putting a caret in the document means you are
editing and no thread is the subject; inert chrome decides nothing. Marks are
the exception inside the editor because they NAME a thread.

Also measured, same pass: **resolving a thread KEEPS its highlight in the text**
and removes only the gutter card (marks 2 → 2, cards 2 → 1). The thread moves to
the resolved panel; the marked range stays marked.

And re-confirmed: **Escape in the document view navigates BACK to the documents
list.** It ended a probe run mid-capture. Close overlays by clicking a neutral
spot, never with Escape.

Status: **measured** — `scratchpad/ref-clear-matrix.mjs` (four targets, a
`Page.navigate` + settle before EVERY trial), `ref-clear-mark.mjs`,
`lin-199b.mjs`. Reference work for the resolve half was done on a throwaway
document created for it, not the reference document.

**Focus is EXCLUSIVE** — measured after the fact by producing a second live
thread on the throwaway (`lin-two-threads2.mjs`): three transitions, both
directions, `["-6px","0px"] -> ["0px","-6px"] -> ["-6px","0px"] -> ["0px","-6px"]`.
Clicking a card focuses it AND returns the other to rest; there is never more
than one active thread. Note the cards REFLOW when focus moves (a card shifted
y 298 -> 401), so a click using coordinates read before the previous click
misses — re-read rects immediately before every click.

**Not measured**: the
disabled restore control's label: its `textContent` read "This is the current
version, you cannot restore it" in one capture and "Restore version" in
another, so whether that string is ever VISIBLE is unknown — the control is
`pointer-events: none`, so no hover can open a tooltip on it.

## #200 (2026-08-29) — three probe traps in one investigation

- **A trial that does not reset measures your click history, not the machine.**
  Three runs of the focus-clear probe disagreed with each other; each had
  inherited whatever state its predecessor left. Two runs of the same probe
  disagreeing is never noise on a deterministic DOM — reload between trials.
- **Selecting an element by a CSS property it animates.** `transition-property:
  margin-left` matched a document-body wrapper (`data-table-overhang-boundary`)
  whose margin shifts for layout reasons. It moved by the right amount, so
  every reading looked plausible. Join by identity.
- **The centre of a WRAPPED inline element is not on the element.** A comment
  mark spanning two lines is 324x70; its bounding-box centre falls between
  line boxes and `elementFromPoint` returns the block DIV. Use
  `getClientRects()[0]` and verify the hit before clicking.
- **A gate that reads one card and clicks an unrelated mark** is an index join
  in disguise: focusing thread B correctly returns thread A's card to rest,
  which the gate reports as "focus cleared". Join by anchor id.

### 2026-08-29 — the RESOLVED comment card is a different card, not a dimmed one

`opacity: 1` in both themes. It is wider (336 vs 284), starts further left
(x 1068 vs 1091), uses radius **8px** where the live card uses 10px, and shows
the anchored QUOTE above the author line. In DARK it sits on a LIGHTER plate
than a live card — `lch(16.432 1.3 272)` against `lch(9.232 0.85 272)`; in
LIGHT the two share `lch(100 0 282)` and are told apart only by width, radius
and the quote.

Panel: heading "Resolved comments" `[1068, 105, 116, 15]` 12px/500
(`lch(64.714 1.425 272)` dark, `lch(40 1 282)` light); toggle 28×28 at
`[1384, 61]`, radius `9999px`, label switching Show/Hide.

Status: **measured** — `scratchpad/lin-189.mjs`, both themes.

**And the theme switch itself, because two documented methods are dead ends.**
`Emulation.setEmulatedMedia({prefers-color-scheme})` is IGNORED by Linear, and
so is writing `localStorage.darkMode` — it stores an explicit interface theme
that beats both. The only thing that works is its own palette: Cmd+K → `theme`
→ Dark / Light / Pure Light / Magic Blue / Classic Dark / System preference.
Verify from a CARD's background, never `document.body` — the body is
transparent and reports `rgba(0, 0, 0, 0)` in every theme, which reads exactly
like "the switch did nothing".

The workspace was found in LIGHT and has been restored to Dark (live card back
to `lch(9.232 0.85 272)`).

### 2026-08-29 — the selection toolbar has 14 items OR 15, and the extra one is real

Captured on a within-paragraph selection: **14** items. Captured on a
select-all: **15** — Linear adds `Move selection to new document`, as the FIRST
item of the actions group.

Order and structure (committed as
`components/rich-text/linear-selection-toolbar-inventory.json`):

    Regular text(42) Bold Italic Strikethrough Underline Link Quote
    Collapse "Inline code" "Code block" List(42)     <- formatting
      ── 16px ──
    [Move selection to new document]* Create-issue Ask-agent Comment  <- actions
                                     * multi-block selections only

Items are 26x26 (the two dropdowns 42x26), radius `4px`, 16x16 icons, resting
`transparent` / `lch(64.714 1.425 272)`. Gap 6px inside a group, **16px between
the two groups** — that gap is the only thing marking the split; there is no
divider rule.

Status: **measured** — `scratchpad/lin-164.mjs`, `lin-164b.mjs`, `lin-164c.mjs`.

**The lesson, again**: the board said "the reference shows 14 and 2 of ours
aren't in it". The 14 was one selection size. Our `Move selection to new
document` was about to be filed as an invention; it is in the reference,
conditioned on a state I had not produced. Before calling one of our rows an
extra, vary the state that could summon it in theirs.

### 2026-08-29 — Linear renders mermaid as a PLAINTEXT CODE BLOCK in both test documents

Attempting to capture the diagram control pill (#193) found no diagram to hang
it on:

- the reference document's `flowchart TD …` is a `<pre><code>` block, 355x179,
  labelled **Plaintext**. No `<svg>` over 18x18 exists anywhere on the page —
  the largest are icon glyphs and `todo-drag-handle`.
- typing a fenced block with an info string (```` ```mermaid ````) produces a
  **Plaintext** block whose first line is the literal text `mermaid`. Linear
  does NOT read the fence's info string as a language.
- hovering the code block revealed no language picker and no control pill; the
  only controls in that band belong to a comment card.

Status: **measured** — `scratchpad/lin-193.mjs`, `lin-193b/c/e.mjs`.

**Not measured**: the insert path that DOES produce a Linear diagram node.
Ahmed's screenshots show one, so it exists; the slash menu did not open from my
drive (caret placement), so that route is untested rather than ruled out. Until
a real diagram node is produced, its control pill, its modes and its fullscreen
cannot be captured — which blocks #193 and bears directly on #195, #121 and
#130, all of which assume a rendered reference diagram.

### 2026-08-29 — a "Leave site?" dialog wedges CDP exactly like a right-click menu

Navigating away from a Linear document that has an in-flight edit raises a
NATIVE beforeunload dialog. The signature is identical to the right-click trap
already recorded, and just as misleading:

- `http://127.0.0.1:9222/json/version` and `/json/list` keep answering happily
- every WebSocket `Runtime.evaluate` hangs forever — a bare attach-and-read-URL
  probe sat for **25 minutes** with no output
- nothing in the page or the logs indicates a dialog

I misread it as machine load, because a 4-worker vitest run happened to start
at the same time. It was not load: the moment the dialog was dismissed, the
25-minute-old probe completed and printed its result.

Recovery, same as the right-click case:
`osascript -e 'tell application "System Events" to key code 53'` (Escape),
then Return for good measure.

Status: **measured** — the hung probe's own completion timestamp is the proof.

The general rule this is the second instance of: **when the DevTools HTTP
endpoint answers but evaluates hang, an OS-level popup owns the renderer.**
Do not look for a script bug, and do not blame the machine — dismiss the
dialog first.

### 2026-08-29 — a deleted Linear document is READ-ONLY, not a tombstone; its ⋯ menu goes 10 → 2

Produced by creating a throwaway document and deleting it — the document Ahmed
linked had already been restored by the time I looked (header showed
`Add to favorites`, no chip). **The deleted state is not durable in a shared
test workspace: produce it, do not expect to find it.**

- the body still renders, but `contenteditable` flips `"true"` → **`"false"`**
- header buttons drop from 4 (Add to favorites · Document options · Copy
  document URL · Unsubscribe) to **2** (Document options · Copy document URL)
- the `Deleted` chip: plate `[1355,20,61,24]`, border
  `0.5px solid lch(27.12 1.48 272)`, padding `2px 6px`; label 13px/450
  `lch(61.803 1.2 272)`
- the banner: plate `[408,207,829,41]`, bg `lch(10.149 0.593 272)`, radius
  **12px**, border `0.5px solid lch(18.48 1.48 272)`, padding `8px 8px 8px 12px`,
  16×16 trash glyph; label `Document deleted` 13px/500 `lch(90.451 1.2 272)`
- the ⋯ menu collapses from **10 rows to 2** — `Copy ▶` and
  `Restore document` (chord `#`), rows 184×32. The diff is the spec.
- **delete is CONFIRMED by a dialog that states the retention**: *Deleted
  documents are available in the "Recently deleted" view for 30 days…*, with
  `Cancel` / `Delete`.

Status: **measured** — `scratchpad/lin-204c.mjs`, `lin-204d.mjs`,
`lin-204e.mjs`, `lin-204f.mjs`. Spec: `specs/linear-deleted-document.md`;
inventory committed at `components/dashboard/linear-document-menu-inventory.json`.

**Not measured**: the delete-time toast. Nothing matched in the bottom 220px
after confirming, and I did NOT distinguish "Linear shows none" from "my
selector missed it" — so that is an open question, not a finding.

Probe note: I named the throwaway "Delete probe", so every ancestor matched a
loose `/delet/i` search. Name test fixtures so they cannot collide with the
string you are about to search for.

### 2026-08-29 — "Recently deleted" is one route family of SEVEN tabs, and ARCHIVED ≠ DELETED

`/{workspace}/team/{TEAM_KEY}/archive/{view}`, tabs at `y=60` h`28`,
`12px/500`, active `lch(100 0 272)` vs inactive `lch(61.803 1.2 272)`:

    Issues · Projects · Cycles                      <- ARCHIVED
    Recently deleted issues|projects|initiatives|documents  <- 30-day bin

Those are two different concepts sharing one family — a build that treats
"archive" as a single list gets the vocabulary wrong immediately. Slug quirk:
recently-deleted ISSUES is the bare `/archive/recently-deleted`; the other
three carry their noun, which is the shape of a feature that shipped for issues
first.

**The row menu IS the deleted-document menu.** Hovering a row reveals
`Open menu` (32×32, far right at x 1374); opening it gives exactly the two rows
the deleted document's own ⋯ gives — `Copy ▶` and `Restore document` (`#`),
184×32. So the deleted-entity action set is ONE thing shown in two places, and
restore is reachable from both.

Row: title `16px/400` `lch(100 0 272)` at y 112, container 1101 wide. Empty
state: **"No matching documents"**.

Status: **measured** — `scratchpad/lin-206.mjs`, `lin-206d/e/f/g.mjs`. Spec:
`specs/linear-recently-deleted-archive.md`.

**Not measured**: light theme; the row's own hover wash (I captured the
revealed control, not the plate); pagination and sort order; bulk
select/restore; any deleted-at column (my probe saw only a title); and the
other three `recently-deleted-*` views — only DOCUMENTS was opened.
