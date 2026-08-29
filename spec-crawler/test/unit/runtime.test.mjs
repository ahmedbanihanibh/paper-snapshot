import assert from 'node:assert/strict';
import test from 'node:test';

import { CrawlerRuntime, RuntimeClosedError } from '../../src/runtime.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function identity() {
  return Object.freeze({
    deterministic: Object.freeze({ package: Object.freeze({ name: 'test', version: '1.0.0' }) }),
    instance: Object.freeze({ uuid: 'instance', pid: 1, startedAt: '2026-01-01T00:00:00.000Z' }),
    mcpClient: Object.freeze({ name: 'test-mcp', version: '1.0.0' }),
  });
}

test('runtime exposes identity and lifecycle slots through a stable status snapshot', () => {
  const expectedIdentity = identity();
  const runtime = new CrawlerRuntime({ identity: expectedIdentity, leaseManager: { acquire() {}, close() {} } });
  const driver = { name: 'driver' };
  const bundle = { name: 'bundle' };
  const explorer = { name: 'explorer' };

  runtime.driver = driver;
  runtime.bundle = bundle;
  runtime.explorer = explorer;

  assert.equal(runtime.identity, expectedIdentity);
  assert.equal(runtime.driver, driver);
  assert.equal(runtime.bundle, bundle);
  assert.equal(runtime.explorer, explorer);
  assert.deepEqual(runtime.readStatus(), {
    state: 'open',
    activeOperation: null,
    queuedOperations: 0,
    slots: { driver: true, bundle: true, explorer: true },
    leases: [],
    identity: runtime.identity,
  });
});

test('invokeExclusive serializes stateful operations and supports nested lock tokens', async () => {
  const runtime = new CrawlerRuntime({ identity: identity(), leaseManager: { close: async () => {} } });
  const order = [];
  let unblock;
  const gate = new Promise((resolve) => { unblock = resolve; });

  const first = runtime.invokeExclusive('first', async (token) => {
    order.push('first-start');
    await runtime.invokeExclusive('nested', async (nestedToken) => {
      assert.equal(nestedToken, token);
      order.push('nested');
    }, { token });
    await gate;
    order.push('first-end');
  });
  const second = runtime.invokeExclusive('second', async () => {
    order.push('second');
  });

  await tick();
  assert.deepEqual(order, ['first-start', 'nested']);
  assert.equal(runtime.readStatus().activeOperation, 'first');
  assert.equal(runtime.readStatus().queuedOperations, 1);
  unblock();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'nested', 'first-end', 'second']);
});

test('runtime acquires and releases bundle and CDP leases through injected lease manager', async () => {
  const events = [];
  const leaseManager = {
    async acquire(key) {
      const lease = {
        kind: key.kind,
        keyHash: key.hash,
        ownerToken: `${key.kind}-owner`,
        released: false,
        async release() {
          events.push(`release:${key.kind}`);
          this.released = true;
          return true;
        },
      };
      events.push(`acquire:${key.kind}`);
      return lease;
    },
    async close() { events.push('manager-close'); },
  };
  const runtime = new CrawlerRuntime({ identity: identity(), leaseManager });

  const bundle = await runtime.acquireBundleLease('/tmp/output');
  const target = await runtime.acquireCdpTargetLease('http://localhost:9222', 'page-1');
  assert.deepEqual(events, ['acquire:bundle', 'acquire:cdp-target']);
  assert.deepEqual(runtime.readStatus().leases.map((lease) => lease.kind), ['bundle', 'cdp-target']);

  assert.equal(await runtime.releaseLease(bundle), true);
  assert.equal(await runtime.releaseLease(bundle), false);
  assert.equal(await runtime.releaseLease(target), true);
  assert.deepEqual(events, ['acquire:bundle', 'acquire:cdp-target', 'release:bundle', 'release:cdp-target']);
});

test('close waits for active work, closes each resource once, releases leases, and is idempotent', async () => {
  const events = [];
  const resource = (name) => ({ async close() { events.push(`close:${name}`); } });
  const lease = {
    kind: 'bundle', keyHash: 'hash', ownerToken: 'owner', released: false,
    async release() { events.push('release:lease'); this.released = true; return true; },
  };
  const leaseManager = {
    async acquire() { return lease; },
    async close() { events.push('close:manager'); },
  };
  const runtime = new CrawlerRuntime({
    identity: identity(),
    leaseManager,
    driver: resource('driver'),
    bundle: resource('bundle'),
    explorer: resource('explorer'),
  });
  await runtime.acquireBundleLease('/tmp/output');

  let unblock;
  const gate = new Promise((resolve) => { unblock = resolve; });
  const active = runtime.invokeExclusive('active', async () => {
    events.push('active:start');
    await gate;
    events.push('active:end');
  });
  await tick();
  const firstClose = runtime.close();
  const secondClose = runtime.close();
  assert.equal(firstClose, secondClose);
  assert.equal(runtime.readStatus().state, 'closing');
  assert.deepEqual(events, ['active:start']);

  unblock();
  await Promise.all([active, firstClose]);
  assert.deepEqual(events, [
    'active:start', 'active:end',
    'close:explorer', 'close:bundle', 'close:driver',
    'release:lease', 'close:manager',
  ]);
  assert.equal(runtime.readStatus().state, 'closed');
  await runtime.close();
  assert.equal(events.filter((entry) => entry.startsWith('close:')).length, 4);
});

test('close is not cancellable once requested and still performs cleanup', async () => {
  let closed = 0;
  const controller = new AbortController();
  controller.abort('shutdown must continue');
  const runtime = new CrawlerRuntime({
    identity: identity(),
    leaseManager: { close: async () => { closed += 1; } },
  });

  await runtime.close({ signal: controller.signal });
  assert.equal(closed, 1);
  assert.equal(runtime.closed, true);
});

test('closed and closing runtimes reject new work with a stable error code', async () => {
  const runtime = new CrawlerRuntime({ identity: identity(), leaseManager: { close: async () => {} } });
  await runtime.close();

  await assert.rejects(runtime.invokeExclusive(() => {}), (error) => {
    assert.ok(error instanceof RuntimeClosedError);
    assert.equal(error.code, 'ERR_RUNTIME_CLOSED');
    assert.equal(error.state, 'closed');
    return true;
  });
  assert.throws(() => { runtime.driver = {}; }, { code: 'ERR_RUNTIME_CLOSED' });
  await assert.rejects(runtime.acquireBundleLease('/tmp/output'), { code: 'ERR_RUNTIME_CLOSED' });
});
