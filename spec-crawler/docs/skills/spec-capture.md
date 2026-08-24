<!--
  SNAPSHOT — the canonical copy is ~/.claude/skills/spec-capture/SKILL.md, which is what
  Claude actually loads. This copy exists because that directory is not version
  controlled and lives on one machine. Update the canonical file first, then
  re-copy here. If the two differ, the one under ~/.claude wins.
-->

---
name: spec-capture
description: Capture a live web app's design spec — CSS states, menus/dialogs/popovers, and multi-step flows — and push them into Paper.design as editable artboards. Use when asked to capture a page's design states, get hover/group-hover specs, snapshot dialogs and dropdowns from a real app, mirror an app's UI into Paper, or run/extend the spec-crawler pipeline in ~/Documents/paper-snapshot.
---

# Spec capture: live web app → Paper

Turns a running web app into a set of design frames, one per *state*, plus the CSS
state matrix for each. Built for mirroring apps like Linear into Paper.

Tooling lives in `~/Documents/paper-snapshot/spec-crawler`. It reuses
`elementSerializer` from the extension's `background.js` (extracted at runtime,
not forked) so crawled frames are byte-identical to hand-captured ones.

## Read this before your first call — the crawler now refuses to guess

As of 2026-08-24 the crawler is an **evidence compiler**: it either produces a
measurement it can stand behind or it fails with a code. It no longer returns a
plausible answer when it could not establish one. Four things this changes for a
calling agent, before anything else in this file:

1. **`expect` is REQUIRED** on `capture_at` and `capture_state_matrix`.
2. **A component containing a live region needs `volatile`**, or every capture of
   it fails `ERR_CAPTURE_DRIFT`.
3. **A failed capture writes nothing at all** — no manifest, no orphan frame.
   Read the `code`; do not retry blindly.
4. **`runtime_handshake` is how you prove you are actually using this MCP.** An
   open CDP port on 9222 proves only that a browser is reachable.

### Where the code is, and which copy the MCP runs

Two locations, and they are not interchangeable:

| Path | What it is |
|---|---|
| `~/Documents/paper-snapshot/spec-crawler` | **What the registered MCP executes.** Code synced from the branch below, on top of ~20 captured bundles, `specs/` (54 files), and `assets/`. Most of it is **untracked** — it is the working corpus and is not reproducible from git. |
| `~/Documents/paper-snapshot-determinism/spec-crawler` | Git worktree of `feat/spec-crawler-determinism`. Source of truth for the code and the only place with `test/` wired to run. |

The MCP is registered at **user scope** as
`node /Users/ahmedbanihani/Documents/paper-snapshot/spec-crawler/mcp.mjs`, so it
runs whatever code sits in the first path regardless of which branch the repo is
on. Confirm you have the right one in one call rather than reading files:

```
runtime_handshake {challenge: "check"}   → 27 tools = this version, 25 = pre-refactor
```

**Never `git checkout` inside `~/Documents/paper-snapshot` to get this code.** That
tree carries unrelated uncommitted work, and `spec-crawler/` is untracked there —
a checkout either refuses or buries the corpus. To update the executing copy,
sync code paths only and leave everything else alone:

```bash
SRC=~/Documents/paper-snapshot-determinism/spec-crawler
DST=~/Documents/paper-snapshot/spec-crawler
for item in src bin test mcp.mjs index.mjs package.json package-lock.json \
            scenario-run.mjs validate-bundles.mjs paper-import.mjs \
            verify-animation-parity.mjs verify-implementation.mjs README.md; do
  cp -R "$SRC/$item" "$DST/"
done
```

Never sync `specs/`, `assets/`, `spec-*/`, or the one-off probe scripts in that
directory — none of them are in git.

**A code change does not reach a running session.** The MCP server is a live
stdio process holding the old modules in memory; it must be restarted (`/mcp`, or
restart Claude Code) before any of this takes effect. `runtime_handshake` reports
`sourceFingerprint` precisely so you can tell whether the process you are talking
to is the code you just changed.

If the worktree is missing (it is disposable), recreate it:

```bash
git -C ~/Documents/paper-snapshot fetch origin
git -C ~/Documents/paper-snapshot worktree add \
  ~/Documents/paper-snapshot-determinism feat/spec-crawler-determinism
```

### The capture contract

Every capture now runs inside one transaction: preconditions → stability wait →
target lease → your action → stability wait → subgrid resolve → **fingerprint** →
measure/serialize/screenshot → **fingerprint again** → validate → commit. Cleanup
is a LIFO stack that always unwinds, so a failed capture cannot leave the page
carrying inline grid tracks, a held mouse button, or a forced pseudo-state.

**A failed capture writes nothing** — no manifest entry, no orphan frame. It
returns `{ok: false, code, stage, evidence}`. Act on the code:

| Code | Means | Do |
|---|---|---|
| `ERR_TARGET_EXPECT_REQUIRED` | a point capture with no `expect` | pass `expect` |
| `ERR_CAPTURE_DRIFT` | the subject changed between the two fingerprints | usually a live region → declare `volatile`; `evidence.differingFields` names what moved |
| `ERR_CAPTURE_VOLATILE_UNMATCHED` | a declared selector matched nothing | fix the selector; it is stale |
| `ERR_CAPTURE_VOLATILE_USAGE` | a `volatile` entry has no `reason` | state why it varies |
| `ERR_CAPTURE_NO_RECT` / `NO_SHOT` / `EMPTY_FRAME` | evidence missing | do not retry blindly — the subject probably left the document |
| `ERR_CAPTURE_SUBJECT_MISSING` | subject gone at capture time | re-resolve it |
| `ERR_NOT_ATTACHED` | no `browser_attach` yet | attach |

