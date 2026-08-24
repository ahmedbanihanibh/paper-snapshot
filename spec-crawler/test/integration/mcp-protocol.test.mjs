/**
 * The MCP server, exercised over a real stdio transport by a real MCP client.
 *
 * Nothing here needs a browser. That is deliberate: the handshake, the tool
 * surface, the provenance stamp and shutdown are all properties of the server
 * process, and a test that needed Edge running would never be run.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { createRuntimeIdentity } from '../../src/runtime-identity.mjs';
import { ADDED_TOOL_NAMES, LEGACY_TOOL_NAMES } from '../../src/mcp-tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SERVER = path.join(REPO, 'mcp.mjs');
const SCENARIOS = path.join(REPO, 'test', 'fixtures', 'scenarios');

const PROVENANCE_KEY = 'spec-crawler/provenance';
const CLIENT_INFO = { name: 'mcp-protocol-test', version: '0.0.0-test' };

/** Connect one client to one freshly spawned server, and always tear it down. */
async function withServer(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd: REPO,
    stderr: 'ignore',
  });
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

const payloadOf = (result) => JSON.parse(result.content[0].text);

function assertProvenance(result, tool, expected) {
  const meta = result._meta?.[PROVENANCE_KEY];
  assert.ok(meta, `${tool} result carries no ${PROVENANCE_KEY} provenance`);
  assert.equal(meta.server, 'spec-crawler');
  assert.equal(meta.tool, tool);
  assert.equal(meta.transport, 'mcp-stdio');
  assert.equal(meta.sourceFingerprint, expected.sourceFingerprint);
  assert.equal(typeof meta.instanceUuid, 'string');
  assert.ok(meta.instanceUuid.length > 0);
  assert.equal(typeof meta.pid, 'number');
  return meta;
}

test('initialize succeeds and reports the server identity', async () => {
  await withServer(async (client) => {
    const version = client.getServerVersion();
    assert.equal(version.name, 'spec-crawler');
    assert.equal(typeof version.version, 'string');
    assert.match(client.getInstructions() ?? '', /browser_attach/);
  });
});

test('list-tools contains all 25 legacy names plus the 2 added ones', async () => {
  await withServer(async (client) => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((tool) => tool.name));

    assert.equal(LEGACY_TOOL_NAMES.length, 25);
    for (const name of LEGACY_TOOL_NAMES) assert.ok(names.has(name), `${name} is missing from list-tools`);
    for (const name of ADDED_TOOL_NAMES) assert.ok(names.has(name), `${name} is missing from list-tools`);
    assert.equal(names.size, tools.length, 'list-tools returned a duplicate name');

    for (const tool of tools) {
      assert.equal(typeof tool.description, 'string');
      assert.equal(tool.inputSchema.type, 'object');
    }
  });
});

test('runtime_handshake echoes the challenge and reports this process', async () => {
  const expected = createRuntimeIdentity();
  await withServer(async (client) => {
    const challenge = `challenge-${Date.now()}-"quoted"\nsecond line\té`;
    const result = await client.callTool({ name: 'runtime_handshake', arguments: { challenge } });

    assert.notEqual(result.isError, true);
    const payload = payloadOf(result);

    assert.equal(payload.challenge, challenge, 'the challenge was not echoed verbatim');
    assert.equal(payload.transport, 'mcp-stdio');
    assert.equal(payload.server, 'spec-crawler');
    assert.equal(payload.source.sourceFingerprint, expected.deterministic.sourceFingerprint);
    assert.equal(payload.source.serializerDigest, expected.deterministic.serializerDigest);
    assert.deepEqual(payload.source.package, expected.deterministic.package);
    assert.equal(payload.source.gitCommit, expected.deterministic.gitCommit);

    // Volatile identity belongs to the spawned process, so it must differ from
    // the identity this test just built in-process.
    assert.equal(typeof payload.instance.uuid, 'string');
    assert.notEqual(payload.instance.uuid, expected.instance.uuid);
    assert.notEqual(payload.instance.pid, process.pid);
    assert.ok(!Number.isNaN(Date.parse(payload.instance.startedAt)));

    // Captured from the initialize handshake, not from a default.
    assert.deepEqual(payload.mcpClient, CLIENT_INFO);

    assert.deepEqual(payload.attachment, { attached: false, url: null, title: null });
    assert.equal(payload.bundle.stateCount, 0);
    assert.equal(payload.runtime.state, 'open');
    assert.ok(Array.isArray(payload.runtime.leases));

    assertProvenance(result, 'runtime_handshake', expected.deterministic);
  });
});

