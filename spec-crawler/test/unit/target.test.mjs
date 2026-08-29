import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TargetLease,
  TargetLeaseError,
  acquireTargetLease,
  getTargetLease,
} from '../../src/target.mjs';

function descriptor(overrides = {}) {
  return {
    specId: 'row-1',
    tag: 'div',
    role: 'row',
    label: 'Issue ABC-123',
    labelDigest: 'abc12345',
    stableAttributes: { role: 'row', 'data-list-key': 'issue-123' },
    rect: { x: 10, y: 20, width: 300, height: 32 },
    ancestorLandmarks: [{ tag: 'main', role: 'main', id: null, testId: null, labelDigest: '00000000' }],
    documentEpoch: '1|https://example.test/issues',
    via: 'spec-id',
    ...overrides,
  };
}

test('target acquisition requires an expectation before touching the page', async () => {
  let evaluated = false;
  const page = { evaluate: async () => { evaluated = true; } };

  await assert.rejects(
    acquireTargetLease(page, { specId: 'row-1' }),
    (error) => {
      assert.ok(error instanceof TargetLeaseError);
      assert.equal(error.code, 'ERR_TARGET_EXPECT_REQUIRED');
      return true;
    },
  );
  assert.equal(evaluated, false);
});

test('a target lease stores acquisition evidence and is discoverable by spec id', async () => {
  const snapshot = descriptor();
  const page = { evaluate: async () => ({ ok: true, descriptor: snapshot }) };

  const lease = await TargetLease.acquire(page, { specId: 'row-1', expect: 'ABC-123' });

  assert.equal(lease.specId, 'row-1');
  assert.equal(lease.snapshot.labelDigest, 'abc12345');
  assert.deepEqual(lease.snapshot.ancestorLandmarks, snapshot.ancestorLandmarks);
  assert.equal(getTargetLease(page, 'row-1'), lease);
});

test('revalidation rejects a recycled element with typed mismatch evidence', async () => {
  const snapshot = descriptor();
  let calls = 0;
  const page = {
    evaluate: async () => {
      calls += 1;
      if (calls === 1) return { ok: true, descriptor: snapshot };
      return {
        ok: false,
        reason: 'identity-mismatch',
        message: 'target identity changed (label-digest) — refusing a recycled or replacement element',
        mismatches: ['label-digest'],
        expected: snapshot,
        resolved: descriptor({ label: 'Issue XYZ-999', labelDigest: 'def67890' }),
      };
    },
  };
  const lease = await TargetLease.acquire(page, { specId: 'row-1', expect: 'Issue' });

  await assert.rejects(lease.revalidate(), (error) => {
    assert.ok(error instanceof TargetLeaseError);
    assert.equal(error.code, 'ERR_TARGET_RECYCLED');
    assert.deepEqual(error.evidence.mismatches, ['label-digest']);
    return true;
  });
});