**`expect` is required on `capture_at` and `capture_state_matrix`.** A coordinate
is not an identity: a virtualised list recycles nodes, so (x, y) can be
re-occupied between the moment you looked and the moment the call runs. Pass a
substring of the label, a tag name, or a selector the target must match. The
matrix holds a component by coordinate across four separate drives, so its
recycling window is the widest of any tool.

### Live regions: `volatile` — the thing that will bite you first

Any component containing a clock, a relative timestamp (`2d ago`), an unread
count, or a presence dot **cannot be captured without declaring it**. The value
ticks between the pre- and post-capture fingerprint and every attempt fails
`ERR_CAPTURE_DRIFT`. On Linear this is most issue rows.

```json
capture_at {
  "x": 420, "y": 310, "name": "issue-row-rest", "expect": "ABC-123",
  "volatile": [{ "selector": ".timestamp", "reason": "relative time, re-rendered each minute" }]
}
```

`reason` is mandatory — declaring a region volatile is the power to make a capture
stop noticing that something changed, and an unexplained mask cannot be told apart
from one hiding a real defect. A selector matching nothing is an error, not a
no-op: otherwise you believe the clock is excluded, the selector is stale, and the
capture fails as drift with no hint that your declaration was the problem.

What it does and does not do:

- **Does** exclude the region from drift detection and from state identity, and
  record its rects into the manifest so a later verification masks the same pixels.
- **Does not** rewrite the artifact. The frame and the PNG keep what was on
  screen, so a volatile state still differs run to run. The declaration says how to
  *read* the evidence, not what to record.
- **Does not** excuse geometry. If a volatile value reflows its subject, the size
  moves and the capture is still rejected — the layout really did change.

Available on `capture_state`, `capture_at`, `capture_state_matrix`,
`capture_component`, `capture_hover_reveal`.

### Proving you are actually using this MCP

An open CDP port on 9222 proves a browser is reachable. It is **not** evidence
that any tool call went through this server, or that a capture came from it.
`runtime_handshake {challenge: "..."}` echoes your challenge and reports the
source fingerprint, instance identity, transport, attachment, bundle and lease
state — plus the MCP client name/version it saw at the initialize handshake, which
a session not routed through this server cannot produce. Every tool result also
carries `_meta["spec-crawler/provenance"]`, on errors as well as successes.

This is self-attestation of a *routing* fact, not a cryptographic attestation
against a hostile process, and a matching fingerprint does not prove the code was
never patched in memory. Do not quote it as more than it is.

### Repeatable captures: `scenario_run`

For anything you will want to re-run — a regression, a hand-off, a "capture this
again after the redesign" — write a scenario instead of driving primitives:

```bash
npm run scenario -- --file specs/menu-open.json --dry-run   # byte-identical each run
npm run scenario -- --file specs/menu-open.json
```

`scenario_run {file | scenario, dryRun, endpoint, urlPattern, out}` over MCP runs
the same runner, so CLI and agent produce identical evidence. Schema v1: typed
actions, mandatory named postconditions on anything that mutates, mandatory
`expect` on point targets, no arbitrary JavaScript in the grammar, teardown in a
`finally`. Exit codes: 0 ok, 1 run failed, 2 invalid scenario, 3 usage.

Declared verification that never runs now **fails** the scenario rather than
reporting a clean verdict off an empty array.

### Tests, when you change the crawler

```bash
cd ~/Documents/paper-snapshot-determinism/spec-crawler
npm run test:unit           # 176 — no browser
npm run test:browser        # 16  — real headless Chromium
npm run test:integration    # 25  — spawns the MCP over stdio
npm run test:repeatability  # 14  — 10 fresh runs, identical manifests
```

The repeatability suite is the one that catches ordering instability; it asserts
byte-identical frames and screenshots across ten runs from fresh directories.

## The five tiers — do not conflate them

Interaction states are five different problems with five different mechanisms.

| Tier | What | Mechanism | Autonomous |
|---|---|---|---|
| 1 | CSS states: `:hover`, `:focus-visible`, `:active`, `[data-state]` | parse stylesheets | yes, clicks nothing |
| 2 | Overlays: menus, dialogs, popovers | click triggers, capture what appears | yes |
| 3 | Flows: "select 2 cards → ⌘ → palette" | an agent decides | needs you |
| 4 | Motion: how a surface enters, resizes, leaves | `getAnimations()` + frame sampling | per interaction |
| 5 | Gestures: drag to reorder, resize, swipe | real pointer input, phase by phase | per gesture |

Tier 1 cannot see JS-driven changes. Tier 2 cannot infer that selecting two cards
means anything. Tier 3 exists because no crawler infers domain intent. Tier 4 is orthogonal to all
three: it records the transition between states, which no static capture holds.

**`:hover` cannot be faked from page JS.** `dispatchEvent(new MouseEvent('mouseover'))`
fires JS listeners but the CSS engine ignores it — hover is driven by real pointer
hit-testing. Use `force_state` (CDP `CSS.forcePseudoState`) or a real pointer.

## Setup

Attaches to an already-running browser so it inherits the user's logins.

```bash
open -na 'Microsoft Edge' --args \
  --remote-debugging-port=9222 --user-data-dir="$HOME/.spec-crawler-edge"
```