test('an omitted challenge comes back as null rather than an empty string', async () => {
  await withServer(async (client) => {
    const payload = payloadOf(await client.callTool({ name: 'runtime_handshake', arguments: {} }));
    assert.equal(payload.challenge, null);
  });
});

test('every result carries the provenance _meta — success and error alike', async () => {
  const expected = createRuntimeIdentity();
  await withServer(async (client) => {
    const ok = await client.callTool({ name: 'runtime_handshake', arguments: {} });
    assert.notEqual(ok.isError, true);
    const okMeta = assertProvenance(ok, 'runtime_handshake', expected.deterministic);

    const failed = await client.callTool({ name: 'page_describe', arguments: {} });
    assert.equal(failed.isError, true);
    const errorMeta = assertProvenance(failed, 'page_describe', expected.deterministic);

    // Same process answered both, so the volatile identity has to match.
    assert.equal(errorMeta.instanceUuid, okMeta.instanceUuid);
    assert.equal(errorMeta.pid, okMeta.pid);

    const unknown = await client.callTool({ name: 'no_such_tool', arguments: {} });
    assert.equal(unknown.isError, true);
    assertProvenance(unknown, 'no_such_tool', expected.deterministic);
    assert.equal(payloadOf(unknown).code, 'ERR_UNKNOWN_TOOL');
  });
});

test('browser-requiring tools return a clean "not attached" error, not a crash', async () => {
  await withServer(async (client) => {
    for (const name of ['page_describe', 'list_regions', 'reset', 'capture_state', 'capture_animation']) {
      const result = await client.callTool({
        name,
        arguments: name === 'capture_state' ? { name: 'anything' } : {},
      });
      assert.equal(result.isError, true, `${name} did not report an error`);
      const payload = payloadOf(result);
      assert.equal(payload.code, 'ERR_NOT_ATTACHED', `${name} reported ${payload.code}`);
      assert.match(payload.error, /browser_attach/);
    }

    // The server is still alive and answering after five refusals.
    const alive = await client.callTool({ name: 'runtime_handshake', arguments: { challenge: 'still-here' } });
    assert.equal(payloadOf(alive).challenge, 'still-here');
  });
});

test('a point capture refuses without expect, and names the parameter', async () => {
  await withServer(async (client) => {
    const result = await client.callTool({ name: 'capture_at', arguments: { x: 10, y: 10, name: 'row' } });
    assert.equal(result.isError, true);
    const payload = payloadOf(result);
    assert.equal(payload.code, 'ERR_TARGET_EXPECT_REQUIRED');
    assert.equal(payload.parameter, 'expect');
    assert.equal(payload.stage, 'precondition');
  });
});

test('scenario_run dry-runs a real scenario file without a browser', async () => {
  const expected = createRuntimeIdentity();
  await withServer(async (client) => {
    const result = await client.callTool({
      name: 'scenario_run',
      arguments: { file: path.join(SCENARIOS, 'menu-open.json'), dryRun: true },
    });

    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    const payload = payloadOf(result);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'dry-run');
    assert.ok(payload.plan, 'the dry run reported no plan');
    assert.ok(payload.steps.length > 0);
    assert.equal(payload.usedAttachedDriver, false);
    assertProvenance(result, 'scenario_run', expected.deterministic);
  });
});

test('scenario_run reports an invalid scenario as a structured error', async () => {
  await withServer(async (client) => {
    const result = await client.callTool({
      name: 'scenario_run',
      arguments: { file: path.join(SCENARIOS, 'invalid.json'), dryRun: true },
    });
    assert.equal(result.isError, true);
    const payload = payloadOf(result);
    assert.equal(payload.code, 'ERR_SCENARIO_INVALID');
    assert.ok(Array.isArray(payload.violations) && payload.violations.length > 0);
  });
});

test('scenario_run refuses with neither file nor scenario', async () => {
  await withServer(async (client) => {
    const result = await client.callTool({ name: 'scenario_run', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(payloadOf(result).code, 'ERR_SCENARIO_INPUT');
  });
});

test('the server exits cleanly on stdin EOF', async () => {
  const child = spawn(process.execPath, [SERVER], { cwd: REPO, stdio: ['pipe', 'pipe', 'ignore'] });
  // Give the process long enough to finish importing and connect the transport,
  // so EOF lands on a running server rather than on a half-built one.
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(child.exitCode, null, 'the server exited before stdin was closed');

  child.stdin.end();
  const [code, signal] = await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('server did not exit within 5s of stdin EOF')), 5000)),
  ]);
  assert.equal(signal, null, 'the server was signalled rather than exiting');
  assert.equal(code, 0, 'the server exited non-zero on stdin EOF');
});
