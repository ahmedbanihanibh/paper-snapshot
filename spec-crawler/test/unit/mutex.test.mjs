import assert from 'node:assert/strict';
import test from 'node:test';

import { AsyncMutex, MutexAbortedError, createMutexToken } from '../../src/mutex.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('mutex grants waiters in FIFO order', async () => {
  const mutex = new AsyncMutex();
  const releaseFirst = await mutex.acquire();
  const order = [];

  const waiters = [1, 2, 3].map((number) => mutex.runExclusive(async () => {
    order.push(number);
    await tick();
  }));

  await tick();
  assert.deepEqual(order, []);
  assert.equal(mutex.pending, 3);
  releaseFirst();
  await Promise.all(waiters);

  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(mutex.locked, false);
  assert.equal(mutex.pending, 0);
});

test('mutex is re-entrant only when the current lock token is supplied', async () => {
  const mutex = new AsyncMutex();
  const token = createMutexToken();
  const events = [];

  await mutex.runExclusive(async (heldToken) => {
    assert.equal(heldToken, token);
    events.push('outer-start');
    await mutex.runExclusive(async (nestedToken) => {
      assert.equal(nestedToken, token);
      events.push('inner');
    }, { token });
    events.push('outer-end');
  }, { token });

  assert.deepEqual(events, ['outer-start', 'inner', 'outer-end']);
  assert.equal(mutex.locked, false);
});

test('cancelling a queued waiter removes it without disturbing FIFO order', async () => {
  const mutex = new AsyncMutex();
  const releaseFirst = await mutex.acquire();
  const controller = new AbortController();
  const order = [];

  const cancelled = mutex.runExclusive(() => order.push('cancelled'), { signal: controller.signal });
  const second = mutex.runExclusive(() => order.push('second'));
  controller.abort('no longer needed');

  await assert.rejects(cancelled, (error) => {
    assert.ok(error instanceof MutexAbortedError);
    assert.equal(error.code, 'ERR_MUTEX_ABORTED');
    assert.equal(error.cause, 'no longer needed');
    return true;
  });
  assert.equal(mutex.pending, 1);

  releaseFirst();
  await second;
  assert.deepEqual(order, ['second']);
});

test('an already-aborted acquisition rejects without taking or queueing the lock', async () => {
  const mutex = new AsyncMutex();
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(mutex.acquire({ signal: controller.signal }), { code: 'ERR_MUTEX_ABORTED' });
  assert.equal(mutex.locked, false);
  assert.equal(mutex.pending, 0);
});

test('null is rejected as a lock token instead of colliding with the unlocked sentinel', async () => {
  const mutex = new AsyncMutex();
  await assert.rejects(mutex.acquire({ token: null }), /token/i);
  assert.equal(mutex.locked, false);
});

test('release functions are idempotent and cannot release a later owner', async () => {
  const mutex = new AsyncMutex();
  const releaseFirst = await mutex.acquire();
  let entered = false;
  const waiter = mutex.runExclusive(() => { entered = true; });

  releaseFirst();
  releaseFirst();
  await waiter;
  assert.equal(entered, true);
  assert.equal(mutex.locked, false);
});