Sign in once in that window; the profile persists.

## Run it

CLI, for the deterministic tiers:

```bash
cd ~/Documents/paper-snapshot/spec-crawler
node index.mjs --url "linear.app" --limit 15 --depth 1 --debug-inert   # sanity
node index.mjs --url "linear.app" --depth 2                            # whole app
node paper-import.mjs --bundle ./spec-bundle --dry-run
node paper-import.mjs --bundle ./spec-bundle
```

`paper-import` **exits 1 when any artboard could not be fitted to its content**
and lists them as `REJECTED`. Those artboards kept a fallback height, so their
frames are clipped — a clipped artboard hands the next agent a truncated
`get_screenshot` with no hint anything is missing. Re-run to retry: the ledger
recorded them as rejected, so they update rather than duplicate. Do not treat a
printed row as success without checking the exit code.

**Scoping to one page is the common case** and much cheaper than sweeping an app.
`--url` only *selects* among open tabs; `--goto` navigates:

```bash
node index.mjs --url "linear.app" --goto "https://linear.app/ws/issue/ABC-123" \
  --depth 2 --out ./spec-issue-page
```

Two more flags worth knowing:

- `--shots minimal|context|all` (default `context`) — `context` also saves the
  trigger element and the **annotated** full viewport, with the trigger boxed in
  red and the surface boxed in blue labelled `side/align gap Npx`. That image is
  what lets an implementing agent read placement instead of inferring it from
  two rects. `all` adds a before-click shot.
- `--exclude-area x1,y1,x2,y2` — geometric exclusion, tested against each
  trigger's centre. **Needed because `--regions` finds nothing on Linear**: it
  has no `<main>`/`<nav>`/`role="main"`, so selector scoping has nothing to grab.
  The sidebar is roughly `0,0,320,20000`.

Drop `--limit` for a single page — it exists only as a brake on app-wide runs.
Always pass a distinct `--out` per target: a bundle clears its own subdirectories
on start, so reusing one silently destroys the previous capture. Detail pages
tend to yield more `routes` and fewer overlays than list/board pages, and their
interesting states live inside menus — so `--depth 2` matters more there.

Agent mode — `spec-crawler` and `paper` are registered at **user scope**, so both
are available from any directory. Tools: `browser_attach`, `page_describe`,
`capture_css_spec`, `crawl_overlays`, `list_regions`, `set_region`, `frontier`,
`novelty`, `click`, `press`, `hover`, `force_state`, `capture_component`,
`capture_animation`, `verify_animation`, `capture_hover_reveal`, `capture_drag`,
`capture_state`, `capture_state_matrix`, `reset`,
`bundle_write`, `paper_import`, `paper_status`, `paper_copy`,
plus `runtime_handshake` and `scenario_run` (27 total).

Session shape:

1. `browser_attach {urlPattern: "linear.app", navigateTo: "<url>"}` — `navigateTo` scopes the run to one page
2. `capture_css_spec` — free, mutates nothing
3. `crawl_overlays {limit: 15, depth: 1}` — verify, then widen to `depth: 2`
4. Tier 3 exploration loop (below)
5. `bundle_write` → `paper_status` → `paper_import`

Use the single deterministic tools for Tiers 1–2. Never drive 200 clicks one
round-trip at a time — `crawl_overlays` already does that correctly and cheaply.

### Tier 3 exploration loop

`frontier` is the loop's memory. It reports the current state, whether it is new,
and which interactions here have not been tried — keyed by (state, trigger), so
"Priority" inside the composer is tracked separately from "Priority" on the board.

```
repeat:
  frontier                      → where am I, what have I not tried?
  pick ONE untried interaction  → prefer aria-haspopup, and anything needing a
                                  precondition a crawler cannot infer:
                                  multi-select, keyboard chords, typing, hover
  click / press / hover
  read newSurfaces              → nothing new? loop
  capture_state                 → name it, and note how you got there
  reset                         → between unrelated flows
until frontier.exhausted everywhere reachable, or dryRounds >= 3
```

Do not re-read the whole page each round; `frontier` is cheaper and is the only
thing tracking what was already tried. Do not pre-check `novelty` before every
capture — `capture_state` dedupes structurally by itself and reports
`{duplicate: true, existingId}` when it was a repeat.

**Dryness means "this round produced nothing", not "I have stood here before."**
The loop returns to baseline after every capture, so counting repeat *states* as
dry declares a productive run finished after three captures. It counts a round
as progress if a new state appeared *or* the bundle grew.

### Tier 4 — motion capture

`capture_animation {specId | keys}` records what one interaction animates.
`capture_component {specId}` is the focused path: opens one surface and captures
its frame, screenshots, CSS states **and** its opening motion in a single call —
use it whenever the user points at one thing ("clone this dialog") instead of
running `crawl_overlays`.

Two sources, and the ranking between them matters:

- **Declared** — `document.getAnimations()` gives exact timing and keyframes for
  CSS transitions, CSS animations and WAAPI alike. When it exists it *is* the
  spec.
- **Measured** — a per-frame sampler that works regardless of technique. It is
  the proof, and the only source when nothing is declared.

**Declared wins on a non-overshooting curve.** Sampling runs at ~17ms/frame, so a
180ms transition gets ~7 points and the onset/settle thresholds clip both ends;
"trust measured" is backwards. `frameIntervalMs` is reported so precision is
visible. Only a gross mismatch is a real finding — an interruption, a
reduced-motion override, or a spring library reporting a duration it ignores.

