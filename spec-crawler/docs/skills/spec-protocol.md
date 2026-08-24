<!--
  SNAPSHOT — the canonical copy is ~/.claude/skills/spec-protocol/SKILL.md, which is what
  Claude actually loads. This copy exists because that directory is not version
  controlled and lives on one machine. Update the canonical file first, then
  re-copy here. If the two differ, the one under ~/.claude wins.
-->

---
name: spec-protocol
description: The builder/spec two-session contract for protocolbase — how to request a MEASURE, VERIFY or RECONCILE, what a response must contain, and which checks gate a UI claim. Load when working on protocolbase UI, when messaging the other session about design fidelity, or when asked to verify that an implementation matches Linear.
---

# Spec protocol

Two Claude sessions build protocolbase. One writes code, one owns the browser and
the measurements. This file is the contract between them, and it exists because
both sessions have shipped confident, plausible, wrong output when nothing could
contradict them.

## The rule everything else serves

**The session making a claim is not the session that checks it.**

A session that builds and verifies its own UI reads its own diff generously. This
is not a discipline problem — it is structural, and the fix is structural.

## Roles

| | Owns | Never does |
|---|---|---|
| **Builder** | protocolbase code, data layer, product decisions | Declares UI "matches Linear" on its own authority |
| **Spec** | CDP browser, Linear captures, `spec-crawler`, the verifiers | Writes protocolbase feature code, decides scope |
| **Ahmed** | Taste, scope, "is this the right thing at all" | Hand-checks what a verifier could check |

Each repo's `CLAUDE.md` states which role that session is. On starting a session,
run `ListAgents` to find the counterpart; address it by name with `SendMessage`.

## The three verbs

Messages between sessions lead with one of these. Anything else drifts into prose
and loses the numbers.

### MEASURE
Builder needs ground truth for a surface it has **not built yet**. Ask before
implementing, not after — reworking a built surface costs more than waiting.

Include: the surface, which states matter, and any specific values needed.

### VERIFY
Builder has shipped it to localhost and wants a verdict. Include: the localhost
URL, the selector for the element, and the state to compare.

### RECONCILE
Two captures disagree, or a capture disagrees with a screenshot. The response
names which reading is authoritative **and explains where the other came from** —
an unexplained discrepancy usually means one of the two was measured wrong.

## Every response carries these sections

1. **Measured** — values with units. Tokens, geometry, timing.
2. **How it was reached** — the entry path. Several surfaces have turned out to be
   unreachable by the obvious route; a value without its path is not reproducible.
3. **Not measured** — mandatory, and the most important section. What was out of
   scope, what could not be driven, what is assumed.
4. **Verdict** (VERIFY only) — pass/fail with deltas, plus a diff image path.

An empty *Not measured* section is a warning sign, not a good result. Two wrong
answers reached the builder this week precisely because nothing forced that field
to be filled in.

## Gates — and what each cannot prove

| Tier | Verifier | Cannot prove |
|---|---|---|
| 1 · CSS states | computed-style diff | that the state is reachable by a user |
| 2 · Overlays | structure + token diff | which trigger opens it |
| 3 · Flows | `src/assert.mjs` | that the effect is the *intended* one |
| 4 · Motion | `verify-animation-parity.mjs` | that it holds 60fps under load |
| 5 · Gestures | phase snapshots | drop semantics — **moved ≠ nested** |
| · Pixels | `verify-implementation.mjs` | *why* it diverged |

**A guard proves its own claim and nothing more.** `dragAndVerify` correctly
reported that a row moved; that was true and still the wrong conclusion. After
any check passes, ask what else would make the same observation true.

### What the verifiers now refuse to claim (2026-08-24)

The crawler was audited for one defect class: a verdict produced from evidence
that was never gathered. Six of these reached this protocol as clean answers, so
the *absence* of these failures is now itself part of the contract:

- **A declared verification that never ran fails the run.** `[].every()` is true,
  so an unrun verification used to report `ok`. If a response says verification
  passed, it ran.
- **`reset()` reports `clean: false` when it is not clean.** Its reload path used
  to re-baseline and then compare against that new baseline, so it could never
  disagree — and a swallowed navigation failure still reported clean.
