# This repo is the SPEC session

You own the browser, Linear ground truth, and the verifiers. You do **not** write
protocolbase feature code — the builder session does, in its own repo.

**Load the `spec-protocol` skill at the start of any fidelity work.** It carries
the request verbs, the required response sections, the gate table, and the
standing rules. Do not restate them from memory; they were each learned from a
specific failure and the wording matters.

## On starting a session

1. **`spec-crawler/bin/spec-up-paired.sh`** — the one to use. Brings up the debug
   browser on port 9222 with the persistent profile `~/.spec-crawler-edge` (which
   is what keeps Linear and protocolbase signed in) and reports whether Claude in
   Chrome is installed in that same profile.

   `spec-up.sh` is the older script and does the same launch without the pairing
   checks. Prefer the paired one; it fails loudly on the things that otherwise
   fail silently.

2. `ListAgents` — find the builder session and address it by name.

### Why the profile is dedicated, and why you cannot use your normal browser

Chromium **ignores `--remote-debugging-port` when the browser runs on its default
user-data-dir**. That is deliberate hardening — it stops malware attaching to your
logged-in browser — and it fails in the worst way: Edge launches, the flag is
visible in `ps`, and nothing ever listens on the port. Measured here on Edge 151,
same binary, one variable:

| launch | port |
|---|---|
| `--user-data-dir=~/.spec-crawler-edge` | opens |
| default profile, no `--user-data-dir` | never opens |

So "just debug the profile where Claude in Chrome already lives" is not an option.
The extension has to be installed **into** `~/.spec-crawler-edge`, once, through
the browser UI. It cannot be scripted: copying the signed extension directory
across profiles breaks its integrity check and Edge disables it.

Never pass `--user-data-dir` pointing at the real Edge profile to work around
this. That is what corrupts Preferences.

## Capturing: use the intent tools, not the primitives

`capture_at` and `capture_state_matrix` take **screen coordinates**, resolve the
point to a component boundary, resolve `subgrid`, measure everything a screenshot
loses, and write that measurement into the annotation. Reach for those first.

The primitives — `page_describe`, `click`, `hover`, `capture_state(specId, …)` —
are still there and still correct, but composing them by hand is how a session
turns into script-writing. Drop to them only for states a pointer cannot reach.

**You supply the half that cannot be measured.** Pass `why` and `path`: what the
component is, and how you got to this state. That is your own action trail and
nobody else has it. Everything else — geometry, tokens, pseudo-element fills,
resolved grid tracks, state attributes — is filled in for you, so do not guess at
it and do not restate it.

**A screenshot cannot verify a capture.** The `shots/*.png` beside every frame is
rendered *in place*, so it looks perfect even when the serialized frame is broken.
Thirteen issue-row frames reached Paper as vertical stacks with thirteen correct
PNGs beside them. After `paper_import`, screenshot an artboard **in Paper** and
look at it.

## What you answer

Requests arrive from the builder as **MEASURE**, **VERIFY**, or **RECONCILE**.
Every reply carries: Measured · How it was reached · **Not measured** · Verdict.

The *Not measured* section is not a formality. Two wrong answers reached the
builder because nothing forced it to be filled in — a child indent taken from
dragging one folder onto another, and a commit-on-blur behaviour measured on an
input the keystrokes never reached.

## Where things live

| | |
|---|---|
| Captured specs, handed to the builder by path | `spec-crawler/specs/` |
| Extracted icons — never redraw one | `spec-crawler/assets/`, via `extract-assets.mjs` |
| Pixel verdict | `spec-crawler/verify-implementation.mjs` |
| Motion verdict | `spec-crawler/verify-animation-parity.mjs` |
| Precondition guards | `spec-crawler/src/assert.mjs` |
| Capture tiers and traps | `~/.claude/skills/spec-capture/SKILL.md` |

Write findings to `spec-crawler/specs/` and send the path. Cross-session messages
are not memory; the files are.

## Before you trust a measurement

Drive the precondition rather than assuming it took — `typeInto`, `elementByText`,
`actAndExpectChange`, `dragAndVerify` in `src/assert.mjs` exist because actions
that silently do nothing still produce plausible numbers.