**Unknown timing is now omitted, not defaulted — do not fill it back in.** When
neither a declared transition nor a measurable motion window exists, the emitter
prints no `transition` line for that property and names it in a `NOT EMITTED`
note. It used to substitute `ease-out` and `0ms`, which printed a fabricated curve
under a heading telling you to reuse it verbatim. If you see that note, re-capture
with the transition actually running or read the value from source. Never
substitute a plausible default: once it is in a component, a guessed curve is
indistinguishable from a measured one.

Three fields that now mean exactly what they say:

- `frameIntervalMs: null` — too few samples to observe an interval. It is not 16.7.
- `durationMs: null` in `contracts/<id>.checklist.json` — never established. It is
  not "instant".
- `truncated: true` — the recorder was cut off; frame counts and durations are
  from a subset.

**`agreement` no longer says "confirmed" off an unmeasured value.** The band is
10%, never smaller than two real sample intervals, and it is stated in the string
so you can judge it. `declared Nms; no motion window could be measured — NOT
verified` means exactly that.

**`status: 'arming-timed-out'` is not `no-causal-animations`.** The first means
the subject never resolved or discovery was still in flight — nothing was
observed, so it is not evidence the interaction is unanimated. Re-run with a
correct subject before concluding anything.

Hard-won specifics:

- **Record before triggering.** A CDP click round-trips through the browser; a
  200ms transition is half spent by the time the call returns. Duration is
  therefore onset→settle, never settle-from-zero — otherwise click latency is
  silently added to every measurement.
- **Sample the properties the keyframes name**, not a fixed transform/opacity
  pair. Apps animate `width`, `min-height`, `clip-path`, `filter`. A fixed pair
  reports "no numeric change" for an animation that plainly moved.
- **Overshoot means spring.** Fitting a cubic-bezier to an overshooting curve is
  confidently wrong; fit stiffness/damping instead.
- **A `linear(...)` easing with dozens of stops is a spring baked into WAAPI** —
  what Motion/Framer emits when converting spring physics. Replicate it as a
  spring, or paste the exact stop list.
- **Emit dimensional properties.** Linear's composer maximize drives
  `width`/`max-width`/`min-height` and never touches transform; a
  transform-and-opacity emitter returns empty output for a fully measured
  animation.
- **Report per-property timing spread.** That same maximize finishes height in
  ~171ms while width runs ~284ms. One duration for all of them changes the feel.
- **`ensureClean()` before capturing an entrance.** `reset()` compares against a
  stored baseline, which is useless if that baseline was recorded with something
  already open — it matches a dirty page and reports success. Tier 4 needs an
  absolute criterion: zero visible overlays, escalating to reload.

### The bundle carries its own contract

Capture and implementation are routinely done by **different agents in different
sessions**, and the implementer will not have read this skill. So every captured
state with motion writes `contracts/<id>.md` into the bundle containing:

- the exact `transition` declaration to reuse verbatim
- which properties to **ANIMATE** (driven) and which to **NOT animate**
  (consequences), with the reasoning inline
- the **reference filmstrip** from the original, as an acceptance table

That last item is the point: an implementer in another session cannot produce a
reference for an app they may not be able to reach, so it is recorded at capture
time or it never exists. Point the implementing agent at the contract, not at
this skill.

A contract whose element shows *"Incomplete capture — no transition-property was
recorded"* came from an older build. Re-capture before implementing; its
properties are observations, not instructions.

### Ownership: which element the animation actually drives

`capture_animation` records the live box constraints on every frame, not just
endpoint values, and reports `owns` per node:

```
s2974  transition=max-width   owns: width ← its own max-width
s2976  transition=min-height  owns: height ← its own min-height
s2972  transition=padding     owns: —          (pushes others)
```

**Put each animation on the element that owns the dimension.** An element whose
rendered size tracks its own constraint mid-transition is the one being driven;
the same value on a descendant means that descendant is being pushed.

This distinction is invisible from endpoints. Animating a child instead leaves
the real subject offset by the surrounding chrome for the entire transition —
start and end land exactly right while the middle is wrong, which is
indistinguishable from a bad easing curve and survives every frame-level check
of width, height and internal offsets. Getting it right makes
`height = max(natural, min-height)` fall out of CSS for free; getting it wrong
turns the clone into a tuning exercise that never converges.

**When outputs disagree but the spec matches, the spec is on the wrong element.**
Measure the constraints mid-transition, not the results. Freeze the animation,
seek to 30/50/70%, and dump `minHeight`/`maxHeight`/`flex`/`overflow` per node —
an element whose height equals its own `min-height` at 50% is the subject.

### Before writing a line of a clone: enumerate every animated node

`contracts/<id>.checklist.json` lists every node the capture recorded as
animating, with the properties each drives. **Work through it. All of it.**

The failure this prevents is specific and was hit repeatedly: a maximize
animation recorded four animated nodes — a wrapper animating `padding-top/bottom
94→43px`, the panel animating `max-width`, the body animating `min-height`, and
an icon colour. Implementing the two obvious size nodes produces a clone that
matches width frame-for-frame, matches the footer offset exactly, and still feels
wrong, because the wrapper padding is what carries the dialog's top edge along
the curve. Centring with `place-items-center` reaches the same end position by a
different path.

Pass the checklist and a `nodeMap` to `verify_animation`. Unmapped nodes are
reported as **INCOMPLETE** — coverage is checked before any frame comparison, so
"implemented 2 of 4" cannot hide behind two nodes that happen to match.