- **A `moved` postcondition fails when its subject vanished.** It used to pass, so
  a drag that deleted its target satisfied its own check. Still true that
  **moved ≠ nested**; now also true that **gone ≠ moved**.
- **Unknown motion timing is omitted, never defaulted.** The emitter used to
  substitute `ease-out`/`0ms` for timing it had explicitly marked unknown, printed
  under a heading saying to reuse it verbatim. A `NOT EMITTED` note means
  re-capture — do not fill in a plausible curve.
- **`agreement` will not say "confirmed" against an unmeasured value.** The band
  is 10% (never smaller than two real sample intervals) and is stated in the
  string. `frameIntervalMs: null` means too few samples, not 16.7.
- **A fully-masked pixel comparison is not a pass**, and `paper-import` exits 1 on
  a clipped artboard rather than printing it as a success.

Two capture-side changes that affect what a MEASURE can even be asked for:

- **`expect` is required** on `capture_at` / `capture_state_matrix`. A coordinate
  is not an identity once a list virtualises.
- **A live region must be declared `volatile`** or its component cannot be
  captured at all — it fails `ERR_CAPTURE_DRIFT`. On Linear that is most issue
  rows. A `volatile` declaration is recorded in the manifest with its stated
  reason, and appears in the verification report as the regions it declined to
  compare. **Treat an unexplained mask in a response as a finding**, and say in
  *Not measured* which regions were excluded and why.

## Verify primitives, not screens

Screen-by-screen comparison does not scale. Linear is a small primitive set
applied consistently — surfaces, pill controls, one easing curve, every neutral at
hue 272. Check conformance to the primitive; only fall back to whole-surface
comparison when a primitive does not cover it.

Current primitive values and open items:
`~/Documents/paper-snapshot/spec-crawler/specs/`

## Standing rules, each learned from a specific failure

- **Never hand-author what is captured.** Icons come from the frame via
  `extract-assets.mjs`. A redrawn icon is the most visible way a clone stops
  being one.
- **Reload before concluding persistence.** Virtualised lists and undo toasts
  keep stale text in the DOM, so a "still present?" scan lies.
- **Units, not pixels.** Linear positions the composer with `13vh`/`6vh`. Captured
  at one window height that reads 94px; at another, 117px. When two captures of the
  same property disagree, find the unit that explains both before trusting either.
- **Normalise state and viewport before comparing.** Two runs in opposite
  directions, or at different window heights, produce enormous meaningless deltas.
- **Foreground the tab for anything time-based.** `requestAnimationFrame` does not
  fire in a background tab; a seek loop then hangs and looks like a wedged browser.
- **Prefer raw CDP over `connectOverCDP` for time-sensitive work.** Playwright
  enumerates every target and blocks if any one is unresponsive.

## Environment

`~/Documents/paper-snapshot/spec-crawler/bin/spec-up-paired.sh` restores it after
a restart: debug browser on port 9222 with the persistent profile
`~/.spec-crawler-edge` (which is what keeps Linear and protocolbase signed in),
plus the reference and candidate tabs, plus the pairing checks that otherwise fail
silently. `spec-up.sh` is the older script and skips those checks — prefer the
paired one.

**Port 9222 being open is not evidence that a measurement came from this MCP.**
It proves a browser is reachable and nothing else. `runtime_handshake
{challenge: "..."}` echoes the challenge and reports the source fingerprint and
the MCP client it saw at initialize; every tool result also carries
`_meta["spec-crawler/provenance"]`. When a VERIFY response is challenged, that is
the artifact to quote — while being clear it attests *routing*, not integrity
against a hostile process.

The spec crawler that the MCP executes lives at
`~/Documents/paper-snapshot/spec-crawler` and is currently the
`feat/spec-crawler-determinism` code (27 tools; 25 means a stale process). The
git worktree for that branch is `~/Documents/paper-snapshot-determinism`. A code
change does not reach a live session until the MCP process restarts. See the
`spec-capture` skill for the sync procedure — do not `git checkout` inside
`~/Documents/paper-snapshot`, whose `spec-crawler/` is untracked and holds the
capture corpus.

Sessions are disposable. The browser profile, the spec files, and this contract
are not — so anything that matters goes in `spec-crawler/specs/` and the message
carries the path. Cross-session messages are not memory.
