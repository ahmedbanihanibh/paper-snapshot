#!/usr/bin/env node
/**
 * spec-crawler as an MCP server — construction and transport only.
 *
 * The tool descriptors live in src/mcp-tools.mjs and the handlers in
 * src/mcp-handlers.mjs. What is left here is the wiring that genuinely needs a
 * process: build the runtime, register the two request handlers, learn who the
 * client is from the initialize handshake, stamp provenance onto every result,
 * and shut down without taking the user's browser with it.
 *
 * Provenance is attached to EVERY CallTool result, success and error alike, under
 * a namespaced `_meta` key. It answers one question and no more: did this call
 * traverse this server process? An open CDP port answers nothing of the kind —
 * it proves a browser is reachable, not that anything went through here. See
 * `runtime_handshake`'s description for the full statement of what is and is not
 * being claimed.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pathToFileURL } from 'node:url';

import { CrawlerRuntime } from './src/runtime.mjs';
import { createTools, DEFAULT_ENDPOINT, DEFAULT_OUT } from './src/mcp-tools.mjs';
import { createHandlers } from './src/mcp-handlers.mjs';

export const PROVENANCE_KEY = 'spec-crawler/provenance';
export const TRANSPORT = 'mcp-stdio';

const INSTRUCTIONS = `Capture a web app's design spec as Paper-pasteable frames.

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
so trust their report over your expectation.

Every tool result carries _meta["${PROVENANCE_KEY}"] identifying the process that
produced it. runtime_handshake reports the same identity on demand, and states
plainly what that identity does and does not prove.`;

/** Build the server, its runtime and its handlers. Connects nothing. */
export function createSpecCrawlerServer({
  runtime = new CrawlerRuntime(),
  defaults = { endpoint: DEFAULT_ENDPOINT, outDir: DEFAULT_OUT },
} = {}) {
  const tools = createTools({ defaultEndpoint: defaults.endpoint, defaultOut: defaults.outDir });

  // Populated by the initialize handshake. Held in a box rather than captured by
  // value, because the handlers are built before the client has said anything.
  let clientInfo = null;

  const server = new Server(
    { name: 'spec-crawler', version: runtime.identity?.deterministic?.package?.version ?? '0.1.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  server.oninitialized = () => {
    const seen = server.getClientVersion();
    if (seen) clientInfo = { name: seen.name ?? null, version: seen.version ?? null };
  };

  const handlers = createHandlers({
    runtime,
    defaults,
    getClientInfo: () => clientInfo,
    transport: TRANSPORT,
  });

  const provenance = (tool) => ({
    [PROVENANCE_KEY]: {
      server: runtime.identity?.deterministic?.package?.name ?? 'spec-crawler',
      version: runtime.identity?.deterministic?.package?.version ?? null,
      sourceFingerprint: runtime.identity?.deterministic?.sourceFingerprint ?? null,
      instanceUuid: runtime.identity?.instance?.uuid ?? null,
      pid: runtime.identity?.instance?.pid ?? process.pid,
      tool,
      transport: TRANSPORT,
    },
  });

  /** Never move or drop anything from `content`; only add `_meta`. */
  const stamp = (result, tool) => ({ ...result, _meta: { ...(result?._meta ?? {}), ...provenance(tool) } });

  /** Thrown errors become a structured result with a stable code where one exists. */
  function normalizeThrown(cause, tool) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const code = cause?.code ?? (cause?.name === 'RuntimeClosedError' ? 'ERR_RUNTIME_CLOSED' : 'ERR_TOOL_FAILED');
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: message,
          code,
          tool,
          ...(cause?.stage ? { stage: cause.stage } : {}),
          ...(cause?.evidence ? { evidence: cause.evidence } : {}),
        }, null, 2),
      }],
      isError: true,
      code,
    };
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = request.params.name;
    const handler = handlers[tool];
    if (!handler) {
      return stamp({
        content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool ${tool}`, code: 'ERR_UNKNOWN_TOOL', tool }, null, 2) }],
        isError: true,
        code: 'ERR_UNKNOWN_TOOL',
      }, tool);
    }
    try {
      return stamp(await handler(request.params.arguments ?? {}), tool);
    } catch (cause) {
      return stamp(normalizeThrown(cause, tool), tool);
    }
  });

  return { server, runtime, tools, handlers, provenance };
}

/**
 * Shut down once, from whichever signal arrives first.
 *
 * `runtime.close()` closes the driver, and `SpecDriver.close()` calls
 * `browser.close()` on a `chromium.connectOverCDP` handle — which DISCONNECTS the
 * CDP session and leaves the browser running. Verified in src/driver.mjs:121-123
 * ("Only detaches; never closes the user's browser."). That is the whole reason
 * this is safe to call on SIGINT: we attach to a browser the user owns, and
 * quitting the server must not quit their windows.
 */
function installShutdown(server, runtime) {
  let shuttingDown = null;
  const shutdown = (reason, exitCode = 0) => {
    if (shuttingDown) return shuttingDown;
    shuttingDown = (async () => {
      try {
        await runtime.close();
      } catch (cause) {
        process.stderr.write(`spec-crawler: shutdown (${reason}) reported cleanup errors: ${cause?.message ?? cause}\n`);
      }
      try { await server.close(); } catch { /* the transport may already be gone */ }
      process.exit(exitCode);
    })();
    return shuttingDown;
  };

  process.stdin.on('end', () => shutdown('stdin-eof'));
  process.stdin.on('close', () => shutdown('stdin-close'));
  server.onclose = () => shutdown('server-close');
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return shutdown;
}

export async function main() {
  const { server, runtime } = createSpecCrawlerServer();
  installShutdown(server, runtime);
  await server.connect(new StdioServerTransport());
  return server;
}

// pathToFileURL, not string concatenation: a path containing a space or any other
// character that must be percent-encoded produces a URL that never equals the
// hand-built one, and the failure is silent — the server starts, matches nothing,
// connects no transport, and exits, so the client just sees the process die.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