Coverage is now graded against nodes actually **probed in the frames**, not
against the keys of the `nodeMap` you passed. Naming a node used to be enough to
mark it covered whether or not the selector resolved. Read three fields:

- `notMapped` — absent from your `nodeMap`.
- `notResolved` — named, but its selector matched no single element during the
  filmstrip. This is the one that used to pass silently.
- `unchangedGeometry` — observed but its box never moved. Not counted as missing
  (colour and opacity are legitimate), but it is where a silent no-op shows up.
- `status: 'no-required-nodes'` — the checklist listed none, so this is **not**
  evidence of a complete implementation.

### Never hand-author what the capture already contains

Every one of these was rebuilt by hand when the real value sat in the frame file,
and every one had to be redone:

- icons — 11 real SVGs are in the frame; unicode glyphs are placeholders
- box values — `min-height: 100px`/`636.24px`, row heights 52/42/40, paddings
- structure — a footer divider that does not exist in the original
- state-specific assets — the expand glyph lives in the *collapsed* frame, since
  that is the state containing it; rotating the collapse icon is a stand-in

A captured pixel value is a measurement at one viewport, not a rule: transcribe
`min-height: 636.24px` and the clone overflows a short window, because the
capture also had `max-height: 100%` next to it. Read the constraint, not just the
size.

### Verifying motion — always filmstrip before believing a clone

`verify_animation` freezes the animation and seeks it to exact progress points,
reporting size and landmark positions at each. Run it on the clone AND on the
original, then compare the tables.

**Property-level measurement passed four times while the visible result was
wrong.** Endpoints and easing can be exactly right while a footer sits still for
half the transition and then lurches. Only matched intermediate frames catch it.

```
progress   Linear        Clone         footer↑bottom (both)
   0%      750x262       750x303            13
  50%      784x391       784x315            13
 100%      820x792       820x638            13
```

Width tracking frame-for-frame and a landmark holding a constant offset is *not*
sufficient — probes report position as well as size, because a clone can match
every size and offset while its top edge follows a different path. Choose the
metrics from what the capture says animates, never from the bugs already found. A landmark that holds still then jumps means a property is
being applied instantly instead of animated.

Two mechanics worth knowing: seek only time-driven animations — progress-based
ones (scroll/view-timeline) throw on absolute `currentTime` and real apps have
them running incidentally — and measure the *panel*, not a full-viewport overlay
wrapper, or the landmark numbers are meaningless.

### Cloning motion: driven vs consequence

Each captured node records its own `transition-property` list, and every measured
property is tagged `driven` or `consequence`.

- **Driven** — the element declares a transition for it. Animate these.
- **Consequence** — it changes because layout responded. Write these instantly,
  or not at all.

Driving a consequence applies it on the first frame and destroys the animation.
Forcing `min-height` on a root that only transitions `max-width` is what made a
maximize jump to full height immediately.

Three rules that follow, all learned the hard way:

- **Do not synthesise transitions.** Captured frames already carry the app's own,
  inline and exact (`transition: max-width 0.3s cubic-bezier(0.43,0.07,0.59,0.94)`).
  Inline beats a stylesheet rule, so anything synthesised is ignored on exactly
  the elements that matter. Change the values; let the captured transitions run.
- **Never infer a stagger from rect onsets.** `w`/`h` come from
  `getBoundingClientRect`, and a rect cannot move until the driving value passes
  the natural content size — so `height` always *looks* late. A 106ms "stagger"
  read this way was pure artifact. Only two CSS-sampled properties can imply one;
  `source: 'rect (derived)'` marks the rest.
- **Applying a consequence instantly is safe for upper bounds, never for floors.**
  Rendered width is `min(width, max-width)`, so a tweening `max-width` still
  drives it. A `min-*` floor forces the final size immediately.

To build and check a clone from a bundle:

```bash
node build-prototype.mjs --bundle ./spec-composer --collapsed 001 --maximized 002
open prototype/index.html
```

It uses the captured frames verbatim, diffs the two endpoints, and animates only
what the elements declare. Nothing in it is hand-authored — a hand-written
approximation proves nothing, since any mismatch could be the transcription.

Worked example — Linear's new-issue composer, measured:

| Phase | Duration | Easing | Animates |
|---|---|---|---|
| open | 300ms | `linear(...)`, 30 stops (a spring) | opacity 0→1, w 712→750 |
| maximize | 300ms | `cubic-bezier(0.43, 0.07, 0.59, 0.94)` | width/max-width 750→820, height 261→637 |
| collapse | 300ms | same curve, exact inverse | 820→750, 637→261 |

### Hover reveals — tooltips, affordances, submenus

`capture_hover_reveal {specId, dwellMs}` hovers a target, waits past the reveal
delay, and diffs page-wide visibility. It classifies what appeared:

- `tooltip` — portals outside the target, small
- `affordance` — `insideTarget: true`, e.g. a `+` that shows on row hover
- `menu` — a menu, listbox, or any other outside surface

**Do not use hover-then-screenshot for these.** A tooltip portals far outside its
target, so a subtree capture cannot contain it; and it fires on a *timer*, so
`settle()` returns long before it exists — settling waits for the DOM to go
quiet, not for a delay that has not elapsed. Both failures report "nothing
appeared" for a reveal that plainly happens.

Submenus need a second call against an item inside the surface just revealed.
Classify by role first: a submenu can be a single short row, so height is a poor
discriminator.

