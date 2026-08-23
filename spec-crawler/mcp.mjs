#!/usr/bin/env node
/**
 * spec-crawler as an MCP server.
 *
 * Deterministic work (CSS scan, overlay crawl) is exposed as single tools —
 * an agent shouldn't spend 200 round-trips on something a loop does correctly.
 * The primitives below exist for the states a crawler provably cannot find:
 * "select two cards, press Cmd, capture the palette".
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { SpecDriver } from './src/driver.mjs';
import { Bundle, copyFrameToPaper } from './src/bundle.mjs';
import { crawlOverlays, DEFAULT_DENY, keyedList } from './src/crawl.mjs';
import { importBundle, PaperClient } from './src/paper.mjs';
import { captureAnimation } from './src/animation.mjs';
import { filmstrip, landmarks, probe } from './src/filmstrip.mjs';
import {
  driveStateMatrix, ensureTagged, formatAnnotation, serializeStable, measuredAnnotation, resolveComponentAt, resolveSubgrid,
} from './src/capture-intent.mjs';
import { captureDrag } from './src/gesture.mjs';
import { captureReveal } from './src/reveal.mjs';
import { readFileSync as _readFileSync } from 'node:fs';
import { classify, keyedList as _keyed } from './src/crawl.mjs';

const DEFAULT_ENDPOINT = process.env.SPEC_CRAWLER_CDP ?? 'http://localhost:9222';
const DEFAULT_OUT = process.env.SPEC_CRAWLER_OUT ?? path.resolve('./spec-bundle');

/** Live session. Attaching is explicit so the agent can't silently drive the wrong tab. */
let driver = null;
let bundle = null;

/**
 * Exploration memory for the Tier 3 loop.
 *
 * An agent driving raw primitives has no way to know what it already tried —
 * it re-clicks the same button and re-captures the same surface until it runs
 * out of context. Interactions are keyed by (state, trigger) rather than by
 * trigger alone: "Priority" inside the composer is a different affordance from
 * "Priority" on the board, and collapsing them loses real states.
 */
let explorer = { tried: new Set(), dryRounds: 0, seenStates: new Set(), lastCaptureCount: 0 };
const resetExplorer = () => { explorer = { tried: new Set(), dryRounds: 0, seenStates: new Set(), lastCaptureCount: 0 }; };
const markTried = async (label) => {
  const stateKey = await driver.currentStateKey().catch(() => 'unknown');
  explorer.tried.add(`${stateKey}::${label}`);
};

const requireDriver = () => {
  if (!driver) throw new Error('Not attached. Call browser_attach first (start Edge with --remote-debugging-port=9222).');
  return driver;
};
const requireBundle = () => {
  bundle ??= new Bundle(DEFAULT_OUT, { url: driver?.baselineUrl });
  return bundle;
};

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

