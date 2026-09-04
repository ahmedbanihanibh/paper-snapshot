/**
 * The MCP tool surface, as data.
 *
 * Kept apart from both the handlers and the transport so the descriptor list can
 * be asserted against without constructing a server, opening a browser, or
 * touching stdio. `mcp.mjs` used to hold all three; a schema change could not be
 * tested without spawning a process, so schemas were never tested at all.
 *
 * The 25 names in LEGACY_TOOL_NAMES are a compatibility contract: sessions and
 * transcripts elsewhere call them by name. They may gain properties and fields;
 * they may not lose or rename one.
 */

import path from 'node:path';
import { DEFAULT_DENY } from './crawl.mjs';

export const DEFAULT_ENDPOINT = process.env.SPEC_CRAWLER_CDP ?? 'http://localhost:9222';
export const DEFAULT_OUT = process.env.SPEC_CRAWLER_OUT ?? path.resolve('./spec-bundle');

/** Regex of trigger labels the overlay crawler skips unless told otherwise. */
export const DEFAULT_DENY_HINT = DEFAULT_DENY;

export const LEGACY_TOOL_NAMES = Object.freeze([
  'browser_attach',
  'list_regions',
  'set_region',
  'page_describe',
  'capture_css_spec',
  'crawl_overlays',
  'click',
  'press',
  'hover',
  'force_state',
  'frontier',
  'novelty',
  'capture_component',
  'capture_animation',
  'verify_animation',
  'capture_hover_reveal',
  'capture_drag',
  'capture_state',
  'capture_at',
  'capture_state_matrix',
  'reset',
  'bundle_write',
  'paper_import',
  'paper_status',
  'paper_copy',
]);

export const ADDED_TOOL_NAMES = Object.freeze(['runtime_handshake', 'scenario_run', 'screenshot']);

/**
 * What runtime_handshake does and — more importantly — what it does not do.
 *
 * Written out in full because the failure mode is a reader concluding more from a
 * green handshake than it can carry.
 */
export const HANDSHAKE_DESCRIPTION = [
  'Prove that this call traversed THIS spec-crawler MCP server process, and report what that process currently holds.',
  'Read-only: it attaches to nothing, mutates nothing, and needs no browser attachment.',
  'Echoes your `challenge` back verbatim, and returns the deterministic source identity of the running code',
  '(package name/version, sourceFingerprint over every crawler source file, serializerDigest, gitCommit),',
  'the volatile instance identity (uuid, pid, startedAt), the MCP client name/version taken from the initialize',
  "handshake, transport, the current attachment, the bundle directory and state count, and the runtime's lease state.",
  '',
  'LIMITS — read these before quoting a handshake as evidence:',
  '· This is SELF-ATTESTATION, not a cryptographic attestation against a hostile process. Every field is asserted by',
  '  this process about itself. A process that wanted to lie about them could. It proves a routing fact — your call',
  '  reached this server and this server answered — not an integrity fact.',
  '· A CDP debugging port being open proves only that some browser is reachable on that port. It is NOT evidence that',
  '  any tool call went through this server, that this server drove that browser, or that any capture came from it.',
  '· A matching sourceFingerprint means the files this process read at startup hash to that value; it does not prove',
  '  the running code was never patched in memory.',
].join('\n');

/**
 * Build the descriptor list. Defaults are interpolated into descriptions, so they
 * are parameters rather than module reads — a test can pin them.
 */