**Hover states can be route-dependent.** Linear's sidebar Agent row shows a `+`
and a "Go to Agent · G then J" tooltip *only when it is not the active route*; on
`/agent` itself it shows neither. Capturing one route and generalising reports a
component as having no hover state when it has a rich one. Record the route as
part of a state's identity.

### Tier 5 — gestures

`capture_drag {fromId, toId}` performs a real drag and records `hover → grab →
drag-10/50/100% → drop → settled`, annotating every frame (source in red,
drag-only surfaces in blue).

A drag is not a trigger and a surface. Its interesting states exist only *during*
the gesture: the lifted row, the portalled drag overlay, the insertion indicator,
siblings translating aside, the settle on release. None are reachable by clicking
and waiting, so no crawler will ever find them.

- **Real pointer input is mandatory** — `mouse.down` → stepped `mouse.move` →
  `mouse.up`. Drag libraries watch `pointerdown`/`pointermove` with genuine
  coordinates and a movement threshold, so a 6px nudge is needed before anything
  lifts. Synthetic events produce nothing, which reads as "not draggable" rather
  than as the wrong technique.
- **The overlay is identified by diffing**, not by being known in advance:
  surfaces present mid-gesture and absent at rest are the overlay and the
  indicator. They are portalled elements — implement them as such, not as styles
  on the source row.
- **It mutates real order.** Confirm a disposable workspace before running.

### Virtualized sections have no subtree to serialize

Linear's sidebar is a flat positioned list, so "Favorites" is a **band of rows**,
not a container. Selector scoping cannot express it and there is no element whose
frame is the section.

- Scope with `includeArea: [x1,y1,x2,y2]` — geometric inclusion, since a band is
  a rect, not a subtree.
- Serialize the **scroller** that owns the rows and record the band as `rect`;
  deliver the section as a **cropped screenshot** (`page.screenshot({clip})`).
  Record `virtualized` on the state so the evidence card says so and prefers the
  crop over the viewport shot.
- Do not inject a marker div and serialize that — it has no children, so the
  frame is empty while looking like a successful capture.

**Diffing is the general tool.** Drag overlays, tooltips, hover affordances and
submenus were all found the same way: snapshot state, act, snapshot again, report
the difference. Reach for a diff before reaching for a selector — a selector
guess encodes what you expect to find, a diff reports what is actually there.

**Also: `cursor: pointer` counts as a trigger.** Linear's sidebar rows are plain
divs with click handlers and no ARIA; role- and tag-based discovery finds one
trigger in the whole section and reports it as inert. The author setting a
pointer cursor is making the same claim ARIA would.

## Before crawling: this clicks real buttons

Tier 2 clicks every trigger it finds, including destructive ones. `DEFAULT_DENY`
skips obvious labels but is **not a safety mechanism** — it exists so the crawler
doesn't destroy the board mid-crawl. Always confirm the target is a disposable
workspace before a run that isn't `--css-only` or `--dry-run`.

**Always pin the target with `--goto` / `navigateTo`. Never attach by pattern
alone for a capture run.** `--url` selects whatever Linear tab exists and adopts
its *current* URL as the baseline. A crashed run leaves the tab wherever its last
click landed, so the next run silently crawls the wrong page and keeps resetting
back to it. Symptom: the user watching the browser sees it clicking around a page
they never asked for.

**Confine the run to a region.** Users routinely mean "spec this page", not "click
everything in the app chrome". Label-based deny cannot express "not the sidebar" —
every nav item has a different label. Discover regions first, then scope:

```bash
node index.mjs --endpoint … --goto "<url>" --regions        # what's here?
node index.mjs --endpoint … --goto "<url>" \
  --scope "main" --exclude "nav, aside, header" --depth 1
```

Agent mode: `list_regions` then `set_region {include, exclude}`. The region is
**sticky for the session** — set once, honoured by `crawl_overlays` and reported
back in every `frontier` response. Per-call scoping was rejected deliberately: an
argument an agent can forget is an argument that produces a sidebar crawl.

Scoping is also a cost control. Excluding chrome removes the navigation triggers
that cause routes, and routes are what force full page reloads mid-crawl.

## Hard-won details — do not regress these

Each of these was a real bug found against production Linear.

- **`element.click()` is not enough.** Menus open on `pointerdown`; SVG elements
  have no `.click()` method at all. Click escalates: real CDP click → coordinate
  `mouse.click` → hand-dispatched pointer sequence. Also resolves upward to the
  nearest `button`/`a`/`[role=button]`, since ARIA often sits on an inner icon.
- **spec-ids die on navigation.** Never hold a trigger list across a reload.
  Re-enumerate every iteration and track work by `tag|role|label|ordinal`.
  Symptom when broken: run-to-run variance with identical inputs.
- **Two overlay mechanisms.** Some apps mount new DOM; others pre-render and
  toggle visibility. Linear does the latter — detecting only "new DOM" finds
  nothing. `harvestSurfaces()` covers both.
- **Overlays must be out of normal flow.** Role alone matched Linear's issue
  board (`role="grid"`). Require an overlay role *and* absolute/fixed/sticky.
- **Container roles lie.** Radix renders every popover as `role="dialog"`, so a
  dropdown reports as a dialog. Rank evidence: trigger `aria-haspopup` >
  descendant `role="menu"`/`listbox` > container role. Stored as `roleEvidence`.