const TOOLS = [
  {
    name: 'browser_attach',
    description: 'Attach to a running Edge/Chrome over CDP and select the tab to capture. Start the browser with --remote-debugging-port=9222 so the session keeps its logins. Call this before anything else.',
    inputSchema: {
      type: 'object',
      properties: {
        urlPattern: { type: 'string', description: 'Regex matched against open tab URLs, e.g. "linear.app". Omit to use the first tab.' },
        navigateTo: { type: 'string', description: 'Navigate the attached tab to this URL before crawling. Use to scope a run to one specific page.' },
        endpoint: { type: 'string', description: `CDP endpoint. Default ${DEFAULT_ENDPOINT}` },
        outDir: { type: 'string', description: `Bundle output directory. Default ${DEFAULT_OUT}` },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_regions',
    description: 'List the page landmarks worth scoping to (main, nav, aside, header, role-based regions) with how many triggers each holds. Call this BEFORE crawling an unfamiliar page to decide what to include or exclude, instead of guessing selectors.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_region',
    description: 'Bound every subsequent crawl and frontier call to part of the page. Sticky for the session — set it once. Use when the user says to stay out of the sidebar or to only spec the main content. Label-based deny cannot express this; every nav item has a different label.',
    inputSchema: {
      type: 'object',
      properties: {
        include: { type: 'string', description: 'CSS selector to confine the crawl to, e.g. "main" or "[role=\'main\']".' },
        exclude: { type: 'string', description: 'CSS selector never to click inside, e.g. "nav, aside, header".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'page_describe',
    description: 'Compact map of the current page: every interactive element with its spec id, role, label, state and rect. Use this to decide what to click — it is far cheaper than reading HTML. Re-call after any interaction, since ids of new DOM only exist once tagged.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'capture_css_spec',
    description: 'Tier 1. Static scan of every stylesheet for hover/focus/active/disabled/[data-state] rules. Reports which elements have which states, what each state changes, and whether a state is self-driven or triggered by an ancestor (group-hover). Requires no interaction and mutates nothing.',
    inputSchema: {
      type: 'object',
      properties: { specId: { type: 'string', description: 'Limit the scan to this element subtree. Omit for the whole document.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'crawl_overlays',
    description: 'Tier 2. Autonomously click every discoverable trigger, capture each menu/dialog/popover that appears, dedupe, and reset between each. Set depth:2 to also capture the controls INSIDE each overlay (a dialog\'s buttons and dropdowns). Returns a report. This CLICKS REAL BUTTONS — only run against a disposable workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max ROOT triggers to visit. Start small (10-20) to sanity-check before a full run.' },
        depth: { type: 'number', description: '1 = overlays only (default). 2 = also crawl controls inside each overlay, e.g. a dialog\'s buttons and dropdowns. 3 = one level deeper. Cost rises steeply: roughly 73 / 550 / 2000+ clicks on a page with 73 root triggers.' },
        shots: { type: 'string', description: "minimal | context (default) | all. 'context' also saves the trigger element and the full viewport with the surface open, so a code agent implementing this can see what opens it and how it anchors." },
        scanStates: { type: 'boolean', description: 'Run the Tier 1 CSS scan scoped to each captured surface, so you get the hover/focus/active states of a dialog\'s own controls. Default true, near-zero cost.' },
        deny: { type: 'string', description: `Regex of trigger labels to skip. Default: ${DEFAULT_DENY}` },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'click',
    description: 'Tier 3 primitive. Click an element by its spec id (from page_describe), then wait for the DOM to settle. Returns any new surfaces that appeared, with their ids.',
    inputSchema: {
      type: 'object',
      properties: { specId: { type: 'string' } },
      required: ['specId'],
      additionalProperties: false,
    },
  },
  {
    name: 'press',
    description: 'Tier 3 primitive. Press a key or chord (e.g. "Escape", "Meta+k", "Shift+ArrowDown"), then wait for the DOM to settle. Returns any new surfaces. Use for command palettes and keyboard-only states.',
    inputSchema: {
      type: 'object',
      properties: { keys: { type: 'string' } },
      required: ['keys'],
      additionalProperties: false,
    },
  },
  {
    name: 'hover',
    description: 'Tier 3 primitive. Move a real pointer over an element, producing genuine :hover AND any JS-driven hover behaviour (tooltips, portalled popovers) that a CSS scan cannot see.',
    inputSchema: {
      type: 'object',
      properties: { specId: { type: 'string' } },
      required: ['specId'],
      additionalProperties: false,
    },
  },
  {
    name: 'force_state',
    description: 'Force CSS pseudo-states on an element via the real style engine (DevTools "force state"). Forcing hover on an ANCESTOR is how you materialise group-hover children. Persists until cleared, so you can capture the state.',
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string' },
        states: { type: 'array', items: { type: 'string', enum: ['hover', 'active', 'focus', 'focus-visible', 'focus-within', 'visited', 'target'] } },
      },
      required: ['specId', 'states'],
      additionalProperties: false,
    },
  },
  {
    name: 'frontier',
    description: 'Tier 3 loop driver. Reports where the page currently is, whether that state is new, and which interactions here have NOT been tried yet. Call this at the top of every exploration round instead of re-reading the whole page: it is what stops you re-clicking the same button forever. When exhausted is true there is nothing left to try in this state — reset or navigate elsewhere. When dryRounds reaches 2-3 with no new states, stop.',
    inputSchema: {
      type: 'object',
      properties: {
        scopeId: { type: 'string', description: 'Limit to interactions inside this surface, e.g. only the controls in an open dialog.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'novelty',
    description: 'Ask whether the current state (or a given surface) is something already captured, WITHOUT capturing it. Use before capture_state when unsure. Comparison is structural, so the same menu with different item text counts as already seen.',
    inputSchema: {
      type: 'object',
      properties: { specId: { type: 'string', description: 'Surface to test. Omit to test the page as a whole.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'capture_component',
    description: "Spec ONE component end to end: open it, capture its frame, screenshots, CSS state matrix and its opening animation, and add it to the bundle. Seconds rather than a full crawl. Use whenever the user points at a single thing — 'clone this dialog', 'spec just this menu' — instead of crawl_overlays. Follow with paper_import --only to place just that one.",
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string', description: 'Trigger that opens the component (from page_describe or frontier).' },
        name: { type: 'string', description: 'Name for the captured state. Defaults to the trigger label.' },
        withAnimation: { type: 'boolean', description: 'Also record the opening motion. Default true.' },
      },
      required: ['specId'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_animation',
    description: "Tier 4. Record the motion one interaction produces in a single pass: declared timing and keyframes from getAnimations() (CSS transitions, CSS animations, WAAPI), a measured per-frame curve, AND the live box constraints per frame — which is what identifies WHICH element each animation actually drives (reported as `owns`). Returns from/to per property, real duration, overshoot, a spring or tween fit, and paste-ready CSS + Framer Motion. Use for 'how does this dialog open', 'replicate this animation', or before implementing any surface whose entrance matters.",
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string', description: 'Trigger to click (from page_describe / frontier).' },
        keys: { type: 'string', description: 'Key or chord to press instead of clicking, e.g. "Escape".' },
        maxMs: { type: 'number', description: 'Recording window, default 2000. Raise for long or staged animations.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'verify_animation',
    description: "Tier 4 verification. Freezes the animation and seeks it to exact progress points, reporting subject size and key landmark positions at each. Property-level measurement can pass while the visible result is wrong — a footer that snaps at the end, content reflowing at the wrong moment — and only matched intermediate frames catch that. Run this on a clone AND on the original, then compare the tables. Screenshots are written to the bundle.",
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string', description: 'Trigger to click.' },
        keys: { type: 'string', description: 'Key or chord to press instead.' },
        subjectSelector: { type: 'string', description: 'CSS selector for the element to measure, e.g. \'[data-spec-id="s42"]\'. Measure the panel, not a full-viewport overlay wrapper, or the numbers are meaningless.' },
        checklist: { type: 'string', description: 'Path to a contracts/<id>.checklist.json. Every animated node it lists must be mapped, or the run is reported as INCOMPLETE.' },
        nodeMap: { type: 'object', description: 'Maps each capture node id from the checklist to a CSS selector in your implementation, e.g. {"s3106": ".wrapper", "anim-4": "[role=dialog]"}. Unmapped nodes are failures, not omissions — this is what catches implementing 2 of 4 animated elements.', additionalProperties: { type: 'string' } },
        name: { type: 'string', description: 'Name for the filmstrip folder in the bundle.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'capture_hover_reveal',
    description: "Hover a target, wait past the reveal delay, and capture everything that appears: tooltips, in-row affordances (a + that shows on hover), and submenus. Finds them by diffing page-wide visibility before and after — no selector guessing. Use this rather than hover+screenshot: a tooltip portals far outside its target and fires on a timer, so a subtree capture misses it and a settle returns before it exists. Submenus need a second call against an item inside the first surface.",
    inputSchema: {
      type: 'object',
      properties: {
        specId: { type: 'string', description: 'Element to hover.' },
        dwellMs: { type: 'number', description: 'How long to rest the pointer. Default 900 — tooltips typically need 300-700ms, submenus similar.' },
        name: { type: 'string', description: 'Name for the captured state; omit to only report what appeared.' },
        capture: { type: 'boolean', description: 'Also add the revealed surface to the bundle as a state. Default false (report only).' },
      },
      required: ['specId'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_drag',
    description: "Tier 5. Record a drag gesture with real pointer input: hover, grab, three mid-drag frames, drop and settle. Identifies the drag overlay and insertion indicator automatically by diffing surfaces present during the gesture against those at rest, and annotates every frame (source in red, drag-only surfaces in blue). Use for reordering, kanban moves, resize handles — anything a click cannot reach. THIS MUTATES ORDER: only run against a disposable workspace.",
    inputSchema: {
      type: 'object',
      properties: {
        fromId: { type: 'string', description: 'Spec id of the element to drag.' },
        toId: { type: 'string', description: 'Spec id of the drop target.' },
        steps: { type: 'number', description: 'Pointer move steps, default 10. More steps means a slower, more realistic drag.' },
        name: { type: 'string', description: 'Name for the gesture folder in the bundle.' },
      },
      required: ['fromId'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_state',
    description: 'Serialize the current visual state into the bundle as a Paper-pasteable frame plus a screenshot. Give it a descriptive name — this is the artifact you are producing.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'e.g. "bulk-selection-actions-bar"' },
        specId: { type: 'string', description: 'Subtree to capture. Omit to capture the whole page.' },
        notes: { type: 'string', description: 'How this state is reached, so it can be reproduced.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_at',
    description: "Capture whatever component is at a screen coordinate — no spec id, no page_describe first. THIS IS THE TOOL FOR AN AGENT THAT CAN SEE THE PAGE: point at what you are looking at and it resolves the point to a component boundary, resolves subgrid so the frame lays out standalone, measures everything a screenshot loses (pseudo-element fills, resolved grid tracks, state attributes, tokens), and writes that measurement into the annotation for you. You supply only intent and how you got here; you cannot see the rest and should not guess it. Set push:true to send it to Paper in the same call.",
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Viewport x of the thing you are pointing at.' },
        y: { type: 'number', description: 'Viewport y.' },
        name: { type: 'string', description: 'e.g. "issue-row-hover". This names the Paper artboard.' },
        why: { type: 'string', description: 'Why this component matters / what it is. Goes at the top of the annotation.' },
        path: { type: 'string', description: 'How you reached this state, in your own words — the route, the clicks, the preconditions. You are the only one who knows this; it cannot be measured.' },
        expect: { type: 'string', description: "A substring of the target's label, its tag name, or a CSS selector it must match. The capture REFUSES if the point resolves to something else — this is what stops a stale coordinate from producing confident wrong output. Always pass it." },
        push: { type: 'boolean', description: 'Import into the open Paper file immediately. Default false.' },
      },
      required: ['x', 'y', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'capture_state_matrix',
    description: "Capture a component in every state a POINTER can reach — rest, hover, active, focus — driving each one and verifying it actually changed. Use on any component whose states matter, instead of hovering and capturing four times by hand. Parks the pointer OUTSIDE the scroll container before 'rest' and verifies hover cleared, because apps commonly keep the last-hovered row marked until the pointer leaves the whole list and a naive rest capture is silently the hover state. States that produce no visible change are reported, not captured. Does NOT guess app-specific states (selection, keyboard cursor, expansion) — it reports which state attributes the component carries so you can drive those yourself.",
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'Viewport x of the component.' },
        y: { type: 'number', description: 'Viewport y.' },
        name: { type: 'string', description: 'Base name; each state is suffixed, e.g. "issue-row" -> "issue-row-hover".' },
        why: { type: 'string', description: 'What this component is.' },
        path: { type: 'string', description: 'How you reached the page/state this component is in.' },
        expect: { type: 'string', description: "A substring of the target's label, its tag name, or a CSS selector it must match. Refuses if the point resolves elsewhere. Always pass it." },
        push: { type: 'boolean', description: 'Import all captured states into Paper immediately. Default false.' },
      },
      required: ['x', 'y', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'reset',
    description: 'Return the page to its resting baseline, escalating Escape -> click-away -> reload, verifying against the baseline signature at each step. Call between unrelated flows.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bundle_write',
    description: 'Write spec.json and return the bundle summary. Call when the capture session is done.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'paper_import',
    description: 'Push captured frames into the open Paper file as real artboards, via the Paper MCP desktop app. No clipboard and no manual paste. Run bundle_write first. Use dryRun to see what would be imported.',
    inputSchema: {
      type: 'object',
      properties: {
        only: { type: 'string', description: 'Import a single state by id, prefix, or substring. Omit to import all.' },
        limit: { type: 'number', description: 'Import at most this many states.' },
        dryRun: { type: 'boolean', description: 'List what would be imported without writing to Paper.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'paper_status',
    description: 'Check that the Paper MCP desktop app is reachable and report which file and page are open. Call before paper_import.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'paper_copy',
    description: 'Put a captured frame on the macOS clipboard in Paper paste format. Switch to Paper and press Cmd-V to place it as editable layers.',
    inputSchema: {
      type: 'object',
      properties: { stateId: { type: 'string', description: 'Id or suffix from bundle_write / capture_state.' } },
      required: ['stateId'],
      additionalProperties: false,
    },
  },
];

/** New surfaces after an interaction, shaped for an agent to act on next. */
async function surfacesAfter(active) {
  await active.settle();
  const roots = await active.harvestSurfaces();
  return {
    url: active.page.url(),
    newSurfaces: roots.map(({ hash, ...rest }) => rest),
  };
}

/**
 * Re-enter a pointer state that driveStateMatrix already proved is reachable.
 *
 * The matrix restores the pointer when it finishes, so each state has to be set
 * again immediately before serializing. Kept separate from the matrix itself so
 * the "which states exist" question and the "put me back in one" question stay
 * answerable independently.
 */
async function applyPointerState(active, specId, state) {
  const { parkPointer } = await import('./src/capture-intent.mjs');
  if (state === 'rest') { await parkPointer(active, specId); return; }
  if (state === 'focus') {
    await parkPointer(active, specId);
    await active.page.evaluate(
      (id) => document.querySelector(`[data-spec-id="${id}"]`)?.focus?.(),
      specId,
    );
    await active.page.waitForTimeout(240);
    return;
  }
  const box = await active.page.evaluate((id) => {
    const el = document.querySelector(`[data-spec-id="${id}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
  }, specId);
  if (!box) return;
  await active.page.mouse.move(box.cx, box.cy);
  await active.page.waitForTimeout(320);
  if (state === 'active') { await active.page.mouse.down(); await active.page.waitForTimeout(140); }
}

const HANDLERS = {
  async browser_attach({ urlPattern, endpoint, outDir, navigateTo, fresh = false }) {
    if (driver) await driver.close();
    driver = await SpecDriver.attach(endpoint ?? DEFAULT_ENDPOINT, urlPattern);
    if (navigateTo) await driver.goto(navigateTo);
    resetExplorer();
    // Re-attaching mid-session is normal — it is how you get back to a page
    // after following a link. It must not cost you the captures made so far.
    //
    // Flush the outgoing bundle FIRST: the replacement resumes its numbering
    // from spec.json on disk, so replacing an unflushed bundle rewinds the id
    // counter and later captures silently overwrite earlier manifest entries.
    // Measured 2026-08-11: three states minted as 015, two fell out of the
    // manifest (their frame files survived; the ids did not).
    try { bundle?.write(); } catch { /* a bundle that cannot flush should not block re-attach */ }
    bundle = new Bundle(outDir ?? DEFAULT_OUT, { url: driver.page.url() }, { fresh });
    await driver.establishBaseline();
    return text({ attached: true, url: driver.page.url(), title: await driver.page.title(), bundleDir: bundle.outDir });
  },

  page_describe: async () => text(await requireDriver().describe()),

  list_regions: async () => text(await requireDriver().regions()),

  set_region: async ({ include, exclude }) => text({
    region: requireDriver().setRegion({ include: include ?? null, exclude: exclude ?? null }),
    note: 'Applies to crawl_overlays and frontier for the rest of this session.',
  }),

  capture_css_spec: async ({ specId }) => {
    const spec = await requireDriver().cssSpec(specId);
    requireBundle().setCssSpec(spec);
    return text(spec);
  },

  crawl_overlays: async ({ limit, deny, depth, scanStates, shots }) =>
    text(await crawlOverlays(requireDriver(), requireBundle(), {
      limit: limit ?? Infinity,
      deny: deny ?? DEFAULT_DENY,
      depth: Math.max(1, depth ?? 1),
      scanStates: scanStates ?? true,
      shots: shots ?? 'context',
    })),

  async click({ specId }) {
    const active = requireDriver();
    await markTried(`click:${specId}`);
    if (!await active.clickById(specId)) throw new Error(`No element with spec id ${specId}. Re-run page_describe — the DOM may have changed.`);
    return text(await surfacesAfter(active));
  },

  async press({ keys }) {
    const active = requireDriver();
    await markTried(`press:${keys}`);
    await active.page.keyboard.press(keys);
    return text(await surfacesAfter(active));
  },

  async hover({ specId }) {
    const active = requireDriver();
    await markTried(`hover:${specId}`);
    const handle = await active.page.$(`[data-spec-id="${specId}"]`);
    if (!handle) throw new Error(`No element with spec id ${specId}.`);
    await handle.hover();
    return text(await surfacesAfter(active));
  },

  async frontier({ scopeId }) {
    const active = requireDriver();
    const stateKey = await active.currentStateKey();
    const isNewState = !explorer.seenStates.has(stateKey);
    if (isNewState) explorer.seenStates.add(stateKey);

    // Dryness must mean "this round produced nothing", not "I have stood here
    // before". The loop resets to baseline after every capture, so keying it on
    // state novelty alone declares a productive run dry after three captures.
    const captureCount = requireBundle().states.length;
    const progressed = isNewState || captureCount > explorer.lastCaptureCount;
    explorer.lastCaptureCount = captureCount;
    explorer.dryRounds = progressed ? 0 : explorer.dryRounds + 1;

    const triggers = keyedList(await active.triggers(DEFAULT_DENY, scopeId ?? null));
    const untried = triggers.filter((trigger) => !explorer.tried.has(`${stateKey}::click:${trigger.id}`));

    return text({
      stateKey,
      isNewState,
      dryRounds: explorer.dryRounds,
      statesSeen: explorer.seenStates.size,
      captured: requireBundle().states.length,
      region: active.region ?? null,
      untried: untried.map(({ id, label, role, hasPopup, tag, rect }) => ({ id, label, role, hasPopup, tag, rect })),
      triedHere: triggers.length - untried.length,
      exhausted: untried.length === 0,
      advice: untried.length === 0
        ? 'Nothing untried in this state. reset, or navigate somewhere else.'
        : (explorer.dryRounds >= 3 ? 'Three rounds without a new state — consider stopping.' : 'Pick an untried interaction and act.'),
    });
  },

  async novelty({ specId }) {
    const active = requireDriver();
    const hash = await active.structuralHash(specId ?? null);
    const seen = requireBundle().seen(hash);
    return text({ hash: hash ? `${hash.slice(0, 60)}…` : null, alreadyCaptured: seen, stateKey: await active.currentStateKey() });
  },

  async force_state({ specId, states }) {
    const active = requireDriver();
    const session = await active.page.context().newCDPSession(active.page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-spec-id="${specId}"]` });
    if (!nodeId) throw new Error(`No element with spec id ${specId}.`);
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states });
    return text({ forced: states, specId, note: 'State is applied in the real style engine. capture_state now, then reset to clear.' });
  },

  async capture_component({ specId: requestedId, name, withAnimation = true }) {
    let specId = requestedId;
    const active = requireDriver();
    const store = requireBundle();

    // Identify the trigger by its reload-stable key *before* resetting: reset
    // escalates to a full reload when a surface will not dismiss, and every
    // spec-id the caller holds dies with the old document.
    const before = _keyed(await active.triggers(DEFAULT_DENY));
    const wanted = before.find((candidate) => candidate.id === specId);

    // Start closed, by an absolute criterion rather than by comparing against a
    // baseline that may itself have been recorded with something open.
    // Capturing an *opening* transition requires the surface to be shut first —
    // otherwise the baseline already contains it, the harvest finds nothing new,
    // and the tool reports a working trigger as dead.
    const cleanedBy = await active.ensureClean();

    const after = _keyed(await active.triggers(DEFAULT_DENY));
    const trigger = (wanted && after.find((candidate) => candidate.key === wanted.key))
      ?? after.find((candidate) => candidate.id === specId)
      ?? wanted
      ?? { id: specId, label: name ?? specId, rect: null, hasPopup: null, role: null };
    specId = trigger.id;

    // Motion first: recording has to straddle the click, and the click is what
    // opens the surface. Doing it in this order means one interaction produces
    // both the animation spec and the surface, instead of opening it twice.
    const animation = withAnimation
      ? await captureAnimation(active, { triggerId: specId }).catch((cause) => ({ error: String(cause?.message ?? cause) }))
      : null;

    // Capture the acceptance test at the same time as the spec. An implementer
    // in another session cannot produce a reference for an app they may not be
    // able to reach, so it has to be recorded here or it never exists.
    let referenceFilmstrip = null;
    if (withAnimation && animation && !animation.error) {
      await active.ensureClean().catch(() => {});
      const strip = await filmstrip(active, {
        triggerId: specId,
        onFrame: () => landmarks(active, `[data-spec-id="${specId}"]`),
      }).catch(() => null);
      if (strip) {
        referenceFilmstrip = {
          durationMs: strip.durationMs,
          frames: strip.frames.map((frame) => ({ progress: frame.progress, atMs: frame.atMs, ...frame.sample })),
        };
      }
    }
    if (!withAnimation && !await active.clickById(specId)) throw new Error(`No element with spec id ${specId}.`);
    await active.settle();

    const roots = await active.harvestSurfaces();
    if (roots.length === 0) throw new Error('That trigger opened nothing. Check page_describe, or the surface may need a precondition.');
    const surface = roots.filter((r) => r.portalled || r.role).sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0] ?? roots[0];

    const classified = classify(surface, trigger);
    const frame = await active.serialize(surface.id);
    const surfaceShot = await active.screenshot(surface.id);
    await active.annotate({ triggerId: specId, surfaceId: surface.id, anchor: null }).catch(() => {});
    const contextShot = await active.screenshot().catch(() => null);
    await active.clearAnnotations().catch(() => {});
    const states = await active.cssSpec(surface.id).catch(() => undefined);

    const record = store.add({
      name: name ?? trigger.label ?? surface.role ?? 'component',
      tier: 4,
      level: 0,
      path: [],
      kind: classified.kind,
      roleEvidence: classified.roleEvidence,
      detectedBy: surface.revealed ? 'revealed' : 'mounted',
      trigger: { label: trigger.label, role: trigger.role, hasPopup: trigger.hasPopup },
      rect: surface.rect,
      hash: surface.hash,
      animation,
      referenceFilmstrip,
      cssStates: states ? { components: states.components.length, stateNames: states.stateNames } : undefined,
    }, frame, { surface: surfaceShot, context: contextShot }, states);

    await active.reset().catch(() => {});
    return text({ ...record, cleanedBy, animationSummary: animation?.nodes?.[0]?.fit ?? animation?.error ?? null });
  },

  async verify_animation({ specId, keys, subjectSelector, name, checklist, nodeMap }) {
    const active = requireDriver();
    const store = requireBundle();
    const strip = await filmstrip(active, {
      triggerId: specId,
      keys,
      onFrame: async () => ({
        ...(await landmarks(active, subjectSelector ?? '#subject')),
        ...(nodeMap ? { nodes: await probe(active, nodeMap) } : {}),
      }),
    });

    const folder = `filmstrip-${String(name ?? specId ?? keys ?? 'run').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const frames = strip.frames.map((frame) => ({
      progress: frame.progress,
      atMs: frame.atMs,
      ...frame.sample,
      shot: store.addDebugShot(`${folder}/${String(Math.round(frame.progress * 100)).padStart(3, '0')}`, frame.png),
    }));

    // Coverage against the captured checklist. Reported first, because an
    // implementation that animates two of four nodes otherwise passes every
    // frame-level check that happens to be run on the two it did implement.
    let coverage = null;
    if (checklist) {
      const spec = JSON.parse(_readFileSync(checklist, 'utf8'));
      const required = (spec.requiredNodes ?? []).map((entry) => entry.node);
      const mapped = Object.keys(nodeMap ?? {});
      const missing = required.filter((node) => !mapped.includes(node));
      coverage = {
        status: missing.length ? 'INCOMPLETE' : 'complete',
        required: required.length,
        mapped: mapped.length,
        missing,
        detail: missing.length
          ? (spec.requiredNodes ?? []).filter((entry) => missing.includes(entry.node))
            .map((entry) => `${entry.node}: animates ${entry.animate.map((a) => a.property).join(', ')} — not implemented`)
          : [],
      };
    }

    return text({
      coverage,
      durationMs: strip.durationMs,
      frames,
      hint: 'Compare against the same run on the original. Position matters as much as size: a clone can match width, height and internal offsets at every frame while its top edge travels a different path.',
    });
  },

  capture_animation: async ({ specId, keys, maxMs }) =>
    text(await captureAnimation(requireDriver(), { triggerId: specId, keys, maxMs: maxMs ?? 2000 })),

  async capture_hover_reveal({ specId, dwellMs, name, capture = false }) {
    const active = requireDriver();
    const reveal = await captureReveal(active, { targetId: specId, dwellMs: dwellMs ?? 900 });

    let record = null;
    if (capture) {
      const subject = reveal.menu ?? reveal.tooltip ?? reveal.affordance ?? reveal.surfaces[0];
      if (subject) {
        const store = requireBundle();
        const frame = await active.serialize(subject.id);
        const surface = await active.screenshot(subject.id);
        await active.annotate({ triggerId: specId, surfaceId: subject.id, anchor: null, label: name ?? 'reveal' }).catch(() => {});
        const context = await active.screenshot();
        await active.clearAnnotations().catch(() => {});
        const states = await active.cssSpec(subject.id).catch(() => undefined);
        record = store.add({
          name: name ?? subject.label ?? 'hover-reveal',
          tier: 3, level: 0, path: [],
          kind: subject.role ?? (subject.insideTarget ? 'affordance' : 'tooltip'),
          trigger: { label: `hover ${specId}` },
          rect: subject.rect, hash: subject.id,
          notes: `Revealed after ${reveal.dwellMs}ms of pointer rest. ${subject.insideTarget ? 'Lives inside the target.' : 'Portals outside the target.'}`,
          cssStates: states ? { components: states.components.length, stateNames: states.stateNames } : undefined,
        }, frame, { surface, context }, states);
      }
    }

    return text({
      ...reveal,
      captured: record?.id ?? null,
      hint: 'insideTarget means an affordance that lives in the row; the rest portal elsewhere and must be implemented as portalled elements. For a submenu, call again with the id of an item inside the surface just revealed.',
    });
  },

  async capture_drag({ fromId, toId, steps, name }) {
    const active = requireDriver();
    const store = requireBundle();
    const drag = await captureDrag(active, { fromId, toId, steps: steps ?? 10 });
    const folder = `gesture-${String(name ?? fromId).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const frames = drag.phases.map((phase) => ({
      ...phase,
      shot: store.addDebugShot(`${folder}/${phase.label.replace('%', 'pct')}`, drag.shots[phase.label]),
    }));
    return text({
      from: drag.from,
      to: drag.to,
      dragOverlay: drag.dragOverlay,
      frames,
      hint: 'Surfaces listed under dragOverlay exist only while the button is down — that is the overlay and the insertion indicator. Implement them as portalled elements, not as styles on the source row.',
    });
  },

  async capture_state({ name, specId, notes }) {
    const active = requireDriver();

    // Dedupe here too, not just in the Tier 2 crawler. An exploring agent that
    // re-reaches a surface by another route would otherwise silently add a
    // second identical frame, and the bundle stops being a set of states.
    const hash = await active.structuralHash(specId ?? null);
    if (hash && requireBundle().seen(hash)) {
      const existing = bundle.states.find((state) => state.hash === hash);
      return text({ duplicate: true, existingId: existing?.id, message: 'Already captured; nothing written.' });
    }

    // Record the captured region's rect. Without it the Paper importer has no
    // size for the artboard and silently falls back to 800×600 — which is how
    // three full-page frames landed in Paper at the wrong size on 2026-08-11.
    // specId → that element's border box; whole page → the viewport.
    const rect = await active.page.evaluate((id) => {
      const el = id ? document.querySelector(`[data-spec-id="${id}"]`) : null;
      if (el) {
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
      }
      return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    }, specId ?? null);

    const frame = await active.serialize(specId);
    const shot = await active.screenshot(specId);
    const record = requireBundle().add({ name, tier: 3, kind: 'agent-captured', notes, hash, path: [], rect }, frame, shot);
    return text({ ...record, bundleDir: bundle.outDir });
  },

  async capture_at({ x, y, name, why, path, expect = null, push = false }) {
    const active = requireDriver();
    const found = await resolveComponentAt(active, x, y, { expect });
    if (!found || found.error) return text({ error: found?.error ?? `Nothing at (${x}, ${y}).` });

    // Resolve subgrid across the serialize call only. Left applied, it would
    // change the live page under the agent that is still looking at it.
    //
    // Measure AFTER resolving, never before: measuring first reports the tracks
    // as the literal string "subgrid [] [] []", which is useless to whoever reads
    // the annotation and actively misleading, since the frame beside it does have
    // real tracks baked in.
    // Virtualised lists recycle nodes between calls, so re-earn the tag from the
    // point rather than reading through a stale one and reporting empty styles.
    const held = await ensureTagged(active, found.specId, x, y);
    const subgrid = await resolveSubgrid(active, held.specId);
    let record;
    let measured;
    try {
      measured = await measuredAnnotation(active, held.specId, { x, y });
      const hash = await active.structuralHash(held.specId);
      if (hash && requireBundle().seen(hash)) {
        const existing = bundle.states.find((state) => state.hash === hash);
        return text({ duplicate: true, existingId: existing?.id, resolved: found, message: 'This exact structure and state is already captured.' });
      }
      const frame = await serializeStable(active, held.specId, x, y);
      const shot = await active.screenshot(held.specId);
      record = requireBundle().add(
        { name, tier: 3, kind: 'agent-captured', notes: formatAnnotation(measured, { why, path }), hash, path: [] },
        frame, shot,
      );
    } finally {
      await subgrid.restore();
    }

    let paper = null;
    if (push) {
      requireBundle().write();
      paper = await importBundle(bundle.outDir, { only: record.id, limit: 1, dryRun: false });
    }
    return text({ ...record, resolved: found, measured, subgridResolved: subgrid.resolved, paper });
  },

  async capture_state_matrix({ x, y, name, why, path, expect = null, push = false }) {
    const active = requireDriver();
    const found = await resolveComponentAt(active, x, y, { expect });
    if (!found || found.error) return text({ error: found?.error ?? `Nothing at (${x}, ${y}).` });

    const matrix = await driveStateMatrix(active, found.specId);
    const captured = [];
    const skipped = [];

    for (const state of matrix.states) {
      if (!state.changed) { skipped.push({ state: state.state, reason: state.note }); continue; }
      // Re-enter the state: driveStateMatrix restored the pointer when it finished.
      const held = await ensureTagged(active, found.specId, x, y);
      await applyPointerState(active, held.specId, state.state);
      const subgrid = await resolveSubgrid(active, held.specId);
      try {
        const hash = await active.structuralHash(held.specId);
        if (hash && requireBundle().seen(hash)) { skipped.push({ state: state.state, reason: 'structurally identical to a state already captured' }); continue; }
        const measured = await measuredAnnotation(active, held.specId, { x, y });
        const frame = await serializeStable(active, held.specId, x, y);
        const shot = await active.screenshot(held.specId);
        captured.push(requireBundle().add(
          {
            name: `${name}-${state.state}`, tier: 3, kind: 'agent-captured', hash, path: [],
            notes: formatAnnotation(measured, { why: `${why ?? name} — state: ${state.state.toUpperCase()}.`, path: `${path ?? ''} ${state.note}`.trim() }),
          },
          frame, shot,
        ));
      } finally {
        await subgrid.restore();
        // `active` holds the button down. Releasing it is not optional: a held
        // button turns every later move into a drag, and the next capture would
        // be of a page mid-gesture.
        if (state.state === 'active') await active.page.mouse.up().catch(() => {});
      }
    }

    let paper = null;
    if (push && captured.length) {
      requireBundle().write();
      paper = await importBundle(bundle.outDir, { limit: Infinity, dryRun: false });
    }
    return text({
      component: found, captured: captured.map((r) => ({ id: r.id, name: r.name })), skipped,
      availableStateAttributes: matrix.availableStateAttributes,
      note: Object.keys(matrix.availableStateAttributes).length
        ? 'This component carries state attributes, so it expresses state through JS, not CSS :hover. States beyond pointer reach (selection, keyboard cursor) must be driven by you, then captured with capture_at.'
        : 'No state attributes found; pointer states are likely the whole matrix.',
      paper,
    });
  },

  reset: async () => text({ method: await requireDriver().reset() }),

  bundle_write: async () => {
    const active = requireBundle();
    const specPath = active.write();
    return text({ specPath, stateCount: active.states.length, states: active.states.map((state) => ({ id: state.id, name: state.name, kind: state.kind })) });
  },

  paper_status: async () => {
    const client = await new PaperClient().connect();
    return text(await client.info());
  },

  paper_import: async ({ only, limit, dryRun }) => {
    const active = requireBundle();
    active.write();
    return text(await importBundle(active.outDir, { only, limit: limit ?? Infinity, dryRun: dryRun ?? false }));
  },

  paper_copy: async ({ stateId }) => {
    const active = requireBundle();
    active.write();
    const state = copyFrameToPaper(active.outDir, stateId);
    return text({ copied: state.id, name: state.name, next: 'Switch to Paper and press Cmd-V.' });
  },
};

const server = new Server({ name: 'spec-crawler', version: '0.1.0' }, {
  capabilities: { tools: {} },
  instructions: `Capture a web app's design spec as Paper-pasteable frames.

Workflow:
1. browser_attach — pick the tab. The browser must already be running with --remote-debugging-port=9222.
2. capture_css_spec — free, mutates nothing. Gives the hover/focus/active matrix including group-hover triggers.
3. crawl_overlays — autonomous menu/dialog/popover sweep. Start with limit:15 to verify behaviour before a full run.
4. For states a crawler cannot reach — anything needing a sequence, a selection, or domain knowledge — drive them yourself with page_describe / click / press / hover, then capture_state.
5. bundle_write, then paper_import to push every frame into Paper as artboards (paper_copy is the manual single-frame clipboard fallback).

Tier 3 is why you are here. A crawler cannot know that selecting two cards reveals a bulk-action bar, or that Cmd opens a scoped command palette.

Tier 3 exploration loop — repeat until told to stop:
  a. frontier          — where am I, is it new, what have I not tried here?
  b. pick ONE untried interaction; prefer aria-haspopup triggers and anything
     needing a precondition a crawler cannot infer (multi-select, keyboard
     chords, typing into a field, hovering to reveal)
  c. click / press / hover
  d. read newSurfaces in the response. Nothing new? go back to (a)
  e. capture_state with a descriptive name and notes saying how you got there
  f. reset between unrelated flows
Stop when frontier reports exhausted in every state you can reach, or dryRounds
hits 3, or you have covered what was asked.

Do not re-read the whole page each round — frontier is cheaper and is the only
thing tracking what you already tried. Do not pre-check with novelty before
every capture; capture_state dedupes by itself and tells you if it was a repeat.

Never assume an overlay closed — the tools verify against a baseline signature,
so trust their report over your expectation.`,
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = HANDLERS[request.params.name];
  if (!handler) return { content: [{ type: 'text', text: `Unknown tool ${request.params.name}` }], isError: true };
  try {
    return await handler(request.params.arguments ?? {});
  } catch (cause) {
    return { content: [{ type: 'text', text: cause instanceof Error ? cause.message : String(cause) }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