export function createTools({ defaultEndpoint = DEFAULT_ENDPOINT, defaultOut = DEFAULT_OUT, defaultDeny = DEFAULT_DENY_HINT } = {}) {
  return [
    {
      name: 'browser_attach',
      description: 'Attach to a running Edge/Chrome over CDP and select the tab to capture. Start the browser with --remote-debugging-port=9222 so the session keeps its logins. Call this before anything else.',
      inputSchema: {
        type: 'object',
        properties: {
          urlPattern: { type: 'string', description: 'Regex matched against open tab URLs, e.g. "linear.app". Omit to use the first tab.' },
          navigateTo: { type: 'string', description: 'Navigate the attached tab to this URL before crawling. Use to scope a run to one specific page.' },
          endpoint: { type: 'string', description: `CDP endpoint. Default ${defaultEndpoint}` },
          outDir: { type: 'string', description: `Bundle output directory. Default ${defaultOut}` },
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
          deny: { type: 'string', description: `Regex of trigger labels to skip. Default: ${defaultDeny}` },
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
          volatile: {
            type: 'array',
            description: 'Regions that are EXPECTED to vary — a clock, a relative timestamp, a live count. Without this, a subject containing any live region cannot be captured at all: the value changes between the pre- and post-capture check and the capture is rejected as drift. Each entry needs a reason, because declaring a region volatile removes it from drift detection and from state identity.',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector for the varying region, resolved inside the captured subject.' },
                reason: { type: 'string', description: 'Why this region legitimately varies, e.g. "unread count polls every 5s".' },
              },
              required: ['selector', 'reason'],
              additionalProperties: false,
            },
          },
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
          volatile: {
            type: 'array',
            description: 'Regions that are EXPECTED to vary — a clock, a relative timestamp, a live count. Without this, a subject containing any live region cannot be captured at all: the value changes between the pre- and post-capture check and the capture is rejected as drift. Each entry needs a reason, because declaring a region volatile removes it from drift detection and from state identity.',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector for the varying region, resolved inside the captured subject.' },
                reason: { type: 'string', description: 'Why this region legitimately varies, e.g. "unread count polls every 5s".' },
              },
              required: ['selector', 'reason'],
              additionalProperties: false,
            },
          },
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
          volatile: {
            type: 'array',
            description: 'Regions that are EXPECTED to vary — a clock, a relative timestamp, a live count. Without this, a subject containing any live region cannot be captured at all: the value changes between the pre- and post-capture check and the capture is rejected as drift. Each entry needs a reason, because declaring a region volatile removes it from drift detection and from state identity.',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector for the varying region, resolved inside the captured subject.' },
                reason: { type: 'string', description: 'Why this region legitimately varies, e.g. "unread count polls every 5s".' },
              },
              required: ['selector', 'reason'],
              additionalProperties: false,
            },
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    {
      name: 'capture_at',
      description: "Capture whatever component is at a screen coordinate — no spec id, no page_describe first. THIS IS THE TOOL FOR AN AGENT THAT CAN SEE THE PAGE: point at what you are looking at and it resolves the point to a component boundary, resolves subgrid so the frame lays out standalone, measures everything a screenshot loses (pseudo-element fills, resolved grid tracks, state attributes, tokens), and writes that measurement into the annotation for you. You supply only intent and how you got here; you cannot see the rest and should not guess it. Set push:true to send it to Paper in the same call. `expect` is REQUIRED: a coordinate is not a stable identity — a virtualised list recycles its nodes constantly, so the same (x, y) can be re-occupied by a different element between the moment you looked and the moment this runs, and without `expect` that produces a confident capture of the wrong component.",
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Viewport x of the thing you are pointing at.' },
          y: { type: 'number', description: 'Viewport y.' },
          name: { type: 'string', description: 'e.g. "issue-row-hover". This names the Paper artboard.' },
          why: { type: 'string', description: 'Why this component matters / what it is. Goes at the top of the annotation.' },
          path: { type: 'string', description: 'How you reached this state, in your own words — the route, the clicks, the preconditions. You are the only one who knows this; it cannot be measured.' },
          expect: { type: 'string', description: "REQUIRED. A substring of the target's label, its tag name, or a CSS selector it must match. The capture REFUSES if the point resolves to something else — this is what stops a stale coordinate from producing confident wrong output." },
          push: { type: 'boolean', description: 'Import into the open Paper file immediately. Default false.' },
          volatile: {
            type: 'array',
            description: 'Regions that are EXPECTED to vary — a clock, a relative timestamp, a live count. Without this, a subject containing any live region cannot be captured at all: the value changes between the pre- and post-capture check and the capture is rejected as drift. Each entry needs a reason, because declaring a region volatile removes it from drift detection and from state identity.',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector for the varying region, resolved inside the captured subject.' },
                reason: { type: 'string', description: 'Why this region legitimately varies, e.g. "unread count polls every 5s".' },
              },
              required: ['selector', 'reason'],
              additionalProperties: false,
            },
          },
        },
        required: ['x', 'y', 'name', 'expect'],
        additionalProperties: false,
      },
    },
    {
      name: 'capture_state_matrix',
      description: "Capture a component in every state a POINTER can reach — rest, hover, active, focus — driving each one and verifying it actually changed. Use on any component whose states matter, instead of hovering and capturing four times by hand. Parks the pointer OUTSIDE the scroll container before 'rest' and verifies hover cleared, because apps commonly keep the last-hovered row marked until the pointer leaves the whole list and a naive rest capture is silently the hover state. States that produce no visible change are reported, not captured. Does NOT guess app-specific states (selection, keyboard cursor, expansion) — it reports which state attributes the component carries so you can drive those yourself. `expect` is REQUIRED for the same reason as capture_at: the component is held by coordinate across four separate drives, and a virtualised list can recycle the node between any two of them.",
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Viewport x of the component.' },
          y: { type: 'number', description: 'Viewport y.' },
          name: { type: 'string', description: 'Base name; each state is suffixed, e.g. "issue-row" -> "issue-row-hover".' },
          why: { type: 'string', description: 'What this component is.' },
          path: { type: 'string', description: 'How you reached the page/state this component is in.' },
          expect: { type: 'string', description: "REQUIRED. A substring of the target's label, its tag name, or a CSS selector it must match. Refuses if the point resolves elsewhere." },
          push: { type: 'boolean', description: 'Import all captured states into Paper immediately. Default false.' },
          volatile: {
            type: 'array',
            description: 'Regions that are EXPECTED to vary — a clock, a relative timestamp, a live count. Without this, a subject containing any live region cannot be captured at all: the value changes between the pre- and post-capture check and the capture is rejected as drift. Each entry needs a reason, because declaring a region volatile removes it from drift detection and from state identity.',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector for the varying region, resolved inside the captured subject.' },
                reason: { type: 'string', description: 'Why this region legitimately varies, e.g. "unread count polls every 5s".' },
              },
              required: ['selector', 'reason'],
              additionalProperties: false,
            },
          },
        },
        required: ['x', 'y', 'name', 'expect'],
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

    /* ------------------------------------------------------------- added */

    {
      name: 'screenshot',
      description: "SEE the page. Returns the actual pixels as an image, not a file path — the agent looks at the browser instead of inferring it from a DOM dump. Use it to confirm you are on the surface you think you are before measuring, to check a state you just drove actually rendered, and to compare your build against the reference by eye BEFORE running the structural gates. It is not a substitute for a measurement: a screenshot cannot tell you a radius or a resolved grid track, and a pixel-perfect look can still be a wrong container. Point it at one element with specId to keep the image small and the subject unambiguous.",
      inputSchema: {
        type: 'object',
        properties: {
          specId: { type: 'string', description: 'Element to shoot (from page_describe). Omit for the whole viewport.' },
          fullPage: { type: 'boolean', description: 'Capture the entire scrollable page rather than the viewport. Ignored when specId is given. Default false.' },
          save: { type: 'string', description: 'Also write the PNG into the bundle under this name, so it survives the conversation.' },
        },
      },
    },
    {
      name: 'runtime_handshake',
      description: HANDSHAKE_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          challenge: { type: 'string', description: 'Any string. Echoed back verbatim, so a caller can tell this response apart from a replayed or fabricated one within its own session.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'scenario_run',
      description: 'Run a declarative scenario (the same JSON scenario-run.mjs takes) inside this server, reusing the attached browser when there is one. A scenario is the reproducible form of a capture session: preconditions, steps, teardown, reset policy and verification, all named and all reported per step. Use dryRun first — it validates and plans without touching a browser, and reports exactly which steps would run in which order.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to a scenario JSON file. Either this or `scenario` is required.' },
          scenario: { type: 'object', description: 'Inline scenario object, instead of `file`.', additionalProperties: true },
          dryRun: { type: 'boolean', description: 'Validate and plan only; never touches a browser. Default false.' },
          endpoint: { type: 'string', description: `CDP endpoint override. Default ${defaultEndpoint} or the scenario's target.endpoint.` },
          urlPattern: { type: 'string', description: "Tab-matching regex override, instead of the scenario's target.urlPattern." },
          out: { type: 'string', description: 'Also write the JSON report to this path.' },
        },
        additionalProperties: false,
      },
    },
  ];
}

export const TOOLS = createTools();