- **Tagging is destructive.** An element tagged mid-fade (opacity 0) is never
  "fresh" again, so retries find nothing. Candidates accumulate in `pendingFresh`.
- **Reset must be verified.** Escape → click-away → reload, checked against a
  baseline signature each time. Unverified dismissal silently attributes one
  menu's styles to the next trigger.
- **Nested states are reached by replay, not unwind.** Escape inside a dropdown
  often closes the whole dialog. Every state carries a `path`; to reach it, reset
  and re-click from root.
- **Anchor geometry is the payload, not the rects.** `anchor` records
  `{side, align, gap}` — the exact props a Floating-UI/Popper call takes. Two
  rects in JSON leave that to be re-derived by hand every time.

## Pushing into Paper

Paper MCP runs at `http://127.0.0.1:29979/mcp` (check `/health`). If it isn't
registered as a tool, drive it over HTTP — it rejects any request carrying an
`Origin` header, and replies as SSE (`data:` frame).

```bash
node paper-import.mjs --bundle ./spec-agent-page --dry-run
node paper-import.mjs --bundle ./spec-agent-page --evidence
```

`--evidence` adds a second artboard per state: kind, trigger, anchor
(side/align/gap), size, detection mechanism, `roleEvidence`, CSS-state summary,
motion (duration, easing, per-property from→to), and the **annotated** context
screenshot embedded as a data URI. Without it the
Paper file holds components with no record of how they were reached, and the
evidence stays on disk where an agent reading the design will not find it.

### Traps, each of which cost a debugging round

- **`create_artboard` requires whole pixel values.** `height: 'fit-content'`
  yields a 0px artboard that renders nothing while its subtree is perfectly
  correct.
- **`update_styles` takes `{updates: [{nodeIds, styles}]}`**, not flat
  `{nodeIds, styles}`. The flat shape throws. Wrapped in a bare `catch` it
  throws *silently*, and every artboard keeps a wrong fixed height across
  repeated imports with no error anywhere. Never swallow a Paper tool error.
- **Artboards clip content and do not honour `fit-content`.** Size them by
  measuring the child that was just written (`get_tree_summary`, parse `W×H`)
  and setting an explicit px height. An oversized artboard leaves dead space; an
  undersized one silently cuts the bottom off — and `get_screenshot` on the
  artboard, the obvious way to read it, then returns a truncated image with no
  hint anything is missing.
- **Embedded images need explicit width AND height.** Paper resolves `<img>` to
  a Rectangle with an image fill; `width: 100%` with no height gives it no
  aspect ratio and it collapses to ~2px. Read the PNG's IHDR chunk (bytes 16–24)
  for intrinsic size and scale. Paper auto-names these from image content, so
  they land as real design nodes.
- **`normalizeFrameRoot` must skip the `<style>` prelude.** A Paper frame is
  `capturedAnimationsStyle + rawHtml`, so any surface with `@keyframes` starts
  with `<style>…</style>`. Matching the literal first tag neutralises the style
  block and leaves the panel's `position: absolute; top; left` intact — which
  renders it outside its own artboard, clipped. Surfaces *without* animations
  work fine, so this passes verification on the first thing you test.
- **Artboards default to white**; set `backgroundColor: 'transparent'` or any
  area the surface doesn't cover reads as a capture bug.
- `lch()` colours are fine; Paper converts them (`lch(12.72 0.85 272)` → `#212122`).

Verify by screenshotting the created node via Paper MCP `get_screenshot` and
looking at it. A correct node tree is not evidence that anything rendered — a
2px image and a clipped artboard both have perfect trees.

## Output

```
spec-bundle/
  spec.json        every state + crawl report + Tier 1 scan
  frames/*.html    Paper-pasteable (inline styles + @keyframes)
  jsx/*.jsx        same capture aimed at code
  shots/*.png      screenshot per state
  states/*.json    per-surface CSS state matrix
  debug/*.png      --debug-inert: triggers that produced nothing
```

`crawlReport.inertDetail` explains every trigger that produced nothing. When
coverage is poor, read it and the debug screenshots before theorising — a shot
of the resting page means the click missed; a shot of an open surface means
detection missed.

## Preconditions: the failure mode that produces numbers

The dangerous failure here is never an exception. It is an action that silently
does not happen, followed by a measurement that looks entirely plausible and is
reported as fact. Four separate answers were sent to another agent this way:

- `keyboard.type()` without clicking the field first typed into nothing, so
  "blur discards the folder name" was measured on an empty input. Blur commits.
- A row lookup by visible text matched a suggestion chip 700px away in the
  content area rather than the sidebar row, so a drag was measured that never
  touched the intended element.
- A "new favourite" detector matched a pre-existing folder with a similar name,
  so a whole child-indent measurement was taken by dragging one folder onto
  another. Folders do not nest, which is why the numbers came out as zero.
- A "still present?" check read a virtualized DOM and reported leftovers that
  had already been deleted. Two extra cleanup passes chased nothing.

Use `src/assert.mjs` rather than relying on care:

- `typeInto(driver, selector, text)` — clicks the field, types, and reads the
  value back. Throws if the keystrokes did not land.
- `elementByText(driver, text, {within})` — throws on ambiguity instead of
  silently taking the first match. Pass `within` to scope to a region.
- `actAndExpectChange(driver, action, {probe, label})` — requires the caller to
  name what should change. The first version asked "did anything change?" and
  passed a deliberate no-op every time, because a live app mutates constantly.
  A check that cannot fail is not a check.
- `dragAndVerify(driver, {fromId, toId})` — confirms the source actually moved.

