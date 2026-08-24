import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSubgrid } from '../../src/capture-intent.mjs';
import { SpecDriver } from '../../src/driver.mjs';
import * as pageAgent from '../../src/page-agent.mjs';

test('intent subgrid resolution delegates to the shared resolver and restores once', async () => {
  const calls = [];
  const records = [{ marker: 'intent-1-0', hadStyle: true, cssText: 'color: red;' }];
  const page = {
    evaluate: async (fn, argument) => {
      calls.push({ fn, argument });
      if (fn === pageAgent.resolveSubgrids) return { resolved: 1, records };
      if (fn === pageAgent.restoreSubgrids) return 1;
      throw new Error('unexpected evaluator');
    },
  };

  const transaction = await resolveSubgrid({ page }, 'row-1');
  assert.equal(transaction.resolved, 1);
  assert.equal(await transaction.restore(), 1);
  assert.equal(await transaction.restore(), 0);
  assert.equal(calls[0].fn, pageAgent.resolveSubgrids);
  assert.equal(calls[1].fn, pageAgent.restoreSubgrids);
  assert.deepEqual(calls[1].argument.records, records);
});

test('driver serialization restores shared subgrid mutations in finally when serializer throws', async () => {
  const calls = [];
  const page = {
    url: () => 'https://example.test/',
    evaluate: async (fn, argument) => {
      calls.push(fn);
      if (fn === pageAgent.resolveSubgrids) {
        return { resolved: 1, records: [{ marker: 'driver-1-0', hadStyle: false, cssText: '' }] };
      }
      if (fn === pageAgent.restoreSubgrids) return 1;
      throw new Error('serializer exploded');
    },
  };
  const driver = new SpecDriver({ close: async () => {} }, page);

  await assert.rejects(driver.serialize('row-1'), /serializer exploded/);
  assert.equal(calls.at(-1), pageAgent.restoreSubgrids);
});
