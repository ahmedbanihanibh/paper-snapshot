# spec-crawler

Capture a web app's **design spec** — not one screenshot, but every state a component can be in — and land it in Paper as editable frames.

Reuses the extension's `elementSerializer` verbatim (extracted at runtime from `background.js`), so a crawled frame pastes into Paper identically to a hand-captured one. Fix a serialization bug in the extension and this inherits it.

## The three tiers

Interaction states are not one problem. They're three, with different automation stories:

| Tier | What | How | Autonomous |
|---|---|---|---|
| 1 | CSS states — `:hover`, `:focus-visible`, `:active`, `[data-state]` | parse stylesheets | yes, mutates nothing |
| 2 | Overlays — menus, dialogs, popovers | click every trigger, capture what appears | yes |
| 3 | Flows — "select 2 cards → ⌘ → palette" | an agent decides | needs Claude Code |

Tier 1 can't see JS-driven changes. Tier 2 can't know that selecting two cards means anything. Tier 3 exists because no crawler infers domain intent — only a model looking at the page does.

## Setup

The crawler attaches to an **already-running browser** so it inherits your logins. Quit Edge fully first:

```bash
open -na 'Microsoft Edge' --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.spec-crawler-edge"
```

Sign in to the target app in that window once. The profile persists, so this is a one-time step.

```bash
cd spec-crawler && npm install
```

## CLI — Tiers 1 and 2

```bash
node index.mjs --url "linear.app" --limit 20
node index.mjs --url "linear.app" --css-only    # scans, clicks nothing
```

Start with `--limit 15` on a new app to see what it does before letting it loose.

## MCP — all three tiers, agent-driven

`.mcp.json` in the repo root registers this server plus your Paper MCP app. Launch Claude Code from the repo and ask it to capture; it drives the tools itself.

Tools: `browser_attach`, `page_describe`, `capture_css_spec`, `crawl_overlays`, `click`, `press`, `hover`, `force_state`, `capture_state`, `reset`, `bundle_write`, `paper_copy`.

`force_state` is the interesting one — it reaches into the real style engine via CDP (DevTools' "force state" checkbox). Forcing `hover` on an **ancestor** materialises `group-hover:` children, which is how you capture a reveal-on-hover button without a pointer.

## Output

```
spec-bundle/
  spec.json          index of every state + the Tier 1 CSS report
  frames/*.html      Paper-pasteable (inline computed styles + @keyframes)
  jsx/*.jsx          same capture aimed at code
  shots/*.png        screenshot per state
```

`paper_copy` puts a frame on the macOS clipboard in Paper's `<x-paper-html>` envelope — switch to Paper and press ⌘V.

## This clicks real buttons

Tier 2 enumerates every trigger it can find and clicks it. On an authenticated app that includes destructive actions. `DEFAULT_DENY` skips obvious ones (`delete`, `archive`, `sign out`) but that is **not a safety mechanism** — it exists so the crawler doesn't destroy the board it's halfway through crawling.

Point this at a disposable workspace.

## Design notes

- **Identity via `data-spec-id`.** DOM node references can't cross an `evaluate` boundary and CSS paths break when a portal re-renders. Elements are tagged once; anything untagged later is by definition new DOM.
- **Settle, don't sleep.** Overlays animate in; serializing mid-transition captures half-faded opacity. A MutationObserver quiet period adapts to the machine.
- **Reset is verified.** Escape → click-away → reload, each checked against a baseline signature. An unverified dismiss is how crawlers silently attribute one menu's styles to the next trigger.
- **Dedupe is structural, not textual.** The same menu opened from three places is one component; the same menu with different item labels still is.