### A guard proves its own claim and nothing more

`dragAndVerify` correctly reported that a row moved. That was true, and it was
still the wrong conclusion: moved is not nested. The follow-up checks each
failed differently — a collapse click that reordered instead of collapsing, and
a DOM containment test that returned true for *every* folder because they all
share one list container. Containment only implies nesting once you have
confirmed the container does not also hold the siblings.

State the claim, then ask what else would make the observation true. Reload the
page before concluding something was or was not persisted; virtualized lists and
undo toasts both keep stale text in the DOM.

## Verifying motion, not just endpoints

`spec-crawler/verify-animation-parity.mjs` freezes the real transition and the
implementation's, seeks both to the same progress fractions, and diffs position
and size at each one:

```
node verify-animation-parity.mjs \
  --reference linear.app --reference-toggle '[aria-label="Expand"]' \
  --reference-panel '[role=dialog] > div > div' \
  --candidate localhost:5178 --candidate-toggle '[data-part="toggle"]' \
  --candidate-panel '[data-part="panel"]'
```

It also prints which properties animate on which elements — the finding that
endpoint comparison cannot produce. The same curve on the wrong property, or the
right property on the wrong element, lands correctly at both ends and is visibly
wrong between roughly 30% and 70%.

Four ways this measurement lies, all now guarded in the tool:

- **Background tabs.** `requestAnimationFrame` does not fire in one, so a seek
  loop never resolves. This reads as a hung browser and cost a diagnosis of
  "leaked CDP connections, restart the browser" when the tab was fine.
- **Unequal viewports.** Anything sized in `vh` produces different pixel values
  per window height. Two correct implementations then disagree by hundreds of
  pixels. Force identical device metrics on both.
- **Measuring before reflow.** Trigger a transition on the same frame as a
  viewport override and it captures its start value from the pre-resize layout —
  a position offset that decays to zero across the curve, indistinguishable from
  an easing mismatch. Wait for the reflow.
- **A still-running transition.** Starting while the previous one finishes
  captures it as "fresh" and reports a trajectory running the wrong direction.
  Wait for animation-quiet first, and check that both sides moved the same way.

### Prefer raw CDP for anything time-sensitive

Playwright's `connectOverCDP` enumerates every target in the browser and blocks
if any single one is unresponsive. One target driven into a bad state makes the
whole browser look wedged. A socket to one page keeps working.

### Units, not pixels

Linear's composer positions itself with `13vh` / `6vh` padding. Captured at one
window height that reads as 94px/43px; at another, 117px/54px. Both are correct
readings of the same rule, and a hard-coded pixel value is right at exactly one
window size. When two captures of the same property disagree, look for the unit
that explains both before trusting either — percentage padding resolves against
the containing block's *width*, so vertical values in a ratio to viewport height
can only be `vh`.

## A bundle resumes; it does not wipe

`new Bundle(outDir)` used to clear its own subdirectories on construction. That
is correct for a fresh sweep and catastrophic mid-session: re-attaching the
browser to get back to a page — the normal way to recover after following a link
— reconstructs the Bundle and deletes everything captured so far. The only
symptom is `bundle_write` reporting zero states afterwards, long after the
captures are gone.

It cost two captures twice before being fixed. Now:

- **Default is resume.** An existing `spec.json` is loaded, numbering continues
  from it, and the dedupe hash set is rebuilt so a resumed run still recognises a
  state it captured before the interruption.
- **`{ fresh: true }` wipes**, and has to be asked for. `browser_attach` exposes
  it as an input; the CLI passes it, because one invocation is one sweep.

The general rule this is an instance of: **a constructor that deletes user data
is a trap, however well documented.** The safe behaviour has to be the default,
and the destructive one has to be named at the call site.

### Two other things this session surfaced

- **`capture_css_spec` unscoped is unusable on a large app** — 550k characters on
  Linear's issues view. Always pass a `specId`.
- **A 12×12 checkbox is too small to click blind.** `click` on one hit the row
  link behind it and navigated away instead of selecting. The call succeeded. Any
  target under about 16px needs its effect asserted, not assumed.

## Tag after the page settles, and refuse an untagged map

`establishBaseline` used to tag the DOM the instant it was called. Attach to an
app mid-hydration and it tags a skeleton; the real controls arrive afterwards,
untagged. `page_describe` then returns a full, correct-looking map of 130
elements in which **every id is null**, and `frontier` reports "nothing untried"
— accurately, because nothing tagged exists to try.

Three rounds were spent reading that as a broken exploration loop. Nothing threw.
The symptom was a tool being unhelpful, not a tool failing.

Two changes, and the second matters more than the first:

- `establishBaseline` settles before tagging.
- `describe` **re-tags once and then throws** if every id is still null. A map
  whose entries cannot be clicked, hovered or captured is not a partial answer —
  it is a useless one wearing the shape of a complete one.

The general form, which by now has cost this toolkit more than any other single
mistake: **a call that succeeds while returning unusable data is worse than one
that fails.** When a tool can tell that its own output cannot be acted on, it
should say so rather than hand it back.

### Test through the caller's entry point

The guard above was written against the wrong shape — `describe()` returns
`{url, title, viewport, items}`, not a bare array — and `node --check` passed on
it happily. So did the `Bundle` resume fix, whose MCP wrapper referenced an
undefined `fresh` that only surfaced on the first real call.

Both were caught by running the actual path, and neither would have been caught
by testing the layer below it.
